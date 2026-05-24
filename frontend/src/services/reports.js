/**
 * @fileoverview Servicio frontend para informes persistidos y plantillas (T-942 Fase D).
 *
 * Cubre los endpoints REST creados en Fase B:
 * - GET    /api/reports/templates       — plantillas (system + custom)
 * - GET    /api/reports/recent          — informes recientes del docente
 * - GET    /api/reports/:id             — informe completo con payload
 * - POST   /api/reports                 — persiste un informe recién generado
 * - DELETE /api/reports/:id             — borra un informe del docente
 *
 * Sigue el patrón de los demás services del frontend: usa el cliente axios
 * compartido y `extractData` para devolver el objeto `data` ya desempacado.
 * Acepta `config` opcional para pasar `AbortController` y otros opts axios.
 *
 * @module services/reports
 */

import api, { extractData } from './api';

const reportsService = {
  /**
   * Lista las plantillas de informe disponibles.
   * Devuelve array con las system y custom ordenadas (system primero).
   *
   * @param {object} [config] - Config Axios (signal, etc.)
   * @returns {Promise<Array<object>>}
   */
  getTemplates: async (config = {}) => {
    const response = await api.get('/reports/templates', config);
    return extractData(response);
  },

  /**
   * Lista los informes recientes del docente autenticado (sin payload).
   *
   * @param {object} [params] - Query: page, limit
   * @param {object} [config] - Config Axios
   * @returns {Promise<{ items: Array<object>, pagination: object }>}
   */
  getRecent: async ({ page = 1, limit = 20 } = {}, config = {}) => {
    const response = await api.get('/reports/recent', {
      params: { page, limit },
      ...config
    });
    return extractData(response);
  },

  /**
   * Obtiene un informe completo (incluyendo `payload`) por id.
   *
   * @param {string} id
   * @param {object} [config] - Config Axios
   * @returns {Promise<object>}
   */
  getById: async (id, config = {}) => {
    const response = await api.get(`/reports/${id}`, config);
    return extractData(response);
  },

  /**
   * Persiste un informe recién generado.
   *
   * @param {object} body - { reportType, period, format, templateKey?, title, studentId?, payload, metadata? }
   * @param {object} [config] - Config Axios
   * @returns {Promise<object>} El informe creado (sin payload completo).
   */
  save: async (body, config = {}) => {
    const response = await api.post('/reports', body, config);
    return extractData(response);
  },

  /**
   * Borra un informe del docente.
   *
   * @param {string} id
   * @param {object} [config] - Config Axios
   * @returns {Promise<void>}
   */
  remove: async (id, config = {}) => {
    await api.delete(`/reports/${id}`, config);
  }
};

export default reportsService;
