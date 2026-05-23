/**
 * @fileoverview Cliente HTTP con Axios para comunicación con el backend
 * Incluye interceptores para autenticación, refresh automático de tokens,
 * manejo de errores y retry en fallos de red.
 * 
 * @module services/api
 */

import axios from 'axios';
import { captureException } from '../lib/sentry';
import * as mfaTokenStore from './mfaTokenStore';
// D.2 (pre-v1.0.0): deduplicación in-flight selectiva para hot endpoints.
import { dedupRequest } from './inFlight';

// ============================================
// CONFIGURACIÓN
// ============================================

// Exportado para que el AuthContext pueda construir el beacon de logout
// diferido (T-957) usando fetch nativo con `keepalive: true` — axios no
// soporta esa flag y el beacon debe sobrevivir al cierre de la pestaña.
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const TIMEOUT = 10000; // 10 segundos
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 segundo base para exponential backoff
const MAX_TOTAL_TIME = 30000; // 30 segundos máximo para todos los reintentos
const RATE_LIMIT_MAX_RETRIES = 2;
const QUEUE_STAGGER_MS = 150; // Milisegundos entre peticiones encoladas tras refresh
const ACTIVE_ONLY_PARAMS = Object.freeze({ isActive: true });

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
  const queue = [...failedQueue];
  failedQueue = [];

  queue.forEach((prom, index) => {
    if (error) {
      prom.reject(error);
    } else {
      // Escalonar resolución para evitar ráfagas que disparen 429
      setTimeout(() => prom.resolve(token), index * QUEUE_STAGGER_MS);
    }
  });
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
 * B.8 (pre-v1.0.0): refresh proactivo del access token desde el cliente
 * Socket.IO (programado N segundos antes del expiry). Comparte el flag
 * `isRefreshing` con el path reactivo del interceptor 401 para evitar
 * dos refreshes paralelos en el mismo segundo (race típica entre
 * setTimeout y un 401 que llega justo antes).
 *
 * Sin esto, durante partidas largas (≥15min) el access token expiraba en
 * silencio: el cliente seguía emitiendo eventos al socket sin saber que
 * el handshake del próximo reconnect rechazaría su token. Con refresh
 * proactivo el cliente siempre tiene un token vivo antes de que expire.
 *
 * NO retorna nada útil al caller — fire-and-forget. Si Redis/backend
 * fallan, el path reactivo del interceptor cogerá el siguiente 401 y
 * forzará el refresh tradicional.
 *
 * @returns {Promise<void>}
 */
export const refreshAccessTokenProactive = async () => {
  if (isRefreshing) {
    // Otro refresh en curso — esperar a que termine y reutilizar el token.
    await new Promise((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    });
    return;
  }

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
  } catch (err) {
    processQueue(err, null);
    // No tiramos clearTokens() porque el interceptor 401 lo hará si el
    // siguiente request HTTP también falla. Aquí queremos best-effort.
    captureException(err);
  } finally {
    isRefreshing = false;
  }
};

/**
 * Obtiene el refresh token actual
 * @returns {string|null} Refresh token
 */
export const clearTokens = () => {
  accessToken = null;
};

const getCookieValue = (name) => {
  const targetCookie = `${name}=`;
  const cookieValue = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(targetCookie))
    ?.slice(targetCookie.length);

  return cookieValue ? decodeURIComponent(cookieValue) : null;
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

    // T-905 B7: añadir X-MFA-Token automáticamente si está vigente — los endpoints
    // protegidos por `requireMfa` lo necesitan; los que no, ignoran este header.
    const mfaToken = mfaTokenStore.getMfaToken();
    if (mfaToken) {
      config.headers['X-MFA-Token'] = mfaToken;
    }

    // Añadir timestamp para debugging
    config.metadata = { startTime: Date.now() };

    return config;
  },
  (error) => {
    throw error;
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
      // eslint-disable-next-line no-console -- dev-only debug logging
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
      // Códigos recuperables via refresh. El backend ahora anota `code`
      // semántico; también aceptamos el mensaje en ES/EN por compatibilidad.
      const errCode = data?.code;
      const msg = data?.message || '';
      const isRecoverable =
        errCode === 'TOKEN_EXPIRED' ||
        errCode === 'TOKEN_MISSING' ||
        /expirado|expired/i.test(msg);
      if (isRecoverable) {
        return handleTokenRefresh(originalRequest);
      }

      // T-905 B7: códigos MFA (TOTP/backup invalido o token MFA expirado/invalido)
      // NO son fallos de la sesión principal — el usuario solo se equivocó en el
      // segundo factor. Propagamos el error sin disparar logout para que la UI
      // (modal MfaChallenge, formularios) muestre el mensaje y permita reintentar.
      const isMfaSecondaryFailure =
        errCode === 'MFA_CODE_INVALID' ||
        errCode === 'MFA_TOKEN_EXPIRED' ||
        errCode === 'MFA_TOKEN_INVALID';
      if (isMfaSecondaryFailure) {
        throw error;
      }

      // Si no hay refresh token o el refresh falló, emitir evento.
      // Nota: el 401 en /auth/refresh sin tokens activos es comportamiento
      // esperado (usuario sin sesion previa). El AuthContext usa un session
      // marker en localStorage para evitar la llamada en ese caso, pero si
      // por algun motivo (marker stale) se dispara, no es necesario reportar
      // el error al captureException porque no es accionable.
      globalThis.dispatchEvent(new CustomEvent(AUTH_EVENTS.UNAUTHORIZED));
      clearTokens();
      throw error;
    }

    // 403 - Cuenta no aprobada o rechazada
    if (status === 403) {
      const errorCode = data?.code;
      if (errorCode === 'ACCOUNT_PENDING' || errorCode === 'ACCOUNT_REJECTED') {
        // No limpiar tokens, solo propagar el error con info
        const accountStatusError = new Error(error?.message || 'Estado de cuenta no permitido');
        accountStatusError.accountStatus = errorCode === 'ACCOUNT_PENDING' ? 'pending_approval' : 'rejected';
        accountStatusError.cause = error;
        throw accountStatusError;
      }
    }

    // 429 - Rate limit excedido
    if (status === 429 && (originalRequest._rateLimitRetryCount || 0) < RATE_LIMIT_MAX_RETRIES) {
      return handleRateLimitError(error, originalRequest);
    }

    // 428 - MFA token requerido o expirado (T-905 B7)
    if (status === 428 && !originalRequest._mfaRetry) {
      const code = data?.code;
      if (code === 'MFA_TOKEN_REQUIRED' || code === 'MFA_TOKEN_EXPIRED') {
        return handleMfaChallenge(originalRequest, code);
      }
      if (code === 'MFA_ENROLLMENT_REQUIRED') {
        // No tiene MFA habilitado — emitir evento para que UI redirija a setup.
        globalThis.dispatchEvent(
          new CustomEvent('mfa:enrollment-required', { detail: { code } })
        );
        throw error;
      }
    }

    throw error;
  }
);

// ============================================
// MFA CHALLENGE — T-905 B7
// ============================================

/**
 * Cuando el servidor responde 428 MFA_TOKEN_REQUIRED/EXPIRED, este handler:
 * 1. Emite evento global `mfa:challenge-required` con detalles.
 * 2. Espera a que el componente modal (`MfaChallengeModal`) resuelva tras pedir
 *    el código TOTP al usuario y guardar el nuevo MFA token en `mfaTokenStore`.
 * 3. Reintenta el request original (que automáticamente añadirá el nuevo
 *    `X-MFA-Token` via el interceptor de request).
 *
 * @param {object} originalRequest - request config que falló
 * @param {string} code - código semántico (MFA_TOKEN_REQUIRED/EXPIRED)
 * @returns {Promise}
 */
const handleMfaChallenge = (originalRequest, code) => {
  return new Promise((resolve, reject) => {
    const resolved = { done: false };

    const onTokenAcquired = ({ detail }) => {
      if (resolved.done) return;
      resolved.done = true;
      globalThis.removeEventListener('mfa:token-acquired', onTokenAcquired);
      globalThis.removeEventListener('mfa:challenge-cancelled', onCancel);
      originalRequest._mfaRetry = true;
      // El nuevo token ya está en mfaTokenStore; el request interceptor lo
      // añadirá automáticamente como `X-MFA-Token`.
      api.request(originalRequest).then(resolve).catch(reject);
      // Telemetría opcional
      if (import.meta.env.DEV && detail) {
        // eslint-disable-next-line no-console -- dev-only debug
        console.debug('[MFA] retry tras challenge OK', detail);
      }
    };
    const onCancel = () => {
      if (resolved.done) return;
      resolved.done = true;
      globalThis.removeEventListener('mfa:token-acquired', onTokenAcquired);
      globalThis.removeEventListener('mfa:challenge-cancelled', onCancel);
      const err = new Error('MFA challenge cancelado por el usuario');
      err.code = 'MFA_CANCELLED';
      reject(err);
    };

    globalThis.addEventListener('mfa:token-acquired', onTokenAcquired);
    globalThis.addEventListener('mfa:challenge-cancelled', onCancel);
    globalThis.dispatchEvent(
      new CustomEvent('mfa:challenge-required', {
        detail: { code, url: originalRequest.url, method: originalRequest.method }
      })
    );
  });
};

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
      .catch((err) => {
        throw err;
      });
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
    globalThis.dispatchEvent(new CustomEvent(AUTH_EVENTS.SESSION_EXPIRED));
    throw refreshError;
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
    throw error;
  }

  const retryCount = originalRequest._retryCount || 0;
  
  // Inicializar tiempo de inicio en el primer intento
  if (!originalRequest._retryStartTime) {
    originalRequest._retryStartTime = Date.now();
  }
  
  // Verificar si hemos excedido el tiempo total máximo
  const elapsedTime = Date.now() - originalRequest._retryStartTime;
  if (elapsedTime >= MAX_TOTAL_TIME) {
    captureException(new Error(`[API] Max total time (${MAX_TOTAL_TIME}ms) exceeded for ${originalRequest.url}`));
    const timeoutError = new Error('Tiempo de espera agotado. Por favor, verifica tu conexion a internet.');
    timeoutError.isNetworkError = true;
    timeoutError.cause = error;
    throw timeoutError;
  }

  if (retryCount >= MAX_RETRIES) {
    captureException(new Error(`[API] Max retries (${MAX_RETRIES}) exceeded for ${originalRequest.url}`));
    const networkError = new Error('Error de conexion. Por favor, verifica tu conexion a internet.');
    networkError.isNetworkError = true;
    networkError.cause = error;
    throw networkError;
  }

  originalRequest._retryCount = retryCount + 1;
  const delay = RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff

  if (import.meta.env.DEV) {
    console.warn(`[API] Network error, retrying (${retryCount + 1}/${MAX_RETRIES}) in ${delay}ms...`);
  }

  await new Promise((resolve) => setTimeout(resolve, delay));
  return api(originalRequest);
}

// ============================================
// MANEJO DE RATE LIMIT (429)
// ============================================

/**
 * Extrae el tiempo de espera en segundos del header Retry-After.
 * express-rate-limit v8 con standardHeaders: true envía Retry-After
 * como segundos enteros en respuestas 429.
 * @param {Object} response - Respuesta de axios
 * @returns {number} Segundos a esperar (0 si no se puede determinar)
 */
function parseRetryAfter(response) {
  const retryAfter = response?.headers?.['retry-after'];
  if (!retryAfter) {
    return 0;
  }

  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/**
 * Maneja errores de rate limit (429) con respeto al header Retry-After.
 * Reintenta hasta RATE_LIMIT_MAX_RETRIES veces esperando el tiempo
 * indicado por el servidor.
 * @param {Error} error - Error original de axios
 * @param {Object} originalRequest - Configuración de la petición original
 * @returns {Promise} Promesa con la petición reintentada o error enriquecido
 */
async function handleRateLimitError(error, originalRequest) {
  if (isAbortError(error)) {
    throw error;
  }

  const retryCount = originalRequest._rateLimitRetryCount || 0;

  if (retryCount >= RATE_LIMIT_MAX_RETRIES) {
    const rateLimitError = new Error(
      error.response?.data?.message || 'Demasiadas peticiones. Por favor, espera un momento.'
    );
    rateLimitError.isRateLimited = true;
    rateLimitError.retryAfterSeconds = parseRetryAfter(error.response);
    rateLimitError.cause = error;
    throw rateLimitError;
  }

  const retryAfterSeconds = parseRetryAfter(error.response);
  // Mínimo 2s, máximo 60s para no bloquear la UI indefinidamente
  const waitMs = Math.min(
    Math.max((retryAfterSeconds || 2) * 1000, 2000),
    60000
  );

  if (import.meta.env.DEV) {
    console.warn(
      `[API] Rate limited (429), retrying (${retryCount + 1}/${RATE_LIMIT_MAX_RETRIES}) in ${waitMs}ms...`
    );
  }

  originalRequest._rateLimitRetryCount = retryCount + 1;

  await new Promise((resolve) => setTimeout(resolve, waitMs));

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

  if (error.isRateLimited) {
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
   * @param {Object} credentials - { email, password, captchaToken? }
   * @returns {Promise} Respuesta con user y accessToken
   *
   * T-905 B6: `captchaToken` opcional. Lo adjunta `Login.jsx` cuando el widget
   * Turnstile genera un token (a partir del 3er fallo previo).
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
  // D.2 (pre-v1.0.0): dedup in-flight. AuthContext.checkExistingSession +
  // AppLayout post-login pueden llamarse en paralelo; sin dedup
  // golpeaban /auth/me dos veces seguidas.
  getProfile: () => dedupRequest('authAPI.getProfile', () => api.get('/auth/me')),

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

  // ============================================
  // MFA TOTP (T-905 B7) — super_admin
  // ============================================

  /**
   * Estado actual del MFA del super_admin: { enabled, enabledAt, lastUsedAt,
   * backupCodesTotal, backupCodesRemaining }. Driver del panel de gestión vs wizard.
   */
  mfaStatus: (config = {}) => api.get('/auth/mfa/status', config),

  /**
   * Iniciar setup MFA. Devuelve otpauthUrl + secret base32 + issuer.
   */
  mfaSetupInit: () => api.post('/auth/mfa/setup-init', {}),

  /**
   * Confirmar setup MFA con primer código TOTP. Devuelve backup codes (única vez).
   * @param {string} code - 6 dígitos
   */
  mfaSetupVerify: (code) => api.post('/auth/mfa/setup-verify', { code }),

  /**
   * Solicitar MFA token corto (5min) presentando un código TOTP válido.
   * @param {string} code
   * @returns {Promise} { mfaToken, expiresIn }
   */
  mfaChallenge: (code) => api.post('/auth/mfa/challenge', { code }),

  /**
   * Alternativa al challenge: usar un backup code one-time.
   * @param {string} backupCode - formato XXXX-XXXX-XXXX-XXXX
   */
  mfaVerifyBackupCode: (backupCode) =>
    api.post('/auth/mfa/verify-backup-code', { backupCode }),

  /**
   * Regenerar los 8 backup codes (invalida los anteriores). Requiere MFA reciente.
   */
  mfaRegenerateBackupCodes: () => api.post('/auth/mfa/backup-codes/regenerate', {}),

  /**
   * Deshabilitar MFA. Requiere MFA reciente + password reentry.
   * @param {string} password
   */
  mfaDisable: (password) => api.delete('/auth/mfa', { data: { password } })
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

  /**
   * Desbloquear cuenta bloqueada por intentos fallidos de login.
   *
   * El backend (T-905 B7) exige header `X-MFA-Token` reciente del super_admin.
   * Si falta, el interceptor responde 428 `MFA_TOKEN_REQUIRED` y el
   * `MfaChallengeModal` global aparece automáticamente para que el admin
   * introduzca el TOTP. Tras validar, la petición se reintenta.
   *
   * @param {string} email - Email de la cuenta a desbloquear (case-insensitive en backend)
   * @returns {Promise} Respuesta `{ unlocked: boolean }`
   */
  unlockAccount: (email) =>
    api.post('/admin/lockouts/unlock', { email }),
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

  // Operaciones RGPD — solo super_admin (ADR-032)

  /** Actualizar consentimiento parental (PATCH /api/users/:id/consent) */
  updateConsent: (userId, data) => api.patch(`/users/${userId}/consent`, data),

  /** Borrado efectivo Art. 17 RGPD (DELETE /api/users/:id/data) */
  hardDeleteUser: (userId) =>
    api.delete(`/users/${userId}/data`, { data: { confirmDeletion: true } }),

  /** Exportar datos Art. 20 RGPD (GET /api/users/:id/export-data) */
  exportStudentData: (userId) =>
    api.get(`/users/${userId}/export-data`, { responseType: 'blob' }),

  /**
   * Actualizar el progreso del onboarding interactivo del propio usuario
   * (T-951 PROP-13). Acepta cualquier subset de los campos editables.
   * @param {Object} payload - Subset { currentStep?, currentTrack?, teacherCompleted?, superAdminCompleted? }
   * @returns {Promise} Respuesta con el subdocumento de onboarding actualizado.
   */
  updateMyOnboarding: (payload) =>
    api.patch('/users/me/onboarding', payload),
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
   * Verificar si un UID de tarjeta RFID existe en otros mazos activos del profesor (ADR-022).
   * Usado durante el escaneo para dar feedback inmediato al profesor.
   * @param {string} uid - UID de la tarjeta RFID
   * @param {string} [excludeDeckId] - ID de mazo a excluir (para edición)
   * @returns {Promise} Respuesta con { found: boolean, deck?: { id, name, cardsCount } }
   */
  checkCard: (uid, excludeDeckId) =>
    api.get('/decks/check-card', { params: { uid, ...(excludeDeckId && { excludeDeckId }) } }),

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
  // D.2 (pre-v1.0.0): dedup solo cuando se llama con `params` por defecto
  // (caso bootstrap), no para queries específicas con filtros.
  getContexts: (params, config = {}) => {
    if (!params && !config.signal) {
      return dedupRequest('contextsAPI.getContexts:default', () =>
        api.get('/contexts', { params: ACTIVE_ONLY_PARAMS, ...config })
      );
    }
    return api.get('/contexts', { params: params ?? ACTIVE_ONLY_PARAMS, ...config });
  },

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

  /**
   * Crear un nuevo contexto de juego (solo super_admin)
   * El contexto se crea vacío; los assets se añaden después mediante upload.
   * @param {Object} data - { contextId: string, name: string }
   * @returns {Promise} Respuesta con el contexto creado
   */
  createContext: (data) =>
    api.post('/contexts', data),

  /**
   * Actualizar metadatos de un contexto (solo super_admin)
   * @param {string} contextMongoId - MongoDB _id del contexto
   * @param {Object} data - Campos a actualizar: { name?, contextId? }
   * @returns {Promise} Respuesta con el contexto actualizado
   */
  updateContext: (contextMongoId, data) =>
    api.put(`/contexts/${contextMongoId}`, data),

  /**
   * Eliminar un contexto completo y sus archivos de Storage (solo super_admin)
   * @param {string} contextMongoId - MongoDB _id del contexto
   * @returns {Promise} Confirmación de eliminación
   */
  deleteContext: (contextMongoId) =>
    api.delete(`/contexts/${contextMongoId}`),

  /**
   * Adjuntar o reemplazar audio en un asset existente
   * @param {string} contextMongoId - MongoDB _id del contexto
   * @param {string} assetKey - Key del asset destino
   * @param {FormData} formData - Datos con archivo de audio (file)
   * @returns {Promise} Asset actualizado con audioUrl
   */
  attachAudio: (contextMongoId, assetKey, formData) =>
    api.patch(`/contexts/${contextMongoId}/assets/${assetKey}/audio`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),

  /**
   * Eliminar la imagen de un asset (y el registro del asset completo)
   * @param {string} contextMongoId - MongoDB _id del contexto
   * @param {string} assetKey - Key del asset a eliminar
   * @returns {Promise} Confirmación de eliminación
   */
  deleteImage: (contextMongoId, assetKey) =>
    api.delete(`/contexts/${contextMongoId}/images/${assetKey}`),

  /**
   * Eliminar el audio de un asset (y el registro del asset completo)
   * @param {string} contextMongoId - MongoDB _id del contexto
   * @param {string} assetKey - Key del asset a eliminar
   * @returns {Promise} Confirmación de eliminación
   */
  deleteAudio: (contextMongoId, assetKey) =>
    api.delete(`/contexts/${contextMongoId}/audio/${assetKey}`),
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
  // D.2 (pre-v1.0.0): dedup default-params como contextsAPI.
  getMechanics: (params, config = {}) => {
    if (!params && !config.signal) {
      return dedupRequest('mechanicsAPI.getMechanics:default', () =>
        api.get('/mechanics', { params: ACTIVE_ONLY_PARAMS, ...config })
      );
    }
    return api.get('/mechanics', { params: params ?? ACTIVE_ONLY_PARAMS, ...config });
  },

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
   * Clonar sesión existente (resincroniza mapping con el mazo actual)
   * @param {string} sessionId
   * @returns {Promise}
   */
  cloneSession: (sessionId) =>
    api.post(`/sessions/${sessionId}/clone`, {}),

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
    api.post(`/plays/${playId}/abandon`, {}),

  /**
   * Obtener estadísticas de un jugador (opcionalmente filtradas por sesión).
   * @param {string} playerId
   * @param {Object} [params] - Ej: { sessionId }
   * @returns {Promise}
   */
  getPlayerStats: (playerId, params = {}) =>
    api.get(`/plays/stats/${playerId}`, { params })
};

/**
 * API de notificaciones tiempo real (T-955).
 *
 * Los endpoints viven bajo /api/notifications. El bell del frontend
 * consume estos endpoints para hidratar el estado inicial y para acciones
 * de read/markAllRead; las notificaciones nuevas llegan vía Socket.IO
 * (`notification:created`) y se prependen al listado cacheado.
 */
export const notificationsAPI = {
  /**
   * Lista paginada de notificaciones del usuario autenticado.
   * @param {Object} params
   * @param {number} [params.limit=20] - Tamaño de la página (1-100).
   * @param {string} [params.before] - ISO date string como cursor.
   * @param {Object} [config] - Axios config extra.
   * @returns {Promise} { data: { items, nextCursor } }
   */
  list: (params = {}, config = {}) =>
    api.get('/notifications', { params, ...config }),

  /**
   * Contador de notificaciones no leídas del usuario.
   * @param {Object} [config]
   * @returns {Promise} { data: { count } }
   */
  unreadCount: (config = {}) => api.get('/notifications/unread-count', config),

  /**
   * Marca una notificación específica como leída.
   * @param {string} id
   * @returns {Promise}
   */
  markRead: (id) => api.patch(`/notifications/${id}/read`, {}),

  /**
   * Marca todas las notificaciones del usuario como leídas.
   * @returns {Promise} { data: { modified } }
   */
  markAllRead: () => api.post('/notifications/mark-all-read', {})
};

export default api;
