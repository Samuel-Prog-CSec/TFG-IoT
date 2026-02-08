import api, { extractData } from './api';

const analyticsService = {
  /**
   * Obtiene el resumen global de la clase (KPIs).
   * @returns {Promise<Object>} KPIs de la clase
   */
  getClassroomSummary: async () => {
    const response = await api.get('/analytics/classroom/summary');
    return extractData(response);
  },

  /**
   * Obtiene el progreso comparativo de la clase (gráfico de área/línea).
   * @param {string} timeRange - '7d' o '30d' (aunque el backend por ahora devuelve 7d)
   * @returns {Promise<Array>} Datos para el gráfico
   */
  getClassroomComparison: async (timeRange = '7d') => {
    const response = await api.get('/analytics/classroom/comparison', {
      params: { timeRange }
    });
    return extractData(response);
  },

  /**
   * Obtiene las dificultades globales de la clase.
   * @returns {Promise<Array>}
   */
  getClassroomDifficulties: async () => {
    const response = await api.get('/analytics/classroom/difficulties');
    return extractData(response);
  },

  /**
   * Obtiene las dificultades de un estudiante específico.
   * @param {string} studentId
   * @returns {Promise<Array>} Lista de dificultades por contexto/mecánica
   */
  getStudentDifficulties: async (studentId) => {
    const response = await api.get(`/analytics/student/${studentId}/difficulties`);
    return extractData(response);
  },

  /**
   * Obtiene el progreso histórico de un estudiante.
   * @param {string} studentId
   * @param {string} timeRange
   * @returns {Promise<Array>} Datos para el gráfico de progreso
   */
  getStudentProgress: async (studentId, timeRange = '30d') => {
    const response = await api.get(`/analytics/student/${studentId}/progress`, {
      params: { timeRange }
    });
    return extractData(response);
  }
};

export default analyticsService;
