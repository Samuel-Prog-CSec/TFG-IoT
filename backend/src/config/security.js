/**
 * @fileoverview Configuración centralizada de seguridad (CORS, Helmet, Rate Limiting).
 * Todas las políticas de seguridad del servidor se configuran aquí.
 * @module config/security
 */

const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');

const isTestEnv = () => process.env.NODE_ENV === 'test' || typeof globalThis.it === 'function';

// Helper para crear rate limiters que se deshabilitan en tests
const createRateLimiter = options => {
  // Check NODE_ENV or existence of Jest global 'it'
  if (isTestEnv()) {
    return (req, res, next) => next();
  }
  return rateLimit(options);
};

/**
 * Whitelist de orígenes permitidos para CORS.
 * En producción, solo dominios específicos deberían estar permitidos.
 *
 * @type {string[]}
 */
const corsWhitelist = process.env.CORS_WHITELIST
  ? process.env.CORS_WHITELIST.split(',').map(origin => origin.trim())
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173'
    ];

/**
 * Opciones de configuración para CORS.
 * Implementa verificación de origen dinámica contra whitelist.
 *
 * @type {import('cors').CorsOptions}
 */
const corsOptions = {
  origin: (origin, callback) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // En producción: SIEMPRE requerir origin
    if (isProduction && !origin) {
      return callback(new Error('Origin header requerido en producción'), false);
    }

    // En desarrollo: Permitir peticiones sin origin (Postman, curl, etc.)
    if (!isProduction && !origin) {
      return callback(null, true);
    }

    // Validación estricta contra whitelist
    if (corsWhitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} no autorizado por política CORS`), false);
    }
  },
  credentials: true, // Permitir cookies y headers de autenticación
  optionsSuccessStatus: 204,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'X-CSRF-Token' // Para protección CSRF
  ],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  maxAge: 86400 // Cache preflight por 24 horas
};

/**
 * Middleware CSRF Protection
 * Valida que las peticiones vengan de orígenes autorizados
 * mediante verificación de Referer/Origin header
 *
 * @param {import('express').Request} req - Request de Express
 * @param {import('express').Response} res - Response de Express
 * @param {Function} next - Next middleware
 */
const CSRF_COOKIE_NAME = 'csrfToken';
const CSRF_HEADER_NAME = 'x-csrf-token';
const skipPaths = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/auth/refresh'
]);
const writeMethods = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

const buildCsrfCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
};

const ensureCsrfCookie = (req, res, next) => {
  if (req.cookies?.[CSRF_COOKIE_NAME]) {
    return next();
  }

  const token = crypto.randomUUID();
  res.cookie(CSRF_COOKIE_NAME, token, buildCsrfCookieOptions());
  next();
};

const getRequestOrigin = req => req.get('Referer') || req.get('Origin');

const parseOrigin = value => {
  if (!value || !URL.canParse(value)) {
    return null;
  }

  const refererUrl = new URL(value);
  return `${refererUrl.protocol}//${refererUrl.host}`;
};

const hasValidCsrf = req => {
  const csrfHeader = req.get(CSRF_HEADER_NAME) || '';
  const csrfCookie = req.cookies?.[CSRF_COOKIE_NAME] || '';
  return Boolean(csrfHeader && csrfCookie && csrfHeader === csrfCookie);
};

const shouldSkipCsrf = req => {
  if (skipPaths.has(req.path)) {
    return true;
  }
  if (typeof req.originalUrl === 'string' && req.originalUrl.endsWith('/auth/refresh')) {
    return true;
  }
  return false;
};

const csrfProtection = (req, res, next) => {
  if (isTestEnv()) {
    return next();
  }

  if (shouldSkipCsrf(req)) {
    return next();
  }

  // Solo aplicar a métodos que modifican datos
  if (!writeMethods.has(req.method)) {
    return next();
  }

  const referer = getRequestOrigin(req);

  // En producción, SIEMPRE requerir referer
  if (process.env.NODE_ENV === 'production' && !referer) {
    return res.status(403).json({
      success: false,
      message: 'Referer/Origin header requerido para operaciones de modificación'
    });
  }

  if (referer) {
    const refererOrigin = parseOrigin(referer);
    if (!refererOrigin) {
      return res.status(403).json({
        success: false,
        message: 'Referer header inválido'
      });
    }

    if (!corsWhitelist.includes(refererOrigin)) {
      return res.status(403).json({
        success: false,
        message: 'Referer no autorizado'
      });
    }
  }

  if (!hasValidCsrf(req)) {
    return res.status(403).json({
      success: false,
      message: 'CSRF token invalido o ausente'
    });
  }

  next();
};

/**
 * Opciones de Helmet para security headers.
 * Configura CSP restrictivo adaptado al proyecto.
 *
 * @type {import('helmet').HelmetOptions}
 */
const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"], // Prevenir clickjacking
      imgSrc: ["'self'", 'data:', 'https:'], // Permitir imágenes de Supabase
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"], // Tailwind requiere unsafe-inline
      upgradeInsecureRequests: [], // Forzar HTTPS en producción
      mediaSrc: ["'self'", 'https:'], // Permitir audios de Supabase
      connectSrc: [
        "'self'",
        'https://api.sentry.io', // Sentry
        process.env.SUPABASE_URL || '' // Supabase Storage
      ].filter(Boolean)
    }
  },
  crossOriginEmbedderPolicy: false, // Necesario para audio/video cross-origin
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Permitir recursos de Supabase
  xPoweredBy: false, // Ocultar tecnología del servidor
  hsts: {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: true
  },
  noSniff: true, // X-Content-Type-Options
  xssFilter: true, // X-XSS-Protection
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
};

/**
 * Rate limiter global para prevenir ataques DoS.
 * Aplica a todas las rutas /api/*.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const isDev = process.env.NODE_ENV === 'development';
const globalWindowMs = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;
const globalMax = isDev
  ? Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_DEV, 10) || 2000
  : Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100;

const globalRateLimiter = createRateLimiter({
  windowMs: globalWindowMs,
  max: globalMax,
  message: {
    success: false,
    message: 'Demasiadas peticiones desde esta IP, por favor intenta más tarde'
  },
  standardHeaders: true, // Rate limit info en headers `RateLimit-*`
  legacyHeaders: false, // Deshabilitar headers `X-RateLimit-*`
  skipSuccessfulRequests: false,
  skipFailedRequests: false
  // Opcional: Usar Redis store en producción
  // store: new RedisStore({ client: redisClient })
});

/**
 * Rate limiter específico para endpoints de autenticación.
 * Más restrictivo que el global para prevenir brute-force.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const authRateLimiter = createRateLimiter({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: isDev
    ? Number.parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS_DEV, 10) || 400
    : Number.parseInt(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS, 10) || 5,
  message: {
    success: false,
    message: 'Demasiados intentos de autenticación, por favor intenta en 15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // No contar requests exitosos
});

/**
 * Rate limiter específico para registro de profesores.
 * Muy restrictivo para reducir bots.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const registerRateLimiter = createRateLimiter({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_REGISTER_WINDOW_MS, 10) || 60 * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_REGISTER_MAX_REQUESTS, 10) || (isDev ? 50 : 3),
  message: {
    success: false,
    message: 'Demasiados intentos de registro, intenta más tarde'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter para creación de recursos.
 * Previene spam de creación de sesiones, contextos, etc.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const createResourceRateLimiter = createRateLimiter({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_CREATE_WINDOW_MS, 10) || 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_CREATE_MAX_REQUESTS, 10) || (isDev ? 200 : 10),
  message: {
    success: false,
    message: 'Demasiadas operaciones de creación, espera un momento'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter para eventos de juego (más permisivo).
 * Usado en POST /api/plays/:id/events durante partidas activas.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const eventRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  max: 120, // 120 eventos por minuto (2 por segundo - permite ráfagas rápidas)
  message: {
    success: false,
    message: 'Demasiados eventos de juego, espera un momento'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter para subida de archivos.
 * Muy restrictivo debido al costo de procesamiento.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20, // 20 uploads por hora
  message: {
    success: false,
    message: 'Límite de uploads alcanzado, intenta más tarde'
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  corsOptions,
  ensureCsrfCookie,
  csrfProtection,
  helmetOptions,
  globalRateLimiter,
  authRateLimiter,
  registerRateLimiter,
  createResourceRateLimiter,
  eventRateLimiter,
  uploadRateLimiter,
  corsWhitelist,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
