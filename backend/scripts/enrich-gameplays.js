/**
 * @fileoverview Script complementario al seeder principal.
 *
 * Para cada alumno y mecánica (memory / association / sequence), añade
 * 4–6 partidas extra distribuidas en los últimos 30 días. Persiste
 * `metrics.memory`, `metrics.association` y los campos sequence
 * existentes para que los charts del profesor (Evolución en Secuencia,
 * MemoryAccuracyChart, AssociationContextChart) tengan densidad real
 * y los highlight cards del perfil de alumno reflejen historial.
 *
 * No regenera lo ya existente: sólo INSERTA nuevos GamePlays. Compatible
 * con BD que ya tiene partidas (las hechas en QA quedan intactas).
 *
 * Uso:
 *   docker compose exec backend node scripts/enrich-gameplays.js [--per-student=5] [--dry-run]
 *
 * @module scripts/enrich-gameplays
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const GamePlay = require('../src/models/GamePlay');
const GameSession = require('../src/models/GameSession');
const User = require('../src/models/User');
// Necesario registrar el schema antes de hacer populate('mechanicId').
require('../src/models/GameMechanic');
require('../src/models/GameContext');
const logger = require('../src/utils/logger');
const { computeMaxScore } = require('../src/services/gamePlayScoring');

// Las funciones derive del seeder principal son privadas (no exportadas).
// Las re-implementamos aquí en compacto para no acoplar el script al
// seeder. Mantener en sync los perfiles cuando cambien en `07-gameplays.js`
// es responsabilidad del reviewer.

const STUDENT_PROFILES = {
  high_performer: {
    label: 'Alto rendimiento',
    baseSuccessProb: 0.95,
    timeoutProb: 0.01,
    avgSpeed: 2300,
    improvementPerGame: 0.005,
    abandonProbability: 0.01
  },
  improving: {
    label: 'Mejorando',
    baseSuccessProb: 0.62,
    timeoutProb: 0.07,
    avgSpeed: 5000,
    improvementPerGame: 0.04,
    abandonProbability: 0.05
  },
  declining: {
    label: 'En descenso',
    baseSuccessProb: 0.7,
    timeoutProb: 0.06,
    avgSpeed: 3700,
    improvementPerGame: -0.02,
    abandonProbability: 0.1
  },
  plateau: {
    label: 'Estancado',
    baseSuccessProb: 0.65,
    timeoutProb: 0.06,
    avgSpeed: 4400,
    improvementPerGame: 0,
    abandonProbability: 0.05
  },
  struggling: {
    label: 'Con dificultades',
    baseSuccessProb: 0.4,
    timeoutProb: 0.15,
    avgSpeed: 7500,
    improvementPerGame: 0.01,
    abandonProbability: 0.12
  },
  average: {
    label: 'Medio',
    baseSuccessProb: 0.78,
    timeoutProb: 0.05,
    avgSpeed: 3600,
    improvementPerGame: 0.02,
    abandonProbability: 0.04
  }
};

const PROFILE_NAMES = Object.keys(STUDENT_PROFILES);

function clampScore(score, maxScore) {
  return Math.max(0, Math.min(Number(score) || 0, Number(maxScore) || 0));
}

function classifyMechanic(session) {
  if (Array.isArray(session.boardLayout) && session.boardLayout.length > 0) {
    return 'memory';
  }
  if (Array.isArray(session.sequencePlan) && session.sequencePlan.length > 0) {
    return 'sequence';
  }
  return 'association';
}

function pickRandomProfile(index) {
  return STUDENT_PROFILES[PROFILE_NAMES[index % PROFILE_NAMES.length]];
}

// ──────────────────────────────────────────────────────────────────────
// Generación de eventos genéricos (correct/error/timeout)
// ──────────────────────────────────────────────────────────────────────

function buildEvents({ rounds, profile, sessionConfig, cardMappings, baseTime }) {
  const events = [];
  let score = 0;
  let correctAttempts = 0;
  let errorAttempts = 0;
  let timeoutAttempts = 0;
  const responseTimes = [];

  const pointsPerCorrect = Number(sessionConfig?.pointsPerCorrect) || 10;
  const penaltyPerError = Number(sessionConfig?.penaltyPerError) || -2;
  const timeLimitMs = (Number(sessionConfig?.timeLimit) || 15) * 1000;

  for (let r = 1; r <= rounds; r += 1) {
    const roundStart = baseTime + (r - 1) * 12000;
    const success = Math.random() < profile.baseSuccessProb;
    const timeout =
      !success && Math.random() < profile.timeoutProb / (1 - profile.baseSuccessProb || 1);

    const expected = cardMappings[(r - 1) % Math.max(cardMappings.length, 1)] || {
      uid: `seed-${r}`,
      assignedValue: `valor${r}`
    };
    const errorMapping = cardMappings[r % Math.max(cardMappings.length, 1)] || expected;

    let elapsed;
    if (success) {
      elapsed = Math.min(profile.avgSpeed + Math.random() * 800, timeLimitMs);
    } else if (timeout) {
      elapsed = timeLimitMs;
    } else {
      elapsed = Math.min(profile.avgSpeed + 1500, timeLimitMs);
    }
    responseTimes.push(elapsed);

    events.push({
      timestamp: new Date(roundStart),
      eventType: 'round_start',
      roundNumber: r
    });

    let eventType = 'correct';
    let pointsAwarded = pointsPerCorrect;
    let cardUid = expected.uid;
    if (timeout) {
      eventType = 'timeout';
      pointsAwarded = 0;
      cardUid = undefined;
      timeoutAttempts += 1;
    } else if (!success) {
      eventType = 'error';
      pointsAwarded = penaltyPerError;
      cardUid = errorMapping.uid;
      errorAttempts += 1;
    } else {
      correctAttempts += 1;
    }

    score += pointsAwarded;

    events.push({
      timestamp: new Date(roundStart + elapsed),
      eventType,
      cardUid,
      expectedValue: expected.assignedValue,
      actualValue: eventType === 'correct' ? expected.assignedValue : errorMapping.assignedValue,
      pointsAwarded,
      timeElapsed: Math.round(elapsed),
      roundNumber: r
    });
  }

  const averageResponseTime =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

  return {
    events,
    score,
    metrics: {
      totalAttempts: rounds,
      correctAttempts,
      errorAttempts,
      timeoutAttempts,
      averageResponseTime,
      completionTime: 0
    }
  };
}

// ──────────────────────────────────────────────────────────────────────
// Métricas específicas por mecánica
// ──────────────────────────────────────────────────────────────────────

function deriveMemoryMetrics({ profile, session, willAbandon }) {
  const totalCards = Array.isArray(session.boardLayout) ? session.boardLayout.length : 0;
  const groupSize = Number(session.mechanicId?.rules?.behavior?.matchingGroupSize) || 2;
  const totalGroups = totalCards > 0 ? Math.floor(totalCards / groupSize) : 0;
  const completionRate = Math.max(0.2, Math.min(1, profile.baseSuccessProb + Math.random() * 0.1));
  const completed = willAbandon
    ? Math.floor(totalGroups * 0.3)
    : Math.floor(totalGroups * completionRate);
  const peakStreak = Math.max(
    1,
    Math.round(completed * (profile.baseSuccessProb > 0.8 ? 0.7 : 0.4))
  );
  const averageMatchTimeMs = Math.round(profile.avgSpeed * (1 + Math.random() * 0.3));
  return {
    groupsMatched: completed,
    peakStreak: completed > 0 ? peakStreak : 0,
    averageMatchTimeMs: completed > 0 ? averageMatchTimeMs : 0,
    attemptsToFirstMatch:
      completed > 0 ? Math.max(1, Math.round((1 - profile.baseSuccessProb) * 6) + 1) : null,
    groupSize
  };
}

function deriveAssociationMetrics({ profile, session, rounds, willAbandon }) {
  const mappings = Array.isArray(session.cardMappings) ? session.cardMappings : [];
  const successRate = Math.max(0.2, Math.min(0.98, profile.baseSuccessProb));
  const playedRounds = willAbandon ? Math.floor(rounds * 0.6) : rounds;

  const byValueAccuracy = {};
  let peakStreak = 0;
  let currentStreak = 0;
  let quickestCorrectMs = null;
  let slowestCorrectMs = null;
  let correctCount = 0;

  for (let i = 0; i < playedRounds && mappings.length > 0; i += 1) {
    const mapping = mappings[i % mappings.length];
    const value = mapping?.assignedValue || `__unknown_${i}__`;
    if (!byValueAccuracy[value]) {
      byValueAccuracy[value] = { correct: 0, total: 0 };
    }
    byValueAccuracy[value].total += 1;

    const isCorrect = Math.random() < successRate;
    if (isCorrect) {
      byValueAccuracy[value].correct += 1;
      correctCount += 1;
      currentStreak += 1;
      peakStreak = Math.max(peakStreak, currentStreak);
      const elapsed = Math.round(profile.avgSpeed * (0.7 + Math.random() * 0.6));
      quickestCorrectMs =
        quickestCorrectMs === null ? elapsed : Math.min(quickestCorrectMs, elapsed);
      slowestCorrectMs = slowestCorrectMs === null ? elapsed : Math.max(slowestCorrectMs, elapsed);
    } else {
      currentStreak = 0;
    }
  }

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

function deriveSequenceMetrics({ profile, session, willAbandon }) {
  const plan = Array.isArray(session.sequencePlan) ? session.sequencePlan : [];
  const successRate = Math.max(0.25, Math.min(0.95, profile.baseSuccessProb));
  let sequencesCompleted = 0;
  let sequencesBlocked = 0;
  let sequencesTimedOut = 0;
  let maxLength = 0;
  let partialReproductions = 0;
  let blockedCardsTotal = 0;
  let totalDuration = 0;
  let hintsUsed = 0;
  let partialRounds = 0;

  for (let i = 0; i < plan.length; i += 1) {
    if (willAbandon && i > Math.floor(plan.length * 0.5)) {
      sequencesTimedOut += 1;
      continue;
    }
    const round = plan[i];
    const len = Number(round?.length) || 3;
    const r = Math.random();
    if (r < successRate) {
      sequencesCompleted += 1;
      partialReproductions += len;
      maxLength = Math.max(maxLength, len);
    } else if (r < successRate + (1 - successRate) * 0.6) {
      sequencesBlocked += 1;
      const partial = Math.floor(len * (0.4 + Math.random() * 0.3));
      partialReproductions += partial;
      if (partial > 0) {
        partialRounds += 1;
      }
      blockedCardsTotal += Math.max(1, Math.floor(len * 0.3));
      maxLength = Math.max(maxLength, partial);
    } else {
      sequencesTimedOut += 1;
      const partial = Math.floor(len * Math.random() * 0.4);
      partialReproductions += partial;
      if (partial > 0) {
        partialRounds += 1;
      }
    }
    if ((session.difficulty || 'medium') === 'easy') {
      hintsUsed += sequencesBlocked + sequencesTimedOut;
    }
    totalDuration += Math.round(1500 * len * (1 + Math.random() * 0.4));
  }

  return {
    sequencesCompleted,
    sequencesBlocked,
    sequencesTimedOut,
    maxSequenceLengthAchieved: maxLength,
    partialReproductions,
    partialRounds,
    averageReproductionTimeMs: plan.length > 0 ? Math.round(totalDuration / plan.length) : 0,
    blockedCardsTotal,
    hintsUsed
  };
}

// ──────────────────────────────────────────────────────────────────────
// Generación de un GamePlay completo
// ──────────────────────────────────────────────────────────────────────

function generatePlay({ student, session, profile, daysAgo, perStudentIndex }) {
  const mechanic = classifyMechanic(session);
  const numberOfRounds = Number(session.config?.numberOfRounds) || 5;
  const willAbandon = Math.random() < profile.abandonProbability;

  // Dispersión temporal: el día base ± 0–6h.
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - daysAgo);
  baseDate.setHours(8 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60), 0, 0);
  const baseTime = baseDate.getTime();

  const cardMappings = Array.isArray(session.cardMappings) ? session.cardMappings : [];
  const built = buildEvents({
    rounds: willAbandon ? Math.max(1, Math.floor(numberOfRounds * 0.6)) : numberOfRounds,
    profile,
    sessionConfig: session.config,
    cardMappings,
    baseTime
  });

  const startedAt = built.events[0].timestamp;
  const lastEventTime = built.events[built.events.length - 1].timestamp.getTime();
  const completedAt = new Date(lastEventTime + 1000);

  // maxScore POR MECÁNICA (igual que runtime/seeder); antes usaba rondas ×
  // puntos para todas, corrompiendo Memoria/Secuencia al normalizar score/maxScore.
  const maxScore = computeMaxScore(session);

  const baseMetrics = {
    ...built.metrics,
    completionTime: completedAt - startedAt
  };

  if (mechanic === 'memory') {
    baseMetrics.memory = deriveMemoryMetrics({ profile, session, willAbandon });
  } else if (mechanic === 'association') {
    baseMetrics.association = deriveAssociationMetrics({
      profile,
      session,
      rounds: built.metrics.totalAttempts,
      willAbandon
    });
  } else if (mechanic === 'sequence') {
    Object.assign(baseMetrics, deriveSequenceMetrics({ profile, session, willAbandon }));
  }

  return {
    sessionId: session._id,
    playerId: student._id,
    score: clampScore(built.score, maxScore),
    maxScore,
    currentRound: willAbandon ? built.metrics.totalAttempts + 1 : numberOfRounds + 1,
    events: built.events,
    metrics: baseMetrics,
    status: willAbandon ? 'abandoned' : 'completed',
    startedAt,
    completedAt,
    _enrichmentMechanic: mechanic,
    _enrichmentIndex: perStudentIndex
  };
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line sonarjs/cyclomatic-complexity -- script de dev (enriquecimiento de gameplays); complejidad aceptable fuera de producción
async function main() {
  // eslint-disable-next-line sonarjs/process-argv -- script CLI de dev: lee flags de argv intencionalmente
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const perStudentArg = args.find(a => a.startsWith('--per-student='));
  const perStudentTarget = perStudentArg ? Number(perStudentArg.split('=')[1]) : 5;

  const mongoUri =
    process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://mongo:27017/rfid_games_db';
  await mongoose.connect(mongoUri);
  // eslint-disable-next-line sonarjs/slow-regex -- `//[^@]+@` es una clase única sin anidamiento ni backtracking catastrófico (enmascara credenciales del URI en logs)
  logger.info(`Conectado a Mongo (${mongoUri.replace(/\/\/[^@]+@/, '//***@')})`);

  const students = await User.find({ role: 'student', status: 'active' });
  const sessions = await GameSession.find({}).populate('mechanicId');

  if (students.length === 0 || sessions.length === 0) {
    logger.warn('No hay alumnos o sesiones suficientes para enriquecer');
    await mongoose.disconnect();
    return;
  }

  // Sesiones por mecánica disponibles para el profesor de cada alumno.
  const sessionsByTeacherAndMechanic = new Map();
  for (const session of sessions) {
    const teacherId = String(session.createdBy || '');
    const mechanic = classifyMechanic(session);
    const key = `${teacherId}:${mechanic}`;
    if (!sessionsByTeacherAndMechanic.has(key)) {
      sessionsByTeacherAndMechanic.set(key, []);
    }
    sessionsByTeacherAndMechanic.get(key).push(session);
  }

  const playsToInsert = [];
  let skippedNoSession = 0;

  students.forEach((student, sIndex) => {
    const profile = pickRandomProfile(sIndex);
    const teacherId = String(student.createdBy || '');

    // Para cada mecánica, generamos `perStudentTarget` partidas distribuidas
    // entre los últimos 30 días.
    for (const mechanic of ['memory', 'association', 'sequence']) {
      const candidateSessions = sessionsByTeacherAndMechanic.get(`${teacherId}:${mechanic}`) || [];
      if (candidateSessions.length === 0) {
        skippedNoSession += 1;
        continue;
      }
      for (let i = 0; i < perStudentTarget; i += 1) {
        const session = candidateSessions[i % candidateSessions.length];
        const daysAgo = Math.floor(Math.random() * 30); // 0–29 días
        const play = generatePlay({
          student,
          session,
          profile,
          daysAgo,
          perStudentIndex: i
        });
        // Eliminar campos de debug antes de insertar
        delete play._enrichmentMechanic;
        delete play._enrichmentIndex;
        playsToInsert.push(play);
      }
    }
  });

  logger.info(
    `Plan: ${playsToInsert.length} gameplays a insertar (${perStudentTarget}/mec × ${students.length} alumnos × 3 mecánicas)` +
      (skippedNoSession > 0 ? `; ${skippedNoSession} (alumno×mec) sin sesión disponible` : '')
  );

  if (dryRun) {
    logger.info('--dry-run: no se inserta nada en BD');
    await mongoose.disconnect();
    return;
  }

  const inserted = await GamePlay.insertMany(playsToInsert);
  logger.info(`Insertados ${inserted.length} gameplays`);

  // Recalcular studentMetrics agregadas para reflejar las nuevas partidas
  // (el seeder principal ya hace esto pero sólo en su primer run; aquí lo
  // forzamos con un agregado completo sobre TODA la colección).
  const allPlays = await GamePlay.find({});
  const byStudent = new Map();
  for (const play of allPlays) {
    const sid = String(play.playerId);
    const e = byStudent.get(sid) || {
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
      e.totalAbandonedGames += 1;
    } else {
      e.totalGamesPlayed += 1;
      e.totalScore += play.score;
      e.bestScore = Math.max(e.bestScore, play.score);
      e.totalCorrectAnswers += play.metrics.correctAttempts || 0;
      e.totalErrors += play.metrics.errorAttempts || 0;
      e.totalTimeouts += play.metrics.timeoutAttempts || 0;
      const responses = (play.metrics.correctAttempts || 0) + (play.metrics.errorAttempts || 0);
      e.totalResponses += responses;
      e.totalResponseTime += (play.metrics.averageResponseTime || 0) * responses;
      const seqLen = Number(play.metrics.maxSequenceLengthAchieved || 0);
      if (seqLen > e.maxSequenceLengthAchieved) {
        e.maxSequenceLengthAchieved = seqLen;
      }
    }
    const playDate = play.completedAt || play.startedAt;
    if (playDate && (!e.lastPlayedAt || playDate > e.lastPlayedAt)) {
      e.lastPlayedAt = playDate;
    }
    byStudent.set(sid, e);
  }

  const updateOps = [];
  byStudent.forEach((m, sid) => {
    const averageScore = m.totalGamesPlayed
      ? Math.round((m.totalScore / m.totalGamesPlayed) * 10) / 10
      : 0;
    const averageResponseTime = m.totalResponses
      ? Math.round(m.totalResponseTime / m.totalResponses)
      : 0;
    updateOps.push(
      User.updateOne(
        { _id: sid },
        {
          $set: {
            'studentMetrics.totalGamesPlayed': m.totalGamesPlayed,
            'studentMetrics.totalScore': m.totalScore,
            'studentMetrics.averageScore': averageScore,
            'studentMetrics.bestScore': m.bestScore,
            'studentMetrics.totalCorrectAnswers': m.totalCorrectAnswers,
            'studentMetrics.totalErrors': m.totalErrors,
            'studentMetrics.totalTimeouts': m.totalTimeouts,
            'studentMetrics.totalAbandonedGames': m.totalAbandonedGames,
            'studentMetrics.averageResponseTime': averageResponseTime,
            'studentMetrics.maxSequenceLengthAchieved': m.maxSequenceLengthAchieved,
            'studentMetrics.lastPlayedAt': m.lastPlayedAt
          }
        }
      )
    );
  });

  await Promise.all(updateOps);
  logger.info(`Actualizadas studentMetrics de ${updateOps.length} alumnos`);

  await mongoose.disconnect();
  logger.info('Enriquecimiento completado');
}

if (require.main === module) {
  main().catch(err => {
    logger.error('enrich-gameplays falló:', err);
    process.exit(1);
  });
}
