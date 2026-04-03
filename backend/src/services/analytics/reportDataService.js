/**
 * @fileoverview Servicio de datos estructurados para reportes y exportación.
 * Orquesta llamadas a otros sub-servicios para generar reportes completos.
 *
 * Ver Analytics_Design_Rationale.md § 2.6 para fundamentación pedagógica.
 *
 * @module services/analytics/reportDataService
 */

const analyticsService = require('../analyticsService');
const userRepository = require('../../repositories/userRepository');
const studentTrajectoryService = require('./studentTrajectoryService');
const engagementService = require('./engagementService');
const sessionAnalysisService = require('./sessionAnalysisService');
const alertsService = require('./alertsService');
const contentEffectivenessService = require('./contentEffectivenessService');
const { toObjectId, classifyTier, calcAccuracyRate, enrichMetric } = require('./analyticsHelpers');

// ══════════════════════════════════════════════════════════════════════
// E17 — Reporte completo de un estudiante
// ══════════════════════════════════════════════════════════════════════

/**
 * Genera datos completos de reporte para un estudiante individual.
 * Orquesta llamadas a múltiples sub-servicios.
 *
 * @param {string} studentId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {string} [options.format='summary']
 * @returns {Promise<Object>}
 */
async function getStudentReport(studentId, { timeRange = '30d', format = 'summary' } = {}) {
  // Obtener datos del estudiante
  const student = await userRepository.findById(studentId, {
    select: 'name profile.classroom profile.age profile.avatar studentMetrics'
  });

  if (!student) {
    const { NotFoundError } = require('../../utils/errors');
    throw new NotFoundError('Estudiante no encontrado');
  }

  const metrics = student.studentMetrics || {};
  const tier = classifyTier(metrics.averageScore);
  const accuracy = calcAccuracyRate(metrics.totalCorrectAnswers, metrics.totalErrors);

  // Enriquecer métricas con RAG (framework BI)
  const scoreEnriched = enrichMetric('score', metrics.averageScore || 0);
  const accuracyEnriched = enrichMetric('accuracy', accuracy);
  const responseTimeEnriched = enrichMetric('responseTime', metrics.averageResponseTime || 0);

  // Obtener datos en paralelo
  const promises = [
    studentTrajectoryService.getStudentTrajectory(studentId, { timeRange }),
    engagementService.getStudentEngagement(studentId, {
      timeRange: timeRange === '7d' ? '30d' : timeRange
    })
  ];

  if (format === 'detailed') {
    promises.push(
      sessionAnalysisService.getStudentStruggles(studentId, { timeRange }),
      studentTrajectoryService.getStudentEvolution(studentId, { timeRange, groupBy: 'context' }),
      studentTrajectoryService.getStudentEvolution(studentId, { timeRange, groupBy: 'mechanic' })
    );
  }

  const results = await Promise.all(promises);

  // Estructura jerárquica: Summary → Trends → Details (framework BI)
  const report = {
    generatedAt: new Date().toISOString(),
    student: {
      id: studentId,
      name: student.name,
      classroom: student.profile?.classroom || null,
      age: student.profile?.age || null
    },
    timeRange,

    // NIVEL 1: Summary cards (top-left, lo más importante)
    summary: {
      tier,
      avgScore: {
        value: Math.round(metrics.averageScore || 0),
        rag: scoreEnriched.rag,
        interpretation: scoreEnriched.interpretation
      },
      accuracy: {
        value: accuracy,
        rag: accuracyEnriched.rag
      },
      engagementScore: {
        value: results[1].engagementScore,
        rag: results[1].rag
      },
      totalGames: metrics.totalGamesPlayed || 0,
      bestScore: metrics.bestScore || 0,
      responseTime: {
        value: Math.round(metrics.averageResponseTime || 0),
        rag: responseTimeEnriched.rag
      }
    },

    // NIVEL 2: Trends (gráficos de tendencia)
    trends: {
      trajectory: results[0].trend,
      dataPoints: results[0].dataPoints
    },

    // NIVEL 3: Engagement
    engagement: {
      score: results[1].engagementScore,
      interpretation: results[1].interpretation,
      components: results[1].components,
      abandonment: results[1].abandonmentAnalysis
    }
  };

  // NIVEL 4: Details (solo en formato detallado)
  if (format === 'detailed') {
    report.details = {
      performanceByContext: results[3]?.series || [],
      performanceByMechanic: results[4]?.series || [],
      struggles: results[2]?.moments || [],
      recentGames: results[0].dataPoints
    };
  }

  return report;
}

// ══════════════════════════════════════════════════════════════════════
// E18 — Reporte completo de la clase
// ══════════════════════════════════════════════════════════════════════

/**
 * Genera datos completos de reporte para toda la clase.
 *
 * @param {string} teacherId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @param {string} [options.format='summary']
 * @returns {Promise<Object>}
 */
async function getClassroomReport(teacherId, { timeRange = '30d', format = 'summary' } = {}) {
  // Obtener datos en paralelo
  const basePromises = [
    analyticsService.getClassroomSummary(teacherId),
    analyticsService.getClassroomDistribution(teacherId),
    analyticsService.getClassroomTrends(teacherId, timeRange),
    engagementService.getClassroomEngagement(teacherId, {
      timeRange: timeRange === '7d' ? '30d' : timeRange
    }),
    alertsService.getAlertsSummary(teacherId)
  ];

  if (format === 'detailed') {
    basePromises.push(
      contentEffectivenessService.getContentEffectiveness(teacherId, {
        timeRange: timeRange === '7d' ? '30d' : timeRange
      })
    );
  }

  const results = await Promise.all(basePromises);

  const report = {
    generatedAt: new Date().toISOString(),
    timeRange,
    overview: {
      totalStudents: results[3].students.length,
      totalGames: results[0].totalGames,
      avgScore: results[0].averageScore,
      studentsInRisk: results[0].studentsInRisk,
      classEngagementScore: results[3].classEngagementScore,
      gamesToday: results[0].gamesToday
    },
    distribution: results[1],
    trends: results[2],
    topAlerts: results[4],
    studentSummaries: results[3].students.map(s => ({
      id: s.studentId,
      name: s.name,
      engagementScore: s.engagementScore,
      completionRate: s.completionRate,
      gamesPlayed: s.gamesPlayed
    }))
  };

  if (format === 'detailed' && results[5]) {
    report.contentEffectiveness = results[5].items;
  }

  return report;
}

// ══════════════════════════════════════════════════════════════════════
// E19 — Datos tabulares para exportación CSV
// ══════════════════════════════════════════════════════════════════════

/**
 * Genera datos en formato tabular optimizado para CSV.
 * Headers en español para el usuario final.
 *
 * @param {string} teacherId
 * @param {Object} options
 * @param {string} [options.timeRange='30d']
 * @returns {Promise<Object>} { headers, rows, generatedAt }
 */
async function getClassroomExport(teacherId, { timeRange: _timeRange = '30d' } = {}) {
  const students = await userRepository.find(
    {
      createdBy: toObjectId(teacherId),
      role: 'student',
      status: 'active'
    },
    { select: 'name profile.classroom profile.age studentMetrics' }
  );

  const headers = [
    'Nombre',
    'Aula',
    'Edad',
    'Partidas Jugadas',
    'Puntuación Media',
    'Mejor Puntuación',
    'Precisión (%)',
    'Tiempo Respuesta (ms)',
    'Nivel',
    'Última Actividad'
  ];

  const tierLabels = {
    risk: 'Riesgo',
    average: 'Promedio',
    good: 'Bueno',
    excellent: 'Excelente'
  };

  const rows = students.map(s => {
    const m = s.studentMetrics || {};
    const accuracy = calcAccuracyRate(m.totalCorrectAnswers, m.totalErrors);
    const tier = classifyTier(m.averageScore);

    return [
      s.name,
      s.profile?.classroom || '',
      s.profile?.age || '',
      m.totalGamesPlayed || 0,
      Math.round(m.averageScore || 0),
      m.bestScore || 0,
      accuracy,
      Math.round(m.averageResponseTime || 0),
      tierLabels[tier] || tier,
      m.lastPlayedAt ? new Date(m.lastPlayedAt).toLocaleDateString('es-ES') : 'Sin actividad'
    ];
  });

  // Ordenar por nombre
  rows.sort((a, b) => a[0].localeCompare(b[0], 'es'));

  return {
    headers,
    rows,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  getStudentReport,
  getClassroomReport,
  getClassroomExport
};
