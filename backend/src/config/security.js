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

  // En single-instance (invariante scale=1, ver config/scaling.js) el rate limit NO
  // necesita store distribuido: con una sola instancia MemoryStore cuenta TODAS las
  // requests igual que Redis, pero sin gastar un comando Upstash por request —crítico
  // en free-tier, con ~10K comandos/día de margen. Usamos MemoryStore de forma
  // DELIBERADA y NO marcamos fallback: el detector `rate_limit_store_fallback` vigila
  // pérdidas de Redis en multi-instancia, no esta elección consciente. Al escalar
  // (`SOCKET_ADAPTER_ENABLED=true`) se reactiva el store distribuido junto con el resto
  // de la coordinación entre instancias (adapter Socket.IO, pub/sub de modo RFID/LRU).
  const { isMultiInstanceEnabled } = require('./scaling');
  if (!isMultiInstanceEnabled()) {
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
      // Comportamiento ante fallo del store (Redis) mid-request:
      //  - Límites de disponibilidad (global, creations, uploads…): fail-OPEN —
      //    preferimos dejar pasar a tirar el servicio durante un blip de Redis.
      //  - auth / register: fail-CLOSED — sin Redis NO hay rate limiting (express
      //    -rate-limit con passOnStoreError NO cae a MemoryStore, simplemente no
      //    limita), lo que abriría una ventana de fuerza bruta sin límite (en 1
      //    instancia, sin límite = sin protección global). Preferimos rechazar
      //    temporalmente login/registro a exponer fuerza bruta sobre datos de
      //    menores. El blip de Redis ya degrada el servicio de todos modos.
      passOnStoreError: rateLimitOptions.passOnStoreError ?? !['auth', 'register'].includes(prefix)
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
      // Normalizar: quitar espacios y la barra final. Evita el footgun de que
      // `https://app.eduplay.com/` (con slash en la env) nunca case con el Origin
      // del navegador (`https://app.eduplay.com`) y provoque un fallo CORS opaco.
      .map(origin => origin.trim().replace(/\/$/, ''))
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

    // Rechazo limpio (sin cabeceras CORS) en vez de lanzar un Error: pasar un
    // Error al callback de cors() lo propaga al error handler → HTTP 500 (incluso
    // en preflight OPTIONS), generando ruido en Sentry. Con callback(null, false)
    // cors() omite Access-Control-Allow-Origin y el navegador bloquea la respuesta;
    // un cliente no-navegador no obtiene ventaja (CORS no es un control server-side).

    // En producción: SIEMPRE requerir origin
    if (isProduction && !origin) {
      logger.warn('CORS: petición sin cabecera Origin rechazada en producción');
      return callback(null, false);
    }

    // En desarrollo: Permitir peticiones sin origin (Postman, curl, etc.)
    if (!isProduction && !origin) {
      return callback(null, true);
    }

    // Validación estricta contra whitelist
    if (corsWhitelist.includes(origin)) {
      return callback(null, true);
    }

    logger.warn({ origin }, 'CORS: origen no autorizado rechazado');
    return callback(null, false);
  },
  credentials: true, // Permitir cookies y headers de autenticación
  optionsSuccessStatus: 204,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'X-CSRF-Token', // Para protección CSRF
    'X-MFA-Token' // T-905 B7: token MFA corto para endpoints protegidos por requireMfa
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
  '/api/csp-report' // T-905 B5: navegador envía sin cookies/headers de auth
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

// Normaliza el trailing slash antes de comparar con la skip-list: Express hace
// coincidir `/api/auth/login` y `/api/auth/login/` con el mismo handler (routing
// no estricto), pero `skipPaths.has('/api/auth/login/')` daría false → CSRF se
// aplicaría a un login con barra final y lo bloquearía. Quitamos la barra final
// (salvo la raíz) para que la exención sea robusta ante esa variante.
const normalizePath = path => (path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path);
const shouldSkipCsrf = req => skipPaths.has(normalizePath(req.path));

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
    return next(new ForbiddenError('CSRF token inválido o ausente'));
  }

  return next();
};

/**
 * Construye las opciones de Helmet diferenciadas por entorno (T-905 B5).
 *
 * Las diferencias clave entre dev y prod:
 * - **scriptSrc**: prod añade `https://*.sentry.io` + `https://challenges.cloudflare.com`
 *   (Turnstile, B6); dev mantiene solo `'self'` y permite HMR si fuese necesario.
 * - **connectSrc**: prod incluye dominio WSS de producción (variable `WSS_DOMAIN`).
 * - **HSTS**: prod usa `maxAge: 63072000` (2 años) para inclusión en hstspreload.org.
 * - **reportUri**: prod reporta violaciones a `/api/csp-report` (Sentry vía backend).
 * - **CSP_REPORT_ONLY=true**: opcional para staging — recolecta violaciones sin bloquear,
 *   útil tras cambios importantes en la política antes de hacer enforce.
 *
 * NOTA: `styleSrc` mantiene `'unsafe-inline'` por compromiso pragmático: Tailwind v4
 * con `@layer` y Framer Motion inyectan inline styles dinámicos. CSP estricta en
 * `scriptSrc` (el vector XSS real) sigue intacta — la justificación está documentada
 * en ADR-149 (T-905).
 *
 * @param {string} env - Valor de NODE_ENV o equivalente.
 * @returns {import('helmet').HelmetOptions}
 */
const buildHelmetOptions = (env = process.env.NODE_ENV) => {
  const isProd = env === 'production';
  const supabaseHost = process.env.SUPABASE_URL || '';
  const wssDomain = process.env.WSS_DOMAIN || ''; // p. ej. wss://api-prod.koyeb.app
  const turnstile = 'https://challenges.cloudflare.com'; // B6 CAPTCHA

  // scriptSrc: en prod añadimos Sentry + Turnstile (Cloudflare CAPTCHA, B6).
  // NUNCA añadir 'unsafe-inline' o 'unsafe-eval' a scriptSrc — es el vector XSS principal.
  const scriptSrc = ["'self'"];
  if (isProd) {
    scriptSrc.push('https://*.sentry.io', turnstile);
  }

  // connectSrc: backend XHR, WS, Sentry ingest, Supabase Storage, Turnstile siteverify.
  const connectSrc = ["'self'", 'https://*.sentry.io', 'https://challenges.cloudflare.com'];
  if (supabaseHost) {
    connectSrc.push(supabaseHost);
  }
  if (isProd && wssDomain) {
    connectSrc.push(wssDomain);
  } else if (!isProd) {
    // dev: permitir cualquier WS local (Vite, Socket.IO local)
    connectSrc.push('ws:', 'wss:');
  }

  // imgSrc + mediaSrc: Supabase Storage tiene dominio variable según proyecto.
  // `blob:` es imprescindible para las vistas previas de imagen/audio ANTES de
  // subir: los modales de subida generan la preview con URL.createObjectURL(),
  // que produce una URL `blob:`. Sin `blob:` en la política, el navegador
  // bloqueaba la miniatura (la subida funcionaba, pero el docente no veía qué
  // iba a subir). Debe ir sincronizado con la CSP de Nginx (security-headers.conf).
  const supabaseDomain = supabaseHost || 'https://*.supabase.co';
  const imgSrc = ["'self'", 'data:', 'blob:', supabaseDomain];
  if (!isProd) {
    imgSrc.push('https:'); // dev: permitir cualquier imagen externa (placeholder, etc.)
  }

  const cspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
    formAction: ["'self'"],
    frameAncestors: ["'none'"], // Prevenir clickjacking
    frameSrc: ["'self'", turnstile], // Turnstile widget se renderiza en iframe
    imgSrc,
    scriptSrc,
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // Tailwind v4 + Framer
    upgradeInsecureRequests: isProd ? [] : null, // Solo en prod (HTTPS forzado)
    mediaSrc: ["'self'", 'blob:', supabaseDomain],
    workerSrc: ["'self'", 'blob:'], // service workers / web workers locales
    connectSrc
  };

  // Endpoint de reportes para violaciones CSP (B5). En prod siempre, en dev opcional
  // para no contaminar logs con cosas que se sabe que no aplican.
  if (isProd) {
    cspDirectives.reportUri = ['/api/csp-report'];
  }

  // Limpia directivas con valor null para no enviarlas (upgradeInsecureRequests).
  for (const key of Object.keys(cspDirectives)) {
    if (cspDirectives[key] === null) {
      delete cspDirectives[key];
    }
  }

  // Resolución de `reportOnly`:
  //  - En dev/test: por defecto `true` para no romper HMR (Vite genera scripts
  //    inline, websockets, blobs); las violaciones siguen llegando a
  //    `/api/csp-report` para detectar regresiones sin penalizar al developer.
  //    Override explícito con `CSP_REPORT_ONLY=false` si se quiere validar la
  //    política completa localmente.
  //  - En prod: por defecto `false` (enforce). Cuando se prepara una rampa de
  //    una política nueva, `CSP_REPORT_ONLY=true` durante 1 semana en staging.
  let reportOnly;
  if (process.env.CSP_REPORT_ONLY === 'true') {
    reportOnly = true;
  } else if (process.env.CSP_REPORT_ONLY === 'false') {
    reportOnly = false;
  } else {
    reportOnly = !isProd;
  }

  return {
    contentSecurityPolicy: {
      directives: cspDirectives,
      reportOnly
    },
    crossOriginEmbedderPolicy: false, // Audio/video cross-origin requieren COEP off
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Recursos de Supabase
    // X-Powered-By se elimina a nivel Express con `app.disable('x-powered-by')` en
    // server.js. NO usar `xPoweredBy: false` aquí: en helmet v7+ ese valor DESACTIVA
    // el borrado de la cabecera (semántica invertida), que es justo lo contrario de
    // lo que se pretendía y dejaba `X-Powered-By: Express` expuesto.
    hsts: {
      // T-905 B5: 2 años en prod para hstspreload.org (requisito de inclusión).
      maxAge: isProd ? 63072000 : 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  };
};

// Mantener export compatible con consumidores existentes — referencia evaluada al
// require-time del módulo (NODE_ENV ya está fijado cuando server.js arranca).
const helmetOptions = buildHelmetOptions();

/**
 * Rate limiter global para prevenir ataques DoS.
 * Aplica a todas las rutas /api/*.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const isDev = process.env.NODE_ENV === 'development';
const globalWindowMs = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;
// T-905 B4: recalibrado a 1000 req/15min en prod para 10-30 docentes activos + picos
// de 100 alumnos. El valor antiguo (100) provocaba 429 con uso normal en clase.
const globalMax = isDev
  ? Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS_DEV, 10) || 2000
  : Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 1000;

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
 * Rate limiter "loose" para endpoints de auth menos sensibles que login.
 * Pensado para `POST /api/auth/refresh` y `GET /api/auth/me`, que se invocan
 * con cierta frecuencia legítima durante una sesión activa (refresh ~5min,
 * me en muchos pages). 20/15min es suficiente para uso normal y bloquea
 * sondeos abusivos. Login y register siguen con sus limiters más estrictos.
 *
 * T-905 B4.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const authLooseRateLimiter = createRateLimiter({
  prefix: 'auth-loose',
  windowMs: Number.parseInt(process.env.RATE_LIMIT_AUTH_LOOSE_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: isDev
    ? Number.parseInt(process.env.RATE_LIMIT_AUTH_LOOSE_MAX_DEV, 10) || 2000
    : Number.parseInt(process.env.RATE_LIMIT_AUTH_LOOSE_MAX, 10) || 20,
  message: {
    success: false,
    message: 'Demasiadas peticiones de auth, por favor intenta más tarde'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator
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
// T-905 B4: creationLimiter recalibrado de 10/min → 50/hora. Un docente activo
// puede crear varios mazos+sesiones por hora durante preparación de clases; el
// límite por minuto antiguo era restrictivo y producía 429 en ráfagas de trabajo.
const createResourceRateLimiter = createRateLimiter({
  prefix: 'create',
  windowMs: Number.parseInt(process.env.RATE_LIMIT_CREATE_WINDOW_MS, 10) || 60 * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_CREATE_MAX_REQUESTS, 10) || (isDev ? 500 : 50),
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

// Límite dedicado para generación/exportación de informes de aula (E17/E18/E19).
// Son las operaciones de analytics más caras (aggregations + serialización del
// aula entera) y la salida de mayor riesgo de exfiltración de datos de menores.
// Más estricto que el analyticsRateLimiter global (30/min) sin molestar al docente.
const reportExportRateLimiter = createRateLimiter({
  prefix: 'report_export',
  windowMs: 60 * 1000, // 1 minuto
  max: Number.parseInt(process.env.RATE_LIMIT_REPORT_EXPORT_MAX, 10) || (isDev ? 60 : 10),
  message: {
    success: false,
    message: 'Demasiadas exportaciones de informes, espera un momento'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator
});

/**
 * Rate limiter específico para acciones administrativas masivas
 * (aprobar/rechazar profesores). Defense-in-depth ante un super_admin
 * comprometido que intente automatizar aprobaciones en lote, o ante un bug
 * de UI que dispare múltiples peticiones idénticas en bucle.
 *
 * Diseñado para no molestar al super_admin legítimo (100 aprobaciones/hora
 * cubre cualquier caso real) pero romper escenarios de abuso.
 *
 * @type {import('express-rate-limit').RateLimitRequestHandler}
 */
const adminApprovalRateLimiter = createRateLimiter({
  prefix: 'admin_approval',
  windowMs: 60 * 60 * 1000, // 1 hora
  max: Number.parseInt(process.env.RATE_LIMIT_ADMIN_APPROVAL_MAX, 10) || (isDev ? 1000 : 100),
  message: {
    success: false,
    message: 'Demasiadas acciones administrativas, espera un momento'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Key por userId (el limiter se monta tras `authenticate + requireRole('super_admin')`,
  // por lo que `req.user` siempre existe). Sin fallback a IP — si no hay user, el
  // helper devuelve la IP, lo que es seguro por defecto.
  keyGenerator: userOrIpKeyGenerator
});

module.exports = {
  corsOptions,
  ensureCsrfCookie,
  csrfProtection,
  helmetOptions,
  buildHelmetOptions,
  globalRateLimiter,
  authRateLimiter,
  authLooseRateLimiter,
  registerRateLimiter,
  createResourceRateLimiter,
  eventRateLimiter,
  analyticsRateLimiter,
  uploadRateLimiter,
  exportDataRateLimiter,
  reportExportRateLimiter,
  adminApprovalRateLimiter,
  initRateLimiters,
  corsWhitelist,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME
};
