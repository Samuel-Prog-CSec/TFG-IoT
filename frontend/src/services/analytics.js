import api, { extractData } from './api';

const analyticsService = {
  // ──────────────── Classroom Analytics ────────────────

  /**
   * Obtiene el resumen global de la clase (KPIs).
   * @param {Object} [params] - Query params: timeRange, contextId, mechanicId
   * @param {Object} [config] - Configuracion de Axios (AbortController, etc.)
   * @returns {Promise<Object>} KPIs de la clase
   */
  getClassroomSummary: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/classroom/summary', {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene el progreso comparativo de la clase (grafico de area/linea).
   * @param {string} [timeRange='7d'] - '7d', '30d' o '90d'
   * @param {Object} [filters] - Filtros opcionales: contextId, mechanicId
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Array>} Datos para el grafico
   */
  getClassroomComparison: async (timeRange = '7d', { contextId, mechanicId } = {}, config = {}) => {
    const response = await api.get('/analytics/classroom/comparison', {
      params: {
        timeRange,
        ...(contextId && { contextId }),
        ...(mechanicId && { mechanicId })
      },
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene tendencias con cambio porcentual (periodo actual vs anterior).
   * @param {string} [timeRange='7d'] - '7d', '30d' o '90d'
   * @param {Object} [filters] - Filtros opcionales: contextId, mechanicId
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} KPIs con current, previous, change, changePercent
   */
  getClassroomTrends: async (timeRange = '7d', { contextId, mechanicId } = {}, config = {}) => {
    const response = await api.get('/analytics/classroom/trends', {
      params: {
        timeRange,
        ...(contextId && { contextId }),
        ...(mechanicId && { mechanicId })
      },
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene las dificultades globales de la clase.
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Array>} Dificultades por contexto/mecanica
   */
  getClassroomDifficulties: async (config = {}) => {
    const response = await api.get('/analytics/classroom/difficulties', config);
    return extractData(response);
  },

  /**
   * Obtiene la lista de estudiantes con metricas agregadas.
   * @param {Object} [params] - Query params: sort, order, tier, classroom
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Lista de estudiantes con metricas
   */
  getClassroomStudents: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/classroom/students', {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene la distribucion de rendimiento en 4 rangos (riesgo, promedio, bueno, excelente).
   * @param {Object} [params] - Query params: timeRange
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Array>} Distribucion [{range, count, percentage}]
   */
  getClassroomDistribution: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/classroom/distribution', {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene el mapa de calor de actividad (dia de la semana x hora).
   * @param {string} [timeRange='30d'] - '7d' o '30d'
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Datos de heatmap dia x hora
   */
  getClassroomHeatmap: async (timeRange = '30d', config = {}) => {
    const response = await api.get('/analytics/classroom/heatmap', {
      params: { timeRange },
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene rankings de contextos y mecanicas por uso y rendimiento.
   * @param {string} [timeRange='30d'] - '7d' o '30d'
   * @param {number} [limit=10] - Numero maximo de resultados (1-20)
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Rankings de contextos y mecanicas
   */
  getClassroomRankings: async (timeRange = '30d', limit = 10, config = {}) => {
    const response = await api.get('/analytics/classroom/rankings', {
      params: { timeRange, limit },
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene engagement agregado de toda la clase.
   * @param {Object} [params] - Query params: timeRange, sort, order
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Engagement por estudiante con score desglosado
   */
  getClassroomEngagement: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/classroom/engagement', {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene indicadores de fatiga agregados de la clase.
   * @param {string} [timeRange='30d'] - '7d' o '30d'
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Indicadores de fatiga (ralentizacion segunda mitad)
   */
  getClassroomFatigue: async (timeRange = '30d', config = {}) => {
    const response = await api.get('/analytics/classroom/fatigue', {
      params: { timeRange },
      ...config
    });
    return extractData(response);
  },

  // ──────────────── Student Analytics ────────────────

  /**
   * Obtiene las dificultades de un estudiante especifico.
   * @param {string} studentId - ID del estudiante
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Array>} Dificultades por contexto/mecanica
   */
  getStudentDifficulties: async (studentId, config = {}) => {
    const response = await api.get(`/analytics/student/${studentId}/difficulties`, config);
    return extractData(response);
  },

  /**
   * Obtiene el progreso historico de un estudiante.
   * @param {string} studentId - ID del estudiante
   * @param {string} [timeRange='30d'] - '7d' o '30d'
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Array>} Datos para el grafico de progreso
   */
  getStudentProgress: async (studentId, timeRange = '30d', config = {}) => {
    const response = await api.get(`/analytics/student/${studentId}/progress`, {
      params: { timeRange },
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene resumen completo de un estudiante (metricas, ultimas partidas, rendimiento, comparativa).
   * @param {string} studentId - ID del estudiante
   * @param {Object} [params] - Query params: timeRange
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Resumen completo del estudiante
   */
  getStudentSummary: async (studentId, params = {}, config = {}) => {
    const response = await api.get(`/analytics/student/${studentId}/summary`, {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene la trayectoria de aprendizaje con tendencia calculada (mejorando/estable/declinando).
   * @param {string} studentId - ID del estudiante
   * @param {Object} [params] - Query params: timeRange (7d/30d/90d), granularity (daily/weekly/monthly)
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Progresion temporal con linea de tendencia
   */
  getStudentTrajectory: async (studentId, params = {}, config = {}) => {
    const response = await api.get(`/analytics/student/${studentId}/trajectory`, {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene la velocidad de mejora en ventanas temporales.
   * @param {string} studentId - ID del estudiante
   * @param {Object} [params] - Query params: timeRange, windowDays (3-14)
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Tasa de mejora por ventana temporal
   */
  getStudentVelocity: async (studentId, params = {}, config = {}) => {
    const response = await api.get(`/analytics/student/${studentId}/velocity`, {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Detecta periodos de estancamiento (plateaus) en el rendimiento.
   * @param {string} studentId - ID del estudiante
   * @param {Object} [params] - Query params: timeRange, minDays (3-30)
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Periodos de estancamiento detectados
   */
  getStudentPlateaus: async (studentId, params = {}, config = {}) => {
    const response = await api.get(`/analytics/student/${studentId}/plateaus`, {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene la evolucion del estudiante agrupada por contexto o mecanica.
   * @param {string} studentId - ID del estudiante
   * @param {Object} [params] - Query params: timeRange, groupBy (context/mechanic)
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Evolucion por dimension
   */
  getStudentEvolution: async (studentId, params = {}, config = {}) => {
    const response = await api.get(`/analytics/student/${studentId}/evolution`, {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Detecta momentos de dificultad (errores consecutivos / frustracion).
   * @param {string} studentId - ID del estudiante
   * @param {Object} [params] - Query params: timeRange, minConsecutiveErrors (2-5)
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Momentos de frustracion detectados
   */
  getStudentStruggles: async (studentId, params = {}, config = {}) => {
    const response = await api.get(`/analytics/student/${studentId}/struggles`, {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene el engagement score individual con componentes desglosados.
   * @param {string} studentId - ID del estudiante
   * @param {Object} [params] - Query params: timeRange (30d/90d)
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Engagement score con 5 componentes
   */
  getStudentEngagement: async (studentId, params = {}, config = {}) => {
    const response = await api.get(`/analytics/student/${studentId}/engagement`, {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene patrones de juego del estudiante.
   * @param {string} studentId - ID del estudiante
   * @param {Object} [params] - Query params: timeRange
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Patrones de comportamiento en partidas
   */
  getStudentPlayPatterns: async (studentId, params = {}, config = {}) => {
    const response = await api.get(`/analytics/student/${studentId}/play-patterns`, {
      params,
      ...config
    });
    return extractData(response);
  },

  // ──────────────── Gameplay Analysis ────────────────

  /**
   * Obtiene el desglose ronda-a-ronda de una partida con deteccion de fatiga.
   * @param {string} gameplayId - ID del gameplay
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Desglose por rondas con indicador de fatiga
   */
  getGameplayRounds: async (gameplayId, config = {}) => {
    const response = await api.get(`/analytics/gameplay/${gameplayId}/rounds`, config);
    return extractData(response);
  },

  // ──────────────── Content Effectiveness ────────────────

  /**
   * Analiza que contextos/mecanicas producen mejor aprendizaje.
   *
   * Soporta tres modos:
   *  - `groupBy: 'context'` — efectividad por contexto (vista 1D, default).
   *  - `groupBy: 'mechanic'` — efectividad por mecanica (vista 1D).
   *  - `groupBy: 'cross'` — matriz cruzada mecanica × contexto (T-942 Fase A).
   *    Cuando se solicita 'cross', acepta tambien `includeEmpty` (bool) para
   *    incluir celdas sin partidas.
   *
   * @param {Object} [params] - Query params: timeRange, groupBy, includeEmpty
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Efectividad por contenido. Para 'cross':
   *   `{ items, groupBy: 'cross' }`. Para 1D: `{ items, groupBy }`.
   */
  getContentEffectiveness: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/classroom/content-effectiveness', {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Atajo semántico para la matriz cruzada (T-942 Fase C). Internamente
   * delega en `getContentEffectiveness` con `groupBy: 'cross'`.
   *
   * @param {Object} [opts]
   * @param {string} [opts.timeRange='30d']
   * @param {'context'|'mechanic'|'cross'} [opts.groupBy='cross']
   * @param {boolean} [opts.includeEmpty=false]
   * @param {Object} [config]
   * @returns {Promise<{items: Array, groupBy: string}>}
   */
  getClassroomContentEffectiveness: async (
    { timeRange = '30d', groupBy = 'cross', includeEmpty = false } = {},
    config = {}
  ) => {
    const response = await api.get('/analytics/classroom/content-effectiveness', {
      params: { timeRange, groupBy, includeEmpty },
      ...config
    });
    return extractData(response);
  },

  /**
   * Identifica tarjetas RFID problematicas con alta tasa de error.
   * @param {Object} [params] - Query params: timeRange, contextId, threshold (10-90)
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Tarjetas con mayor dificultad
   */
  getCardDifficulty: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/classroom/card-difficulty', {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene curvas de aprendizaje por contenido (como mejoran con repeticion).
   * @param {Object} [params] - Query params: timeRange (90d), contextId, mechanicId
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Curvas de aprendizaje por intento
   */
  getLearningCurves: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/classroom/learning-curves', {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Analiza rendimiento por tarjeta RFID (analisis de cartas).
   * @param {Object} [params] - Query params: timeRange, contextId, limit
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Rendimiento por tarjeta
   */
  getCardAnalysis: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/classroom/card-analysis', {
      params,
      ...config
    });
    return extractData(response);
  },

  // ──────────────── Alerts (T-941) ────────────────

  /**
   * Obtiene alertas inteligentes persistidas.
   * Estados: active | resolved | dismissed | snoozed (default: active)
   * 13 tipos catalogados — ver `constants/alertTypes.js`.
   *
   * @param {Object} [params] - Query params: status, severity, type, studentId, cursor, limit
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<{ items: object[], nextCursor: string|null }>}
   */
  getAlerts: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/alerts', { params, ...config });
    return extractData(response);
  },

  /**
   * Conteos por severidad/estado/tipo para badges.
   */
  getAlertsSummary: async (config = {}) => {
    const response = await api.get('/analytics/alerts/summary', config);
    return extractData(response);
  },

  /**
   * Dashboard interno del sistema (H.3).
   */
  getAlertsEffectiveness: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/alerts/effectiveness', { params, ...config });
    return extractData(response);
  },

  /**
   * Detalle individual.
   */
  getAlertById: async (id, config = {}) => {
    const response = await api.get(`/analytics/alerts/${id}`, config);
    return extractData(response);
  },

  /**
   * Audit log de una alerta (H.2).
   */
  getAlertHistory: async (id, config = {}) => {
    const response = await api.get(`/analytics/alerts/${id}/history`, config);
    return extractData(response);
  },

  dismissAlert: async (id, { reason } = {}, config = {}) => {
    const response = await api.patch(`/analytics/alerts/${id}/dismiss`, { reason }, config);
    return extractData(response);
  },

  resolveAlert: async (id, config = {}) => {
    const response = await api.patch(`/analytics/alerts/${id}/resolve`, {}, config);
    return extractData(response);
  },

  snoozeAlert: async (id, { untilDays, untilDate } = {}, config = {}) => {
    const body = {};
    if (untilDate) body.untilDate = untilDate;
    if (untilDays) body.untilDays = untilDays;
    const response = await api.patch(`/analytics/alerts/${id}/snooze`, body, config);
    return extractData(response);
  },

  pinAlert: async (id, config = {}) => {
    const response = await api.patch(`/analytics/alerts/${id}/pin`, {}, config);
    return extractData(response);
  },

  unpinAlert: async (id, config = {}) => {
    const response = await api.patch(`/analytics/alerts/${id}/unpin`, {}, config);
    return extractData(response);
  },

  bulkAlertAction: async ({ ids, action, reason, untilDays, untilDate } = {}, config = {}) => {
    const body = { ids, action };
    if (reason) body.reason = reason;
    if (untilDays) body.untilDays = untilDays;
    if (untilDate) body.untilDate = untilDate;
    const response = await api.post('/analytics/alerts/bulk-action', body, config);
    return extractData(response);
  },

  // ──────────────── Reports & Export ────────────────

  /**
   * Obtiene datos completos de reporte de un estudiante.
   * @param {string} studentId - ID del estudiante
   * @param {Object} [params] - Query params: timeRange, format (summary/detailed)
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Datos completos del reporte individual
   */
  getStudentReport: async (studentId, params = {}, config = {}) => {
    const response = await api.get(`/analytics/reports/student/${studentId}`, {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene datos completos de reporte de la clase.
   * @param {Object} [params] - Query params: timeRange, format (summary/detailed)
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Datos completos del reporte de clase
   */
  getClassroomReport: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/reports/classroom', {
      params,
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene datos tabulares optimizados para exportacion CSV.
   * @param {Object} [params] - Query params: timeRange
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} Datos tabulares para CSV
   */
  getClassroomExport: async (params = {}, config = {}) => {
    const response = await api.get('/analytics/reports/classroom/export', {
      params,
      ...config
    });
    return extractData(response);
  },

  // ──────────────── Admin Overview (T-942 Fase D) ────────────────

  /**
   * Obtiene los KPIs agregados del centro educativo (solo super_admin).
   * Endpoint cacheado en backend con TTL 300s.
   *
   * @param {Object} [params] - Query params: timeRange ('7d' | '30d' | '90d')
   * @param {Object} [config] - Configuracion de Axios
   * @returns {Promise<Object>} { users, activity, content, alerts, topTeachers, topMechanics, topContexts, generatedAt }
   */
  getAdminOverview: async ({ timeRange = '30d' } = {}, config = {}) => {
    const response = await api.get('/admin/analytics/overview', {
      params: { timeRange },
      ...config
    });
    return extractData(response);
  }
};

export default analyticsService;
