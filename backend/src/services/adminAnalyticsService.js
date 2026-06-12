/**
 * @fileoverview Servicio de analíticas del centro educativo para super_admin.
 *
 * Agrega métricas tenancy-wide (sin filtro `teacherId`) que alimentan el
 * `AdminDashboard`: KPIs de usuarios, partidas, contenido y alertas, más
 * rankings de profesores/mecánicas/contextos. T-942 Fase B.
 *
 * Reutiliza helpers de `analyticsHelpers` y los repositorios de dominio
 * existentes. No cachea internamente — el caching se hace en el controller
 * via `cacheGet` para mantener responsabilidades separadas (ver ADR-026).
 *
 * @module services/adminAnalyticsService
 */

const gamePlayRepository = require('../repositories/gamePlayRepository');
const userRepository = require('../repositories/userRepository');
const gameSessionRepository = require('../repositories/gameSessionRepository');
const gameContextRepository = require('../repositories/gameContextRepository');
const gameMechanicRepository = require('../repositories/gameMechanicRepository');
const cardDeckRepository = require('../repositories/cardDeckRepository');
const smartAlertRepository = require('../repositories/smartAlertRepository');

const {
  getStartDate,
  getStartOfToday,
  enrichMetric,
  SCORE_PERCENT_EXPR
} = require('./analytics/analyticsHelpers');

// Tope de elementos en los rankings ("top N").
const TOP_N = 5;

/**
 * Agregado de usuarios del centro (sin métricas dependientes de fecha).
 *
 * `activeTeachers` se calcula aparte (`getActiveTeachersCount`) en base a
 * profesores que han tenido partidas completadas en el periodo. Definición más
 * útil para un director que "logueados recientemente": un profesor que prepara
 * sesiones y deja al alumnado jugar sin volver a entrar sigue siendo activo.
 *
 * @returns {Promise<{
 *   totalStudents: number,
 *   totalTeachers: number,
 *   pendingTeachers: number
 * }>}
 */
const getUsersAggregate = async () => {
  const [totalStudents, totalTeachers, pendingTeachers] = await Promise.all([
    userRepository.count({ role: 'student', status: 'active' }),
    userRepository.count({
      role: 'teacher',
      accountStatus: 'approved'
    }),
    userRepository.count({
      role: 'teacher',
      accountStatus: 'pending_approval'
    })
  ]);

  return { totalStudents, totalTeachers, pendingTeachers };
};

/**
 * Cuenta profesores con al menos una partida completada en el periodo. Es la
 * señal de "actividad real" desde la mirada de un director (más útil que
 * `lastLoginAt`, que no se actualiza si el profesor prepara una sesión y deja
 * jugar a su clase sin volver a entrar).
 *
 * @param {Date} startDate
 * @returns {Promise<number>}
 */
const getActiveTeachersCount = async startDate => {
  const result = await gamePlayRepository.aggregate([
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: startDate }
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
    // Proyección post-lookup: el $group solo usa createdBy. Descartamos los
    // arrays pesados de la sesión (cardMappings/boardLayout/sequencePlan) que
    // de otro modo viajarían materializados hasta el $group.
    { $project: { 'session.createdBy': 1 } },
    {
      $group: {
        _id: '$session.createdBy'
      }
    },
    { $count: 'count' }
  ]);

  return result[0]?.count || 0;
};

/**
 * Agregado de actividad (partidas, scores y desglose por mecánica) del centro.
 *
 * @param {Date} startDate
 * @returns {Promise<{
 *   totalPlaysInRange: number,
 *   avgScoreInRange: number,
 *   playsToday: number,
 *   playsByMechanic: Array<{ mechanicId: string, mechanicName: string, totalPlays: number, avgScore: number }>
 * }>}
 */
const getActivityAggregate = async startDate => {
  const startOfToday = getStartOfToday();

  // KPIs globales del rango
  const globalAggPromise = gamePlayRepository.aggregate([
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalPlaysInRange: { $sum: 1 },
        avgScoreInRange: { $avg: SCORE_PERCENT_EXPR }
      }
    }
  ]);

  const playsTodayPromise = gamePlayRepository.count({
    status: 'completed',
    completedAt: { $gte: startOfToday }
  });

  // Desglose por mecánica (join con sessions para extraer mechanicId)
  const byMechanicPromise = gamePlayRepository.aggregate([
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: startDate }
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
    // Proyección post-lookup: solo mechanicId (para el 2º lookup) +
    // score/maxScore (SCORE_PERCENT_EXPR). Descarta los arrays pesados.
    { $project: { score: 1, maxScore: 1, 'session.mechanicId': 1 } },
    {
      $lookup: {
        from: 'game_mechanics',
        localField: 'session.mechanicId',
        foreignField: '_id',
        as: 'mechanic'
      }
    },
    { $unwind: '$mechanic' },
    {
      $group: {
        _id: {
          mechanicId: '$mechanic._id',
          mechanicName: { $ifNull: ['$mechanic.displayName', '$mechanic.name'] }
        },
        totalPlays: { $sum: 1 },
        avgScore: { $avg: SCORE_PERCENT_EXPR }
      }
    },
    { $sort: { totalPlays: -1 } }
  ]);

  const [globalAggResult, playsToday, byMechanicResult] = await Promise.all([
    globalAggPromise,
    playsTodayPromise,
    byMechanicPromise
  ]);

  const totalPlaysInRange = globalAggResult[0]?.totalPlaysInRange || 0;
  const avgScoreInRange = Math.round((globalAggResult[0]?.avgScoreInRange || 0) * 10) / 10;

  const playsByMechanic = byMechanicResult.map(r => ({
    mechanicId: r._id.mechanicId.toString(),
    mechanicName: r._id.mechanicName,
    totalPlays: r.totalPlays,
    avgScore: Math.round((r.avgScore || 0) * 10) / 10
  }));

  return { totalPlaysInRange, avgScoreInRange, playsToday, playsByMechanic };
};

/**
 * Agregado de contenido del centro (mazos, sesiones, contextos, mecánicas).
 *
 * @returns {Promise<{
 *   totalDecks: number,
 *   totalSessions: number,
 *   activeSessions: number,
 *   totalContexts: number,
 *   totalMechanics: number
 * }>}
 */
const getContentAggregate = async () => {
  const [totalDecks, totalSessions, activeSessions, totalContexts, totalMechanics] =
    await Promise.all([
      cardDeckRepository.count({}),
      gameSessionRepository.count({}),
      gameSessionRepository.count({ status: 'active' }),
      gameContextRepository.count({}),
      gameMechanicRepository.count({})
    ]);

  return { totalDecks, totalSessions, activeSessions, totalContexts, totalMechanics };
};

/**
 * Agregado de alertas SmartAlert activas del centro por severidad,
 * con top-5 de profesores con más alertas críticas/warning.
 *
 * @returns {Promise<{
 *   totalCriticalActive: number,
 *   totalWarningActive: number,
 *   totalInfoActive: number,
 *   byTeacher: Array<{ teacherId: string, teacherName: string, criticalCount: number, warningCount: number }>
 * }>}
 */
const getAlertsAggregate = async () => {
  const pipeline = [
    { $match: { status: 'active' } },
    {
      $group: {
        _id: { teacherId: '$teacherId', severity: '$severity' },
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id.teacherId',
        foreignField: '_id',
        as: 'teacher'
      }
    },
    { $unwind: { path: '$teacher', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$_id.teacherId',
        teacherName: { $first: '$teacher.name' },
        bySeverity: {
          $push: { severity: '$_id.severity', count: '$count' }
        },
        totalForTeacher: { $sum: '$count' }
      }
    },
    { $sort: { totalForTeacher: -1 } }
  ];

  const results = await smartAlertRepository.aggregate(pipeline);

  let totalCriticalActive = 0;
  let totalWarningActive = 0;
  let totalInfoActive = 0;

  const teacherEntries = results.map(r => {
    let criticalCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    for (const { severity, count } of r.bySeverity) {
      if (severity === 'critical') {
        criticalCount = count;
      } else if (severity === 'warning') {
        warningCount = count;
      } else if (severity === 'info') {
        infoCount = count;
      }
    }
    totalCriticalActive += criticalCount;
    totalWarningActive += warningCount;
    totalInfoActive += infoCount;
    return {
      teacherId: r._id ? r._id.toString() : null,
      teacherName: r.teacherName || 'Sin profesor',
      criticalCount,
      warningCount
    };
  });

  // Top-5 ordenado por (critical desc, warning desc).
  const byTeacher = teacherEntries
    .sort((a, b) => {
      if (b.criticalCount !== a.criticalCount) {
        return b.criticalCount - a.criticalCount;
      }
      return b.warningCount - a.warningCount;
    })
    .slice(0, TOP_N)
    .filter(t => t.criticalCount > 0 || t.warningCount > 0);

  return { totalCriticalActive, totalWarningActive, totalInfoActive, byTeacher };
};

/**
 * Top-5 de profesores por actividad agregada (totalPlays, avgScore, alumnos activos).
 *
 * @param {Date} startDate
 * @returns {Promise<Array<{
 *   teacherId: string,
 *   teacherName: string,
 *   totalPlays: number,
 *   avgScore: number,
 *   activeStudents: number
 * }>>}
 */
const getTopTeachers = async startDate => {
  const pipeline = [
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: startDate }
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
    // Proyección post-lookup: createdBy (group) + playerId (uniqueStudents) +
    // score/maxScore (SCORE_PERCENT_EXPR). Descarta los arrays pesados.
    { $project: { score: 1, maxScore: 1, playerId: 1, 'session.createdBy': 1 } },
    {
      $group: {
        _id: '$session.createdBy',
        totalPlays: { $sum: 1 },
        avgScore: { $avg: SCORE_PERCENT_EXPR },
        uniqueStudents: { $addToSet: '$playerId' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'teacher'
      }
    },
    { $unwind: { path: '$teacher', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        teacherId: '$_id',
        teacherName: { $ifNull: ['$teacher.name', 'Sin profesor'] },
        totalPlays: 1,
        avgScore: { $round: [{ $ifNull: ['$avgScore', 0] }, 1] },
        activeStudents: { $size: '$uniqueStudents' }
      }
    },
    { $sort: { totalPlays: -1 } },
    { $limit: TOP_N }
  ];

  const results = await gamePlayRepository.aggregate(pipeline);
  return results.map(r => ({
    teacherId: r.teacherId ? r.teacherId.toString() : null,
    teacherName: r.teacherName,
    totalPlays: r.totalPlays,
    avgScore: r.avgScore,
    activeStudents: r.activeStudents
  }));
};

/**
 * Top-5 de mecánicas del centro por uso, con score promedio.
 *
 * @param {Date} startDate
 * @returns {Promise<Array<{ mechanicId: string, mechanicName: string, totalPlays: number, avgScore: number }>>}
 */
const getTopMechanics = async startDate => {
  const pipeline = [
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: startDate }
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
    // Proyección post-lookup: solo mechanicId (para el 2º lookup) +
    // score/maxScore (SCORE_PERCENT_EXPR). Descarta los arrays pesados.
    { $project: { score: 1, maxScore: 1, 'session.mechanicId': 1 } },
    {
      $lookup: {
        from: 'game_mechanics',
        localField: 'session.mechanicId',
        foreignField: '_id',
        as: 'mechanic'
      }
    },
    { $unwind: '$mechanic' },
    {
      $group: {
        _id: {
          mechanicId: '$mechanic._id',
          mechanicName: { $ifNull: ['$mechanic.displayName', '$mechanic.name'] }
        },
        totalPlays: { $sum: 1 },
        avgScore: { $avg: SCORE_PERCENT_EXPR }
      }
    },
    { $sort: { totalPlays: -1 } },
    { $limit: TOP_N }
  ];

  const results = await gamePlayRepository.aggregate(pipeline);
  return results.map(r => ({
    mechanicId: r._id.mechanicId.toString(),
    mechanicName: r._id.mechanicName,
    totalPlays: r.totalPlays,
    avgScore: Math.round((r.avgScore || 0) * 10) / 10
  }));
};

/**
 * Top-5 de contextos del centro por uso, con score promedio.
 *
 * @param {Date} startDate
 * @returns {Promise<Array<{ contextId: string, contextName: string, totalPlays: number, avgScore: number }>>}
 */
const getTopContexts = async startDate => {
  const pipeline = [
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: startDate }
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
    // Proyección post-lookup: solo contextId (para el 2º lookup) +
    // score/maxScore (SCORE_PERCENT_EXPR). Descarta los arrays pesados.
    { $project: { score: 1, maxScore: 1, 'session.contextId': 1 } },
    {
      $lookup: {
        from: 'game_contexts',
        localField: 'session.contextId',
        foreignField: '_id',
        as: 'context'
      }
    },
    { $unwind: '$context' },
    {
      $group: {
        _id: {
          contextId: '$context._id',
          contextName: '$context.name'
        },
        totalPlays: { $sum: 1 },
        avgScore: { $avg: SCORE_PERCENT_EXPR }
      }
    },
    { $sort: { totalPlays: -1 } },
    { $limit: TOP_N }
  ];

  const results = await gamePlayRepository.aggregate(pipeline);
  return results.map(r => ({
    contextId: r._id.contextId.toString(),
    contextName: r._id.contextName,
    totalPlays: r.totalPlays,
    avgScore: Math.round((r.avgScore || 0) * 10) / 10
  }));
};

/**
 * Devuelve el agregado completo del centro educativo para el AdminDashboard.
 *
 * @param {object} [options]
 * @param {('7d'|'30d'|'90d')} [options.timeRange='30d']
 * @returns {Promise<object>}
 */
const getCenterOverview = async ({ timeRange = '30d' } = {}) => {
  const startDate = getStartDate(timeRange);

  const [usersBase, activity, content, alerts, topTeachers, topContexts, activeTeachers] =
    await Promise.all([
      getUsersAggregate(),
      getActivityAggregate(startDate),
      getContentAggregate(),
      getAlertsAggregate(),
      getTopTeachers(startDate),
      getTopContexts(startDate),
      getActiveTeachersCount(startDate)
    ]);

  const users = { ...usersBase, activeTeachers };

  // Top mecánicas: se deriva del desglose que `getActivityAggregate` ya calcula
  // (`playsByMechanic`, ordenado desc por totalPlays, mismo shape y redondeo que
  // `getTopMechanics`). Antes `getTopMechanics` re-escaneaba `gameplays` entera
  // con el MISMO doble `$lookup` solo para aplicar un `$limit` → doble escaneo
  // de la colección por cada overview. `getTopMechanics` se mantiene como
  // utilidad standalone exportada, pero el overview ya no la necesita.
  const topMechanics = activity.playsByMechanic.slice(0, TOP_N);

  // Enriquecemos la puntuación media del centro con su RAG para reutilizar el
  // framework BI compartido con `analyticsHelpers` (whatHappened/soWhat/nowWhat
  // se ignoran en el dashboard pero el rag.status alimenta el badge visual).
  const scoreEnriched = activity.totalPlaysInRange
    ? enrichMetric('score', activity.avgScoreInRange)
    : null;

  return {
    timeRange,
    users,
    activity: {
      ...activity,
      avgScoreRag: scoreEnriched ? scoreEnriched.rag : null
    },
    content,
    alerts,
    topTeachers,
    topMechanics,
    topContexts,
    generatedAt: new Date().toISOString()
  };
};

module.exports = {
  getCenterOverview,
  // Internals expuestos para tests unitarios y consumidores avanzados.
  getUsersAggregate,
  getActiveTeachersCount,
  getActivityAggregate,
  getContentAggregate,
  getAlertsAggregate,
  getTopTeachers,
  getTopMechanics,
  getTopContexts,
  TOP_N
};
