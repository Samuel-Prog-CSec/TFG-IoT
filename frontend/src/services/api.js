/**
 * @fileoverview Cliente HTTP con Axios para comunicación con el backend
 * Incluye interceptores para autenticación, refresh automático de tokens,
 * manejo de errores y retry en fallos de red.
 * 
 * @module services/api
 */

import axios from 'axios';

// ============================================
// CONFIGURACIÓN
// ============================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TIMEOUT = 10000; // 10 segundos
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 segundo base para exponential backoff
const MAX_TOTAL_TIME = 30000; // 30 segundos máximo para todos los reintentos

// Eventos personalizados para comunicación con AuthContext
export const AUTH_EVENTS = {
  SESSION_EXPIRED: 'auth:session_expired',
  SESSION_INVALIDATED: 'auth:session_invalidated',
  UNAUTHORIZED: 'auth:unauthorized',
};

export const isAbortError = (error) => error?.code === 'ERR_CANCELED';

// ============================================
// INSTANCIA AXIOS
// ============================================

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Para cookies httpOnly si se usan
});

// ============================================
// GESTIÓN DE TOKENS (en memoria para seguridad)
// ============================================

let accessToken = null;
let isRefreshing = false;
let failedQueue = [];

/**
 * Procesa la cola de peticiones que fallaron durante el refresh
 * @param {Error|null} error - Error si el refresh falló
 * @param {string|null} token - Nuevo token si el refresh fue exitoso
 */
const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Establece los tokens de autenticación
 * @param {string} access - Access token (se guarda en memoria)
 */
export const setTokens = (access) => {
  accessToken = access;
};

/**
 * Obtiene el access token actual
 * @returns {string|null} Access token
 */
export const getAccessToken = () => accessToken;

/**
 * Obtiene el refresh token actual
 * @returns {string|null} Refresh token
 */
export const clearTokens = () => {
  accessToken = null;
};

const getCookieValue = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

// ============================================
// INTERCEPTOR DE REQUEST
// ============================================

api.interceptors.request.use(
  (config) => {
    // Añadir access token a las peticiones si existe
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    const method = (config.method || 'get').toLowerCase();
    const requiresCsrf = ['post', 'put', 'patch', 'delete'].includes(method);
    if (requiresCsrf) {
      const csrfToken = getCookieValue('csrfToken');
      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken;
      }
    }
    
    // Añadir timestamp para debugging
    config.metadata = { startTime: Date.now() };
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ============================================
// INTERCEPTOR DE RESPONSE
// ============================================

api.interceptors.response.use(
  (response) => {
    // Log de tiempo de respuesta en desarrollo
    if (import.meta.env.DEV && response.config.metadata) {
      const duration = Date.now() - response.config.metadata.startTime;
      console.debug(`[API] ${response.config.method?.toUpperCase()} ${response.config.url} - ${duration}ms`);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Si no hay respuesta (error de red), intentar retry
    if (!error.response) {
      return handleNetworkError(error, originalRequest);
    }

    const { status, data } = error.response;

    // 401 - Token expirado o inválido
    if (status === 401 && !originalRequest._retry) {
      // Si el error es de token expirado, intentar refresh
      if (data?.code === 'TOKEN_EXPIRED' || data?.message?.includes('expired')) {
        return handleTokenRefresh(originalRequest);
      }

      // Si no hay refresh token o el refresh falló, emitir evento
      window.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED));
      clearTokens();
      return Promise.reject(error);
    }

    // 403 - Cuenta no aprobada o rechazada
    if (status === 403) {
      const errorCode = data?.code;
      if (errorCode === 'ACCOUNT_PENDING' || errorCode === 'ACCOUNT_REJECTED') {
        // No limpiar tokens, solo propagar el error con info
        return Promise.reject({
          ...error,
          accountStatus: errorCode === 'ACCOUNT_PENDING' ? 'pending_approval' : 'rejected',
        });
      }
    }

    return Promise.reject(error);
  }
);

// ============================================
// MANEJO DE REFRESH TOKEN
// ============================================

/**
 * Maneja el refresh del access token
 * @param {Object} originalRequest - Petición original que falló
 * @returns {Promise} Promesa con la petición reintentada
 */
async function handleTokenRefresh(originalRequest) {
  if (isRefreshing) {
    // Si ya se está haciendo refresh, encolar la petición
    return new Promise((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    })
      .then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      })
      .catch((err) => Promise.reject(err));
  }

  originalRequest._retry = true;
  isRefreshing = true;

  try {
    const csrfToken = getCookieValue('csrfToken');
    const response = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      {},
      {
        withCredentials: true,
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {}
      }
    );

    const { accessToken: newAccessToken } = response.data.data;
    
    setTokens(newAccessToken);
    processQueue(null, newAccessToken);

    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
    return api(originalRequest);
  } catch (refreshError) {
    processQueue(refreshError, null);
    clearTokens();
    window.dispatchEvent(new CustomEvent(AUTH_EVENTS.SESSION_EXPIRED));
    return Promise.reject(refreshError);
  } finally {
    isRefreshing = false;
  }
}

// ============================================
// MANEJO DE ERRORES DE RED CON RETRY
// ============================================

/**
 * Maneja errores de red con retry exponencial
 * @param {Error} error - Error original
 * @param {Object} originalRequest - Petición original
 * @returns {Promise} Promesa con retry o error
 */
async function handleNetworkError(error, originalRequest) {
  if (isAbortError(error)) {
    return Promise.reject(error);
  }

  const retryCount = originalRequest._retryCount || 0;
  
  // Inicializar tiempo de inicio en el primer intento
  if (!originalRequest._retryStartTime) {
    originalRequest._retryStartTime = Date.now();
  }
  
  // Verificar si hemos excedido el tiempo total máximo
  const elapsedTime = Date.now() - originalRequest._retryStartTime;
  if (elapsedTime >= MAX_TOTAL_TIME) {
    console.error(`[API] Max total time (${MAX_TOTAL_TIME}ms) exceeded for ${originalRequest.url}`);
    return Promise.reject({
      ...error,
      isNetworkError: true,
      message: 'Tiempo de espera agotado. Por favor, verifica tu conexión a internet.',
    });
  }

  if (retryCount >= MAX_RETRIES) {
    console.error(`[API] Max retries (${MAX_RETRIES}) exceeded for ${originalRequest.url}`);
    return Promise.reject({
      ...error,
      isNetworkError: true,
      message: 'Error de conexión. Por favor, verifica tu conexión a internet.',
    });
  }

  originalRequest._retryCount = retryCount + 1;
  const delay = RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff

  console.warn(`[API] Network error, retrying (${retryCount + 1}/${MAX_RETRIES}) in ${delay}ms...`);

  await new Promise((resolve) => setTimeout(resolve, delay));
  return api(originalRequest);
}

// ============================================
// HELPERS DE RESPUESTA
// ============================================

/**
 * Extrae datos de una respuesta exitosa de la API
 * @param {Object} response - Respuesta de axios
 * @returns {Object} Datos de la respuesta
 */
export const extractData = (response) => response.data?.data || response.data;

/**
 * Extrae mensaje de error de una respuesta de la API
 * @param {Error} error - Error de axios
 * @returns {string} Mensaje de error
 */
export const extractErrorMessage = (error) => {
  if (error.isNetworkError) {
    return error.message;
  }
  
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  
  if (error.response?.data?.errors?.length > 0) {
    return error.response.data.errors.map((e) => e.message).join('. ');
  }
  
  return 'Ha ocurrido un error inesperado';
};

/**
 * Extrae errores de validación de una respuesta de la API
 * @param {Error} error - Error de axios
 * @returns {Object} Objeto con errores por campo
 */
export const extractValidationErrors = (error) => {
  const errors = {};
  const validationErrors = error.response?.data?.errors || [];
  
  validationErrors.forEach((err) => {
    if (err.field) {
      errors[err.field] = err.message;
    }
  });
  
  return errors;
};

// ============================================
// API ENDPOINTS - AUTH
// ============================================

export const authAPI = {
  /**
   * Registrar nuevo profesor
   * @param {Object} data - { name, email, password }
   * @returns {Promise} Respuesta con mensaje de éxito
   */
  register: (data) => api.post('/auth/register', data),

  /**
   * Iniciar sesión
   * @param {Object} credentials - { email, password }
  * @returns {Promise} Respuesta con user y accessToken
   */
  login: (credentials) => api.post('/auth/login', credentials),

  /**
   * Cerrar sesión
   * @returns {Promise} Respuesta de confirmación
   */
  logout: () => api.post('/auth/logout'),

  /**
   * Obtener perfil del usuario actual
   * @returns {Promise} Respuesta con datos del usuario
   */
  getProfile: () => api.get('/auth/me'),

  /**
   * Actualizar perfil del usuario
   * @param {Object} data - Datos a actualizar
   * @returns {Promise} Respuesta con usuario actualizado
   */
  updateProfile: (data) => api.put('/auth/me', data),

  /**
   * Cambiar contraseña
   * @param {Object} data - { currentPassword, newPassword }
   * @returns {Promise} Respuesta de confirmación
   */
  changePassword: (data) => api.put('/auth/change-password', data),

  /**
   * Refrescar access token
   * @returns {Promise} Respuesta con nuevos tokens
   */
  refreshToken: () => api.post('/auth/refresh', {}),
};

// ============================================
// API ENDPOINTS - ADMIN
// ============================================

export const adminAPI = {
  /**
   * Obtener lista de profesores pendientes de aprobación
   * @param {Object} params - Parámetros de paginación { page, limit }
   * @returns {Promise} Respuesta con lista paginada
   */
  getPendingTeachers: (params = {}, config = {}) => 
    api.get('/admin/pending', { params, ...config }),

  /**
   * Aprobar profesor
   * @param {string} userId - ID del usuario a aprobar
   * @returns {Promise} Respuesta de confirmación
   */
  approveTeacher: (userId) => 
    api.post(`/admin/users/${userId}/approve`),

  /**
   * Rechazar profesor
   * @param {string} userId - ID del usuario a rechazar
   * @param {string} reason - Razón del rechazo (opcional)
   * @returns {Promise} Respuesta de confirmación
   */
  rejectTeacher: (userId, reason = '') => 
    api.post(`/admin/users/${userId}/reject`, { reason }),
};

// ============================================
// API ENDPOINTS - USERS (para futuro uso)
// ============================================

export const usersAPI = {
  /**
   * Obtener lista de usuarios
   * @param {Object} params - Parámetros de búsqueda y paginación
   * @returns {Promise} Respuesta con lista paginada
   */
  getUsers: (params = {}, config = {}) => 
    api.get('/users', { params, ...config }),

  /**
   * Obtener usuario por ID
   * @param {string} userId - ID del usuario
   * @returns {Promise} Respuesta con datos del usuario
   */
  getUser: (userId, config = {}) => 
    api.get(`/users/${userId}`, config),

  /**
   * Crear nuevo usuario (estudiante)
   * @param {Object} data - Datos del usuario
   * @returns {Promise} Respuesta con usuario creado
   */
  createUser: (data) => 
    api.post('/users', data),

  /**
   * Actualizar usuario
   * @param {string} userId - ID del usuario
   * @param {Object} data - Datos a actualizar
   * @returns {Promise} Respuesta con usuario actualizado
   */
  updateUser: (userId, data) => 
    api.put(`/users/${userId}`, data),

  /**
   * Eliminar usuario
   * @param {string} userId - ID del usuario
   * @returns {Promise} Respuesta de confirmación
   */
  deleteUser: (userId) => 
    api.delete(`/users/${userId}`),

  /**
   * Obtener alumnos de un profesor específico
   * @param {string} teacherId - ID del profesor
   * @param {Object} params - Parámetros opcionales (classroom, sortBy, order)
   * @returns {Promise} Respuesta con lista de alumnos
   */
  getStudentsByTeacher: (teacherId, params = {}, config = {}) =>
    api.get(`/users/teacher/${teacherId}/students`, { params, ...config }),

  /**
   * Transferir un alumno a otro profesor
   * @param {string} studentId - ID del alumno
   * @param {Object} payload - { newTeacherId, newClassroom, reason? }
   * @returns {Promise} Respuesta de confirmación
   */
  transferStudent: (studentId, payload) =>
    api.post(`/users/${studentId}/transfer`, payload),
};

// ============================================
// API ENDPOINTS - DECKS (Mazos de Cartas)
// ============================================

export const decksAPI = {
  /**
   * Obtener lista de mazos del profesor
   * @param {Object} params - Parámetros de búsqueda y paginación
   * @param {number} [params.page=1] - Página actual
   * @param {number} [params.limit=20] - Elementos por página
   * @param {string} [params.sortBy='createdAt'] - Campo de ordenación
   * @param {string} [params.order='desc'] - Dirección de ordenación
   * @param {string} [params.contextId] - Filtrar por contexto
   * @param {string} [params.status] - Filtrar por estado (active/archived)
   * @param {string} [params.search] - Búsqueda por nombre/descripción
   * @returns {Promise} Respuesta con lista paginada de mazos
   */
  getDecks: (params = {}, config = {}) => 
    api.get('/decks', { params, ...config }),

  /**
   * Obtener mazo por ID con detalles completos
   * @param {string} deckId - ID del mazo
   * @returns {Promise} Respuesta con datos del mazo
   */
  getDeckById: (deckId, config = {}) => 
    api.get(`/decks/${deckId}`, config),

  /**
   * Crear nuevo mazo
   * @param {Object} data - Datos del mazo
   * @param {string} data.name - Nombre del mazo (2-100 caracteres)
   * @param {string} [data.description] - Descripción opcional (máx 500 caracteres)
   * @param {string} data.contextId - ID del contexto temático
   * @param {Array} data.cardMappings - Array de mapeos tarjeta-valor
   * @returns {Promise} Respuesta con mazo creado
   */
  createDeck: (data) => 
    api.post('/decks', data),

  /**
   * Actualizar mazo existente
   * @param {string} deckId - ID del mazo
   * @param {Object} data - Datos a actualizar (todos opcionales)
   * @returns {Promise} Respuesta con mazo actualizado
   */
  updateDeck: (deckId, data) => 
    api.put(`/decks/${deckId}`, data),

  /**
   * Archivar (soft delete) mazo
   * @param {string} deckId - ID del mazo
   * @returns {Promise} Respuesta de confirmación
   */
  deleteDeck: (deckId) => 
    api.delete(`/decks/${deckId}`),

  /**
   * Obtener contador de mazos activos del profesor
   * Útil para mostrar "X/50 mazos" en la UI
   * @returns {Promise} Respuesta con { active, archived, total }
   */
  getDecksCount: async (config = {}) => {
    const [activeRes, archivedRes] = await Promise.all([
      api.get('/decks', { params: { status: 'active', limit: 1 }, ...config }),
      api.get('/decks', { params: { status: 'archived', limit: 1 }, ...config }),
    ]);
    return {
      active: activeRes.data?.pagination?.total || 0,
      archived: archivedRes.data?.pagination?.total || 0,
      total: (activeRes.data?.pagination?.total || 0) + (archivedRes.data?.pagination?.total || 0),
    };
  },
};

// ============================================
// API ENDPOINTS - CONTEXTS (Contextos de Juego)
// ============================================

export const contextsAPI = {
  /**
   * Obtener lista de contextos disponibles
   * @param {Object} params - Parámetros de búsqueda
   * @param {boolean} [params.isActive=true] - Filtrar solo activos
   * @returns {Promise} Respuesta con lista de contextos
   */
  getContexts: (params = { isActive: true }, config = {}) => 
    api.get('/contexts', { params, ...config }),

  /**
   * Obtener contexto por ID con sus assets
   * @param {string} contextId - ID del contexto
   * @returns {Promise} Respuesta con datos del contexto y assets
   */
  getContextById: (contextId, config = {}) => 
    api.get(`/contexts/${contextId}`, config),

  /**
   * Obtener solo los assets de un contexto
   * @param {string} contextId - ID del contexto
   * @returns {Promise} Respuesta con array de assets
   */
  getContextAssets: (contextId, config = {}) => 
    api.get(`/contexts/${contextId}/assets`, config),

  /**
   * Obtener límites y formatos permitidos para subida de assets
   * @returns {Promise} Configuración de upload del backend
   */
  getUploadConfig: (config = {}) =>
    api.get('/contexts/upload-config', config),

  /**
   * Subir imagen para asset
   * @param {string} contextId - ID del contexto
   * @param {FormData} formData - Datos con archivo (file, key, value, display)
   * @returns {Promise} Respuesta de Supabase
   */
  uploadImage: (contextId, formData) => 
    api.post(`/contexts/${contextId}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),

  /**
   * Subir audio para asset
   * @param {string} contextId - ID del contexto
   * @param {FormData} formData - Datos con archivo (file, key, value, display)
   * @returns {Promise} Respuesta de Supabase
   */
  uploadAudio: (contextId, formData) => 
    api.post(`/contexts/${contextId}/audio`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
};

// ============================================
// API ENDPOINTS - CARDS (Tarjetas RFID)
// ============================================

export const cardsAPI = {
  /**
   * Obtener lista de tarjetas del profesor
   * @param {Object} params - Parámetros de búsqueda y paginación
   * @param {string} [params.status='active'] - Filtrar por estado
   * @returns {Promise} Respuesta con lista paginada de tarjetas
   */
  getCards: (params = {}, config = {}) => 
    api.get('/cards', { params, ...config }),

  /**
   * Obtener tarjetas disponibles (activas) para crear mazos
   * @returns {Promise} Respuesta con lista de tarjetas activas
   */
  getAvailableCards: (config = {}) => 
    api.get('/cards', { params: { status: 'active', limit: 100 }, ...config }),

  /**
   * Obtener tarjeta por ID
   * @param {string} cardId - ID de la tarjeta
   * @returns {Promise} Respuesta con datos de la tarjeta
   */
  getCardById: (cardId, config = {}) => 
    api.get(`/cards/${cardId}`, config),

  /**
   * Buscar tarjeta por UID
   * @param {string} uid - UID de la tarjeta RFID
   * @returns {Promise} Respuesta con datos de la tarjeta
   */
  getCardByUid: (uid, config = {}) => 
    api.get('/cards', { params: { uid: uid.toUpperCase(), limit: 1 }, ...config }),

  /**
   * Crear nueva tarjeta
   * @param {Object} data - Datos de la tarjeta
   * @param {string} data.uid - UID de la tarjeta (8 o 14 hex)
   * @param {string} [data.type] - Tipo de tarjeta
   * @returns {Promise} Respuesta con tarjeta creada
   */
  createCard: (data) => 
    api.post('/cards', data),
};

// ============================================
// API ENDPOINTS - MECHANICS (Mecánicas de Juego)
// ============================================

export const mechanicsAPI = {
  /**
   * Obtener lista de mecánicas de juego disponibles
   * @param {Object} params - Parámetros de búsqueda
   * @param {boolean} [params.isActive=true] - Filtrar solo activas
   * @returns {Promise} Respuesta con lista de mecánicas
   */
  getMechanics: (params = { isActive: true }, config = {}) => 
    api.get('/mechanics', { params, ...config }),

  /**
   * Obtener mecánica por ID
   * @param {string} mechanicId - ID de la mecánica
   * @returns {Promise} Respuesta con datos de la mecánica
   */
  getMechanicById: (mechanicId, config = {}) => 
    api.get(`/mechanics/${mechanicId}`, config),
};

// ============================================
// API ENDPOINTS - SESSIONS (Sesiones de Juego)
// ============================================

export const sessionsAPI = {
  /**
   * Obtener lista de sesiones del profesor
   * @param {Object} params - Parámetros de búsqueda y paginación
   * @returns {Promise} Respuesta con lista paginada de sesiones
   */
  getSessions: (params = {}, config = {}) => 
    api.get('/sessions', { params, ...config }),

  /**
   * Obtener sesión por ID
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise} Respuesta con datos de la sesión
   */
  getSessionById: (sessionId, config = {}) => 
    api.get(`/sessions/${sessionId}`, config),

  /**
   * Crear nueva sesión de juego
   * @param {Object} data - Datos de la sesión
   * @param {string} data.mechanicId - ID de la mecánica
   * @param {string} data.contextId - ID del contexto
   * @param {Array} data.cardMappings - Mapeos de tarjetas
   * @param {Object} data.config - Configuración de la sesión
   * @returns {Promise} Respuesta con sesión creada
   */
  createSession: (data) => 
    api.post('/sessions', data),

  /**
   * Iniciar sesión de juego
   * @param {string} sessionId
   * @returns {Promise}
   */
  startSession: (sessionId) =>
    api.post(`/sessions/${sessionId}/start`, {}),

  /**
   * Finalizar sesión de juego
   * @param {string} sessionId
   * @returns {Promise}
   */
  endSession: (sessionId) =>
    api.post(`/sessions/${sessionId}/end`, {}),

  /**
   * Actualizar sesión existente
   * @param {string} sessionId - ID de la sesión
   * @param {Object} data - Datos a actualizar
   * @returns {Promise} Respuesta con sesión actualizada
   */
  updateSession: (sessionId, data) => 
    api.put(`/sessions/${sessionId}`, data),

  /**
   * Eliminar sesión
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise} Respuesta de confirmación
   */
  deleteSession: (sessionId) => 
    api.delete(`/sessions/${sessionId}`),
};

export const playsAPI = {
  /**
   * Obtener partidas con filtros.
   * @param {Object} params
   * @returns {Promise}
   */
  getPlays: (params = {}, config = {}) =>
    api.get('/plays', { params, ...config }),

  /**
   * Crear una nueva partida.
   * @param {{sessionId: string, playerId: string}} data
   * @returns {Promise}
   */
  createPlay: (data) =>
    api.post('/plays', data),

  /**
   * Pausar partida.
   * @param {string} playId
   * @returns {Promise}
   */
  pausePlay: (playId) =>
    api.post(`/plays/${playId}/pause`, {}),

  /**
   * Reanudar partida.
   * @param {string} playId
   * @returns {Promise}
   */
  resumePlay: (playId) =>
    api.post(`/plays/${playId}/resume`, {}),

  /**
   * Abandonar partida.
   * @param {string} playId
   * @returns {Promise}
   */
  abandonPlay: (playId) =>
    api.post(`/plays/${playId}/abandon`, {})
};

export default api;
