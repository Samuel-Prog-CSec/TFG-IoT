/**
 * @fileoverview Servicio de exportación de datos personales de estudiantes.
 *
 * Implementa el derecho a la portabilidad de datos (Art. 20 RGPD):
 * el interesado tiene derecho a recibir sus datos personales en un
 * formato estructurado, de uso común y lectura mecánica (JSON).
 *
 * @module services/dataExportService
 */

const userRepository = require('../repositories/userRepository');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { pseudonymize } = require('../utils/pseudonymize');
const logger = require('../utils/logger').child({ component: 'dataExportService' });

/**
 * Genera un paquete de exportación con todos los datos personales de un estudiante.
 *
 * @param {string} studentId - ID del estudiante
 * @param {Object} requestingUser - Usuario que solicita la exportación (req.user)
 * @returns {Promise<Object>} Paquete de datos en formato portable (Art. 20 RGPD)
 * @throws {NotFoundError} Si el estudiante no existe
 * @throws {ForbiddenError} Si el solicitante no tiene acceso
 */
async function exportStudentData(studentId, requestingUser) {
  const student = await userRepository.findById(studentId);

  if (!student) {
    throw new NotFoundError('Alumno');
  }

  if (student.role !== 'student') {
    throw new NotFoundError('Alumno');
  }

  // Verificar acceso: solo el profesor creador o super_admin
  if (
    requestingUser.role === 'teacher' &&
    student.createdBy?.toString() !== requestingUser._id.toString()
  ) {
    throw new ForbiddenError('No tienes permiso para exportar los datos de este alumno');
  }

  // A.5 (pre-v1.0.0): cursor + `.lean()` para evitar el spike de memoria
  // pico cuando un alumno con 500+ partidas se exporta. La consulta
  // directa con `find` carga el dataset completo en heap antes de mapear; el cursor
  // procesa documento a documento con `for await`, manteniendo la RAM
  // intermedia acotada. El array final mantiene el shape esperado por
  // el controller (Art. 20 RGPD — formato portable).
  const GamePlay = require('mongoose').model('GamePlay');
  const cursor = GamePlay.find({ playerId: student._id })
    .sort({ completedAt: -1 })
    .lean()
    .cursor({ batchSize: 50 });
  const gamePlays = [];
  for await (const gp of cursor) {
    gamePlays.push(gp);
  }

  const gameHistory = gamePlays.map(gp => ({
    sessionId: gp.sessionId?.toString(),
    score: gp.score,
    status: gp.status,
    currentRound: gp.currentRound,
    metrics: gp.metrics
      ? {
          totalAttempts: gp.metrics.totalAttempts,
          correctAttempts: gp.metrics.correctAttempts,
          errorAttempts: gp.metrics.errorAttempts,
          timeoutAttempts: gp.metrics.timeoutAttempts,
          averageResponseTime: gp.metrics.averageResponseTime,
          completionTime: gp.metrics.completionTime
        }
      : null,
    events: Array.isArray(gp.events)
      ? gp.events.map(e => ({
          timestamp: e.timestamp,
          eventType: e.eventType,
          expectedValue: e.expectedValue,
          actualValue: e.actualValue,
          pointsAwarded: e.pointsAwarded,
          timeElapsed: e.timeElapsed,
          roundNumber: e.roundNumber
        }))
      : [],
    startedAt: gp.startedAt,
    completedAt: gp.completedAt
  }));

  logger.info('Exportación de datos de estudiante generada', {
    studentPseudoId: pseudonymize(studentId),
    requestedBy: requestingUser._id,
    gamePlayCount: gameHistory.length
  });

  return {
    exportMetadata: {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      platformName: 'Eduplay',
      format: 'JSON (Art. 20 RGPD)',
      generatedBy: requestingUser._id.toString()
    },
    student: {
      pseudoId: pseudonymize(student._id),
      name: student.name,
      profile: {
        age: student.profile?.age,
        classroom: student.profile?.classroom,
        avatar: student.profile?.avatar
      },
      status: student.status,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt
    },
    consent: student.consent
      ? {
          granted: student.consent.granted,
          grantedBy: student.consent.grantedBy,
          grantedAt: student.consent.grantedAt,
          purposes: student.consent.purposes,
          policyVersion: student.consent.policyVersion,
          withdrawnAt: student.consent.withdrawnAt
        }
      : null,
    consentHistory: Array.isArray(student.consentHistory)
      ? student.consentHistory.map(entry => ({
          action: entry.action,
          grantedBy: entry.grantedBy,
          timestamp: entry.timestamp,
          policyVersion: entry.policyVersion,
          purposes: entry.purposes
        }))
      : [],
    metrics: student.studentMetrics
      ? {
          totalGamesPlayed: student.studentMetrics.totalGamesPlayed,
          totalScore: student.studentMetrics.totalScore,
          averageScore: student.studentMetrics.averageScore,
          bestScore: student.studentMetrics.bestScore,
          totalCorrectAnswers: student.studentMetrics.totalCorrectAnswers,
          totalErrors: student.studentMetrics.totalErrors,
          totalTimeouts: student.studentMetrics.totalTimeouts,
          totalAbandonedGames: student.studentMetrics.totalAbandonedGames,
          averageResponseTime: student.studentMetrics.averageResponseTime,
          lastPlayedAt: student.studentMetrics.lastPlayedAt
        }
      : null,
    gameHistory
  };
}

module.exports = { exportStudentData };
