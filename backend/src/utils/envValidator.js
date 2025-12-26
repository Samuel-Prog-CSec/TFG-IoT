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
  'REDIS_HOST',
  'REDIS_PORT'
];

/**
 * Valida que todas las variables requeridas estén configuradas.
 * @throws {Error} Si falta alguna variable crítica
 */
function validateEnv() {
  const missing = [];
  const warnings = [];
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  // En tests, permitir defaults para no bloquear la suite
  if (isTest) {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-jwt-secret-'.padEnd(40, 'x');
      warnings.push('JWT_SECRET (default test)');
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-'.padEnd(48, 'y');
      warnings.push('JWT_REFRESH_SECRET (default test)');
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

  // RFID: SERIAL_PORT solo es obligatorio si RFID_ENABLED=true
  if (process.env.RFID_ENABLED === 'true' && !process.env.SERIAL_PORT) {
    if (isProduction) {
      missing.push('SERIAL_PORT');
    } else {
      warnings.push('SERIAL_PORT (RFID_ENABLED=true pero falta puerto)');
    }
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

  // Warnings para recomendadas
  if (warnings.length > 0) {
    logger.warn('Variables de entorno recomendadas no configuradas (usando defaults):', warnings);
  }

  logger.info('Validación de variables de entorno completada exitosamente');
}

/**
 * Valida que los JWT secrets tengan longitud y complejidad adecuadas.
 * @throws {Error} Si algún secret es inseguro
 */
function validateJWTSecrets() {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

  if (jwtSecret.length < 32) {
    throw new Error(
      `JWT_SECRET es demasiado corto (${jwtSecret.length} caracteres).\n` +
        `Debe tener al menos 32 caracteres para ser seguro.\n` +
        `Genera uno aleatorio con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
    );
  }

  if (jwtRefreshSecret.length < 32) {
    throw new Error(
      `JWT_REFRESH_SECRET es demasiado corto (${jwtRefreshSecret.length} caracteres).\n` +
        `Debe tener al menos 32 caracteres para ser seguro.\n` +
        `Genera uno aleatorio con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
    );
  }

  // Validar que no sean valores por defecto conocidos
  const insecureDefaults = [
    'dev-secret-change-in-production',
    'dev-refresh-secret-change-in-production',
    'secret',
    'mysecret',
    'changeme',
    'your-secret-here'
  ];

  if (insecureDefaults.includes(jwtSecret.toLowerCase())) {
    throw new Error(
      `JWT_SECRET contiene un valor por defecto inseguro.\n` + `Genera un secret aleatorio único.`
    );
  }

  if (insecureDefaults.includes(jwtRefreshSecret.toLowerCase())) {
    throw new Error(
      `JWT_REFRESH_SECRET contiene un valor por defecto inseguro.\n` +
        `Genera un secret aleatorio único.`
    );
  }

  // Validar que access y refresh secrets sean diferentes
  if (jwtSecret === jwtRefreshSecret) {
    logger.warn(
      'JWT_SECRET y JWT_REFRESH_SECRET son idénticos. ' +
        'Se recomienda usar secrets diferentes para mayor seguridad.'
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

module.exports = {
  validateEnv
};
