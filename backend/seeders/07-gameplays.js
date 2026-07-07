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

/**
 * PRNG determinista (mulberry32) sembrado por una semilla entera. El seeder
 * produce SIEMPRE los mismos datos para la misma semilla → QA y tests
 * reproducibles, capturas que no cambian entre `seed:reset`. Sustituye a
 * `Math.random()` en la generación de partidas (antes cada siembra daba
 * métricas distintas: "alumno con N partidas" variaba, los charts cambiaban).
 *
 * @param {number} seed - semilla entera (p. ej. derivada de alumno+partida)
 * @returns {() => number} función que devuelve un float en [0, 1)
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function resolveRoundResult({
  random,
  successProb,
  timeoutProb,
  finalSpeed,
  config,
  pointsWeight = 1
}) {
  if (random < successProb) {
    return {
      eventType: 'correct',
      pointsAwarded: config.pointsPerCorrect * pointsWeight,
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
  isMemory,
  rng,
  roundPointWeights
) {
  const events = [];
  let score = 0;
  let correctAttempts = 0;
  let errorAttempts = 0;
  let timeoutAttempts = 0;
  const responseTimes = [];
  // Resultado por ronda (tipo de evento, peso/longitud, valor, tiempo). Es la
  // ÚNICA fuente de verdad: las sub-métricas por mecánica se DERIVAN de aquí (no
  // se re-simulan), así cuadran exactamente con el score/aciertos de cabecera.
  const roundOutcomes = [];

  // Si abandona, jugar solo una parte de las rondas
  const roundsToPlay = willAbandon
    ? Math.max(1, Math.floor(numberOfRounds * (0.3 + rng() * 0.4)))
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

    const random = rng();
    const speedJitter = rng() * 2000 - 1000;
    const finalSpeed = Math.max(1000, avgSpeed + speedJitter);

    const mappingIndex = (round - 1) % cardMappings.length;
    const expectedMapping = cardMappings[mappingIndex];
    const errorMapping = cardMappings[(mappingIndex + 1) % cardMappings.length] || expectedMapping;

    // Peso de puntos por ronda: en Secuencia una ronda correcta vale
    // `length × pointsPerCorrect` (el runtime puntúa por carta de la secuencia y
    // `maxScore` es Σ length × points). Sin el peso, una partida perfecta de
    // Secuencia sumaba solo `numberOfRounds × points` ≈ 20% de su maxScore →
    // "le cuesta Secuencia" sistémico falso en todos los analytics.
    const pointsWeight = roundPointWeights ? roundPointWeights[round - 1] || 1 : 1;
    const roundResult = resolveRoundResult({
      random,
      successProb,
      timeoutProb,
      finalSpeed,
      config,
      pointsWeight
    });

    const { eventType, pointsAwarded, timeElapsed } = roundResult;
    correctAttempts += roundResult.counters.correctAttempts;
    errorAttempts += roundResult.counters.errorAttempts;
    timeoutAttempts += roundResult.counters.timeoutAttempts;

    score += pointsAwarded;
    responseTimes.push(timeElapsed);
    roundOutcomes.push({
      eventType,
      weight: pointsWeight,
      value: expectedMapping.assignedValue,
      timeElapsed
    });

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
    roundsPlayed: roundsToPlay,
    roundOutcomes
  };
}

/**
 * Deriva las métricas de Memoria (`GamePlay.metrics.memory`) DESDE los
 * resultados de ronda de la propia partida (no re-simula): cada ronda correcta
 * es un grupo emparejado, así `groupsMatched` cuadra con los aciertos de
 * cabecera y varía por alumno (los outcomes ya están sembrados por alumno).
 */
function deriveMemoryMetricsFromProfile({ roundOutcomes, session }) {
  const totalCards = Array.isArray(session.boardLayout) ? session.boardLayout.length : 0;
  const groupSize = Number(session.mechanicId?.rules?.behavior?.matchingGroupSize) || 2;
  const totalGroups = totalCards > 0 ? Math.floor(totalCards / groupSize) : 0;

  let groupsMatched = 0;
  let peakStreak = 0;
  let currentStreak = 0;
  let attemptsToFirstMatch = null;
  const matchTimes = [];

  roundOutcomes.forEach((outcome, idx) => {
    if (outcome.eventType === 'correct') {
      groupsMatched += 1;
      currentStreak += 1;
      peakStreak = Math.max(peakStreak, currentStreak);
      matchTimes.push(outcome.timeElapsed);
      if (attemptsToFirstMatch === null) {
        attemptsToFirstMatch = idx + 1;
      }
    } else {
      currentStreak = 0;
    }
  });

  // No puede haber más grupos emparejados que grupos en el tablero.
  if (totalGroups > 0) {
    groupsMatched = Math.min(groupsMatched, totalGroups);
  }
  const averageMatchTimeMs =
    matchTimes.length > 0
      ? Math.round(matchTimes.reduce((a, b) => a + b, 0) / matchTimes.length)
      : 0;

  return {
    groupsMatched,
    peakStreak: groupsMatched > 0 ? Math.max(1, peakStreak) : 0,
    averageMatchTimeMs,
    attemptsToFirstMatch,
    groupSize
  };
}

/**
 * Deriva las métricas de Asociación (`GamePlay.metrics.association`) DESDE los
 * resultados de ronda de la propia partida (no re-simula): `byValueAccuracy` se
 * construye con el valor real de cada ronda y su acierto/fallo, así cuadra
 * exactamente con los aciertos de cabecera y varía por alumno.
 */
function deriveAssociationMetricsFromProfile({ roundOutcomes }) {
  const byValueAccuracy = {};
  let peakStreak = 0;
  let currentStreak = 0;
  let quickestCorrectMs = null;
  let slowestCorrectMs = null;
  let correctCount = 0;

  roundOutcomes.forEach((outcome, idx) => {
    const value = outcome.value || `__unknown_${idx}__`;
    if (!byValueAccuracy[value]) {
      byValueAccuracy[value] = { correct: 0, total: 0 };
    }
    byValueAccuracy[value].total += 1;

    if (outcome.eventType === 'correct') {
      byValueAccuracy[value].correct += 1;
      correctCount += 1;
      currentStreak += 1;
      peakStreak = Math.max(peakStreak, currentStreak);
      quickestCorrectMs =
        quickestCorrectMs === null
          ? outcome.timeElapsed
          : Math.min(quickestCorrectMs, outcome.timeElapsed);
      slowestCorrectMs =
        slowestCorrectMs === null
          ? outcome.timeElapsed
          : Math.max(slowestCorrectMs, outcome.timeElapsed);
    } else {
      currentStreak = 0;
    }
  });

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
function deriveSequenceMetricsFromProfile({ roundOutcomes, session, willAbandon }) {
  const plan = Array.isArray(session.sequencePlan) ? session.sequencePlan : [];
  const playedRounds = roundOutcomes.length;

  let sequencesCompleted = 0;
  let sequencesBlocked = 0;
  let sequencesTimedOut = 0;
  let maxLength = 0;
  let partialReproductions = 0;
  let partialRounds = 0;
  let blockedCardsTotal = 0;
  let totalDuration = 0;
  let hintsUsed = 0;

  // Deriva cada ronda del MISMO resultado que produjo el score de cabecera:
  // `weight` es la longitud de la secuencia de esa ronda (puntuación por carta).
  roundOutcomes.forEach(outcome => {
    const len = Number(outcome.weight) || 3;
    let correctThisRound = 0;
    if (outcome.eventType === 'correct') {
      sequencesCompleted += 1;
      correctThisRound = len;
      maxLength = Math.max(maxLength, len);
    } else if (outcome.eventType === 'error') {
      sequencesBlocked += 1;
      correctThisRound = Math.floor(len * 0.5);
      blockedCardsTotal += Math.max(1, Math.floor(len * 0.3));
    } else {
      sequencesTimedOut += 1;
      correctThisRound = Math.floor(len * 0.2);
    }

    partialReproductions += correctThisRound;
    // Ronda parcial: acertó alguna carta pero no completó la secuencia. Es el
    // numerador correcto del detector `sequence_order_errors` (ronda, no carta).
    if (correctThisRound > 0 && correctThisRound < len) {
      partialRounds += 1;
    }

    totalDuration += outcome.timeElapsed;
  });

  // Pistas (modeladas solo en 'easy'): una por cada ronda no completada. Se
  // calcula UNA vez (antes se acumulaba el total acumulado cada ronda → sobreconteo).
  if ((session.difficulty || 'medium') === 'easy') {
    hintsUsed = sequencesBlocked + sequencesTimedOut;
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
    partialRounds,
    roundsPlayed: playedRounds,
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

  // eslint-disable-next-line sonarjs/cyclomatic-complexity -- seeder de dev (generación de gameplays); complejidad aceptable fuera de producción
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

      // PRNG determinista sembrado por (alumno, partida): toda la partida
      // (abandono, resultados de ronda, jitter, sub-métricas) deriva de esta
      // semilla → reproducible entre `seed:reset` y distinta por alumno/partida.
      const seedBase = (index + 1) * 100003 + (i + 1) * 7919;
      const rng = makeRng(seedBase);

      // Pesos de puntos por ronda: en Secuencia, cada ronda vale su `length`
      // (puntuación por carta); el resto de mecánicas usan 1 (por ronda).
      const roundPointWeights = isSequence
        ? session.sequencePlan.map(r => Number(r?.length) || 1)
        : null;

      // Decidir si abandona (según perfil)
      const willAbandon = rng() < profile.abandonProbability;

      const playData = generatePlayEvents(
        numberOfRounds,
        session.config,
        session.cardMappings,
        profile,
        i,
        willAbandon,
        isMemory,
        rng,
        roundPointWeights
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
            roundOutcomes: playData.roundOutcomes,
            session,
            willAbandon
          })
        : null;
      const memoryMetrics = isMemory
        ? deriveMemoryMetricsFromProfile({
            roundOutcomes: playData.roundOutcomes,
            session
          })
        : null;
      // Asociación se infiere por exclusión: ni boardLayout ni sequencePlan.
      const isAssociation = !isMemory && !isSequence;
      const associationMetrics = isAssociation
        ? deriveAssociationMetricsFromProfile({
            roundOutcomes: playData.roundOutcomes
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
      totalScorePercent: 0,
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
      // `averageScore` es un PORCENTAJE (score/maxScore×100), no puntos crudos:
      // así lo define el modelo (`User.updateStudentMetrics`) y lo consume TODA
      // la app (tiers, "alumnos en riesgo", "Mis Alumnos"). Como `maxScore` varía
      // por mecánica, promediar puntos crudos era incomparable y podía superar
      // 100%. `totalScore`/`bestScore` se mantienen crudos (eso sí es correcto).
      entry.totalScorePercent += play.maxScore > 0 ? (play.score / play.maxScore) * 100 : 0;
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
  const resolveSessionStatus = (counters, currentStatus) => {
    if (counters.activeOrPausedPlays > 0) {
      return 'active';
    }
    if (counters.totalPlays > 0) {
      return 'completed';
    }
    // Sin partidas: NO degradar una sesión sembrada como 'completed' (se diseñó
    // así, con timestamps, para alimentar las tendencias de "últimos 7 días");
    // degradarla a 'created' le borraba `startedAt`/`endedAt`. Solo las que ya
    // estaban en 'created' se mantienen 'created'.
    return currentStatus === 'completed' ? 'completed' : 'created';
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

    const nextStatus = resolveSessionStatus({ totalPlays, activeOrPausedPlays }, session.status);

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
        ? Math.round(metrics.totalScorePercent / metrics.totalGamesPlayed)
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
