/**
 * @fileoverview Configuración centralizada de seguridad (CORS, Helmet, Rate Limiting).
 * Todas las políticas de seguridad del servidor se configuran aquí.
 * @module config/security
 */

const rateLimit = require('express-rate-limit');
const crypto = require('node:crypto');
const logger = require('../utils/logger');
const { ForbiddenError } = require('../utils/errors');
const { recordRateLimitStoreFallback } = require('../utils/runtimeMetrics');
const { userOrIpKeyGenerator } = require('../utils/ipHelper');

const isTestEnv = () => process.env.NODE_ENV === 'test' || typeof globalThis.it === 'function';

/**
 * Crea un Redis store para express-rate-limit.
 * Usa carga lazy de rate-limit-redis y getRedis() de config/redis.
 * Si Redis no está disponible, retorna undefined para fallback a MemoryStore.
 *
 * IMPORTANTE: createRedisStore se invoca UNA vez por limiter al boot del servidor.
 * Si Redis no está disponible al arrancar, el limiter queda anclado a MemoryStore
 * incluso tras reconexión de Redis. En multi-instancia esto fragmenta el límite
 * global (cada réplica lleva su propio contador). Se registra como evento de alerta
 * (error + Sentry) y se incrementa un contador en runtimeMetrics para observabilidad.
 *
 * @param {string} [prefix='default'] - Prefijo para las keys de rate limiting en Redis
 * @returns {Object|undefined} RedisStore instance o undefined (fallback in-memory)
 */
const createRedisStore = (prefix = 'default') => {
  if (isTestEnv()) {
    return undefined;
  }

  const reportFallback = (reason, extra = {}) => {
    recordRateLimitStoreFallback();
    // En producción elevamos a error con alert: true para que llegue a Sentry.
    // En desarrollo nos basta con warn (ruido en logs aceptable).
    const logLevel = process.env.NODE_ENV === 'production' ? 'error' : 'warn';
    logger[logLevel](
      {
        alert: process.env.NODE_ENV === 'production',
        fallback: 'memory',
        prefix,
        reason,
        ...extra
      },
      'Rate limiter fallback a MemoryStore — límite no distribuido'
    );
  };

  try {
    // Import lazy: evita errores si Redis no está configurado
    const { getRedis } = require('./redis');
    const client = getRedis();

    if (!client) {
      reportFallback('redis_not_connected');
      return undefined;
    }

    const { RedisStore } = require('rate-limit-redis');
    return new RedisStore({
      sendCommand: (...args) => client.call(...args),
      prefix: `rl:${prefix}:`
    });
  } catch (error) {
    reportFallback('store_creation_failed', { error: error.message });
    return undefined;
  }
};

/**
 * Registry interno de limiters ya inicializados con su store real.
 * Poblado por `initRateLimiters()` tras `await connectRedis()`.
 *
 * @type {Record<string, Function>}
 */
const rateLimitersRegistry = {};

/**
 * Configuraciones declaradas por los `createRateLimiter(...)` del módulo.
 * Guardadas aquí para que `initRateLimiters()` pueda instanciar los limiters
 * reales una vez Redis esté listo, respetando las mismas opciones.
 *
 * @type {Record<string, Object>}
 */
const limiterConfigs = {};

/**
 * Declara un rate limiter y devuelve un middleware "shim" que delega al
 * limiter real cuando `initRateLimiters()` haya corrido.
 *
 * Antes del fix: `createRateLimiter` instanciaba `rateLimit({ store: createRedisStore() })`
 * al require-time, que ocurría ANTES de `await connectRedis()` en server.js.
 * Redis no estaba conectado → `createRedisStore()` devolvía `undefined` → los 8
 * limiters quedaban anclados a `MemoryStore` para siempre (rate-limit NO distribuido).
 *
 * Ahora: la config se registra en `limiterConfigs`, se devuelve un shim, y el
 * limiter real se crea en `initRateLimiters()` con Redis ya disponible. El shim
 * mantiene el contrato de export: las rutas siguen haciendo
 * `const { authRateLimiter } = require('./security')` sin cambios.
 *
 * @param {Object} options - Opciones de express-rate-limit + { prefix } para Redis key
 * @returns {Function} Middleware shim
 */
const createRateLimiter = options => {
  if (isTestEnv()) {
    return (req, res, next) => next();
  }
  const { prefix } = options;
  if (!prefix) {
    throw new Error('createRateLimiter requiere un prefix único para el registry');
  }
  if (limiterConfigs[prefix]) {
    throw new Error(`createRateLimiter: prefix duplicado '${prefix}'`);
  }
  limiterConfigs[prefix] = options;

  return (req, res, next) => {
    const real = rateLimitersRegistry[prefix];
    if (!real) {
      // Boot temprano (pre-initRateLimiters) o arranque fallido: permitir paso.
      // El resto del startup loguea advertencia si esto persiste.
      return next();
    }
    return real(req, res, next);
  };
};

/**
 * Inicializa los limiters reales con Redis store. Debe llamarse desde
 * `server.js` **después** de `await connectRedis()` para que el store
 * distribuido funcione en multi-instancia. Si se invoca sin Redis, los
 * limiters se crean con MemoryStore y `recordRateLimitStoreFallback` deja
 * rastro en métricas.
 *
 * Idempotente: llamadas adicionales no duplican ni sobrescriben.
 *
 * @returns {void}
 */
const initRateLimiters = () => {
  if (isTestEnv()) {
    return;
  }
  const declaredPrefixes = Object.keys(limiterConfigs);
  if (declaredPrefixes.length === 0) {
    logger.warn('initRateLimiters: no hay configs registradas (¿orden de require incorrecto?)');
    return;
  }
  if (declaredPrefixes.every(prefix => rateLimitersRegistry[prefix])) {
    // Ya inicializado por completo — no-op.
    return;
  }

  for (const prefix of declaredPrefixes) {
    if (rateLimitersRegistry[prefix]) {
      continue;
    }
    // Spread sin la clave 'prefix' (es interna del registry, no de express-rate-limit).
    const rateLimitOptions = { ...limiterConfigs[prefix] };
    delete rateLimitOptions.prefix;

    rateLimitersRegistry[prefix] = rateLimit({
      ...rateLimitOptions,
      store: rateLimitOptions.store || createRedisStore(prefix),
      // Si el store (Redis) falla mid-request, permitir el paso en vez de
      // devolver 500: preferimos fail-open para no tirar el servicio entero
      // durante un blip de Redis. El fallback ya quedó registrado en métricas.
      passOnStoreError: rateLimitOptions.passOnStoreError ?? true
    });
  }

  logger.info('Rate limiters HTTP inicializados', {
    count: Object.keys(rateLimitersRegistry).length,
    prefixes: Object.keys(rateLimitersRegistry)
  });
};

/**
 * Whitelist de orígenes permitidos para CORS.
 * En producción, solo dominios específicos deberían estar permitidos.
 *
 * @type {string[]}
 */
const corsWhitelist = process.env.CORS_WHITELIST
  ? process.env.CORS_WHITELIST.split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173'
    ];

if (process.env.NODE_ENV === 'production') {
  const hasOnlyLocalhost = corsWhitelist.every(origin => /localhost|127\.0\.0\.1/.test(origin));
  if (hasOnlyLocalhost) {
    logger.fatal(
      { corsWhitelist },
      'CORS whitelist solo contiene origenes localhost en produccion — configurar CORS_WHITELIST con dominios de produccion'
    );
  }
}

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
      return callback(null, true);
    } else {
      return callback(new Error(`Origin ${origin} no autorizado por política CORS`), false);
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
const skipPaths = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/refresh']);
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
  return next();
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

const shouldSkipCsrf = req => skipPaths.has(req.path);

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
    return next(
      new ForbiddenError('Referer/Origin header requerido para operaciones de modificación')
    );
  }

  if (referer) {
    const refererOrigin = parseOrigin(referer);
    if (!refererOrigin) {
      return next(new ForbiddenError('Referer header inválido'));
    }

    if (!corsWhitelist.includes(refererOrigin)) {
      return next(new ForbiddenError('Referer no autorizado'));
    }
  }

  if (!hasValidCsrf(req)) {
    return next(new ForbiddenError('CSRF token invalido o ausente'));
  }

  return next();
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
  prefix: 'global',
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
});

/**
 * Rate limiter específico para endpoints de autenticación.
 * Más restrictivo que el global para prevenir brute-force.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const authRateLimiter = createRateLimiter({
  prefix: 'auth',
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
  prefix: 'register',
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
  prefix: 'create',
  windowMs: Number.parseInt(process.env.RATE_LIMIT_CREATE_WINDOW_MS, 10) || 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_CREATE_MAX_REQUESTS, 10) || (isDev ? 200 : 10),
  message: {
    success: false,
    message: 'Demasiadas operaciones de creación, espera un momento'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Key compuesta: userId (post-auth) o IP normalizada. Evita que NAT compartido
  // (escuelas) agote el límite y normaliza IPv6 vía `ipKeyGenerator` del helper.
  keyGenerator: userOrIpKeyGenerator
});

/**
 * Rate limiter para eventos de juego (más permisivo).
 * Usado en POST /api/plays/:id/events durante partidas activas.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const eventRateLimiter = createRateLimiter({
  prefix: 'event',
  windowMs: 60 * 1000, // 1 minuto
  max: 120, // 120 eventos por minuto (2 por segundo - permite ráfagas rápidas)
  message: {
    success: false,
    message: 'Demasiados eventos de juego, espera un momento'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Key compuesta: userId (post-auth) o IP normalizada. Evita que NAT compartido
  // (escuelas) agote el límite y normaliza IPv6 vía `ipKeyGenerator` del helper.
  keyGenerator: userOrIpKeyGenerator
});

/**
 * Rate limiter para endpoints de analíticas.
 * Las aggregations de MongoDB son costosas; este limiter previene abuso
 * sin afectar el uso normal de un dashboard (30 req/min es suficiente).
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const analyticsRateLimiter = createRateLimiter({
  prefix: 'analytics',
  windowMs: 60 * 1000, // 1 minuto
  max: isDev ? 200 : 30,
  message: {
    success: false,
    message: 'Demasiadas peticiones de analíticas, espera un momento'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator
});

/**
 * Rate limiter para subida de archivos.
 * Muy restrictivo debido al costo de procesamiento.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const uploadRateLimiter = createRateLimiter({
  prefix: 'upload',
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20, // 20 uploads por hora
  message: {
    success: false,
    message: 'Límite de uploads alcanzado, intenta más tarde'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Key compuesta: userId (post-auth) o IP normalizada. Evita que NAT compartido
  // (escuelas) agote el límite y normaliza IPv6 vía `ipKeyGenerator` del helper.
  keyGenerator: userOrIpKeyGenerator
});

// Límite estricto para exportación de datos personales (Art. 20 RGPD)
const exportDataRateLimiter = createRateLimiter({
  prefix: 'export',
  windowMs: 60 * 1000, // 1 minuto
  max: 1, // 1 exportación por minuto por usuario
  message: {
    success: false,
    message: 'Solo se permite una exportación de datos por minuto'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator
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
  analyticsRateLimiter,
  uploadRateLimiter,
  exportDataRateLimiter,
  initRateLimiters,
  corsWhitelist,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
