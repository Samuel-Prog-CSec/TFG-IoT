/**
 * @fileoverview Cliente API para SystemAlerts y SystemAnnouncements (T-942).
 *
 * Espejo de los métodos de `services/analytics.js` para alertas pedagógicas,
 * apuntando a `/admin/system-alerts/*` y `/admin/announcements/*`.
 *
 * @module services/systemAlerts
 */

import api, { extractData } from './api';

const systemAlertsService = {
  // ─────────────── SystemAlerts ──────────────────

  getSystemAlerts: async (params = {}, config = {}) => {
    const response = await api.get('/admin/system-alerts', { params, ...config });
    return extractData(response);
  },

  getSystemAlertsSummary: async (config = {}) => {
    const response = await api.get('/admin/system-alerts/summary', config);
    return extractData(response);
  },

  getSystemAlertsEffectiveness: async (params = {}, config = {}) => {
    const response = await api.get('/admin/system-alerts/effectiveness', {
      params,
      ...config
    });
    return extractData(response);
  },

  getSystemAlertById: async (id, config = {}) => {
    const response = await api.get(`/admin/system-alerts/${id}`, config);
    return extractData(response);
  },

  getSystemAlertHistory: async (id, config = {}) => {
    const response = await api.get(`/admin/system-alerts/${id}/history`, config);
    return extractData(response);
  },

  dismissSystemAlert: async (id, { reason } = {}, config = {}) => {
    const response = await api.patch(
      `/admin/system-alerts/${id}/dismiss`,
      { reason },
      config
    );
    return extractData(response);
  },

  resolveSystemAlert: async (id, config = {}) => {
    const response = await api.patch(`/admin/system-alerts/${id}/resolve`, {}, config);
    return extractData(response);
  },

  snoozeSystemAlert: async (id, { untilHours, untilDays, untilDate } = {}, config = {}) => {
    const body = {};
    if (untilDate) body.untilDate = untilDate;
    if (untilHours) body.untilHours = untilHours;
    if (untilDays) body.untilDays = untilDays;
    const response = await api.patch(`/admin/system-alerts/${id}/snooze`, body, config);
    return extractData(response);
  },

  pinSystemAlert: async (id, config = {}) => {
    const response = await api.patch(`/admin/system-alerts/${id}/pin`, {}, config);
    return extractData(response);
  },

  unpinSystemAlert: async (id, config = {}) => {
    const response = await api.patch(`/admin/system-alerts/${id}/unpin`, {}, config);
    return extractData(response);
  },

  bulkSystemAlertAction: async (
    { ids, action, reason, untilHours, untilDays, untilDate } = {},
    config = {}
  ) => {
    const body = { ids, action };
    if (reason) body.reason = reason;
    if (untilHours) body.untilHours = untilHours;
    if (untilDays) body.untilDays = untilDays;
    if (untilDate) body.untilDate = untilDate;
    const response = await api.post('/admin/system-alerts/bulk-action', body, config);
    return extractData(response);
  },

  /**
   * Endpoint debug — solo disponible en entornos no-producción.
   */
  runDetectionNow: async (config = {}) => {
    const response = await api.post(
      '/admin/system-alerts/_debug/run-now',
      { dryRun: false },
      config
    );
    return extractData(response);
  }
};

export default systemAlertsService;
