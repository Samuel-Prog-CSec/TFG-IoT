/**
 * @fileoverview Validador de variables de entorno críticas.
 * Falla FAST si falta alguna configuración requerida.
 * IMPORTANTE: Este módulo debe ejecutarse ANTES de cualquier inicialización.
 * @module utils/envValidator
 */

const logger = require('./logger');

/**
 * Variables de entorno REQUERIDAS para producción.
 * El servidor NO arrancará si falta alguna de estas.
 *
 * @type {string[]}
 */
const REQUIRED_ENV_VARS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGO_URI'];

/**
 * Variables de entorno REQUERIDAS solo en producción.
 * En desarrollo pueden usar defaults.
 *
 * @type {string[]}
 */
const REQUIRED_IN_PRODUCTION = ['CORS_WHITELIST'];

/**
 * Variables recomendadas (warning si faltan).
 * El sistema funcionará pero con configuración por defecto.
 *
 * @type {string[]}
 */
const RECOMMENDED_ENV_VARS = [
  'JWT_EXPIRES_IN',
  'JWT_REFRESH_EXPIRES_IN',
  'PORT',
  'NODE_ENV',
  'APP_ENV',
  'REDIS_URL',
  'REDIS_KEY_PREFIX',
  'SUPABASE_BUCKET'
];

/**
 * Valores permitidos para APP_ENV (separa "entorno cloud" de NODE_ENV).
 * - development: dev local
 * - staging: deploy automatico desde Maintenance (datos de prueba)
 * - production: deploy desde tag v* (datos reales)
 *
 * @type {string[]}
 */
const ALLOWED_APP_ENVS = ['development', 'staging', 'production'];

/**
 * Variables REQUERIDAS en producción para Redis.
 * En desarrollo se usa localhost por defecto.
 *
 * @type {string[]}
 */
const REQUIRED_REDIS_IN_PRODUCTION = ['REDIS_URL'];

/**
 * Valida que todas las variables requeridas estén configuradas.
 * @throws {Error} Si falta alguna variable crítica
 */
// eslint-disable-next-line sonarjs/cognitive-complexity, sonarjs/cyclomatic-complexity -- validacion exhaustiva de variables de entorno, la complejidad es inherente
function validateEnv() {
  const missing = [];
  const warnings = [];
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  // En tests, permitir defaults para no bloquear la suite.
  // Generados pseudo-aleatoriamente al arrancar para cumplir los requisitos B1
  // (≥64 chars + entropía ≥3.5 bits/char) sin necesidad de configurar nada.
  if (isTest) {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = require('node:crypto').randomBytes(48).toString('hex'); // 96 chars
      warnings.push('JWT_SECRET (default test)');
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      process.env.JWT_REFRESH_SECRET = require('node:crypto').randomBytes(48).toString('hex');
      warnings.push('JWT_REFRESH_SECRET (default test)');
    }
    // T-905 B7: JWT_MFA_SECRET para firmar MFA tokens cortos (5min). Default test.
    if (!process.env.JWT_MFA_SECRET) {
      process.env.JWT_MFA_SECRET = require('node:crypto').randomBytes(48).toString('hex');
      warnings.push('JWT_MFA_SECRET (default test)');
    }
    if (!process.env.MONGO_URI) {
      process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/rfid-games-test';
      warnings.push('MONGO_URI (default test)');
    }
  }

  // Validar requeridas SIEMPRE
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Validar requeridas solo en producción
  if (isProduction) {
    for (const envVar of REQUIRED_IN_PRODUCTION) {
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }
  }

  // Sentry: solo requerido si está explícitamente habilitado
  if (process.env.SENTRY_ENABLED === 'true' && !process.env.SENTRY_DSN) {
    if (isProduction) {
      missing.push('SENTRY_DSN');
    } else {
      warnings.push('SENTRY_DSN (SENTRY_ENABLED=true pero falta DSN)');
    }
  }

  // RFID: fuente requerida en producción (client|disabled)
  if (!process.env.RFID_SOURCE) {
    if (isProduction) {
      missing.push('RFID_SOURCE');
    } else {
      process.env.RFID_SOURCE = 'client';
      warnings.push('RFID_SOURCE (usando client por defecto)');
    }
  }

  if (process.env.RFID_SOURCE) {
    const source = process.env.RFID_SOURCE.trim().toLowerCase();
    const allowedSources = ['client', 'disabled'];
    if (!allowedSources.includes(source)) {
      throw new Error(
        `RFID_SOURCE inválido: ${process.env.RFID_SOURCE}. ` +
          `Valores permitidos: ${allowedSources.join(', ')}`
      );
    }
    process.env.RFID_SOURCE = source;
  }

  // Supabase Storage: requerido en producción (uploads de assets)
  // En desarrollo/test, se permite arrancar sin storage y se muestra warning.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    if (isProduction) {
      if (!process.env.SUPABASE_URL) {
        missing.push('SUPABASE_URL');
      }
      if (!process.env.SUPABASE_SERVICE_KEY) {
        missing.push('SUPABASE_SERVICE_KEY');
      }
    } else {
      warnings.push('SUPABASE_URL/SUPABASE_SERVICE_KEY (Storage deshabilitado)');
    }
  }

  // Redis: requerido en producción para tokens y estado de partidas
  // En desarrollo se usa redis://localhost:6379 por defecto
  if (!process.env.REDIS_URL) {
    if (isProduction) {
      for (const envVar of REQUIRED_REDIS_IN_PRODUCTION) {
        missing.push(envVar);
      }
    } else {
      // En desarrollo, establecer default y advertir
      process.env.REDIS_URL = 'redis://localhost:6379';
      warnings.push('REDIS_URL (usando redis://localhost:6379)');
    }
  }

  // Validar recomendadas
  for (const envVar of RECOMMENDED_ENV_VARS) {
    if (!process.env[envVar]) {
      warnings.push(envVar);
    }
  }

  // Si falta alguna requerida, FALLAR
  if (missing.length > 0) {
    const error = new Error(
      `CONFIGURACIÓN CRÍTICA FALTANTE\n\n` +
        `Las siguientes variables de entorno son REQUERIDAS:\n` +
        missing.map(v => `  - ${v}`).join('\n') +
        `\n\nCrea un archivo .env con estas variables o configúralas en el sistema.\n` +
        `Ejemplo: JWT_SECRET=tu_secret_aqui_muy_largo_y_aleatorio\n`
    );

    logger.error('Variables de entorno faltantes:', { missing });
    throw error;
  }

  // Validar formato y longitud de JWT secrets
  // En tests permitimos defaults conocidos para no bloquear
  if (!isTest) {
    validateJWTSecrets();
  }

  // Validar formato de MONGO_URI
  // En tests puede venir de mongodb-memory-server u override en setup
  validateMongoURI();

  // Validar formato de REDIS_URL
  if (process.env.REDIS_URL) {
    validateRedisURL();
  }

  // Validar formato de JWT_EXPIRES_IN y JWT_REFRESH_EXPIRES_IN
  if (process.env.JWT_EXPIRES_IN) {
    validateJWTExpiresIn('JWT_EXPIRES_IN', process.env.JWT_EXPIRES_IN);
  }
  if (process.env.JWT_REFRESH_EXPIRES_IN) {
    validateJWTExpiresIn('JWT_REFRESH_EXPIRES_IN', process.env.JWT_REFRESH_EXPIRES_IN);
  }

  // Validar rango de PORT
  if (process.env.PORT) {
    validatePort();
  }

  // Validar rango de LOG_SAMPLE_RATE
  if (process.env.LOG_SAMPLE_RATE) {
    validateLogSampleRate();
  }

  // Validar formato de SHUTDOWN_TIMEOUT_MS
  if (process.env.SHUTDOWN_TIMEOUT_MS) {
    validateShutdownTimeout();
  }

  // Validar APP_ENV si está definido (separado de NODE_ENV)
  if (process.env.APP_ENV) {
    validateAppEnv();
  }

  // Validar SEED_ON_BOOT si está definido (true|false)
  if (process.env.SEED_ON_BOOT) {
    validateSeedOnBoot();
  }

  // P1 plan auditoría Sprint 6 (#9): si APP_ENV está definido y Upstash se
  // comparte entre staging y prod, el prefix debería contener el nombre del
  // entorno para evitar colisiones. Warning no bloqueante — operativa
  // documentada en .env.example y Secrets_Rotation.md.
  validateRedisKeyPrefixForEnv();

  // Warnings para recomendadas
  if (warnings.length > 0) {
    logger.warn('Variables de entorno recomendadas no configuradas (usando defaults):', warnings);
  }

  logger.info('Validación de variables de entorno completada exitosamente');
}

/**
 * Calcula la entropía de Shannon (bits/símbolo) para un string.
 * Útil para detectar secrets repetitivos (ej. "aaaaaa..." tiene entropía 0).
 *
 * @param {string} str
 * @returns {number} Entropía en bits por símbolo (0 - 8 aprox).
 */
function shannonEntropy(str) {
  if (!str || str.length === 0) {
    return 0;
  }
  const freq = new Map();
  for (const char of str) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }
  const len = str.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Valida que los JWT secrets tengan longitud y complejidad adecuadas.
 *
 * Hardening B1 (T-905):
 * - Longitud mínima 64 caracteres (era 32) — entropía suficiente para HS256.
 * - Entropía Shannon ≥ 3.5 bits/char — rechaza secrets repetitivos.
 * - Diferentes entre sí — falla en lugar de solo warn.
 * - Defaults conocidos bloqueados (mantenido).
 *
 * @throws {Error} Si algún secret es inseguro
 */
function validateJWTSecrets() {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const MIN_LENGTH = 64;
  const MIN_ENTROPY = 3.5;

  if (jwtSecret.length < MIN_LENGTH) {
    throw new Error(
      `JWT_SECRET es demasiado corto (${jwtSecret.length} caracteres).\n` +
        `Debe tener al menos ${MIN_LENGTH} caracteres para ser seguro.\n` +
        `Genera uno aleatorio con: openssl rand -hex 64`
    );
  }

  if (jwtRefreshSecret.length < MIN_LENGTH) {
    throw new Error(
      `JWT_REFRESH_SECRET es demasiado corto (${jwtRefreshSecret.length} caracteres).\n` +
        `Debe tener al menos ${MIN_LENGTH} caracteres para ser seguro.\n` +
        `Genera uno aleatorio con: openssl rand -hex 64`
    );
  }

  // Validar entropía: bloquea secrets repetitivos como "aaaa..." o "abcabcabc..."
  const jwtEntropy = shannonEntropy(jwtSecret);
  if (jwtEntropy < MIN_ENTROPY) {
    throw new Error(
      `JWT_SECRET tiene entropía baja (${jwtEntropy.toFixed(2)} bits/char, mínimo ${MIN_ENTROPY}).\n` +
        `Indica un secret poco aleatorio. Regenera con crypto.randomBytes.`
    );
  }
  const refreshEntropy = shannonEntropy(jwtRefreshSecret);
  if (refreshEntropy < MIN_ENTROPY) {
    throw new Error(
      `JWT_REFRESH_SECRET tiene entropía baja (${refreshEntropy.toFixed(2)} bits/char, mínimo ${MIN_ENTROPY}).\n` +
        `Indica un secret poco aleatorio. Regenera con crypto.randomBytes.`
    );
  }

  // Validar que no sean valores por defecto conocidos
  const insecureDefaults = new Set([
    'dev-secret-change-in-production',
    'dev-refresh-secret-change-in-production',
    'secret',
    'mysecret',
    'changeme',
    'your-secret-here'
  ]);

  if (insecureDefaults.has(jwtSecret.toLowerCase())) {
    throw new Error(
      `JWT_SECRET contiene un valor por defecto inseguro.\n` + `Genera un secret aleatorio único.`
    );
  }

  if (insecureDefaults.has(jwtRefreshSecret.toLowerCase())) {
    throw new Error(
      `JWT_REFRESH_SECRET contiene un valor por defecto inseguro.\n` +
        `Genera un secret aleatorio único.`
    );
  }

  // Validar que access y refresh secrets sean diferentes — ahora estricto (fail-fast)
  if (jwtSecret === jwtRefreshSecret) {
    throw new Error(
      'JWT_SECRET y JWT_REFRESH_SECRET no pueden ser idénticos. ' +
        'Usa secrets independientes (compromiso de uno no debe comprometer el otro).'
    );
  }
}

/**
 * Valida que MONGO_URI tenga formato correcto.
 * @throws {Error} Si el formato es inválido
 */
function validateMongoURI() {
  const mongoUri = process.env.MONGO_URI;

  // Validar que empiece con mongodb:// o mongodb+srv://
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    throw new Error(
      `MONGO_URI tiene formato inválido.\n` +
        `Debe empezar con 'mongodb://' o 'mongodb+srv://'.\n` +
        `Valor actual: ${mongoUri.substring(0, 30)}...`
    );
  }

  // Validar que no esté vacío después del protocolo
  const uriWithoutProtocol = mongoUri.replace(/^mongodb(\+srv)?:\/\//, '');
  if (uriWithoutProtocol.length === 0) {
    throw new Error(`MONGO_URI está incompleto.\n` + `Debe incluir host y base de datos.`);
  }
}

/**
 * Valida que REDIS_URL tenga formato correcto.
 * Soporta redis:// y rediss:// (TLS).
 * @throws {Error} Si el formato es inválido
 */
function validateRedisURL() {
  const redisUrl = process.env.REDIS_URL;

  // Validar que empiece con redis:// o rediss://
  if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    throw new Error(
      `REDIS_URL tiene formato inválido.\n` +
        `Debe empezar con 'redis://' o 'rediss://' (TLS).\n` +
        `Ejemplo: redis://localhost:6379 o rediss://user:pass@host:6379`
    );
  }

  // Validar que se pueda parsear como URL
  try {
    const url = new URL(redisUrl);
    if (!url.hostname) {
      throw new Error('Falta hostname en REDIS_URL');
    }
  } catch (error) {
    throw new Error(
      `REDIS_URL no es una URL válida.\n` +
        `Error: ${error.message}\n` +
        `Ejemplo correcto: redis://localhost:6379`
    );
  }
}

/**
 * Valida que JWT_EXPIRES_IN o JWT_REFRESH_EXPIRES_IN tengan formato correcto.
 * Formato esperado: número seguido de unidad (s, m, h, d). Ej: "15m", "30d".
 * @param {string} varName - Nombre de la variable de entorno
 * @param {string} value - Valor a validar
 * @throws {Error} Si el formato es inválido
 */
function validateJWTExpiresIn(varName, value) {
  const pattern = /^\d+[smhd]$/;
  if (!pattern.test(value)) {
    throw new Error(
      `${varName} tiene formato inválido: "${value}".\n` +
        `Debe ser un número seguido de una unidad de tiempo (s, m, h, d).\n` +
        `Ejemplo: "15m", "30d", "1h", "3600s"`
    );
  }
}

/**
 * Valida que PORT sea un número entre 1024 y 65535.
 * @throws {Error} Si el valor está fuera de rango o no es numérico
 */
function validatePort() {
  const port = Number(process.env.PORT);
  if (Number.isNaN(port) || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(
      `PORT tiene un valor inválido: "${process.env.PORT}".\n` +
        `Debe ser un número entero entre 1024 y 65535.\n` +
        `Ejemplo: 5000`
    );
  }
}

/**
 * Valida que LOG_SAMPLE_RATE sea un número entre 0 y 1 (inclusivo).
 * @throws {Error} Si el valor está fuera de rango o no es numérico
 */
function validateLogSampleRate() {
  const rate = Number(process.env.LOG_SAMPLE_RATE);
  if (Number.isNaN(rate) || rate < 0 || rate > 1) {
    throw new Error(
      `LOG_SAMPLE_RATE tiene un valor inválido: "${process.env.LOG_SAMPLE_RATE}".\n` +
        `Debe ser un número entre 0 y 1 (inclusivo).\n` +
        `Ejemplo: 0.5`
    );
  }
}

/**
 * Valida que SHUTDOWN_TIMEOUT_MS sea un entero positivo.
 * @throws {Error} Si el valor no es un entero positivo
 */
function validateShutdownTimeout() {
  const timeout = Number(process.env.SHUTDOWN_TIMEOUT_MS);
  if (Number.isNaN(timeout) || !Number.isInteger(timeout) || timeout <= 0) {
    throw new Error(
      `SHUTDOWN_TIMEOUT_MS tiene un valor inválido: "${process.env.SHUTDOWN_TIMEOUT_MS}".\n` +
        `Debe ser un número entero positivo.\n` +
        `Ejemplo: 10000`
    );
  }
}

/**
 * Valida que APP_ENV (cuando está definido) sea uno de los valores permitidos.
 * APP_ENV identifica el entorno cloud (staging|production) sin depender de NODE_ENV,
 * que en cloud siempre debería ser "production" para optimizaciones de runtime.
 * @throws {Error} Si APP_ENV tiene un valor no permitido
 */
function validateAppEnv() {
  const appEnv = process.env.APP_ENV.trim().toLowerCase();
  if (!ALLOWED_APP_ENVS.includes(appEnv)) {
    throw new Error(
      `APP_ENV tiene un valor inválido: "${process.env.APP_ENV}".\n` +
        `Valores permitidos: ${ALLOWED_APP_ENVS.join(', ')}`
    );
  }
  process.env.APP_ENV = appEnv;
}

/**
 * Avisa (no bloquea) si `REDIS_KEY_PREFIX` no incluye el nombre del entorno
 * cuando `APP_ENV` está definido. Caso real: en cloud free tier puede
 * compartirse una sola DB Upstash entre staging y prod (Secrets_Rotation.md
 * §Redis). Sin un prefix distinto por entorno se mezclarían sessions y
 * caches — equivale a data contamination silenciosa.
 *
 * No tiramos el boot (`logger.warn`, no `throw`) porque hay setups legítimos
 * con DB Upstash separada por entorno donde el prefix no necesita codificar
 * el nombre. La señal sirve para descubrir misconfiguraciones operativas.
 */
function validateRedisKeyPrefixForEnv() {
  const appEnv = process.env.APP_ENV;
  if (!appEnv) {
    return; // Local dev sin APP_ENV — no aplica
  }
  if (appEnv === 'development') {
    return;
  }

  const prefix = (process.env.REDIS_KEY_PREFIX || '').toLowerCase();
  if (!prefix) {
    return; // No prefix configurado — otro warning lo cubre en redis.js
  }

  if (!prefix.includes(appEnv)) {
    logger.warn(
      `REDIS_KEY_PREFIX="${process.env.REDIS_KEY_PREFIX}" no incluye "${appEnv}". ` +
        'Si Upstash se comparte entre staging y prod, esto puede causar ' +
        `colisiones de keys. Recomendado: REDIS_KEY_PREFIX="eduplay:${appEnv}:".`
    );
  }
}

/**
 * Valida que SEED_ON_BOOT (cuando está definido) sea "true" o "false".
 * Sólo se debería activar en el servicio api-staging para auto-poblar datos
 * tras un reset del cluster. En producción siempre "false" o ausente.
 * @throws {Error} Si SEED_ON_BOOT tiene un valor no booleano
 */
function validateSeedOnBoot() {
  const value = process.env.SEED_ON_BOOT.trim().toLowerCase();
  if (value !== 'true' && value !== 'false') {
    throw new Error(
      `SEED_ON_BOOT tiene un valor inválido: "${process.env.SEED_ON_BOOT}".\n` +
        `Debe ser "true" o "false".`
    );
  }
  process.env.SEED_ON_BOOT = value;

  // Guardrail: si APP_ENV=production y SEED_ON_BOOT=true, advertir.
  // No bloqueamos por si el usuario sabe lo que hace (reset programado de prod),
  // pero queda en el log para revisar.
  if (process.env.APP_ENV === 'production' && value === 'true') {
    logger.warn(
      'SEED_ON_BOOT=true en APP_ENV=production: se ejecutará seed:if-empty contra ' +
        'la base de datos productiva. Revisar que es el comportamiento deseado.'
    );
  }
}

module.exports = {
  validateEnv
};
