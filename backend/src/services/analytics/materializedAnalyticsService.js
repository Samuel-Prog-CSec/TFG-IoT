/**
 * @fileoverview T-931 (pre-v1.0.0) — Materialización Redis para hot reads de
 * analytics.
 *
 * Pasa de pagar el coste de `$lookup` con `$facet` en cada lectura del
 * dashboard a estructuras Redis especializadas:
 *
 *   1) **Leaderboards ZSET** — rankings de contextos y mecánicas por
 *      profesor y rango temporal. Score acumulado y plays count se
 *      mantienen en sorted sets distintos (`leaderboard:context:score:...`,
 *      `leaderboard:mechanic:plays:...`, etc.), accedidos con `ZINCRBY`
 *      en escritura y `ZREVRANGE WITHSCORES` en lectura. Coste lectura
 *      O(log N + M).
 *
 *   2) **studentMetrics Hash** — contadores por alumno
 *      (`student:metrics:<studentId>`). Cada `endPlay` actualiza con
 *      `HINCRBY` (atómico, sin race en multi-instancia) los campos
 *      `totalGamesPlayed`, `totalCorrectAnswers`, `totalErrors`, `sumScores`,
 *      `sumResponseTimeMs`, `responseTimeSamples`, `lastPlayedAt` y los
 *      específicos de Secuencia (`maxSequenceLengthAchieved`,
 *      `sequencesCompleted`).
 *
 *   3) **Reconciliación nocturna** — un job BullMQ recalcula desde Mongo
 *      todas las materializaciones y reporta drift detectado. Si el drift
 *      supera 5% se loguea como Sentry warning. Se ejecuta a las 00:30
 *      hora servidor.
 *
 * Mongo permanece como fuente de verdad — Redis es caché de lecturas
 * calientes. Cualquier `endPlay` que falle al escribir en Redis no
 * compromete el flujo (fire-and-forget con catch silente) porque la
 * reconciliación nocturna lo arreglará. El consentimiento RGPD se respeta
 * porque las escrituras pasan por el flujo `endPlay` que ya gatekeepea
 * con `player.hasConsentFor('performance_analytics')`.
 *
 * GDPR Art. 17 — al eliminar un alumno hay que purgar `student:metrics:*`
 * y miembros en leaderboards. Exportado `purgeStudentMaterialization`.
 *
 * @module services/analytics/materializedAnalyticsService
 */

const mongoose = require('mongoose');
const redisService = require('../redisService');
const logger = require('../../utils/logger').child({ component: 'materializedAnalytics' });
const runtimeMetrics = require('../../utils/runtimeMetrics');

// =============================================================================
// Constantes
// =============================================================================

/**
 * Rangos temporales de leaderboard. Cada uno tiene su propio ZSET para
 * permitir lecturas O(log N + M) sin necesidad de filtrar por timestamp.
 * @readonly
 */
const LEADERBOARD_TIME_RANGES = ['24h', '7d', '30d'];

/**
 * Ventana de cada rango en milisegundos (para el job de reconciliación).
 * @readonly
 */
const TIME_RANGE_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

/**
 * TTL de los ZSETs en segundos. 8 días = una ventana 7d + margen.
 * Cuando expira sin reconciliación, el endpoint devuelve fallback Mongo
 * (transparente para el cliente).
 * @readonly
 */
const LEADERBOARD_TTL_SECONDS = 8 * 24 * 60 * 60;

/**
 * TTL del Hash `student:metrics:<id>` (90 días). Sin él, cada alumno que haya
 * jugado alguna vez deja una key viva indefinidamente — fuga de memoria lenta
 * en Redis free-tier (Upstash 256MB). El reconciliador nocturno refresca este
 * TTL para los alumnos activos; un alumno inactivo >90d cae solo (su métrica
 * vive en Mongo como fuente de verdad — el Hash es caché materializada
 * reconstruible). (C1)
 */
const STUDENT_METRICS_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Tope máximo de miembros por leaderboard ZSET (D10-001).
 *
 * Los leaderboards por docente acumulan `score`/`plays` por contexto y por
 * mecánica con `ZINCRBY`. Aunque el TTL de 8 días impone un techo natural,
 * sin un cap explícito una corrupción aguas arriba podría inyectar miles de
 * miembros (p. ej. IDs basura) y agotar la cuota Redis del free tier antes
 * de que el TTL expire. Tras cada `ZINCRBY` aplicamos `ZREMRANGEBYRANK` para
 * quedarnos solo con los `LEADERBOARD_MAX_MEMBERS` de mayor score; en
 * operación normal hay <20 contextos / 4 mecánicas por docente, así que el
 * recorte es no-op y solo actúa como salvaguarda.
 */
const LEADERBOARD_MAX_MEMBERS = 200;

/**
 * Fracción de partidas en las que se ejecuta el recorte a top-N (B2).
 *
 * El `ZREMRANGEBYRANK` es una salvaguarda contra corrupción aguas arriba, pero
 * dado que el dominio real tiene <20 miembros por leaderboard (contextos/mecánicas
 * de un docente), en operación normal es no-op el ~100% de las partidas. Ejecutarlo
 * en CADA endPlay gastaba 12 comandos Upstash por partida sin recortar nada
 * (~1/3 del presupuesto free-tier bajo carga). Ejecutándolo de forma probabilística
 * (~1 de cada 50 partidas) la salvaguarda sigue activa —una corrupción se recortaría
 * en pocas partidas— y el coste baja ~98%. El reconciliador nocturno además reconstruye
 * los ZSET desde Mongo, así que cualquier deriva se corrige a diario.
 * @readonly
 */
const LEADERBOARD_CAP_SAMPLE_RATE = 0.02;

const NAMESPACES = {
  LEADERBOARD: 'leaderboard',
  STUDENT_METRICS: 'student:metrics'
};

// =============================================================================
// Helpers internos
// =============================================================================

const toObjectId = id => {
  if (!id) {
    return null;
  }
  if (id instanceof mongoose.Types.ObjectId) {
    return id;
  }
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
};

const toIdString = id => (typeof id === 'string' ? id : id?.toString?.() || '');

/**
 * Construye la key Redis para un leaderboard concreto.
 * Pattern: `<dimension>:<metric>:<teacherId>:<timeRange>`.
 *   - dimension: `context` | `mechanic`
 *   - metric:    `score`   | `plays`
 *
 * Las cuatro combinaciones se mantienen para evitar derivar plays desde
 * ZSCORE/avg en lectura — `ZINCRBY` × 2 por dimensión es el precio justo
 * frente a una aggregation Mongo con dos `$lookup`.
 *
 * @param {string} dimension
 * @param {string} metric
 * @param {string} teacherId
 * @param {string} timeRange
 * @returns {string}
 */
const leaderboardId = (dimension, metric, teacherId, timeRange) =>
  `${dimension}:${metric}:${toIdString(teacherId)}:${timeRange}`;

// =============================================================================
// Escrituras (invocadas desde endPlay)
// =============================================================================

/**
 * Registra una partida completada en TODAS las materializaciones Redis.
 * Se invoca desde `GameEngine._endPlayInternal` tras `player.updateStudentMetrics`
 * (fire-and-forget — un fallo Redis no compromete la partida porque la
 * reconciliación nocturna lo arreglará).
 *
 * @param {Object} payload
 * @param {string} payload.teacherId - createdBy de la session
 * @param {string} payload.contextId - session.contextId
 * @param {string} payload.mechanicId - session.mechanicId
 * @param {string} payload.studentId - playDoc.playerId
 * @param {number} payload.score - playDoc.score final
 * @param {number} [payload.maxScore] - playDoc.maxScore (opcional)
 * @param {number} [payload.correctAttempts]
 * @param {number} [payload.errorAttempts]
 * @param {number} [payload.timeoutAttempts]
 * @param {number} [payload.averageResponseTime] - ms
 * @param {string} [payload.mechanicName] - 'memory'|'association'|'sequence'
 * @param {number} [payload.maxSequenceLengthAchieved]
 * @param {number} [payload.sequencesCompleted]
 * @returns {Promise<void>}
 */
async function recordPlayCompletion(payload) {
  if (!payload?.teacherId || !payload?.studentId) {
    return;
  }
  const {
    teacherId,
    contextId,
    mechanicId,
    studentId,
    score = 0,
    maxScore = 0,
    correctAttempts = 0,
    errorAttempts = 0,
    timeoutAttempts = 0,
    averageResponseTime = 0,
    mechanicName,
    maxSequenceLengthAchieved = 0,
    sequencesCompleted = 0
  } = payload;

  // Porcentaje de la partida (score/maxScore×100): el leaderboard acumula % en
  // vez de score crudo para que mecánicas con techos muy distintos (Secuencia
  // 210-420 vs Asociación 50-90) sean comparables y ninguna domine por su escala.
  // Coherente con el reconciliador nocturno y con student:metrics (ADR-213).
  const scorePercent = maxScore > 0 ? (score / maxScore) * 100 : 0;

  // (B2) Una única tirada por partida decide si aplicamos el recorte-salvaguarda
  // de los leaderboards en este endPlay; cuando aplica, se recortan las 6
  // dimensiones a la vez. Ver LEADERBOARD_CAP_SAMPLE_RATE.
  // eslint-disable-next-line sonarjs/pseudo-random -- muestreo de salvaguarda, no es un uso de seguridad
  const applyLeaderboardCap = Math.random() < LEADERBOARD_CAP_SAMPLE_RATE;

  // Las escrituras pueden fallar de forma silenciosa (Redis caído,
  // circuit breaker abierto). El job nocturno reconciliará — no
  // bloqueamos endPlay.
  try {
    await redisService.runPipeline(p => {
      // === ZSETs leaderboards (4 keys × 3 timeRanges = 12 ZINCRBY) ===
      // Solo si contextId / mechanicId tienen valor.
      // (D10-001) Helper local: tras cada ZINCRBY recortamos a top-N por
      // score con `ZREMRANGEBYRANK key 0 -(MAX+1)` (elimina los N-MAX peores
      // por score asc). Si el ZSET tiene <=MAX miembros el comando es no-op.
      // `range` se pasa explícitamente porque cuando se llama desde el `for`
      // exterior no está en el scope léxico de la función.
      const bumpAndCap = (dimension, dimensionId, range) => {
        const scoreKey = redisService.buildKey(
          NAMESPACES.LEADERBOARD,
          leaderboardId(dimension, 'score', teacherId, range)
        );
        const playsKey = redisService.buildKey(
          NAMESPACES.LEADERBOARD,
          leaderboardId(dimension, 'plays', teacherId, range)
        );
        const member = toIdString(dimensionId);
        // Acumula PORCENTAJE de la partida (no score crudo) — ver `scorePercent`.
        p.zincrby(scoreKey, scorePercent, member);
        p.zincrby(playsKey, 1, member);
        p.expire(scoreKey, LEADERBOARD_TTL_SECONDS);
        p.expire(playsKey, LEADERBOARD_TTL_SECONDS);
        // (B2) Recorte-salvaguarda solo en ~2% de partidas: en operación normal
        // es no-op (dominio <20 miembros) y ejecutarlo siempre desperdiciaba 12
        // comandos Upstash/partida. Ver LEADERBOARD_CAP_SAMPLE_RATE.
        if (applyLeaderboardCap) {
          p.zremrangebyrank(scoreKey, 0, -(LEADERBOARD_MAX_MEMBERS + 1));
          p.zremrangebyrank(playsKey, 0, -(LEADERBOARD_MAX_MEMBERS + 1));
        }
      };

      if (contextId) {
        for (const range of LEADERBOARD_TIME_RANGES) {
          bumpAndCap('context', contextId, range);
        }
      }
      if (mechanicId) {
        for (const range of LEADERBOARD_TIME_RANGES) {
          bumpAndCap('mechanic', mechanicId, range);
        }
      }

      // === Hash studentMetrics — HINCRBY atómico (sin race condition) ===
      const studentHashKey = redisService.buildKey(
        NAMESPACES.STUDENT_METRICS,
        toIdString(studentId)
      );
      p.hincrby(studentHashKey, 'totalGamesPlayed', 1);
      p.hincrby(studentHashKey, 'totalCorrectAnswers', correctAttempts);
      p.hincrby(studentHashKey, 'totalErrors', errorAttempts);
      p.hincrby(studentHashKey, 'totalTimeouts', timeoutAttempts);
      // sumScores / responseTime usan números enteros (multiplicados ×100)
      // para evitar `HINCRBYFLOAT` (más lento, mantiene precisión decimal
      // si lo necesitásemos más adelante).
      // Acumulamos el PORCENTAJE de la partida (score/maxScore×100), no el score
      // crudo: así `averageScore = sumScoresHundredths/games/100` coincide en
      // escala (%) con `studentMetrics.averageScore` y con el reconciliador
      // nocturno, que reconstruye desde el % de Mongo (ADR-201). Antes el live
      // acumulaba crudo y el reconciliador %, dando unidades divergentes según
      // el momento del caché.
      p.hincrby(
        studentHashKey,
        'sumScoresHundredths',
        Math.round((maxScore > 0 ? (score / maxScore) * 100 : 0) * 100)
      );
      p.hincrby(
        studentHashKey,
        'sumResponseTimeMs',
        Math.max(0, Math.round(averageResponseTime || 0))
      );
      if (averageResponseTime > 0) {
        p.hincrby(studentHashKey, 'responseTimeSamples', 1);
      }
      p.hset(studentHashKey, 'lastPlayedAt', String(Date.now()));
      // Secuencia: campos específicos
      if (mechanicName === 'sequence') {
        p.hincrby(studentHashKey, 'sequencesCompleted', sequencesCompleted);
        // maxSequenceLength es MAX, no SUM. Lo guardamos como simple set
        // condicional: leemos antes en otra operación si fuese estrictamente
        // necesario, pero como `HINCRBY` no permite max, dejamos al
        // reconciliador la consolidación correcta. Aquí lo escribimos en
        // claro con `hset` solo si supera el actual (best-effort).
        if (maxSequenceLengthAchieved > 0) {
          // Sin lectura previa: sobrescribimos. Reconcile nocturno corrige.
          p.hset(studentHashKey, 'maxSequenceLengthAchieved', String(maxSequenceLengthAchieved));
        }
      }

      // (C1) TTL del Hash: sin esto la key crece sin cota (un Hash por alumno,
      // vivo para siempre). EXPIRE en cada escritura renueva la ventana de los
      // alumnos activos; los inactivos caen solos sin acumular en Upstash.
      p.expire(studentHashKey, STUDENT_METRICS_TTL_SECONDS);
    }, 't931-write');

    if (contextId || mechanicId) {
      runtimeMetrics.recordT931Write('leaderboard');
    }
    runtimeMetrics.recordT931Write('studentMetrics');
  } catch (err) {
    // Fire-and-forget — log y seguir.
    logger.warn('T-931: error registrando partida en Redis (no bloquea endPlay)', {
      teacherId: toIdString(teacherId),
      studentId: toIdString(studentId),
      error: err.message
    });
  }
}

// =============================================================================
// Lecturas con fallback Mongo
// =============================================================================

/**
 * Devuelve el top de contextos por puntuación o plays para un profesor +
 * timeRange. Si el ZSET no existe (miss / TTL expirado), retorna `null`
 * para que el caller use el camino aggregation Mongo.
 *
 * @param {string} teacherId
 * @param {Object} options
 * @param {string} options.timeRange - '24h'|'7d'|'30d'
 * @param {string} options.dimension - 'context'|'mechanic'
 * @param {string} options.metric - 'score'|'plays' (cuál es el sort principal)
 * @param {number} [options.limit=5]
 * @returns {Promise<Array<{id:string, score:number, plays:number}>|null>}
 */
async function getTopFromLeaderboard(teacherId, { timeRange, dimension, metric, limit = 5 } = {}) {
  if (!teacherId || !LEADERBOARD_TIME_RANGES.includes(timeRange)) {
    return null;
  }
  try {
    const primaryKey = leaderboardId(dimension, metric, teacherId, timeRange);
    const otherMetric = metric === 'score' ? 'plays' : 'score';
    const secondaryKey = leaderboardId(dimension, otherMetric, teacherId, timeRange);

    const primary = await redisService.runPipeline(p => {
      // ZREVRANGE devuelve [member, score, member, score, ...]
      p.zrevrange(
        redisService.buildKey(NAMESPACES.LEADERBOARD, primaryKey),
        0,
        limit - 1,
        'WITHSCORES'
      );
      p.exists(redisService.buildKey(NAMESPACES.LEADERBOARD, primaryKey));
    }, 't931-read');

    if (!primary) {
      runtimeMetrics.recordT931Read('leaderboard', 'miss');
      return null;
    }

    const [rangeReply, existsReply] = primary;
    const existsCount = existsReply?.[1] ?? 0;
    if (existsCount === 0) {
      runtimeMetrics.recordT931Read('leaderboard', 'miss');
      return null;
    }
    const flat = rangeReply?.[1] || [];
    if (!Array.isArray(flat) || flat.length === 0) {
      // ZSET existe pero vacío — devolver lista vacía (NO miss, es respuesta
      // legítima de "no hay datos en este rango").
      runtimeMetrics.recordT931Read('leaderboard', 'hit');
      return [];
    }

    // flat es [member1, score1, member2, score2, ...]
    const entries = [];
    for (let i = 0; i < flat.length; i += 2) {
      entries.push({
        id: flat[i],
        primaryScore: Number(flat[i + 1]) || 0
      });
    }

    // Resolver la métrica secundaria (plays cuando el primary es score, y
    // viceversa) con un ZMSCORE pipelined.
    const memberIds = entries.map(e => e.id);
    if (memberIds.length > 0) {
      const secondary = await redisService.runPipeline(p => {
        p.zmscore(redisService.buildKey(NAMESPACES.LEADERBOARD, secondaryKey), ...memberIds);
      }, 't931-read');
      const secondaryScores = secondary?.[0]?.[1] || [];
      for (let i = 0; i < entries.length; i++) {
        const v = secondaryScores[i];
        const num = v === null || v === undefined ? 0 : Number(v) || 0;
        if (metric === 'score') {
          entries[i].score = entries[i].primaryScore;
          entries[i].plays = num;
        } else {
          entries[i].plays = entries[i].primaryScore;
          entries[i].score = num;
        }
        delete entries[i].primaryScore;
      }
    }

    runtimeMetrics.recordT931Read('leaderboard', 'hit');
    return entries;
  } catch (err) {
    logger.debug('T-931 getTopFromLeaderboard error — fallback Mongo', { error: err.message });
    runtimeMetrics.recordT931Read('leaderboard', 'miss');
    return null;
  }
}

/**
 * Lee el Hash `student:metrics:<studentId>` y devuelve los contadores
 * normalizados, o `null` si no existe (miss → caller usa Mongo).
 *
 * @param {string} studentId
 * @returns {Promise<Object|null>}
 */
async function getStudentMetricsMaterialized(studentId) {
  if (!studentId) {
    return null;
  }
  try {
    const raw = await redisService.hgetall(NAMESPACES.STUDENT_METRICS, toIdString(studentId));
    if (!raw || Object.keys(raw).length === 0) {
      runtimeMetrics.recordT931Read('studentMetrics', 'miss');
      return null;
    }
    const totalGames = Number(raw.totalGamesPlayed) || 0;
    const sumScoresHundredths = Number(raw.sumScoresHundredths) || 0;
    const sumResponseTimeMs = Number(raw.sumResponseTimeMs) || 0;
    const responseSamples = Number(raw.responseTimeSamples) || 0;

    runtimeMetrics.recordT931Read('studentMetrics', 'hit');
    return {
      totalGamesPlayed: totalGames,
      totalCorrectAnswers: Number(raw.totalCorrectAnswers) || 0,
      totalErrors: Number(raw.totalErrors) || 0,
      totalTimeouts: Number(raw.totalTimeouts) || 0,
      averageScore: totalGames > 0 ? Math.round(sumScoresHundredths / totalGames) / 100 : 0,
      averageResponseTime:
        responseSamples > 0 ? Math.round(sumResponseTimeMs / responseSamples) : 0,
      lastPlayedAt: raw.lastPlayedAt ? new Date(Number(raw.lastPlayedAt)) : null,
      maxSequenceLengthAchieved: Number(raw.maxSequenceLengthAchieved) || 0,
      sequencesCompleted: Number(raw.sequencesCompleted) || 0
    };
  } catch (err) {
    logger.debug('T-931 getStudentMetricsMaterialized error — fallback Mongo', {
      error: err.message
    });
    runtimeMetrics.recordT931Read('studentMetrics', 'miss');
    return null;
  }
}

// =============================================================================
// GDPR Art. 17 — purga cross-layer
// =============================================================================

/**
 * Purga toda la materialización Redis asociada a un alumno tras Art. 17
 * (derecho al olvido). Elimina:
 *   - El Hash `student:metrics:<studentId>`.
 *   - Las entradas del alumno en TODOS los leaderboards `*:score:*` y
 *     `*:plays:*` del profesor que lo creó.
 *
 * Idempotente: si las keys no existen, `ZREM`/`DEL` simplemente devuelven 0.
 *
 * @param {Object} payload
 * @param {string} payload.studentId
 * @param {string} [payload.teacherId] - createdBy del alumno. Si no se pasa,
 *   solo se purga el Hash (los leaderboards quedan pendientes de la
 *   reconciliación nocturna).
 * @returns {Promise<{hashDeleted: boolean, leaderboardEntriesRemoved: number}>}
 */
async function purgeStudentMaterialization({ studentId, teacherId } = {}) {
  if (!studentId) {
    return { hashDeleted: false, leaderboardEntriesRemoved: 0 };
  }
  let hashDeleted = false;
  let entriesRemoved = 0;
  try {
    hashDeleted = await redisService.del(NAMESPACES.STUDENT_METRICS, toIdString(studentId));

    if (teacherId) {
      const studentIdStr = toIdString(studentId);
      const teacherIdStr = toIdString(teacherId);
      const result = await redisService.runPipeline(p => {
        for (const range of LEADERBOARD_TIME_RANGES) {
          // Por ahora los leaderboards son a nivel context/mechanic, no
          // student. Mantenemos el helper preparado para futuras versiones
          // student-leaderboards (T-931 Fase A.5 — pendiente). Aquí solo
          // limpiamos placeholders si existieran.
          p.zrem(
            redisService.buildKey(
              NAMESPACES.LEADERBOARD,
              leaderboardId('student', 'score', teacherIdStr, range)
            ),
            studentIdStr
          );
          p.zrem(
            redisService.buildKey(
              NAMESPACES.LEADERBOARD,
              leaderboardId('student', 'plays', teacherIdStr, range)
            ),
            studentIdStr
          );
        }
      }, 't931-gdpr');
      if (Array.isArray(result)) {
        entriesRemoved = result.reduce((acc, [err, val]) => acc + (err ? 0 : Number(val) || 0), 0);
      }
    }

    runtimeMetrics.recordT931GdprPurge();
    logger.info('T-931 GDPR purge — student materialization', {
      studentId: toIdString(studentId),
      teacherId: teacherId ? toIdString(teacherId) : null,
      hashDeleted,
      entriesRemoved
    });
  } catch (err) {
    logger.warn('T-931 purgeStudentMaterialization error', {
      studentId: toIdString(studentId),
      error: err.message
    });
  }
  return { hashDeleted: Boolean(hashDeleted), leaderboardEntriesRemoved: entriesRemoved };
}

// =============================================================================
// Reconciliación nocturna (invocada desde analyticsReconcileJob)
// =============================================================================

/**
 * Reconcilia leaderboards Redis contra GamePlay aggregations Mongo. Para
 * cada (profesor, dimensión, timeRange) recalcula los acumulados desde
 * Mongo, los compara con el ZSET actual y reescribe Redis con TTL fresco.
 *
 * Reporta drift detectado (entries que diferían >5%) — el job invocador
 * los publica como Sentry warning.
 *
 * @param {Object} options
 * @param {Array<string>} [options.teacherIds] - Si se omite, reconcilia
 *   TODOS los profesores con sesiones en los últimos 30d.
 * @returns {Promise<{leaderboardsReconciled:number, driftDetected:number, driftCorrected:number}>}
 */
async function reconcileLeaderboards({ teacherIds } = {}) {
  const gamePlayRepository = require('../../repositories/gamePlayRepository');
  const gameSessionRepository = require('../../repositories/gameSessionRepository');
  // % normalizado (score/maxScore×100). Fuente única compartida con el resto de
  // analytics; el reconcile reconstruye el ZSET con el MISMO % que escribe el
  // writer en vivo, manteniendo unidades coherentes (ADR-213).
  const { SCORE_PERCENT_EXPR } = require('./analyticsHelpers');

  // Si no se pasan teacherIds, deducirlos: profesores que tienen sesiones
  // con plays completadas en los últimos 30 días.
  let teachersToProcess = teacherIds;
  if (!Array.isArray(teachersToProcess) || teachersToProcess.length === 0) {
    const lastMonth = new Date(Date.now() - TIME_RANGE_MS['30d']);
    const sessions = await gameSessionRepository.find(
      { updatedAt: { $gte: lastMonth } },
      { select: 'createdBy' }
    );
    teachersToProcess = [...new Set(sessions.map(s => s.createdBy?.toString()))].filter(Boolean);
  }

  let totalReconciled = 0;
  let driftDetected = 0;
  let driftCorrected = 0;

  // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
  for (const teacherId of teachersToProcess) {
    const teacherOid = toObjectId(teacherId);
    if (!teacherOid) {
      continue;
    }

    // (D08-H03) Cargar las sesiones del docente UNA sola vez por docente:
    // los 3 rangos temporales del leaderboard ven exactamente el mismo
    // conjunto de sesiones (el `cutoff` filtra después, en el `$match`
    // sobre `completedAt`). Cachearlas en este scope ahorra 2/3 partes de
    // las queries de listado en cada reconciliación nocturna.
    let teacherSessionIds;
    try {
      const teacherSessions = await gameSessionRepository.find(
        { createdBy: teacherOid },
        { select: '_id', lean: true }
      );
      teacherSessionIds = teacherSessions.map(s => s._id);
    } catch (err) {
      logger.warn('T-931 reconcile error (carga sessionIds del docente)', {
        teacherId: toIdString(teacherId),
        error: err.message
      });
      continue;
    }
    if (teacherSessionIds.length === 0) {
      continue;
    }

    for (const range of LEADERBOARD_TIME_RANGES) {
      const cutoff = new Date(Date.now() - TIME_RANGE_MS[range]);
      // Aggregation: GamePlay → match sessionId IN teacher sessions →
      // lookup session → group por context+mechanic. Reusamos el patrón
      // proyección post-lookup (A.2).
      try {
        const sessionIds = teacherSessionIds;

        const pipeline = [
          {
            $match: {
              sessionId: { $in: sessionIds },
              status: 'completed',
              completedAt: { $gte: cutoff }
            }
          },
          {
            $lookup: {
              from: 'game_sessions',
              localField: 'sessionId',
              foreignField: '_id',
              as: 'session'
            }
          },
          { $unwind: '$session' },
          {
            $project: {
              score: 1,
              maxScore: 1,
              'session.contextId': 1,
              'session.mechanicId': 1
            }
          },
          {
            $facet: {
              byContext: [
                {
                  $group: {
                    _id: '$session.contextId',
                    totalScore: { $sum: SCORE_PERCENT_EXPR },
                    plays: { $sum: 1 }
                  }
                }
              ],
              byMechanic: [
                {
                  $group: {
                    _id: '$session.mechanicId',
                    totalScore: { $sum: SCORE_PERCENT_EXPR },
                    plays: { $sum: 1 }
                  }
                }
              ]
            }
          }
        ];

        const [agg] = await gamePlayRepository.aggregate(pipeline, { maxTimeMS: 10000 });
        const byContextRaw = agg?.byContext || [];
        const byMechanicRaw = agg?.byMechanic || [];

        // Comparar contra Redis y reescribir.
        const reconcileDimension = async (rawRows, dimension) => {
          if (!rawRows.length) {
            // No hay datos — pero podríamos tener datos stale en Redis.
            // Borramos las keys para que no informen valores fantasma.
            await redisService.del(
              NAMESPACES.LEADERBOARD,
              leaderboardId(dimension, 'score', teacherId, range)
            );
            await redisService.del(
              NAMESPACES.LEADERBOARD,
              leaderboardId(dimension, 'plays', teacherId, range)
            );
            return;
          }
          // (D08-M02) Map único `{score, plays}` por miembro: un lookup en
          // lugar de dos, idéntico semánticamente y más legible al iterar.
          const expected = new Map();
          for (const row of rawRows) {
            // eslint-disable-next-line sonarjs/nested-control-flow -- guard-continue en la reconciliación de leaderboards; el nivel de anidamiento es intencional
            if (!row._id) {
              continue;
            }
            expected.set(row._id.toString(), {
              score: Number(row.totalScore) || 0,
              plays: Number(row.plays) || 0
            });
          }

          // (D08-H01) Batch de TODOS los `zscore` en una sola pipeline. La
          // versión anterior abría N pipelines secuenciales (una por miembro
          // de dimensión) con 2 zscore cada una — con 10 contextos × 3 rangos
          // por docente son 30 round-trips al Redis en serie. Ahora es una
          // sola pipeline por dimensión-rango con 2N zscore en orden estable
          // (score, plays alternados); `results[i*2]` es score y `[i*2+1]`
          // es plays para `members[i]`.
          const scoreKey = redisService.buildKey(
            NAMESPACES.LEADERBOARD,
            leaderboardId(dimension, 'score', teacherId, range)
          );
          const playsKey = redisService.buildKey(
            NAMESPACES.LEADERBOARD,
            leaderboardId(dimension, 'plays', teacherId, range)
          );
          const members = [...expected.keys()];
          const liveResults = await redisService.runPipeline(p => {
            for (const member of members) {
              p.zscore(scoreKey, member);
              p.zscore(playsKey, member);
            }
          }, 't931-reconcile-batch');

          let scoreDrifted = false;
          let playsDrifted = false;
          members.forEach((member, idx) => {
            const liveScoreVal = Number(liveResults?.[idx * 2]?.[1] || 0);
            const livePlaysVal = Number(liveResults?.[idx * 2 + 1]?.[1] || 0);
            const { score: expScore, plays: expPlays } = expected.get(member);
            if (Math.abs(liveScoreVal - expScore) > Math.max(1, expScore * 0.05)) {
              scoreDrifted = true;
            }
            if (Math.abs(livePlaysVal - expPlays) > Math.max(1, expPlays * 0.05)) {
              playsDrifted = true;
            }
          });
          if (scoreDrifted || playsDrifted) {
            driftDetected += 1;
            driftCorrected += 1;
          }

          // Reescribir SIEMPRE (idempotente, evita drift acumulado por
          // escrituras perdidas durante caída Redis previa). Usamos
          // pipeline para minimizar round-trips.
          await redisService.runPipeline(p => {
            p.del(scoreKey);
            p.del(playsKey);
            const scoreArgs = [];
            const playsArgs = [];
            for (const [member, { score, plays }] of expected.entries()) {
              scoreArgs.push(score, member);
              playsArgs.push(plays, member);
            }
            if (scoreArgs.length > 0) {
              p.zadd(scoreKey, ...scoreArgs);
              p.expire(scoreKey, LEADERBOARD_TTL_SECONDS);
            }
            if (playsArgs.length > 0) {
              p.zadd(playsKey, ...playsArgs);
              p.expire(playsKey, LEADERBOARD_TTL_SECONDS);
            }
          }, 't931-reconcile');
          totalReconciled += 1;
        };

        await reconcileDimension(byContextRaw, 'context');
        await reconcileDimension(byMechanicRaw, 'mechanic');
      } catch (err) {
        logger.warn('T-931 reconcile error (teacher/range)', {
          teacherId: toIdString(teacherId),
          range,
          error: err.message
        });
      }
    }
  }

  return {
    leaderboardsReconciled: totalReconciled,
    driftDetected,
    driftCorrected
  };
}

/**
 * Reconcilia los `studentMetrics` Hash de Redis contra los `User.studentMetrics`
 * de Mongo. La fuente de verdad es Mongo; sobrescribimos Redis con valores
 * canónicos. Solo procesamos alumnos activos en los últimos 30d (los demás
 * no impactan el dashboard).
 *
 * @returns {Promise<{studentsReconciled:number, driftDetected:number, driftCorrected:number}>}
 */
async function reconcileStudentMetrics() {
  const userRepository = require('../../repositories/userRepository');

  const cutoff = new Date(Date.now() - TIME_RANGE_MS['30d']);
  const activeStudents = await userRepository.find(
    {
      role: 'student',
      status: 'active',
      'studentMetrics.lastPlayedAt': { $gte: cutoff }
    },
    { select: 'studentMetrics' }
  );

  let driftDetected = 0;
  let driftCorrected = 0;
  let processed = 0;

  for (const student of activeStudents) {
    const m = student.studentMetrics || {};
    const studentIdStr = student._id.toString();

    try {
      // Leer materializado actual para medir drift.
      const live = await redisService.hgetall(NAMESPACES.STUDENT_METRICS, studentIdStr);
      const liveTotalGames = Number(live?.totalGamesPlayed) || 0;
      const expectedTotalGames = Number(m.totalGamesPlayed) || 0;
      if (Math.abs(liveTotalGames - expectedTotalGames) > Math.max(1, expectedTotalGames * 0.05)) {
        driftDetected += 1;
        driftCorrected += 1;
      }

      const sumScoresHundredths = Math.round(
        (m.averageScore || 0) * (m.totalGamesPlayed || 0) * 100
      );
      const sumResponseTimeMs = Math.round(
        (m.averageResponseTime || 0) * (m.totalGamesPlayed || 0)
      );
      const samples = m.totalGamesPlayed || 0;

      await redisService.hset(
        NAMESPACES.STUDENT_METRICS,
        studentIdStr,
        {
          totalGamesPlayed: String(m.totalGamesPlayed || 0),
          totalCorrectAnswers: String(m.totalCorrectAnswers || 0),
          totalErrors: String(m.totalErrors || 0),
          totalTimeouts: String(m.totalTimeouts || 0),
          sumScoresHundredths: String(sumScoresHundredths),
          sumResponseTimeMs: String(sumResponseTimeMs),
          responseTimeSamples: String(samples),
          lastPlayedAt: m.lastPlayedAt ? String(new Date(m.lastPlayedAt).getTime()) : '0',
          maxSequenceLengthAchieved: String(m.maxSequenceLengthAchieved || 0),
          sequencesCompleted: String(m.sequencesCompleted || 0)
          // (C1) Mismo TTL que la escritura en vivo: el reconciliador renueva la
          // ventana de 90d para los alumnos activos en lugar de dejar la key
          // permanente (HSET preserva el EXPIRE solo si se vuelve a fijar).
        },
        STUDENT_METRICS_TTL_SECONDS
      );
      processed += 1;
    } catch (err) {
      logger.warn('T-931 reconcileStudentMetrics error (student)', {
        studentId: studentIdStr,
        error: err.message
      });
    }
  }

  return {
    studentsReconciled: processed,
    driftDetected,
    driftCorrected
  };
}

/**
 * Punto de entrada del job nocturno. Encadena reconcileLeaderboards +
 * reconcileStudentMetrics y reporta agregados a runtimeMetrics.
 *
 * @returns {Promise<Object>} Resumen agregado de la corrida.
 */
async function runFullReconciliation() {
  const start = Date.now();
  logger.info('T-931 reconcile job: iniciando');

  const lb = await reconcileLeaderboards({});
  const sm = await reconcileStudentMetrics();

  const totalDrift = lb.driftDetected + sm.driftDetected;
  const totalCorrected = lb.driftCorrected + sm.driftCorrected;

  runtimeMetrics.recordT931Reconcile({
    driftDetected: totalDrift,
    driftCorrected: totalCorrected
  });

  const summary = {
    durationMs: Date.now() - start,
    leaderboardsReconciled: lb.leaderboardsReconciled,
    studentsReconciled: sm.studentsReconciled,
    driftDetected: totalDrift,
    driftCorrected: totalCorrected
  };

  if (totalDrift > 0) {
    logger.warn('T-931 reconcile: drift detectado y corregido', summary);
  } else {
    logger.info('T-931 reconcile job completado sin drift', summary);
  }

  return summary;
}

module.exports = {
  // Escrituras
  recordPlayCompletion,
  // Lecturas
  getTopFromLeaderboard,
  getStudentMetricsMaterialized,
  // GDPR
  purgeStudentMaterialization,
  // Reconciliación
  reconcileLeaderboards,
  reconcileStudentMetrics,
  runFullReconciliation,
  // Constants exportadas para tests
  LEADERBOARD_TIME_RANGES,
  NAMESPACES
};
