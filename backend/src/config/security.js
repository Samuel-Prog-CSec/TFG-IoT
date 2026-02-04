/**
 * @fileoverview Configuración centralizada de seguridad (CORS, Helmet, Rate Limiting).
 * Todas las políticas de seguridad del servidor se configuran aquí.
 * @module config/security
 */

const rateLimit = require('express-rate-limit');

// Helper para crear rate limiters que se deshabilitan en tests
const createRateLimiter = options => {
  // Check NODE_ENV or existence of Jest global 'it'
  if (process.env.NODE_ENV === 'test' || typeof global.it === 'function') {
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
  : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'];

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
const csrfProtection = (req, res, next) => {
  // Solo aplicar a métodos que modifican datos
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const referer = req.get('Referer') || req.get('Origin');

    // En producción, SIEMPRE requerir referer
    if (process.env.NODE_ENV === 'production' && !referer) {
      return res.status(403).json({
        success: false,
        message: 'Referer/Origin header requerido para operaciones de modificación'
      });
    }

    // Si hay referer, verificar que esté en la whitelist
    if (referer) {
      let refererOrigin;
      try {
        const refererUrl = new URL(referer);
        refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      } catch (error) {
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
const globalRateLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests
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
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Solo 5 intentos
  message: {
    success: false,
    message: 'Demasiados intentos de autenticación, por favor intenta en 15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // No contar requests exitosos
});

/**
 * Rate limiter para creación de recursos.
 * Previene spam de creación de sesiones, contextos, etc.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const createResourceRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  max: 10, // 10 creaciones por minuto
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
  csrfProtection,
  helmetOptions,
  globalRateLimiter,
  authRateLimiter,
  createResourceRateLimiter,
  eventRateLimiter,
  uploadRateLimiter,
  corsWhitelist
};
