/**
 * @fileoverview Servicio de alertas inteligentes para analytics.
 * Computa alertas on-the-fly basándose en patrones detectados en los datos
 * de GamePlay y User.studentMetrics.
 *
 * Las alertas NO se almacenan en BD — se derivan de datos existentes con cache.
 * Ver Analytics_Design_Rationale.md § 2.5 para justificación de umbrales.
 *
 * @module services/analytics/alertsService
 */

const gamePlayRepository = require('../../repositories/gamePlayRepository');
const userRepository = require('../../repositories/userRepository');
const logger = require('../../utils/logger').child({ component: 'alertsService' });
const {
  ALERT_TYPES,
  toObjectId,
  getStartDate,
  getPeriodDates,
  generateAlertId
} = require('./analyticsHelpers');
const { pseudonymize } = require('../../utils/pseudonymize');

// ══════════════════════════════════════════════════════════════════════
// Detectores individuales de alertas
// ══════════════════════════════════════════════════════════════════════

/**
 * Detecta alumnos con rendimiento en descenso.
 * Compara score promedio del periodo actual vs periodo anterior.
 *
 * @param {string} teacherId
 * @param {Array} students - Lista de estudiantes del profesor
 * @returns {Promise<Array>} Alertas de tipo declining_performance
 */
async function detectDecliningPerformance(teacherId, students) {
  const alerts = [];
  const { currentStart, previousStart, now } = getPeriodDates('7d');

  const studentIds = students.map(s => toObjectId(s._id));
  if (studentIds.length === 0) {
    return alerts;
  }

  // Obtener scores promedio por estudiante en ambos periodos con un solo pipeline
  const pipeline = [
    {
      $match: {
        playerId: { $in: studentIds },
        status: 'completed',
        completedAt: { $gte: previousStart, $lte: now }
      }
    },
    {
      $addFields: {
        period: {
          $cond: [{ $gte: ['$completedAt', currentStart] }, 'current', 'previous']
        }
      }
    },
    {
      $group: {
        _id: { playerId: '$playerId', period: '$period' },
        avgScore: { $avg: '$score' },
        count: { $sum: 1 }
      }
    }
  ];

  const results = await gamePlayRepository.aggregate(pipeline);

  // Agrupar por estudiante
  const byStudent = {};
  for (const r of results) {
    const sid = r._id.playerId.toString();
    if (!byStudent[sid]) {
      byStudent[sid] = {};
    }
    byStudent[sid][r._id.period] = { avgScore: r.avgScore, count: r.count };
  }

  // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- cada continue filtra un criterio estadistico diferente
  for (const student of students) {
    const sid = student._id.toString();
    const data = byStudent[sid];
    if (!data?.current || !data?.previous) {
      continue;
    }
    if (data.previous.count < 2 || data.current.count < 2) {
      continue;
    }

    const declinePercent =
      ((data.previous.avgScore - data.current.avgScore) / data.previous.avgScore) * 100;

    if (declinePercent > ALERT_TYPES.declining_performance.thresholds.warning) {
      const severity =
        declinePercent > ALERT_TYPES.declining_performance.thresholds.critical
          ? 'critical'
          : 'warning';

      alerts.push({
        id: generateAlertId('declining_performance', sid),
        type: 'declining_performance',
        severity,
        studentId: sid,
        studentPseudoId: pseudonymize(sid),
        studentName: student.name,
        message: `Su rendimiento ha bajado un ${Math.round(declinePercent)}% en la última semana`,
        recommendation:
          'Considerar revisar el contenido asignado o proporcionar sesiones de refuerzo',
        detectedAt: new Date().toISOString(),
        data: {
          previousAvg: Math.round(data.previous.avgScore),
          currentAvg: Math.round(data.current.avgScore),
          declinePercent: Math.round(declinePercent * 10) / 10
        }
      });
    }
  }

  return alerts;
}

/**
 * Detecta alumnos inactivos (sin jugar en >7 días).
 *
 * @param {Array} students - Lista de estudiantes con studentMetrics
 * @returns {Array} Alertas de tipo inactivity
 */
function detectInactivity(students) {
  const alerts = [];
  const now = new Date();

  for (const student of students) {
    const lastPlayed = student.studentMetrics?.lastPlayedAt;
    if (!lastPlayed) {
      continue;
    }

    const daysSince = Math.floor((now - new Date(lastPlayed)) / (1000 * 60 * 60 * 24));

    if (daysSince >= ALERT_TYPES.inactivity.thresholds.info) {
      const severity = daysSince >= ALERT_TYPES.inactivity.thresholds.warning ? 'warning' : 'info';

      alerts.push({
        id: generateAlertId('inactivity', student._id.toString()),
        type: 'inactivity',
        severity,
        studentId: student._id.toString(),
        studentPseudoId: pseudonymize(student._id),
        studentName: student.name,
        message: `No ha jugado en ${daysSince} días`,
        recommendation:
          daysSince >= 14
            ? 'Verificar si el alumno tiene algún problema para acceder a las sesiones'
            : 'Considerar asignar una sesión de juego motivadora',
        detectedAt: new Date().toISOString(),
        data: { daysSinceLastPlay: daysSince, lastPlayedAt: lastPlayed }
      });
    }
  }

  return alerts;
}

/**
 * Detecta caídas repentinas de puntuación en una partida individual.
 * Se activa cuando un score está >30 puntos por debajo de la media del alumno.
 *
 * @param {string} teacherId
 * @param {Array} students
 * @returns {Promise<Array>} Alertas de tipo sudden_score_drop
 */
async function detectSuddenScoreDrop(teacherId, students) {
  const alerts = [];
  const threshold = ALERT_TYPES.sudden_score_drop.thresholds.warning;
  const sevenDaysAgo = getStartDate('7d');

  const studentIds = students
    .filter(s => s.studentMetrics?.averageScore > 0)
    .map(s => toObjectId(s._id));
  if (studentIds.length === 0) {
    return alerts;
  }

  // Buscar partidas recientes con score muy bajo respecto a la media
  const pipeline = [
    {
      $match: {
        playerId: { $in: studentIds },
        status: 'completed',
        completedAt: { $gte: sevenDaysAgo }
      }
    },
    { $sort: { completedAt: -1 } },
    {
      $group: {
        _id: '$playerId',
        lastGame: { $first: '$$ROOT' }
      }
    }
  ];

  const results = await gamePlayRepository.aggregate(pipeline);
  const studentMap = new Map(students.map(s => [s._id.toString(), s]));

  for (const r of results) {
    const sid = r._id.toString();
    const student = studentMap.get(sid);
    if (!student) {
      continue;
    }

    const avgScore = student.studentMetrics.averageScore;
    const lastScore = r.lastGame.score;
    const drop = avgScore - lastScore;

    if (drop > threshold) {
      alerts.push({
        id: generateAlertId('sudden_score_drop', sid),
        type: 'sudden_score_drop',
        severity: 'warning',
        studentId: sid,
        studentPseudoId: pseudonymize(sid),
        studentName: student.name,
        message: `Obtuvo ${lastScore} puntos en su última partida (media: ${Math.round(avgScore)})`,
        recommendation: 'Revisar si hubo alguna dificultad específica en la última sesión',
        detectedAt: new Date().toISOString(),
        data: {
          lastScore,
          averageScore: Math.round(avgScore),
          dropPoints: Math.round(drop)
        }
      });
    }
  }

  return alerts;
}

/**
 * Detecta alumnos con tasa de timeout consistentemente alta.
 * Timeout >30% en las últimas 5 partidas indica confusión sistemática.
 *
 * @param {string} teacherId
 * @param {Array} students
 * @returns {Promise<Array>} Alertas de tipo consistent_timeout
 */
async function detectConsistentTimeout(teacherId, students) {
  const alerts = [];
  const threshold = ALERT_TYPES.consistent_timeout.thresholds.warning;

  const studentIds = students.map(s => toObjectId(s._id));
  if (studentIds.length === 0) {
    return alerts;
  }

  const pipeline = [
    {
      $match: {
        playerId: { $in: studentIds },
        status: 'completed',
        'metrics.totalAttempts': { $gt: 0 }
      }
    },
    { $sort: { completedAt: -1 } },
    {
      $group: {
        _id: '$playerId',
        recentGames: {
          $push: {
            timeoutRate: {
              $cond: [
                { $gt: ['$metrics.totalAttempts', 0] },
                { $divide: ['$metrics.timeoutAttempts', '$metrics.totalAttempts'] },
                0
              ]
            }
          }
        }
      }
    },
    {
      $project: {
        last5: { $slice: ['$recentGames', 5] }
      }
    }
  ];

  const results = await gamePlayRepository.aggregate(pipeline);
  const studentMap = new Map(students.map(s => [s._id.toString(), s]));

  // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- cada continue filtra un criterio estadistico diferente
  for (const r of results) {
    if (r.last5.length < 3) {
      continue;
    }

    const avgTimeoutRate = r.last5.reduce((sum, g) => sum + g.timeoutRate, 0) / r.last5.length;

    if (avgTimeoutRate > threshold) {
      const sid = r._id.toString();
      const student = studentMap.get(sid);
      if (!student) {
        continue;
      }

      alerts.push({
        id: generateAlertId('consistent_timeout', sid),
        type: 'consistent_timeout',
        severity: 'warning',
        studentId: sid,
        studentPseudoId: pseudonymize(sid),
        studentName: student.name,
        message: `Tasa de timeout del ${Math.round(avgTimeoutRate * 100)}% en sus últimas ${r.last5.length} partidas`,
        recommendation:
          'Verificar si el tiempo límite es adecuado o si el alumno necesita apoyo adicional',
        detectedAt: new Date().toISOString(),
        data: {
          avgTimeoutRate: Math.round(avgTimeoutRate * 100 * 10) / 10,
          gamesAnalyzed: r.last5.length
        }
      });
    }
  }

  return alerts;
}

/**
 * Detecta alumnos con mejora rápida (>15% en 7 días).
 * Alerta positiva para refuerzo.
 *
 * @param {string} teacherId
 * @param {Array} students
 * @returns {Promise<Array>} Alertas de tipo improving_fast
 */
async function detectImprovingFast(teacherId, students) {
  const alerts = [];
  const { currentStart, previousStart, now } = getPeriodDates('7d');
  const threshold = ALERT_TYPES.improving_fast.thresholds.info;

  const studentIds = students.map(s => toObjectId(s._id));
  if (studentIds.length === 0) {
    return alerts;
  }

  const pipeline = [
    {
      $match: {
        playerId: { $in: studentIds },
        status: 'completed',
        completedAt: { $gte: previousStart, $lte: now }
      }
    },
    {
      $addFields: {
        period: {
          $cond: [{ $gte: ['$completedAt', currentStart] }, 'current', 'previous']
        }
      }
    },
    {
      $group: {
        _id: { playerId: '$playerId', period: '$period' },
        avgScore: { $avg: '$score' },
        count: { $sum: 1 }
      }
    }
  ];

  const results = await gamePlayRepository.aggregate(pipeline);

  const byStudent = {};
  for (const r of results) {
    const sid = r._id.playerId.toString();
    if (!byStudent[sid]) {
      byStudent[sid] = {};
    }
    byStudent[sid][r._id.period] = { avgScore: r.avgScore, count: r.count };
  }

  const studentMap = new Map(students.map(s => [s._id.toString(), s]));

  // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- cada continue filtra un criterio estadistico diferente
  for (const [sid, data] of Object.entries(byStudent)) {
    if (!data.current || !data.previous) {
      continue;
    }
    if (data.previous.count < 2 || data.current.count < 2) {
      continue;
    }
    if (data.previous.avgScore === 0) {
      continue;
    }

    const improvementPercent =
      ((data.current.avgScore - data.previous.avgScore) / data.previous.avgScore) * 100;

    if (improvementPercent > threshold) {
      const student = studentMap.get(sid);
      if (!student) {
        continue;
      }

      alerts.push({
        id: generateAlertId('improving_fast', sid),
        type: 'improving_fast',
        severity: 'info',
        studentId: sid,
        studentPseudoId: pseudonymize(sid),
        studentName: student.name,
        message: `Ha mejorado un ${Math.round(improvementPercent)}% en la última semana`,
        recommendation: 'Reforzar positivamente el progreso del alumno',
        detectedAt: new Date().toISOString(),
        data: {
          previousAvg: Math.round(data.previous.avgScore),
          currentAvg: Math.round(data.current.avgScore),
          improvementPercent: Math.round(improvementPercent * 10) / 10
        }
      });
    }
  }

  return alerts;
}

/**
 * Detecta alumnos con alta tasa de abandono (>25% en 7 días).
 *
 * @param {string} teacherId
 * @param {Array} students
 * @returns {Promise<Array>} Alertas de tipo high_abandonment
 */
async function detectHighAbandonment(teacherId, students) {
  const alerts = [];
  const threshold = ALERT_TYPES.high_abandonment.thresholds.warning;
  const sevenDaysAgo = getStartDate('7d');

  const studentIds = students.map(s => toObjectId(s._id));
  if (studentIds.length === 0) {
    return alerts;
  }

  const pipeline = [
    {
      $match: {
        playerId: { $in: studentIds },
        startedAt: { $gte: sevenDaysAgo },
        status: { $in: ['completed', 'abandoned'] }
      }
    },
    {
      $group: {
        _id: '$playerId',
        total: { $sum: 1 },
        abandoned: {
          $sum: { $cond: [{ $eq: ['$status', 'abandoned'] }, 1, 0] }
        }
      }
    },
    {
      $match: { total: { $gte: 3 } }
    }
  ];

  const results = await gamePlayRepository.aggregate(pipeline);
  const studentMap = new Map(students.map(s => [s._id.toString(), s]));

  for (const r of results) {
    const abandonmentRate = r.abandoned / r.total;

    if (abandonmentRate > threshold) {
      const sid = r._id.toString();
      const student = studentMap.get(sid);
      if (!student) {
        continue;
      }

      alerts.push({
        id: generateAlertId('high_abandonment', sid),
        type: 'high_abandonment',
        severity: 'warning',
        studentId: sid,
        studentPseudoId: pseudonymize(sid),
        studentName: student.name,
        message: `Ha abandonado ${r.abandoned} de ${r.total} partidas en los últimos 7 días (${Math.round(abandonmentRate * 100)}%)`,
        recommendation:
          'Revisar si las sesiones son demasiado largas o si el contenido genera frustración',
        detectedAt: new Date().toISOString(),
        data: {
          abandonedGames: r.abandoned,
          totalGames: r.total,
          abandonmentRate: Math.round(abandonmentRate * 100 * 10) / 10
        }
      });
    }
  }

  return alerts;
}

// ══════════════════════════════════════════════════════════════════════
// Funciones públicas
// ══════════════════════════════════════════════════════════════════════

/**
 * Obtiene todas las alertas activas para los alumnos de un profesor.
 * Ejecuta todos los detectores en paralelo y combina los resultados.
 *
 * @param {string} teacherId - ID del profesor
 * @param {Object} [options] - Opciones de filtrado
 * @param {string} [options.severity] - Filtrar por severidad
 * @param {string} [options.type] - Filtrar por tipo de alerta
 * @param {number} [options.limit=20] - Máximo de alertas a retornar
 * @returns {Promise<Object>} { alerts, summary }
 */
async function getAlerts(teacherId, { severity, type, limit = 20 } = {}) {
  // Obtener todos los estudiantes del profesor (con métricas)
  const students = await userRepository.find(
    {
      createdBy: toObjectId(teacherId),
      role: 'student',
      status: 'active'
    },
    { select: 'name studentMetrics profile.classroom' }
  );

  if (students.length === 0) {
    return {
      alerts: [],
      summary: { critical: 0, warning: 0, info: 0, total: 0 }
    };
  }

  // Ejecutar todos los detectores en paralelo
  const [
    decliningAlerts,
    inactivityAlerts,
    scoreDropAlerts,
    timeoutAlerts,
    improvingAlerts,
    abandonmentAlerts
  ] = await Promise.all([
    detectDecliningPerformance(teacherId, students),
    Promise.resolve(detectInactivity(students)),
    detectSuddenScoreDrop(teacherId, students),
    detectConsistentTimeout(teacherId, students),
    detectImprovingFast(teacherId, students),
    detectHighAbandonment(teacherId, students)
  ]);

  let allAlerts = [
    ...decliningAlerts,
    ...inactivityAlerts,
    ...scoreDropAlerts,
    ...timeoutAlerts,
    ...improvingAlerts,
    ...abandonmentAlerts
  ];

  // Filtrar por severidad si se especifica
  if (severity) {
    allAlerts = allAlerts.filter(a => a.severity === severity);
  }

  // Filtrar por tipo si se especifica
  if (type) {
    allAlerts = allAlerts.filter(a => a.type === type);
  }

  // Ordenar: critical primero, luego warning, luego info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  allAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Calcular summary antes de aplicar limit
  const summary = {
    critical: allAlerts.filter(a => a.severity === 'critical').length,
    warning: allAlerts.filter(a => a.severity === 'warning').length,
    info: allAlerts.filter(a => a.severity === 'info').length,
    total: allAlerts.length
  };

  // Aplicar limit
  const limitedAlerts = allAlerts.slice(0, limit);

  logger.info('Alertas computadas', {
    teacherId,
    total: summary.total,
    critical: summary.critical,
    warning: summary.warning,
    info: summary.info
  });

  return { alerts: limitedAlerts, summary };
}

/**
 * Obtiene solo el resumen de alertas (conteo por severidad y tipo).
 * Versión ligera para badges y contadores del sidebar.
 *
 * @param {string} teacherId - ID del profesor
 * @returns {Promise<Object>} { total, bySeverity, byType }
 */
async function getAlertsSummary(teacherId) {
  const { alerts } = await getAlerts(teacherId, { limit: 100 });

  const byType = {};
  for (const alert of alerts) {
    byType[alert.type] = (byType[alert.type] || 0) + 1;
  }

  return {
    total: alerts.length,
    bySeverity: {
      critical: alerts.filter(a => a.severity === 'critical').length,
      warning: alerts.filter(a => a.severity === 'warning').length,
      info: alerts.filter(a => a.severity === 'info').length
    },
    byType
  };
}

module.exports = {
  getAlerts,
  getAlertsSummary
};
