/**
 * @fileoverview Servicio de lógica de negocio para GamePlay.
 * Extrae la lógica compleja de gamePlayController para mantener controllers delgados.
 * Principio Single Responsibility: Maneja únicamente la lógica de partidas.
 * @module services/gamePlayService
 */

const gamePlayRepository = require('../repositories/gamePlayRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');
const userRepository = require('../repositories/userRepository');
const { recalculateSessionStatusFromPlays } = require('./sessionStatusService');
const notificationService = require('./notificationService');
const { computeMaxScore } = require('./gamePlayScoring');
const { withTransaction } = require('../utils/withTransaction');
const {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError
} = require('../utils/errors');
const logger = require('../utils/logger').child({ component: 'gamePlayService' });

/**
 * Valida que una sesión de juego esté disponible para crear partidas.
 *
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<Object>} Sesión validada
 * @throws {NotFoundError} Si la sesión no existe
 *
 * QA 2026-05-06 (ADR-113): aceptamos también `status === 'completed'`. Una
 * sesión "completada" no es una sesión cerrada — significa que todas las
 * plays previas terminaron y nadie está jugando ahora mismo. Permitir una
 * nueva play en ese estado es el caso de uso real de "Jugar de Nuevo": el
 * `recalculateSessionStatusFromPlays` la pondrá de vuelta en `'active'` al
 * insertar la play. Antes esta validación rechazaba con "La sesión no
 * está activa" y bloqueaba el botón Jugar de Nuevo en GameOver.
 */
async function validateGameSession(sessionId) {
  // Read-only: la sesión se usa para comprobar permisos/estado y para
  // `computeMaxScore` (función pura sobre los arrays de layout). No se hace
  // `.save()`, así que `lean` devuelve un POJO ligero (regla baseRepository).
  // Sin `select`: computeMaxScore necesita boardLayout/sequencePlan/cardMappings.
  const session = await gameSessionRepository.findById(sessionId, { lean: true });

  if (!session) {
    throw new NotFoundError('Sesión de juego');
  }

  // Estados aceptables para crear plays: 'created' (primera vez), 'active'
  // (otra play en curso), 'completed' (replay tras terminar las anteriores).
  // Si en el futuro se introduce un estado terminal real (`archived`),
  // hay que rechazarlo explícitamente aquí.
  const ACCEPTABLE_STATUSES = new Set(['created', 'active', 'completed']);
  if (!ACCEPTABLE_STATUSES.has(session.status)) {
    throw new ValidationError('La sesión no admite nuevas partidas');
  }

  return session;
}

/**
 * Valida que un jugador pueda participar en la partida.
 *
 * @param {string} playerId - ID del jugador
 * @param {string} sessionId - ID de la sesión
 * @returns {Promise<Object>} Jugador validado
 * @throws {NotFoundError} Si el jugador no existe
 * @throws {ValidationError} Si el jugador no es estudiante o ya tiene partida activa
 */
async function validatePlayer(playerId, sessionId, { creatorId, creatorRole } = {}) {
  // Read-only y solo se leen `role`, `consent` y `createdBy` (el retorno se descarta
  // en createPlay). `lean` + `select` evita hidratar el documento User completo
  // (PII innecesaria) en cada creación de partida.
  const player = await userRepository.findById(playerId, {
    lean: true,
    select: 'role consent createdBy'
  });

  if (!player) {
    throw new NotFoundError('Jugador');
  }

  if (player.role !== 'student') {
    throw new ValidationError('Solo los estudiantes pueden jugar partidas');
  }

  // IDOR (defense in depth): un docente solo puede crear partidas para SUS
  // alumnos. El selector de la UI ya muestra solo los propios, pero el endpoint
  // acepta cualquier `playerId`, así que un docente podía vincular su sesión a un
  // alumno de otro docente pasando su ObjectId directamente. super_admin exento
  // (gestión centralizada). El dueño de la sesión ya se valida en createPlay.
  if (
    creatorRole !== 'super_admin' &&
    creatorId &&
    player.createdBy?.toString() !== creatorId.toString()
  ) {
    throw new ForbiddenError('No tienes permiso para crear partidas para este alumno');
  }

  // Defense in depth: verificar consentimiento activo — Art. 6.1 RGPD (licitud del tratamiento)
  if (!player.consent?.granted) {
    throw new ValidationError(
      'El estudiante no tiene consentimiento parental activo. No puede participar en partidas.'
    );
  }

  // Verificar partida activa existente. DB-7: es un test de EXISTENCIA — basta el
  // `_id` con `lean`. Antes hidrataba el documento completo (incluido el array
  // `events[]`, hasta 500 subdocumentos) solo para comprobar si había una partida
  // activa, incumpliendo la regla operativa del baseRepository (leer lo mínimo).
  const existingPlay = await gamePlayRepository.findOne(
    {
      sessionId,
      playerId,
      status: { $in: ['in-progress', 'paused'] }
    },
    { select: '_id', lean: true }
  );

  if (existingPlay) {
    throw new ValidationError('El jugador ya tiene una partida activa en esta sesión');
  }

  return player;
}

/**
 * Crea una nueva partida para un estudiante en una sesión específica.
 * Incluye validaciones de permisos y estado de sesión.
 *
 * @param {Object} params - Parámetros de creación
 * @param {string} params.sessionId - ID de la sesión
 * @param {string} params.playerId - ID del estudiante
 * @param {string} params.creatorId - ID del profesor que crea la partida
 * @returns {Promise<Object>} Partida creada con populate
 * @throws {ForbiddenError} Si el creador no es el dueño de la sesión
 */
async function createPlay({ sessionId, playerId, creatorId, creatorRole }) {
  // Validar sesión
  const session = await validateGameSession(sessionId);

  // Verificar permisos: solo el creador de la sesión
  if (session.createdBy.toString() !== creatorId.toString()) {
    throw new ForbiddenError('No tienes permiso para crear partidas en esta sesión');
  }

  // Validar jugador (incluye comprobación de propiedad del alumno — IDOR)
  await validatePlayer(playerId, sessionId, { creatorId, creatorRole });

  // Techo de puntuación teórico (P19, ADR-114): usa el tipo explícito de la
  // sesión (`mechanicType`) y, si falta (sesiones legacy aún sin migrar),
  // infiere por huella de datos. La fórmula por mecánica vive en
  // `gamePlayScoring.js`, testeada en aislamiento (ADR-193).
  const maxScore = computeMaxScore(session);

  // Crear partida. El findOne de validatePlayer ya descartó una partida activa
  // previa, pero es un check TOCTOU: ante dos POST concurrentes (doble clic,
  // reintento por 429/timeout) el índice único parcial `uniq_active_play_per_session_player`
  // (A2) es la garantía atómica. Traducimos el error 11000 a un ValidationError
  // de dominio para que el segundo request reciba un mensaje claro en vez de un 500.
  let play;
  try {
    play = await gamePlayRepository.create({
      sessionId,
      playerId,
      status: 'in-progress',
      score: 0,
      maxScore,
      currentRound: 1
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ConflictError('El jugador ya tiene una partida activa en esta sesión');
    }
    throw err;
  }

  // Populate para respuesta completa (RGPD data minimization: solo campos necesarios del perfil)
  await play.populate([
    { path: 'sessionId', select: 'mechanicId contextId config difficulty' },
    { path: 'playerId', select: 'name profile.classroom profile.age' }
  ]);

  logger.info('Partida creada via service', {
    playId: play._id,
    sessionId,
    playerId,
    createdBy: creatorId
  });

  await recalculateSessionStatusFromPlays(sessionId);

  return play;
}

/**
 * Añade un evento a una partida en progreso.
 * Actualiza métricas automáticamente según el tipo de evento.
 *
 * @param {string} playId - ID de la partida
 * @param {Object} eventData - Datos del evento
 * @param {string} eventData.eventType - Tipo de evento (card_scanned, correct, error, timeout, round_start, round_end)
 * @param {string} [eventData.cardUid] - UID de la tarjeta escaneada
 * @param {string} [eventData.expectedValue] - Valor esperado
 * @param {string} [eventData.actualValue] - Valor recibido
 * @param {number} [eventData.pointsAwarded] - Puntos otorgados
 * @param {number} [eventData.timeElapsed] - Tiempo transcurrido en ms
 * @param {number} [eventData.roundNumber] - Número de ronda
 * @returns {Promise<Object>} Partida actualizada
 * @throws {NotFoundError} Si la partida no existe
 * @throws {ValidationError} Si la partida no está en progreso
 */
async function addEventToPlay(playId, eventData) {
  // `select: '-events'` evita rehidratar el array `events[]` (hasta 500 sub-docs)
  // en CADA evento de partida (path más caliente, un evento por scan RFID). El
  // documento sigue siendo no-lean para poder llamar `play.addEvent()`, que
  // persiste vía `updateOne($push/$inc)` sin leer el array previo; aquí solo se
  // lee `status` (vía `isInProgress()`). Antes se cargaba el doc completo → coste
  // O(eventos²) en bytes a lo largo de una partida.
  const play = await gamePlayRepository.findById(playId, { select: '-events' });

  if (!play) {
    throw new NotFoundError('Partida');
  }

  if (!play.isInProgress()) {
    throw new ValidationError('La partida no está en progreso');
  }

  // Usar método del modelo que actualiza métricas automáticamente
  await play.addEvent(eventData);

  logger.info('Evento añadido via service', {
    playId: play._id,
    eventType: eventData.eventType,
    roundNumber: eventData.roundNumber
  });

  return play;
}

/**
 * Completa una partida y actualiza las métricas del estudiante.
 * Calcula rating y actualiza User.studentMetrics.
 *
 * @param {string} playId - ID de la partida
 * @returns {Promise<Object>} Objeto con partida completada y rating
 * @throws {NotFoundError} Si la partida no existe
 * @throws {ValidationError} Si la partida ya no está en progreso
 */
async function completePlay(playId) {
  // T-907 INT6: el populate original traía documentos completos de User
  // (RGPD: PII innecesaria) y GameSession (cardMappings grande). Acotamos:
  //   - playerId: solo _id basta para `play.playerId._id` (línea 280) y el
  //     refetch a `userRepository.findById` (línea 243) cuando hay consent.
  //   - sessionId: necesitamos `config` (pointsPerCorrect, numberOfRounds
  //     para `calculateRating`) y `_id` para `recalculateSessionStatusFromPlays`.
  const play = await gamePlayRepository.findById(playId, {
    // `playerId` NO se popula: solo necesitábamos su `_id`, que YA es el propio
    // `play.playerId` (ObjectId del ref). El populate con `select:'_id'` materializaba
    // un documento {_id} inútil (un round-trip y un wrap sin valor).
    // `name`/`createdBy` (A1): la notificación play_completed al docente los usa.
    populate: [{ path: 'sessionId', select: 'config name createdBy' }]
  });

  if (!play) {
    throw new NotFoundError('Partida');
  }

  if (!play.isInProgress()) {
    throw new ValidationError('La partida ya no está en progreso');
  }

  // H1: `complete()` + `updateStudentMetrics()` ATÓMICOS en una transacción.
  // Antes eran dos escrituras sueltas: un fallo entre ambas dejaba la partida
  // `completed` sin reflejar en studentMetrics, y dos finalizaciones concurrentes
  // del mismo alumno corrompían la media (read-modify-write con last-write-wins).
  // La transacción da atomicidad y serializa (write-conflict → withTransaction
  // reintenta con lectura fresca). En Mongo standalone (tests) withTransaction
  // degrada a ejecución directa sin sesión.
  let prevAverage = null;
  let metricsUpdated = false;
  let studentName = null;

  await withTransaction(async session => {
    await play.complete({ session });

    // Solo si el tutor no ha ejercido el derecho de oposición a analytics (RGPD Art. 21).
    // Se re-lee el alumno DENTRO de la txn: en un reintento por write-conflict hay
    // que partir de la media persistida fresca, no de una copia previa en memoria.
    const player = await userRepository.findById(play.playerId, { session });
    studentName = player?.name || null;
    if (player?.hasConsentFor('performance_analytics')) {
      prevAverage =
        typeof player.studentMetrics?.averageScore === 'number'
          ? player.studentMetrics.averageScore
          : null;
      await player.updateStudentMetrics(
        {
          score: play.score,
          maxScore: play.maxScore,
          correctAttempts: play.metrics.correctAttempts,
          errorAttempts: play.metrics.errorAttempts,
          timeoutAttempts: play.metrics.timeoutAttempts,
          averageResponseTime: play.metrics.averageResponseTime
        },
        { session }
      );
      metricsUpdated = true;
    }
  });

  // Trigger de notificación FUERA de la txn (efecto secundario, no parte de la
  // atomicidad). Comprueba si el alumno cruzó el umbral 50 hacia abajo tras la
  // actualización. La dedup window 60s del notificationService evita spam.
  if (metricsUpdated) {
    await notifyStudentAtRiskIfTransition(play.playerId, prevAverage).catch(err => {
      logger.warn('Trigger notify student_at_risk ignorado', {
        playerId: play.playerId,
        error: err?.message
      });
    });
  }

  // Calcular rating (A4): usar el maxScore PERSISTIDO (computeMaxScore, correcto
  // por mecánica), no pointsPerCorrect×rondas — esa fórmula plana daba estrellas
  // erróneas en Secuencia/Memoria (cuyo techo no es lineal en las rondas).
  const rating = calculateRating(play.score, play.maxScore);

  logger.info('Partida completada via service', {
    playId: play._id,
    playerId: play.playerId,
    finalScore: play.score,
    rating
  });

  await recalculateSessionStatusFromPlays(play.sessionId._id);

  // Notificación al docente que creó la sesión (T-955 trigger: play_completed).
  // Tono conversacional (Microcopy_Style_Guide). El microcopy y los 3 niveles
  // de praise dependen del porcentaje de aciertos canónico (mismo umbral que
  // calculateStars del frontend, lib/utils.js).
  await notifyTeacherPlayCompleted({
    teacherId: play.sessionId?.createdBy,
    studentName,
    studentId: play.playerId,
    sessionName: play.sessionId?.name,
    sessionId: play.sessionId?._id,
    score: play.score,
    maxScore: play.maxScore,
    playId: play._id
  }).catch(err => {
    // notify() ya captura sus propios errores; este catch es defensa por si
    // fallara el cálculo de microcopy. Nunca debe bloquear el flujo.
    logger.warn('Trigger notify play_completed ignorado por error', {
      playId: play._id,
      error: err?.message
    });
  });

  return { play, rating };
}

/**
 * (I5) Marca una partida en curso como abandonada y recalcula el estado de la
 * sesión. Extraído del controller para que `abandonPlay` delegue la lógica de
 * dominio igual que `completePlay` (controllers delgados). La limpieza del motor
 * de juego (timers/Redis) permanece en el controller porque necesita `req.app`.
 *
 * @param {string} playId
 * @returns {Promise<Object>} La partida abandonada.
 * @throws {NotFoundError} Si la partida no existe.
 * @throws {ValidationError} Si la partida ya no está en progreso.
 */
async function abandonPlay(playId) {
  const play = await gamePlayRepository.findById(playId);

  if (!play) {
    throw new NotFoundError('Partida');
  }

  if (!play.isInProgress()) {
    throw new ValidationError('La partida ya no está en progreso');
  }

  play.status = 'abandoned';
  play.completedAt = new Date();
  await play.save();

  // DB-9: registrar el abandono en las métricas del alumno también en ESTE path.
  // Antes solo lo hacía `GameEngine.endPlay({abandoned:true})` para partidas AÚN en
  // el motor; una partida huérfana abandonada por este service (el caso del fix de
  // salida del frontend — bug #1) dejaba `totalAbandonedGames` infracontado. Mismo
  // patrón que el motor. Best-effort: un fallo registrando la métrica no debe
  // impedir el abandono en sí. El controller garantiza que NO se cuente dos veces
  // (llama a este service O a endPlay, nunca ambos — ver gamePlayController.abandonPlay).
  try {
    const player = await userRepository.findById(play.playerId);
    if (player && player.role === 'student') {
      await player.recordAbandonedGame();
    }
  } catch (err) {
    logger.warn('No se pudo registrar recordAbandonedGame al abandonar partida', {
      playId: play._id,
      playerId: play.playerId,
      error: err?.message
    });
  }

  await recalculateSessionStatusFromPlays(play.sessionId);

  logger.info('Partida abandonada via service', {
    playId: play._id,
    playerId: play.playerId,
    abandonedAt: play.completedAt
  });

  return play;
}

/**
 * Escala canónica de estrellas (1-5) a partir del porcentaje de aciertos.
 * Umbrales 90/75/60/40; mínimo 1⭐ (motivador para 4-8 años). Fuente ÚNICA
 * compartida por la nota del docente y el rating de la respuesta de partida,
 * y alineada con el frontend (lib/utils.js calculateStars).
 *
 * @param {number} percentage - 0..100
 * @returns {number} 1..5
 */
function scorePercentToStars(percentage) {
  if (percentage >= 90) {
    return 5;
  }
  if (percentage >= 75) {
    return 4;
  }
  if (percentage >= 60) {
    return 3;
  }
  if (percentage >= 40) {
    return 2;
  }
  return 1;
}

/**
 * Calcula el número de estrellas (1-5) a partir de score y el maxScore PERSISTIDO.
 *
 * (A4) Usa `maxScore` directamente (el techo real por mecánica que calcula
 * `computeMaxScore` y se guarda en la partida), NO `pointsPerCorrect × rondas`:
 * esa fórmula plana solo es correcta para Asociación; en Secuencia/Memoria el
 * techo no es lineal en las rondas, así que daba estrellas erróneas.
 *
 * @param {number} score
 * @param {number} maxScore - Techo teórico persistido en la partida.
 * @returns {number} 1..5
 */
function starsFromScore(score, maxScore) {
  const max = Number(maxScore) || 0;
  const percentage = max > 0 ? (Number(score) / max) * 100 : 0;
  return scorePercentToStars(percentage);
}

/**
 * Frase de elogio asociada al número de estrellas (1-5) conseguidas.
 * Mantener tono docente conversacional, sin tecnicismos.
 *
 * @param {number} stars - 1..5
 * @returns {string}
 */
function getPraiseForStars(stars) {
  if (stars >= 5) {
    return '¡Trabajo redondo!';
  }
  if (stars === 4) {
    return '¡Casi perfecto!';
  }
  if (stars === 3) {
    return '¡Buen ritmo!';
  }
  if (stars === 2) {
    return 'Sigue así.';
  }
  return 'Toca repasar — vuelve a intentarlo.';
}

/**
 * Detecta la transición a "en riesgo" del alumno (avg score cae bajo 50)
 * y notifica al docente que lo creó. T-955 / student_at_risk.
 *
 * Solo dispara cuando la media previa era >= 50 y la media nueva es < 50.
 * Re-cae a refetch del documento para leer la media recalculada.
 *
 * @param {import('mongoose').Types.ObjectId|string} playerId
 * @param {number|null} prevAverage - Media antes de aplicar la última partida.
 * @returns {Promise<void>}
 */
async function notifyStudentAtRiskIfTransition(playerId, prevAverage) {
  if (prevAverage === null || !Number.isFinite(prevAverage)) {
    return;
  }
  if (prevAverage < 50) {
    return;
  }
  const refreshed = await userRepository.findById(playerId);
  const newAverage = refreshed?.studentMetrics?.averageScore;
  if (typeof newAverage !== 'number' || newAverage >= 50) {
    return;
  }
  const teacherId = refreshed?.createdBy?.toString?.();
  if (!teacherId) {
    return;
  }
  await notificationService.notify({
    userId: teacherId,
    type: 'student_at_risk',
    priority: 'warning',
    title: 'Un alumno necesita refuerzo',
    body: `${refreshed.name || 'Un alumno'} ha bajado su rendimiento al ${Math.round(newAverage)}%. Revisa su progreso.`,
    link: `/students/${refreshed._id}`,
    metadata: {
      studentId: refreshed._id.toString(),
      prevAverage: Math.round(prevAverage),
      newAverage: Math.round(newAverage)
    }
  });
}

/**
 * Dispara la notificación `play_completed` al docente que creó la sesión.
 * No bloquea el flujo de dominio (errores ignorados por notify()).
 *
 * (A1) Recibe primitivos en vez de un documento Mongoose para que la llamen
 * TANTO `completePlay` (endpoint HTTP) COMO `GameEngine.endPlay` (el flujo real
 * de juego, que antes no notificaba nada — la feature estaba muerta en producción).
 *
 * @param {object} args
 * @param {string|object} args.teacherId - Docente destinatario (dueño de la sesión).
 * @param {string} [args.studentName]
 * @param {string|object} [args.studentId]
 * @param {string} [args.sessionName]
 * @param {string|object} args.sessionId
 * @param {number} args.score
 * @param {number} args.maxScore - Techo persistido (A4: estrellas correctas por mecánica).
 * @param {string|object} [args.playId]
 * @returns {Promise<void>}
 */
async function notifyTeacherPlayCompleted({
  teacherId,
  studentName,
  studentId,
  sessionName,
  sessionId,
  score,
  maxScore,
  playId
}) {
  const teacher = teacherId?.toString?.() || (teacherId ? String(teacherId) : null);
  if (!teacher || !sessionId) {
    return;
  }
  const stars = starsFromScore(score, maxScore);
  const praise = getPraiseForStars(stars);
  const starsLabel = stars === 1 ? '1 estrella' : `${stars} estrellas`;

  await notificationService.notify({
    userId: teacher,
    type: 'play_completed',
    priority: 'info',
    title: `${studentName || 'Un alumno'} ha completado una partida`,
    body: `${sessionName || 'una sesión'} · ${starsLabel} · ${praise}`,
    // Normaliza el id: acepta ObjectId, string o un documento de sesión POPULADO
    // (endPlay pasa `playDoc.sessionId` populado). Sin extraer `_id`, un doc
    // populado se serializaba entero en el link (>2000 chars) y superaba el
    // maxlength(200) del modelo Notification → la notificación fallaba SIEMPRE.
    link: `/sessions/${sessionId?._id?.toString?.() || sessionId?.toString?.() || sessionId}`,
    metadata: {
      playId: playId ? playId.toString?.() || String(playId) : undefined,
      sessionId: sessionId.toString?.() || String(sessionId),
      studentId: studentId ? studentId.toString?.() || String(studentId) : undefined,
      score,
      stars
    }
  });
}

/**
 * Rating visual en estrellas (⭐ a ⭐⭐⭐⭐⭐) basado en la puntuación.
 * Deriva de la MISMA escala canónica que la nota del docente (scorePercentToStars),
 * así que ambos coinciden siempre.
 *
 * @param {number} score - Puntuación final
 * @param {number} maxScore - Techo teórico PERSISTIDO de la partida (A4).
 * @returns {string} Rating en estrellas (⭐ a ⭐⭐⭐⭐⭐)
 */
function calculateRating(score, maxScore) {
  return '⭐'.repeat(starsFromScore(score, maxScore));
}

/**
 * Calcula estadísticas agregadas de un jugador.
 * Puede filtrar por sesión específica o calcular para todas las sesiones.
 *
 * @param {string} playerId - ID del jugador
 * @param {string} [sessionId] - ID de sesión opcional para filtrar
 * @returns {Promise<Object>} Estadísticas calculadas
 */
async function getPlayerStats(playerId, sessionId = null) {
  const filter = { playerId, status: 'completed' };
  if (sessionId) {
    filter.sessionId = sessionId;
  }

  const stats = await gamePlayRepository.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalPlays: { $sum: 1 },
        totalScore: { $sum: '$score' },
        averageScore: { $avg: '$score' },
        bestScore: { $max: '$score' },
        worstScore: { $min: '$score' },
        totalCorrect: { $sum: '$metrics.correctAttempts' },
        totalErrors: { $sum: '$metrics.errorAttempts' },
        averageResponseTime: { $avg: '$metrics.averageResponseTime' },
        totalCompletionTime: { $sum: '$metrics.completionTime' }
      }
    }
  ]);

  const result = stats[0] || {
    totalPlays: 0,
    totalScore: 0,
    averageScore: 0,
    bestScore: 0,
    worstScore: 0,
    totalCorrect: 0,
    totalErrors: 0,
    averageResponseTime: 0,
    totalCompletionTime: 0
  };

  delete result._id;

  // Calcular tasa de acierto
  const accuracyRate =
    result.totalCorrect + result.totalErrors > 0
      ? Number.parseFloat(
          ((result.totalCorrect / (result.totalCorrect + result.totalErrors)) * 100).toFixed(2)
        )
      : 0;

  return {
    playerId,
    sessionId: sessionId || 'all',
    stats: {
      ...result,
      accuracyRate
    }
  };
}

/**
 * Calcula estadísticas de partidas agrupadas por sesión, incluyendo:
 *   - `playsCount` y `averageScore` (uso histórico).
 *   - `lastPlayedAt`: fecha de la última partida completada (para PROP-5,
 *     "hace X días" en SessionCard).
 *   - `recentScores`: hasta 7 últimas puntuaciones, ordenadas cronológicamente
 *     ascendente (para sparkline en SessionCard, PROP-5).
 *
 * Devuelve un Map sessionId → stats. Solo considera plays con `status: 'completed'`.
 *
 * @param {Array<string|ObjectId>} sessionIds - IDs de sesiones
 * @returns {Promise<Object>} Mapa sessionId → stats
 */
async function getPlayStatsBySessionIds(sessionIds) {
  if (!sessionIds || sessionIds.length === 0) {
    return {};
  }

  const playStatsAgg = await gamePlayRepository.aggregate([
    { $match: { sessionId: { $in: sessionIds }, status: 'completed' } },
    {
      $group: {
        _id: '$sessionId',
        playsCount: { $sum: 1 },
        averageScore: { $avg: '$score' },
        lastPlayedAt: { $max: '$completedAt' },
        // $topN (Mongo 5.2+) acota la acumulación a las 7 partidas más recientes
        // DESDE EL PRINCIPIO. La versión previa hacía un `$sort` global del set
        // completo + `$push` de cada partida del grupo + `$slice 7` posterior:
        // en sesiones con cientos de partidas, el array intermedio crecía con el
        // grupo entero aunque la salida fuesen 7. `$topN` ordena internamente
        // (su `sortBy`), así que además elimina el `$sort` previo del set completo.
        recentScoresDesc: {
          $topN: {
            n: 7,
            sortBy: { completedAt: -1 },
            output: { score: '$score', completedAt: '$completedAt' }
          }
        }
      }
    },
    {
      $project: {
        playsCount: 1,
        averageScore: 1,
        lastPlayedAt: 1,
        // recentScoresDesc ya viene acotado a 7 (desc) → revertir para orden asc.
        recentScores: { $reverseArray: '$recentScoresDesc' }
      }
    }
  ]);

  const statsMap = {};
  for (const stat of playStatsAgg) {
    statsMap[stat._id.toString()] = {
      playsCount: stat.playsCount,
      averageScore: Math.round(stat.averageScore ?? 0),
      lastPlayedAt: stat.lastPlayedAt || null,
      recentScores: (stat.recentScores || []).map(s => ({
        score: Math.round(s.score ?? 0),
        completedAt: s.completedAt
      }))
    };
  }
  return statsMap;
}

/**
 * Verifica si una sesión tiene partidas activas (in-progress o paused).
 *
 * @param {string|ObjectId} sessionId - ID de la sesión
 * @returns {Promise<number>} Número de partidas activas
 */
async function countActivePlays(sessionId) {
  return gamePlayRepository.count({
    sessionId,
    status: { $in: ['in-progress', 'paused'] }
  });
}

module.exports = {
  createPlay,
  addEventToPlay,
  completePlay,
  abandonPlay,
  getPlayerStats,
  getPlayStatsBySessionIds,
  countActivePlays,
  validateGameSession,
  validatePlayer,
  calculateRating,
  // A1: expuestas para que GameEngine.endPlay (flujo real de juego) dispare las
  // notificaciones al docente, que antes solo vivían en el endpoint HTTP huérfano.
  notifyTeacherPlayCompleted,
  notifyStudentAtRiskIfTransition
};
