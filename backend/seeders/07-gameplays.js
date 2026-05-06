/**
 * @fileoverview Seeder de partidas individuales (GamePlay).
 * Genera partidas con eventos y métricas realistas para alimentar 30 endpoints de analytics.
 *
 * Mejoras sobre versión anterior:
 * - Rango temporal: 60 días (antes: 10 días)
 * - Partidas por alumno: 8-15 (antes: 2-5)
 * - Estados: completed + abandoned (antes: solo completed)
 * - Re-intentos: misma sesión jugada múltiples veces
 * - Patrones temporales: variabilidad entre días
 * - Fatiga simulada: tiempos crecientes en rondas finales
 *
 * Ver backend/docs/Analytics_Design_Rationale.md para contexto de BI.
 * @module seeders/07-gameplays
 */

const GamePlay = require('../src/models/GamePlay');
const GameSession = require('../src/models/GameSession');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

// ══════════════════════════════════════════════════════════════════════
// Perfiles de estudiante con soporte para evolución temporal
// ══════════════════════════════════════════════════════════════════════

/**
 * Perfiles de estudiante extendidos para analytics avanzados.
 * Cada perfil define cómo varía el rendimiento en el tiempo.
 */
const STUDENT_PROFILES = {
  high_performer: {
    label: 'Alto rendimiento estable',
    baseSuccessProb: 0.97,
    timeoutProb: 0.01,
    avgSpeed: 2200,
    // Tendencia: estable, muy consistente — genera tier "Excelente" (90+)
    improvementPerGame: 0.008,
    fatigueMultiplier: 1.1,
    abandonProbability: 0.01
  },
  improving: {
    label: 'Mejorando progresivamente',
    baseSuccessProb: 0.6,
    timeoutProb: 0.08,
    avgSpeed: 5500,
    // Tendencia: mejora clara, termina en "Bueno" (70-89)
    improvementPerGame: 0.045,
    fatigueMultiplier: 1.25,
    abandonProbability: 0.06
  },
  declining: {
    label: 'Rendimiento en descenso',
    baseSuccessProb: 0.75,
    timeoutProb: 0.05,
    avgSpeed: 3500,
    // Tendencia: empeora
    improvementPerGame: -0.025,
    fatigueMultiplier: 1.4,
    abandonProbability: 0.12
  },
  plateau: {
    label: 'Estancado',
    baseSuccessProb: 0.65,
    timeoutProb: 0.06,
    avgSpeed: 4500,
    // Tendencia: estable sin mejora
    improvementPerGame: 0.002,
    fatigueMultiplier: 1.2,
    abandonProbability: 0.05
  },
  struggling: {
    label: 'Con dificultades',
    baseSuccessProb: 0.35,
    timeoutProb: 0.18,
    avgSpeed: 8000,
    // Tendencia: ligera mejora pero lenta
    improvementPerGame: 0.015,
    fatigueMultiplier: 1.5,
    abandonProbability: 0.15
  },
  average: {
    label: 'Rendimiento medio',
    baseSuccessProb: 0.8,
    timeoutProb: 0.05,
    avgSpeed: 3500,
    // Tendencia: mejora moderada, termina en "Bueno"
    improvementPerGame: 0.025,
    fatigueMultiplier: 1.2,
    abandonProbability: 0.04
  }
};

const PROFILE_NAMES = Object.keys(STUDENT_PROFILES);

// ══════════════════════════════════════════════════════════════════════
// Funciones de generación de eventos
// ══════════════════════════════════════════════════════════════════════

/**
 * Genera la configuración de rendimiento para una ronda específica,
 * considerando el perfil del alumno, su progresión y la fatiga.
 *
 * @param {Object} profile - Perfil STUDENT_PROFILES[key]
 * @param {number} gameNumber - Número de partida (para progresión temporal)
 * @param {number} round - Ronda actual
 * @param {number} numberOfRounds - Total de rondas
 * @returns {Object} { successProb, timeoutProb, avgSpeed }
 */
function getProfileConfig(profile, gameNumber, round, numberOfRounds) {
  // Progresión temporal: el alumno mejora/empeora con cada partida
  const progression = Math.min(gameNumber * profile.improvementPerGame, 0.3);
  const successProb = Math.max(0.1, Math.min(0.98, profile.baseSuccessProb + progression));
  const timeoutProb = Math.max(0.01, profile.timeoutProb - progression * 0.3);

  // Fatiga: los tiempos aumentan en las rondas finales
  const roundProgress = round / numberOfRounds;
  const fatigueEffect =
    roundProgress > 0.5 ? 1 + (roundProgress - 0.5) * (profile.fatigueMultiplier - 1) * 2 : 1;

  const avgSpeed = profile.avgSpeed * fatigueEffect;

  return { successProb, timeoutProb, avgSpeed };
}

function resolveRoundResult({ random, successProb, timeoutProb, finalSpeed, config }) {
  if (random < successProb) {
    return {
      eventType: 'correct',
      pointsAwarded: config.pointsPerCorrect,
      timeElapsed: Math.min(finalSpeed, config.timeLimit * 1000),
      counters: { correctAttempts: 1, errorAttempts: 0, timeoutAttempts: 0 }
    };
  }

  if (random < 1 - timeoutProb) {
    return {
      eventType: 'error',
      pointsAwarded: config.penaltyPerError,
      timeElapsed: Math.min(finalSpeed + 1000, config.timeLimit * 1000),
      counters: { correctAttempts: 0, errorAttempts: 1, timeoutAttempts: 0 }
    };
  }

  return {
    eventType: 'timeout',
    pointsAwarded: 0,
    timeElapsed: config.timeLimit * 1000,
    counters: { correctAttempts: 0, errorAttempts: 0, timeoutAttempts: 1 }
  };
}

function resolveCardUid(eventType, expectedMapping, errorMapping) {
  if (eventType === 'error') {
    return errorMapping.uid;
  }
  if (eventType === 'correct') {
    return expectedMapping.uid;
  }
  return undefined;
}

function resolveActualValue(eventType, expectedMapping, errorMapping) {
  if (eventType === 'correct') {
    return expectedMapping.assignedValue;
  }
  return errorMapping.assignedValue;
}

function buildRoundEvents({
  roundStartTime,
  round,
  eventType,
  expectedMapping,
  errorMapping,
  pointsAwarded,
  timeElapsed,
  isMemory
}) {
  // Replica fielmente lo que emite GameEngine:
  // 1. round_start al iniciar ronda (GameEngine.js:982)
  // 2. En memory, card_scanned antes del outcome del par resuelto (GameEngine.js:769-777)
  // 3. correct | error | timeout con advanceRound (GameEngine.js:793, 1175-1178, 1271)
  // NO emite round_end: el enum lo contempla pero el engine nunca lo invoca.
  const events = [
    {
      timestamp: new Date(roundStartTime),
      eventType: 'round_start',
      roundNumber: round
    }
  ];

  if (isMemory && eventType !== 'timeout') {
    // En memory, el first_pick se registra como card_scanned sin puntos
    // antes de resolverse el par. timeout no genera first_pick.
    const firstPickElapsed = Math.max(0, Math.floor(timeElapsed / 2));
    events.push({
      timestamp: new Date(roundStartTime + firstPickElapsed),
      eventType: 'card_scanned',
      cardUid: expectedMapping.uid,
      expectedValue: expectedMapping.assignedValue,
      actualValue: expectedMapping.assignedValue,
      pointsAwarded: 0,
      timeElapsed: firstPickElapsed,
      roundNumber: round
    });
  }

  events.push({
    timestamp: new Date(roundStartTime + timeElapsed),
    eventType,
    cardUid: resolveCardUid(eventType, expectedMapping, errorMapping),
    expectedValue: expectedMapping.assignedValue,
    actualValue: resolveActualValue(eventType, expectedMapping, errorMapping),
    pointsAwarded,
    timeElapsed,
    roundNumber: round
  });

  return events;
}

/**
 * Genera eventos para una partida.
 *
 * @param {number} numberOfRounds - Rondas de la sesión
 * @param {Object} config - Configuración de la sesión
 * @param {Array} cardMappings - Mapeos de tarjetas
 * @param {Object} profile - Perfil STUDENT_PROFILES[key]
 * @param {number} gameNumber - Número de partida (para progresión)
 * @param {boolean} willAbandon - Si la partida será abandonada
 * @param {boolean} isMemory - Si la sesión es mecánica memory (para emitir card_scanned)
 * @returns {Object} { events, score, metrics, roundsPlayed }
 */
function generatePlayEvents(
  numberOfRounds,
  config,
  cardMappings,
  profile,
  gameNumber,
  willAbandon,
  isMemory
) {
  const events = [];
  let score = 0;
  let correctAttempts = 0;
  let errorAttempts = 0;
  let timeoutAttempts = 0;
  const responseTimes = [];

  // Si abandona, jugar solo una parte de las rondas
  const roundsToPlay = willAbandon
    ? Math.max(1, Math.floor(numberOfRounds * (0.3 + Math.random() * 0.4)))
    : numberOfRounds;

  const jitter = (numberOfRounds * 7919 + gameNumber * 1237) % 60000;
  const startTime = Date.now() - numberOfRounds * 20000 - jitter;

  for (let round = 1; round <= roundsToPlay; round++) {
    const roundStartTime = startTime + (round - 1) * 15000;

    const { successProb, timeoutProb, avgSpeed } = getProfileConfig(
      profile,
      gameNumber,
      round,
      numberOfRounds
    );

    const random = Math.random();
    const speedJitter = Math.random() * 2000 - 1000;
    const finalSpeed = Math.max(1000, avgSpeed + speedJitter);

    const mappingIndex = (round - 1) % cardMappings.length;
    const expectedMapping = cardMappings[mappingIndex];
    const errorMapping = cardMappings[(mappingIndex + 1) % cardMappings.length] || expectedMapping;

    const roundResult = resolveRoundResult({
      random,
      successProb,
      timeoutProb,
      finalSpeed,
      config
    });

    const { eventType, pointsAwarded, timeElapsed } = roundResult;
    correctAttempts += roundResult.counters.correctAttempts;
    errorAttempts += roundResult.counters.errorAttempts;
    timeoutAttempts += roundResult.counters.timeoutAttempts;

    score += pointsAwarded;
    responseTimes.push(timeElapsed);

    events.push(
      ...buildRoundEvents({
        roundStartTime,
        round,
        eventType,
        expectedMapping,
        errorMapping,
        pointsAwarded,
        timeElapsed,
        isMemory
      })
    );
  }

  const averageResponseTime =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

  return {
    events,
    score,
    metrics: {
      totalAttempts: roundsToPlay,
      correctAttempts,
      errorAttempts,
      timeoutAttempts,
      averageResponseTime,
      completionTime: 0 // Se recalcula con timestamps reales en generateGamePlaysData
    },
    roundsPlayed: roundsToPlay
  };
}

/**
 * Deriva métricas específicas de la mecánica Memoria (ADR-A/B). Genera un
 * objeto plano que se persiste en `GamePlay.metrics.memory` para que los
 * highlight cards y el GameOver del cierre tengan datos realistas.
 */
function deriveMemoryMetricsFromProfile({ profile, session, gameNumber, willAbandon }) {
  const totalCards = Array.isArray(session.boardLayout) ? session.boardLayout.length : 0;
  const groupSize = Number(session.mechanicId?.rules?.behavior?.matchingGroupSize) || 2;
  const totalGroups = totalCards > 0 ? Math.floor(totalCards / groupSize) : 0;

  // Probabilidad de completar grupos basada en perfil + progresión.
  const progression = Math.min(gameNumber * profile.improvementPerGame, 0.3);
  const completionRate = Math.max(0.2, Math.min(1, profile.baseSuccessProb + progression));
  // Si abandona, juega solo una fracción de los grupos.
  const completed = willAbandon
    ? Math.floor(totalGroups * 0.3)
    : Math.floor(totalGroups * completionRate);

  // Mejor racha: 70% del completado en perfiles altos, 40% en struggling.
  const streakRatio = profile.baseSuccessProb > 0.8 ? 0.7 : 0.4;
  const peakStreak = Math.max(1, Math.round(completed * streakRatio));

  // Tiempo medio por grupo: avgSpeed × fatiga moderada.
  const averageMatchTimeMs = Math.round(profile.avgSpeed * 1.15);

  // Primer match: alumnos con baseSuccessProb alto lo pillan en el 1er-2º
  // intento; struggling tarda 4-6.
  const attemptsToFirstMatch =
    completed > 0 ? Math.max(1, Math.round((1 - profile.baseSuccessProb) * 6) + 1) : null;

  return {
    groupsMatched: completed,
    peakStreak: completed > 0 ? peakStreak : 0,
    averageMatchTimeMs: completed > 0 ? averageMatchTimeMs : 0,
    attemptsToFirstMatch,
    groupSize
  };
}

/**
 * Deriva métricas específicas de la mecánica Asociación (ADR-A/B). El mapa
 * `byValueAccuracy` se construye con los `assignedValue` reales del mazo
 * para que el GameOver y el `categoryDominance` aparezcan creíbles.
 */
function deriveAssociationMetricsFromProfile({ profile, session, roundsPlayed, willAbandon }) {
  const mappings = Array.isArray(session.cardMappings) ? session.cardMappings : [];
  const progression = Math.min((profile.improvementPerGame || 0) * 5, 0.2);
  const successRate = Math.max(0.2, Math.min(0.98, profile.baseSuccessProb + progression));

  const byValueAccuracy = {};
  let peakStreak = 0;
  let currentStreak = 0;
  let quickestCorrectMs = null;
  let slowestCorrectMs = null;
  let correctCount = 0;

  // Distribuye `roundsPlayed` rondas entre los mappings de forma cíclica
  // (el plan de Asociación elige por roundNumber).
  const rounds = willAbandon ? Math.floor(roundsPlayed * 0.6) : roundsPlayed;
  for (let i = 0; i < rounds && mappings.length > 0; i += 1) {
    const mapping = mappings[i % mappings.length];
    const value = mapping?.assignedValue || `__unknown_${i}__`;
    if (!byValueAccuracy[value]) {
      byValueAccuracy[value] = { correct: 0, total: 0 };
    }
    byValueAccuracy[value].total += 1;

    // Pseudo-aleatoriedad determinista (round * mapping hash).
    const seed = ((i + 1) * 7919 + value.length * 31) % 1000;
    const isCorrect = seed / 1000 < successRate;

    if (isCorrect) {
      byValueAccuracy[value].correct += 1;
      correctCount += 1;
      currentStreak += 1;
      peakStreak = Math.max(peakStreak, currentStreak);
      const elapsedMs = Math.round(profile.avgSpeed * (0.7 + (seed % 60) / 100));
      quickestCorrectMs =
        quickestCorrectMs === null ? elapsedMs : Math.min(quickestCorrectMs, elapsedMs);
      slowestCorrectMs =
        slowestCorrectMs === null ? elapsedMs : Math.max(slowestCorrectMs, elapsedMs);
    } else {
      currentStreak = 0;
    }
  }

  // categoryDominance: el slug con mejor ratio (correct/total) entre los
  // que tienen total >= 1. Idéntico al builder runtime.
  let bestSlug = null;
  let bestRatio = -1;
  for (const slug of Object.keys(byValueAccuracy).sort()) {
    const stats = byValueAccuracy[slug];
    if (stats.total <= 0) {
      continue;
    }
    const ratio = stats.correct / stats.total;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestSlug = slug;
    }
  }

  return {
    peakStreak,
    quickestCorrectMs,
    slowestCorrectMs,
    byValueAccuracy,
    categoryDominance: correctCount > 0 ? bestSlug : null
  };
}

/**
 * Deriva métricas específicas de la mecánica Secuencia (T-921 fase E) para
 * un alumno+sesión a partir del perfil. Devuelve un objeto con los campos
 * que persistimos en `GamePlay.metrics.sequencesCompleted`,
 * `maxSequenceLengthAchieved`, `partialReproductions`, etc.
 *
 * No es una simulación exacta del flujo runtime — es suficiente para que
 * los analytics (`bySequence`, charts) muestren datos realistas.
 */
function deriveSequenceMetricsFromProfile({ profile, session, roundsPlayed, willAbandon }) {
  const plan = Array.isArray(session.sequencePlan) ? session.sequencePlan : [];
  const playedRounds = Math.min(roundsPlayed, plan.length);
  const successRate = Math.max(0, Math.min(1, profile?.successRate ?? 0.7));
  const speedFactor = Number(profile?.speedFactor || 1);

  let sequencesCompleted = 0;
  let sequencesBlocked = 0;
  let sequencesTimedOut = 0;
  let maxLength = 0;
  let partialReproductions = 0;
  let blockedCardsTotal = 0;
  let totalDuration = 0;
  let hintsUsed = 0;

  for (let i = 0; i < playedRounds; i += 1) {
    const round = plan[i];
    const len = Number(round?.length) || 3;
    const seedHash = (i + 1) * 7919 + len * 31;
    const random = (seedHash % 100) / 100;

    if (random < successRate) {
      sequencesCompleted += 1;
      partialReproductions += len;
      maxLength = Math.max(maxLength, len);
    } else if (random < successRate + (1 - successRate) * 0.6) {
      sequencesBlocked += 1;
      partialReproductions += Math.floor(len * 0.5);
      blockedCardsTotal += Math.max(1, Math.floor(len * 0.3));
    } else {
      sequencesTimedOut += 1;
      partialReproductions += Math.floor(len * 0.2);
    }

    if ((session.difficulty || 'medium') === 'easy') {
      hintsUsed += sequencesBlocked + sequencesTimedOut;
    }

    totalDuration += Math.round(1500 * len * (1 / speedFactor));
  }

  if (willAbandon) {
    sequencesTimedOut += plan.length - playedRounds;
  }

  return {
    sequencesCompleted,
    sequencesBlocked,
    sequencesTimedOut,
    maxSequenceLengthAchieved: maxLength,
    partialReproductions,
    averageReproductionTimeMs: playedRounds > 0 ? Math.round(totalDuration / playedRounds) : 0,
    blockedCardsTotal,
    hintsUsed
  };
}

// ══════════════════════════════════════════════════════════════════════
// Generación de partidas con distribución temporal realista
// ══════════════════════════════════════════════════════════════════════

/**
 * Clasifica la mecánica de una sesión a partir de su shape persistido.
 * (No populamos `mechanicId` en el seeder para evitar lookup extra).
 */
function classifySessionMechanic(session) {
  if (Array.isArray(session.boardLayout) && session.boardLayout.length > 0) {
    return 'memory';
  }
  if (Array.isArray(session.sequencePlan) && session.sequencePlan.length > 0) {
    return 'sequence';
  }
  return 'association';
}

/**
 * Genera partidas distribuidas temporalmente para analytics avanzados.
 * Cada alumno recibe 8-15 partidas distribuidas en 60 días, **garantizando
 * cobertura por mecánica**: si el profesor tiene sesiones de las 3
 * mecánicas, el alumno juega al menos 2 partidas de cada (ADR-A/B).
 *
 * Sin esta cobertura forzada, el ciclado puro por `sortedSessions[i %
 * length]` deja alumnos sin partidas en alguna mecánica, lo que rompe la
 * densidad de los charts del profesor (`MemoryAccuracyChart`,
 * `AssociationContextChart`, `SequenceProgressChart`) y los highlight
 * cards.
 */
function generateGamePlaysData(sessions, students) {
  const gamePlays = [];

  const completedSessions = sessions.filter(s => s.status === 'completed');
  const sessionsByTeacher = completedSessions.reduce((acc, session) => {
    const teacherId = session.createdBy.toString();
    if (!acc[teacherId]) {
      acc[teacherId] = [];
    }
    acc[teacherId].push(session);
    return acc;
  }, {});

  students.forEach((student, index) => {
    const teacherId = (student.createdBy || '').toString();
    const teacherSessions = sessionsByTeacher[teacherId] || [];
    if (teacherSessions.length === 0) {
      return;
    }

    // Asignar perfil determinista: cicla por los 6 perfiles
    const profileName = PROFILE_NAMES[index % PROFILE_NAMES.length];
    const profile = STUDENT_PROFILES[profileName];

    // 8-15 partidas por alumno (determinista, más que antes)
    const playsCount = 8 + (index % 8);

    // Ordenar sesiones por fecha para distribuir partidas temporalmente
    const sortedSessions = [...teacherSessions].sort(
      (a, b) => (a.startedAt || a.createdAt) - (b.startedAt || b.createdAt)
    );

    // Agrupar sesiones del profesor por mecánica para garantizar cobertura.
    const sessionsByMechanic = { memory: [], association: [], sequence: [] };
    for (const sess of sortedSessions) {
      const m = classifySessionMechanic(sess);
      sessionsByMechanic[m].push(sess);
    }
    const availableMechanics = ['memory', 'association', 'sequence'].filter(
      m => sessionsByMechanic[m].length > 0
    );

    // Construir un plan ordenado de sesiones a jugar:
    //  - Las primeras 2*N partidas (N = número de mecánicas con sesión)
    //    rotan por mecánica para garantizar 2 partidas en cada una.
    //  - Las restantes ciclan por todas las sesiones del profesor (mismo
    //    comportamiento histórico) para mantener el patrón temporal.
    const playPlan = [];
    if (availableMechanics.length > 0) {
      const guaranteedRounds = Math.min(playsCount, availableMechanics.length * 2);
      for (let g = 0; g < guaranteedRounds; g += 1) {
        const mech = availableMechanics[g % availableMechanics.length];
        const list = sessionsByMechanic[mech];
        playPlan.push(list[Math.floor(g / availableMechanics.length) % list.length]);
      }
    }
    while (playPlan.length < playsCount) {
      playPlan.push(sortedSessions[playPlan.length % sortedSessions.length]);
    }

    for (let i = 0; i < playsCount; i++) {
      // Distribuir entre sesiones (con cobertura garantizada por mecánica).
      const session = playPlan[i];
      const numberOfRounds = session.config.numberOfRounds;

      // Inferir si la sesión usa mecánica memory desde boardLayout (solo memory lo tiene)
      const isMemory = Array.isArray(session.boardLayout) && session.boardLayout.length > 0;
      // Inferir Secuencia desde la presencia de sequencePlan (T-921 fase G).
      const isSequence = Array.isArray(session.sequencePlan) && session.sequencePlan.length > 0;

      // Decidir si abandona (según perfil)
      const willAbandon = Math.random() < profile.abandonProbability;

      const playData = generatePlayEvents(
        numberOfRounds,
        session.config,
        session.cardMappings,
        profile,
        i,
        willAbandon,
        isMemory
      );

      // Calcular timestamp: distribuir partidas del alumno a lo largo del tiempo
      // Las últimas 3 partidas de cada alumno se ubican en los últimos 7 días
      // para que las métricas de "Partidas Hoy" y "Alumnos Activos" muestren datos
      const isRecentPlay = i >= playsCount - 3;
      let baseTime;

      if (isRecentPlay) {
        // Partidas recientes: hoy y últimos días (horario escolar 8:00-14:00)
        const daysAgo = playsCount - 1 - i; // 2, 1, 0 (hoy la última)
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - daysAgo);
        recentDate.setHours(9 + ((index * 3 + i) % 5), (index * 11 + i * 13) % 60, 0, 0);
        baseTime = recentDate.getTime();
      } else {
        // Partidas históricas: distribuidas en los últimos 60 días
        const sessionStart = session.startedAt || session.createdAt || new Date();
        const hourOffset = ((index * 3 + i * 7) % 6) * 60 * 60 * 1000;
        const minuteOffset = ((index * 11 + i * 13) % 60) * 60 * 1000;
        baseTime = sessionStart.getTime() + hourOffset + minuteOffset;
      }

      // Ajustar timestamps de eventos relativos a esta base
      const timeShift = baseTime - playData.events[0].timestamp.getTime();
      playData.events.forEach(e => {
        e.timestamp = new Date(e.timestamp.getTime() + timeShift);
      });

      const startedAt = playData.events[0].timestamp;
      const lastEventTime = playData.events[playData.events.length - 1].timestamp.getTime();

      const completedAt = new Date(lastEventTime + 1000);

      // P19 / ADR-114: maxScore se calcula con la MISMA fórmula que el
      // backend usa en runtime (`gamePlayService.createPlay`). Sin esta
      // alineación, el seeder produce maxScores con una regla y las plays
      // nuevas con otra — los rankings normalizados (`score / maxScore`)
      // quedan incomparables entre datos sembrados y datos en vivo.
      //   - Secuencia: Σ longitud rondas × pointsPerCorrect
      //   - Memoria: (boardLayout.length / 2) × pointsPerCorrect
      //   - Asociación / fallback: numberOfRounds × pointsPerCorrect
      const pointsPerCorrect = Number(session.config?.pointsPerCorrect) || 10;
      let maxScore;
      if (isSequence) {
        const totalSeqCards = session.sequencePlan.reduce(
          (acc, r) => acc + (Number(r?.length) || 0),
          0
        );
        maxScore = Math.max(1, totalSeqCards * pointsPerCorrect);
      } else if (isMemory) {
        const numberOfPairs = Math.max(1, Math.floor(session.boardLayout.length / 2));
        maxScore = Math.max(1, numberOfPairs * pointsPerCorrect);
      } else {
        maxScore = Math.max(1, numberOfRounds * pointsPerCorrect);
      }
      const clampedScore = Math.max(0, Math.min(playData.score, maxScore));

      // Métricas específicas por mecánica (ADR-A/B). Cada builder es
      // idempotente — si la sesión no es de su mecánica no se invoca y el
      // sub-objeto no se persiste, manteniendo el contrato "sólo aparece
      // cuando es relevante" que aplican los DTOs.
      const sequenceMetrics = isSequence
        ? deriveSequenceMetricsFromProfile({
            profile,
            session,
            roundsPlayed: playData.roundsPlayed,
            willAbandon
          })
        : null;
      const memoryMetrics = isMemory
        ? deriveMemoryMetricsFromProfile({
            profile,
            session,
            gameNumber: i,
            willAbandon
          })
        : null;
      // Asociación se infiere por exclusión: ni boardLayout ni sequencePlan.
      const isAssociation = !isMemory && !isSequence;
      const associationMetrics = isAssociation
        ? deriveAssociationMetricsFromProfile({
            profile,
            session,
            roundsPlayed: playData.roundsPlayed,
            willAbandon
          })
        : null;

      const baseMetrics = {
        ...playData.metrics,
        // Recalcular completionTime desde timestamps reales (como hace GamePlay.complete())
        completionTime: completedAt - startedAt,
        ...(sequenceMetrics || {})
      };
      if (memoryMetrics) {
        baseMetrics.memory = memoryMetrics;
      }
      if (associationMetrics) {
        baseMetrics.association = associationMetrics;
      }

      const gamePlay = {
        sessionId: session._id,
        playerId: student._id,
        score: clampedScore,
        maxScore,
        currentRound: willAbandon ? playData.roundsPlayed + 1 : numberOfRounds + 1,
        events: playData.events,
        metrics: baseMetrics,
        status: willAbandon ? 'abandoned' : 'completed',
        startedAt,
        // completedAt se establece tanto para completadas como abandonadas
        // (el modelo GameEngine también lo hace en endPlay para ambos estados)
        completedAt
      };

      gamePlays.push(gamePlay);
    }
  });

  return gamePlays;
}

// ══════════════════════════════════════════════════════════════════════
// Agregación de métricas y ejecución
// ══════════════════════════════════════════════════════════════════════

function aggregateStudentMetrics(gamePlays) {
  const metricsByStudent = new Map();

  gamePlays.forEach(play => {
    const studentId = play.playerId.toString();
    const entry = metricsByStudent.get(studentId) || {
      totalGamesPlayed: 0,
      totalScore: 0,
      bestScore: 0,
      totalCorrectAnswers: 0,
      totalErrors: 0,
      totalTimeouts: 0,
      totalAbandonedGames: 0,
      totalResponseTime: 0,
      totalResponses: 0,
      maxSequenceLengthAchieved: 0,
      lastPlayedAt: null
    };

    if (play.status === 'abandoned') {
      // Las partidas abandonadas solo incrementan el contador de abandonos
      entry.totalAbandonedGames += 1;
    } else if (play.status === 'completed') {
      // Las partidas completadas contribuyen a todas las métricas de rendimiento
      entry.totalGamesPlayed += 1;
      entry.totalScore += play.score;
      entry.bestScore = Math.max(entry.bestScore, play.score);
      entry.totalCorrectAnswers += play.metrics.correctAttempts;
      entry.totalErrors += play.metrics.errorAttempts;
      entry.totalTimeouts += play.metrics.timeoutAttempts;
      const responses = play.metrics.correctAttempts + play.metrics.errorAttempts;
      entry.totalResponses += responses;
      entry.totalResponseTime += play.metrics.averageResponseTime * responses;
      // T-921: actualizar récord histórico de longitud de secuencia.
      const seqLen = Number(play.metrics.maxSequenceLengthAchieved || 0);
      if (seqLen > entry.maxSequenceLengthAchieved) {
        entry.maxSequenceLengthAchieved = seqLen;
      }
    }

    // lastPlayedAt se actualiza con cualquier partida (completada o abandonada)
    const playDate = play.completedAt || play.startedAt;
    if (playDate && (!entry.lastPlayedAt || playDate > entry.lastPlayedAt)) {
      entry.lastPlayedAt = playDate;
    }

    metricsByStudent.set(studentId, entry);
  });

  return metricsByStudent;
}

async function recalculateSessionStatusesFromSeededPlays() {
  const resolveSessionStatus = counters => {
    if (counters.activeOrPausedPlays > 0) {
      return 'active';
    }
    if (counters.totalPlays > 0) {
      return 'completed';
    }
    return 'created';
  };

  const applySessionStatus = (session, nextStatus) => {
    session.status = nextStatus;

    if (nextStatus === 'active') {
      if (!session.startedAt) {
        session.startedAt = new Date();
      }
      session.endedAt = undefined;
      return;
    }

    if (nextStatus === 'completed') {
      if (!session.endedAt) {
        session.endedAt = new Date();
      }
      return;
    }

    session.startedAt = undefined;
    session.endedAt = undefined;
  };

  const sessions = await GameSession.find({}, { _id: 1, status: 1, startedAt: 1, endedAt: 1 });

  for (const session of sessions) {
    const [totalPlays, activeOrPausedPlays] = await Promise.all([
      GamePlay.countDocuments({ sessionId: session._id }),
      GamePlay.countDocuments({
        sessionId: session._id,
        status: { $in: ['in-progress', 'paused'] }
      })
    ]);

    const nextStatus = resolveSessionStatus({ totalPlays, activeOrPausedPlays });

    if (session.status === nextStatus) {
      continue;
    }

    applySessionStatus(session, nextStatus);
    await session.save();
  }
}

/**
 * Ejecuta el seeder de partidas.
 * Idempotente: si ya existen partidas, las devuelve sin regenerarlas ni
 * recalcular métricas/estados (evita duplicados en ejecuciones repetidas).
 * @param {Array} sessions - Sesiones creadas
 * @param {Array} students - Alumnos creados
 * @returns {Promise<Array>} Array de partidas creadas o preexistentes
 */
async function seedGamePlays(sessions, students) {
  try {
    const existing = await GamePlay.find({});
    if (existing.length > 0) {
      logger.info(`Partidas ya existen (${existing.length}), omitiendo creacion`);
      return existing;
    }

    const gamePlaysData = generateGamePlaysData(sessions, students);
    const gamePlays = await GamePlay.create(gamePlaysData);

    const metricsByStudent = aggregateStudentMetrics(gamePlays);
    const updatePromises = [];

    metricsByStudent.forEach((metrics, studentId) => {
      const averageScore = metrics.totalGamesPlayed
        ? Math.round(metrics.totalScore / metrics.totalGamesPlayed)
        : 0;
      const averageResponseTime = metrics.totalResponses
        ? Math.round(metrics.totalResponseTime / metrics.totalResponses)
        : 0;

      updatePromises.push(
        User.updateOne(
          { _id: studentId },
          {
            $set: {
              'studentMetrics.totalGamesPlayed': metrics.totalGamesPlayed,
              'studentMetrics.totalScore': metrics.totalScore,
              'studentMetrics.averageScore': averageScore,
              'studentMetrics.bestScore': metrics.bestScore,
              'studentMetrics.totalCorrectAnswers': metrics.totalCorrectAnswers,
              'studentMetrics.totalErrors': metrics.totalErrors,
              'studentMetrics.totalTimeouts': metrics.totalTimeouts,
              'studentMetrics.totalAbandonedGames': metrics.totalAbandonedGames,
              'studentMetrics.averageResponseTime': averageResponseTime,
              'studentMetrics.maxSequenceLengthAchieved': metrics.maxSequenceLengthAchieved,
              'studentMetrics.lastPlayedAt': metrics.lastPlayedAt
            }
          }
        )
      );
    });

    await Promise.all(updatePromises);
    await recalculateSessionStatusesFromSeededPlays();

    // Estadísticas de lo generado
    const byStatus = gamePlays.reduce((acc, gp) => {
      acc[gp.status] = (acc[gp.status] || 0) + 1;
      return acc;
    }, {});

    const uniqueStudents = new Set(gamePlays.map(gp => gp.playerId.toString())).size;
    const uniqueSessions = new Set(gamePlays.map(gp => gp.sessionId.toString())).size;

    logger.info('Partidas (GamePlays) seeded exitosamente');
    logger.info(`- ${gamePlays.length} partidas totales`);
    logger.info(`- ${uniqueStudents} estudiantes con partidas`);
    logger.info(`- ${uniqueSessions} sesiones utilizadas`);
    Object.entries(byStatus).forEach(([status, count]) => {
      logger.info(`- ${count} partidas en estado "${status}"`);
    });

    return gamePlays;
  } catch (error) {
    logger.error('Error en seedGamePlays:', error);
    throw error;
  }
}

module.exports = seedGamePlays;
