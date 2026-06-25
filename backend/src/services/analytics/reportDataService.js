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
const alertDetectionService = require('./alertDetectionService');
const contentEffectivenessService = require('./contentEffectivenessService');
const { toObjectId, classifyTier, calcAccuracyRate, enrichMetric } = require('./analyticsHelpers');
const { MIN_ANALYTICS_GROUP_SIZE } = require('../../config/dataRetention');
const logger = require('../../utils/logger').child({ component: 'reportDataService' });
const { Sentry } = require('../../config/sentry');

/**
 * Timeout duro para la orquestación paralela del reporte. Sin esto, si una
 * sub-agregación cuelga (Atlas M0 con cluster saturado), el request HTTP
 * queda colgado indefinidamente bloqueando un slot del pool Mongoose. 8s es
 * generoso para queries normales (~200-800ms) y suficientemente breve para
 * que el usuario reciba un error claro en vez de un timeout HTTP de 30s+.
 *
 * Configurable via env `REPORT_TIMEOUT_MS`.
 *
 * @type {number}
 */
const REPORT_TIMEOUT_MS = Number.parseInt(process.env.REPORT_TIMEOUT_MS, 10) || 8000;

class ReportTimeoutError extends Error {
  constructor(label) {
    super(`Reporte excedió ${REPORT_TIMEOUT_MS}ms (${label})`);
    this.name = 'ReportTimeoutError';
    this.isOperational = true;
    this.statusCode = 504;
    this.code = 'REPORT_TIMEOUT';
  }
}

/**
 * Envuelve una promesa con un timeout duro. Si vence, rechaza con
 * `ReportTimeoutError` y notifica a Sentry con un tag dedicado para que el
 * dashboard de errores muestre la tasa de timeouts del módulo de informes.
 *
 * @param {Promise<any>} promise
 * @param {string} label - Etiqueta para logging/Sentry.
 * @returns {Promise<any>}
 */
const withReportTimeout = (promise, label) => {
  let timer;
  const timeoutPromise = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new ReportTimeoutError(label);
      logger.warn({ label, timeoutMs: REPORT_TIMEOUT_MS }, 'reportDataService timeout');
      Sentry.captureException(err, {
        tags: { module: 'reportDataService', report: 'timeout', label }
      });
      reject(err);
    }, REPORT_TIMEOUT_MS);
    // `.unref()` evita que el timer mantenga el proceso vivo al shutdown.
    if (timer.unref) {
      timer.unref();
    }
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
};

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

  const results = await withReportTimeout(Promise.all(promises), `studentReport:${studentId}`);

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
    alertDetectionService.summaryForTeacher(teacherId)
  ];

  if (format === 'detailed') {
    basePromises.push(
      contentEffectivenessService.getContentEffectiveness(teacherId, {
        timeRange: timeRange === '7d' ? '30d' : timeRange
      })
    );
  }

  const results = await withReportTimeout(
    Promise.all(basePromises),
    `classroomReport:${teacherId}`
  );

  // Enriquecer studentSummaries con averageScore de studentMetrics para que el
  // ranking "Mejores/En Riesgo" coincida con la tabla "Mis Alumnos" (que tambien
  // ordena por averageScore historico). Sin esto, el informe ordenaba por
  // engagementScore y producia rankings divergentes (QA 2026-04-29 BUG-2).
  const studentIdsForScore = results[3].students.map(s => s.studentId);
  // `lean: true` evita hidratar documentos Mongoose: la consulta solo lee
  // `_id` y `studentMetrics.averageScore` para construir un Map de lookup,
  // sin métodos de instancia. En cache miss del namespace AUTH_USER (cold
  // boot del proceso o refetch post-timeout) esto ahorra ~30 docs hidratados
  // por informe en un aula típica.
  const studentDocsByScore =
    studentIdsForScore.length > 0
      ? await userRepository.find(
          { _id: { $in: studentIdsForScore } },
          { select: '_id studentMetrics.averageScore', lean: true }
        )
      : [];
  const scoreById = new Map(
    studentDocsByScore.map(d => [d._id.toString(), d.studentMetrics?.averageScore ?? 0])
  );

  const enrichedStudentSummaries = results[3].students
    .map(s => ({
      id: s.studentId,
      name: s.name,
      averageScore: scoreById.get(s.studentId) ?? 0,
      engagementScore: s.engagementScore,
      completionRate: s.completionRate,
      gamesPlayed: s.gamesPlayed
    }))
    .sort((a, b) => b.averageScore - a.averageScore);

  const report = {
    generatedAt: new Date().toISOString(),
    timeRange,
    overview: {
      totalStudents: results[3].students.length,
      totalGames: results[0].totalGames,
      avgScore: results[0].averageScore,
      studentsInRisk: results[0].studentsInRisk,
      classEngagementScore: results[3].classEngagementScore,
      // Tasa de completado real (partidas completadas / totales). Sin este campo
      // el informe caía al `classEngagementScore` y etiquetaba el engagement como
      // "Completado", divergiendo de la "Tasa de completado" del dashboard.
      completionRate: results[3].classCompletionRate,
      gamesToday: results[0].gamesToday
    },
    distribution: results[1],
    trends: results[2],
    topAlerts: results[4],
    studentSummaries: enrichedStudentSummaries
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
      status: 'active',
      // Art. 21 RGPD: excluir del export a alumnos sin consentimiento de analytics
      // (o cuyo tutor ejerció oposición). Paridad con getClassroomStudents; el export
      // (dato que SALE del sistema) es la salida de mayor riesgo y no debe ser menos
      // estricto que la vista en pantalla, que sí aplicaba este filtro.
      'consent.granted': true,
      'consent.purposes': 'performance_analytics'
    },
    { select: 'name profile.classroom profile.age studentMetrics', lean: true }
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

  // Protección k-anonimidad (Guía Anonimización AEPD 2019): por debajo del umbral,
  // un CSV con filas individuales permitiría re-identificar a menores en aulas
  // pequeñas una vez el archivo sale del sistema. Devolvemos solo agregados, igual
  // que la vista getClassroomStudents.
  if (students.length > 0 && students.length < MIN_ANALYTICS_GROUP_SIZE) {
    const totalGames = students.reduce(
      (sum, s) => sum + (s.studentMetrics?.totalGamesPlayed || 0),
      0
    );
    const avgScore =
      students.reduce((sum, s) => sum + (s.studentMetrics?.averageScore || 0), 0) / students.length;
    return {
      headers,
      rows: [],
      aggregatedOnly: true,
      reason: `Protección k-anonimidad: grupo de ${students.length} estudiantes (mínimo ${MIN_ANALYTICS_GROUP_SIZE})`,
      total: students.length,
      aggregatedMetrics: {
        totalGames,
        averageScore: Math.round(avgScore * 10) / 10
      },
      generatedAt: new Date().toISOString()
    };
  }

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
