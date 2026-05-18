/**
 * @fileoverview Cliente API para SystemAnnouncements (T-942).
 *
 * Endpoints:
 *  - admin: list/create/update/archive bajo /admin/announcements
 *  - público: /announcements/active (todos los autenticados)
 *
 * @module services/announcements
 */

import api from './api';

const extractData = response => response.data?.data ?? response.data;

const announcementsService = {
  // Admin (super_admin)
  listAnnouncements: async (params = {}, config = {}) => {
    const response = await api.get('/admin/announcements', { params, ...config });
    return extractData(response);
  },

  createAnnouncement: async (payload, config = {}) => {
    const response = await api.post('/admin/announcements', payload, config);
    return extractData(response);
  },

  updateAnnouncement: async (id, payload, config = {}) => {
    const response = await api.patch(`/admin/announcements/${id}`, payload, config);
    return extractData(response);
  },

  archiveAnnouncement: async (id, config = {}) => {
    const response = await api.patch(`/admin/announcements/${id}/archive`, {}, config);
    return extractData(response);
  },

  // Público (teacher)
  listActiveAnnouncements: async (config = {}) => {
    const response = await api.get('/announcements/active', config);
    return extractData(response);
  }
};

export default announcementsService;
