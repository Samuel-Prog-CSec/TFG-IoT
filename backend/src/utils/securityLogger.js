/**
 * @fileoverview Logger de seguridad centralizado.
 * Define eventos de seguridad, severidad dinámica, sanitización y alertas Sentry.
 * @module utils/securityLogger
 */

const logger = require('./logger');
const { Sentry } = require('../config/sentry');

const securityLogger = logger.child({ component: 'security' });

const SECURITY_EVENTS = {
  AUTH_LOGIN_SUCCESS: {
    level: 'info',
    message: 'Login exitoso'
  },
  AUTH_LOGIN_FAILED: {
    level: 'warn',
    message: 'Login fallido',
    sentry: { threshold: 10, windowMs: 60 * 1000, level: 'warning' },
    severityThreshold: 5
  },
  AUTH_ACCOUNT_LOCKED: {
    level: 'warn',
    message: 'Cuenta bloqueada temporalmente por intentos fallidos',
    sentry: { threshold: 3, windowMs: 60 * 1000, level: 'warning' }
  },
  AUTH_ACCOUNT_LOCKOUT_BYPASS: {
    level: 'info',
    message: 'Cuenta desbloqueada manualmente por admin'
  },
  AUTH_REGISTER_SUCCESS: {
    level: 'info',
    message: 'Registro de profesor exitoso'
  },
  AUTH_REGISTER_FAILED: {
    level: 'warn',
    message: 'Registro de profesor fallido',
    sentry: { threshold: 5, windowMs: 60 * 1000, level: 'warning' }
  },
  AUTH_PASSWORD_CHANGED: {
    level: 'info',
    message: 'Contraseña actualizada'
  },
  AUTH_PASSWORD_CHANGE_FAILED: {
    level: 'warn',
    message: 'Fallo al cambiar contraseña'
  },
  AUTH_REFRESH_SUCCESS: {
    level: 'info',
    message: 'Refresh token exitoso'
  },
  AUTH_REFRESH_FAILED: {
    level: 'warn',
    message: 'Refresh token fallido',
    sentry: { threshold: 10, windowMs: 60 * 1000, level: 'warning' }
  },
  AUTH_TOKEN_REVOKED: {
    level: 'info',
    message: 'Token revocado'
  },
  AUTH_TOKENS_REVOKED_ALL: {
    level: 'warn',
    message: 'Revocación global de tokens',
    sentry: { threshold: 3, windowMs: 60 * 1000, level: 'warning' }
  },
  AUTH_TOKEN_THEFT_DETECTED: {
    level: 'error',
    message: 'Posible robo de token detectado',
    sentry: { immediate: true, level: 'error' }
  },
  AUTH_TOKEN_INVALID: {
    level: 'warn',
    message: 'Token inválido o expirado'
  },
  AUTH_TOKEN_FINGERPRINT_MISMATCH: {
    level: 'warn',
    message: 'Fingerprint de token inválido'
  },
  AUTH_REFRESH_TOKEN_REUSED: {
    level: 'warn',
    message: 'Refresh token reusado en grace period'
  },
  AUTH_SESSION_INVALIDATED: {
    level: 'info',
    message: 'Sesión invalidada'
  },
  AUTH_BYPASS_ENABLED: {
    level: 'warn',
    message: 'Bypass de autenticación habilitado'
  },
  AUTHZ_ACCESS_DENIED: {
    level: 'warn',
    message: 'Acceso denegado por autorización',
    sentry: { threshold: 20, windowMs: 60 * 1000, level: 'warning' }
  },
  STUDENT_TRANSFER: {
    level: 'info',
    message: 'Transferencia de alumno registrada'
  },
  // Protección de datos — Art. 5.2 RGPD (accountability)
  DATA_CONSENT_CHANGE: {
    level: 'info',
    message: 'Cambio en consentimiento parental registrado'
  },
  DATA_HARD_DELETE: {
    level: 'warn',
    message: 'Borrado efectivo de datos de estudiante ejecutado (Art. 17 RGPD)',
    sentry: { threshold: 5, windowMs: 60 * 1000, level: 'warning' }
  },
  DATA_RETENTION_EXECUTED: {
    level: 'info',
    message: 'Política de retención de datos ejecutada'
  },
  WS_AUTH_FAILED: {
    level: 'warn',
    message: 'Autenticación WebSocket fallida',
    sentry: { threshold: 10, windowMs: 60 * 1000, level: 'warning' }
  },
  SECURITY_RATE_LIMITED: {
    level: 'warn',
    message: 'Rate limit de seguridad excedido',
    sentry: { threshold: 10, windowMs: 60 * 1000, level: 'warning' }
  },
  SECURITY_PAYLOAD_TOO_LARGE: {
    level: 'warn',
    message: 'Payload WebSocket rechazado por tamaño',
    sentry: { threshold: 5, windowMs: 60 * 1000, level: 'warning' }
  },
  SECURITY_RFID_DEDUPE: {
    level: 'info',
    message: 'Evento RFID duplicado bloqueado'
  },
  SECURITY_RFID_EVENT_INVALID: {
    level: 'warn',
    message: 'Evento RFID inválido recibido',
    sentry: { threshold: 10, windowMs: 60 * 1000, level: 'warning' }
  },
  // Protección de datos — Seudonimización y auditoría (Art. 5.2, 16, 20, 25 RGPD)
  DATA_RECTIFICATION: {
    level: 'info',
    message: 'Rectificación de datos personales de estudiante registrada (Art. 16 RGPD)'
  },
  DATA_ACCESS: {
    level: 'info',
    message: 'Acceso a datos personales de estudiante registrado'
  },
  DATA_EXPORT: {
    level: 'info',
    message: 'Exportación de datos de estudiante ejecutada (Art. 20 RGPD)'
  }
};

const LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'set-cookie',
  'fp',
  'fingerprint',
  'secret',
  'jwt',
  'session',
  // PII de menores — Art. 25 RGPD (protección desde el diseño)
  'studentName',
  'playerName',
  // Quasi-identificador en aulas pequeñas (ver T-714, evaluación riesgo re-identificación)
  'classroom'
]);

const eventCounters = new Map();

const sanitizeValue = (value, depth = 0) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > 4) {
    return '[TRUNCATED]';
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, item]) => {
      if (SENSITIVE_KEYS.has(key)) {
        acc[key] = '[REDACTED]';
      } else {
        acc[key] = sanitizeValue(item, depth + 1);
      }
      return acc;
    }, {});
  }

  return value;
};

const sanitizeMeta = meta => sanitizeValue(meta, 0);

const getRequestContext = req => {
  if (!req) {
    return { source: 'http' };
  }

  const forwarded = req.headers?.['x-forwarded-for'];
  const forwardedIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : undefined;

  return {
    source: 'http',
    requestId: req.headers?.['x-request-id'] || req.headers?.['x-correlation-id'] || req.id,
    ip: req.ip || forwardedIp,
    userAgent: req.headers?.['user-agent'],
    method: req.method,
    path: req.originalUrl || req.path
  };
};

const getSocketContext = socket => ({
  source: 'ws',
  socketId: socket?.id,
  ip: socket?.handshake?.address,
  origin: socket?.handshake?.headers?.origin,
  userAgent: socket?.handshake?.headers?.['user-agent']
});

const updateCounter = (eventCode, windowMs) => {
  const now = Date.now();
  const state = eventCounters.get(eventCode) || {
    count: 0,
    windowStart: now,
    lastAlertAt: 0
  };

  if (now - state.windowStart > windowMs) {
    state.windowStart = now;
    state.count = 0;
  }

  state.count += 1;
  eventCounters.set(eventCode, state);

  return { now, state };
};

const shouldAlert = (eventConfig, state, now) => {
  if (!eventConfig?.sentry) {
    return false;
  }

  if (eventConfig.sentry.immediate) {
    return true;
  }

  const threshold = eventConfig.sentry.threshold;
  const windowMs = eventConfig.sentry.windowMs || 60 * 1000;

  if (!threshold) {
    return false;
  }

  if (state.count < threshold) {
    return false;
  }

  if (now - state.lastAlertAt < windowMs) {
    return false;
  }

  return true;
};

const resolveLevel = (baseLevel, correlationMissing, eventConfig, state) => {
  let level = baseLevel || 'info';

  if (eventConfig?.severityThreshold && state.count >= eventConfig.severityThreshold) {
    level = 'error';
  }

  if (correlationMissing && LEVEL_PRIORITY[level] < LEVEL_PRIORITY.warn) {
    level = 'warn';
  }

  return level;
};

// T-942: mapeo de eventos de seguridad → contador sliding 1h consumido por
// los detectores `auth_failed_spike`, `account_lockout_spike`, etc.
// Fire-and-forget: el incremento en Redis nunca debe bloquear ni propagar.
const COUNTER_MAP = {
  AUTH_LOGIN_FAILED: 'auth_failed',
  AUTH_REFRESH_FAILED: 'auth_failed',
  AUTH_ACCOUNT_LOCKED: 'account_locked',
  AUTH_TOKEN_THEFT_DETECTED: 'token_theft',
  DATA_CONSENT_CHANGE: 'consent_withdrawn' // se filtra dentro: solo si action=withdrawn
};

const bumpSecurityCounter = (eventCode, meta) => {
  const counterType = COUNTER_MAP[eventCode];
  if (!counterType) {
    return;
  }
  // Para DATA_CONSENT_CHANGE distinguimos withdrawn vs granted via meta.action
  if (counterType === 'consent_withdrawn' && meta?.action && meta.action !== 'withdrawn') {
    return;
  }
  try {
    // Lazy require para evitar dependencia circular con redisService.
    const securityCounters = require('../services/security/securityCountersService');
    securityCounters.increment(counterType).catch(() => {});
  } catch {
    // Si el módulo no está disponible (durante boot), simplemente no contamos.
  }
};

const logSecurityEvent = (eventCode, meta = {}) => {
  const eventConfig = SECURITY_EVENTS[eventCode] || {
    level: 'info',
    message: 'Evento de seguridad'
  };

  const windowMs = eventConfig?.sentry?.windowMs || 60 * 1000;
  const { now, state } = updateCounter(eventCode, windowMs);

  // Incrementa contadores sliding-window para detectores de SystemAlerts.
  bumpSecurityCounter(eventCode, meta);

  const correlationMissing =
    (meta?.source === 'http' && !meta?.requestId) || (meta?.source === 'ws' && !meta?.socketId);

  const level = resolveLevel(eventConfig.level, correlationMissing, eventConfig, state);

  const sanitizedMeta = sanitizeMeta({
    securityEvent: eventCode,
    correlationWarning: correlationMissing ? 'Falta requestId/socketId' : undefined,
    ...meta
  });

  if (typeof securityLogger[level] === 'function') {
    securityLogger[level](sanitizedMeta, eventConfig.message);
  } else {
    securityLogger.info(sanitizedMeta, eventConfig.message);
  }

  if (eventConfig.sentry && shouldAlert(eventConfig, state, now)) {
    state.lastAlertAt = now;
    eventCounters.set(eventCode, state);

    Sentry.captureMessage(eventConfig.message, {
      level: eventConfig.sentry.level || 'warning',
      tags: {
        securityEvent: eventCode
      },
      extra: sanitizedMeta
    });
  }
};

module.exports = {
  SECURITY_EVENTS,
  logSecurityEvent,
  getRequestContext,
  getSocketContext
};
