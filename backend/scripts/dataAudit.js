/**
 * @fileoverview Script de auditoría automática de datos personales en modelos Mongoose.
 *
 * Introspecciona los esquemas de User, GamePlay y GameSession para verificar
 * que todos los campos con datos personales (PII) están correctamente
 * clasificados según el Registro de Actividades de Tratamiento (RAT).
 *
 * Detecta:
 *   - Campos PII no clasificados (gaps de cobertura)
 *   - Estudiantes con birthdate definido (debería ser 0 tras migración)
 *   - Estudiantes sin consentimiento registrado
 *   - GamePlays candidatos a anonimización (>12 meses)
 *
 * Uso:
 *   node backend/scripts/dataAudit.js
 *
 * Exit codes:
 *   0 — Auditoría correcta, sin gaps ni métricas fuera de rango
 *   1 — Se encontraron campos sin clasificar o métricas fuera de rango
 *
 * @requires mongoose
 * @requires pino
 */

const mongoose = require('mongoose');
const pino = require('pino');

// --- Configuración del logger ---
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' }
  }
});

// --- Constantes ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid_games';

// Umbral de antigüedad para candidatos a anonimización (12 meses)
const ANONYMIZATION_THRESHOLD_MONTHS = 12;

// Campos internos de Mongoose/MongoDB que no son PII y deben ignorarse
const IGNORED_FIELDS = new Set(['_id', '__v', 'id', 'createdAt', 'updatedAt']);

// Prefijos de campos internos de subdocumentos que no son PII
const IGNORED_PREFIXES = [
  'cardMappings._id',
  'boardLayout._id',
  'associationChallengePlan._id',
  'events._id'
];

/**
 * Mapa de clasificación de campos PII por modelo.
 * Cada entrada documenta la clasificación, propósito y referencia al RAT.
 */
const PII_CLASSIFICATION = {
  User: {
    name: {
      classification: 'PII',
      purpose: 'Identificación del estudiante por el profesor',
      ratReference: 'AT-01'
    },
    email: { classification: 'PII', purpose: 'Autenticación de profesores', ratReference: 'AT-04' },
    password: { classification: 'CREDENTIAL', purpose: 'Autenticación', ratReference: 'AT-04' },
    'profile.age': {
      classification: 'PII',
      purpose: 'Contextualización pedagógica',
      ratReference: 'AT-01'
    },
    'profile.classroom': {
      classification: 'PII',
      purpose: 'Organización por grupos',
      ratReference: 'AT-01'
    },
    'profile.birthdate': {
      classification: 'PII_ELIMINATED',
      purpose: 'ELIMINADO por minimización (Art. 5.1.c RGPD)',
      ratReference: 'AT-01'
    },
    'profile.avatar': {
      classification: 'INDIRECT',
      purpose: 'Personalización visual',
      ratReference: 'AT-01'
    },
    createdBy: {
      classification: 'REFERENCE',
      purpose: 'Relación profesor-alumno',
      ratReference: 'AT-01'
    },
    assignedTeacher: {
      classification: 'REFERENCE',
      purpose: 'Asignación responsable',
      ratReference: 'AT-01'
    },
    lastLoginAt: {
      classification: 'METADATA',
      purpose: 'Último acceso (solo profesores)',
      ratReference: 'AT-04'
    },
    'consent.grantedBy': {
      classification: 'PII',
      purpose: 'Nombre del tutor legal',
      ratReference: 'AT-01'
    },
    'studentMetrics.averageResponseTime': {
      classification: 'BEHAVIORAL',
      purpose: 'Seguimiento pedagógico',
      ratReference: 'AT-03'
    },
    'studentMetrics.lastPlayedAt': {
      classification: 'METADATA',
      purpose: 'Última actividad',
      ratReference: 'AT-03'
    }
  },
  GamePlay: {
    playerId: {
      classification: 'PII_REFERENCE',
      purpose: 'Vinculación partida-estudiante',
      ratReference: 'AT-02'
    },
    'events.cardUid': {
      classification: 'DEVICE_ID',
      purpose: 'Identificación de tarjeta RFID',
      ratReference: 'AT-07'
    },
    'events.timeElapsed': {
      classification: 'BEHAVIORAL',
      purpose: 'Tiempo de respuesta',
      ratReference: 'AT-02'
    },
    'events.timestamp': {
      classification: 'METADATA',
      purpose: 'Momento del evento',
      ratReference: 'AT-02'
    }
  },
  GameSession: {
    createdBy: { classification: 'REFERENCE', purpose: 'Profesor creador', ratReference: 'AT-04' },
    'cardMappings.uid': {
      classification: 'DEVICE_ID',
      purpose: 'UID tarjeta RFID',
      ratReference: 'AT-07'
    }
  }
};

/**
 * Conecta a MongoDB usando mongoose.
 *
 * @async
 * @returns {Promise<void>}
 */
const connect = async () => {
  await mongoose.connect(MONGODB_URI);
  logger.info(`Conectado a MongoDB: ${mongoose.connection.host}`);
};

/**
 * Desconecta de MongoDB de forma controlada.
 *
 * @async
 * @returns {Promise<void>}
 */
const disconnect = async () => {
  await mongoose.connection.close();
  logger.info('Conexión a MongoDB cerrada');
};

/**
 * Determina si un campo del esquema podría contener PII basándose en su nombre.
 * Heurística para detectar gaps de clasificación.
 *
 * @param {string} fieldPath - Ruta del campo (ej. "profile.age")
 * @returns {boolean} true si el campo podría contener PII
 */
const isPotentialPiiField = fieldPath => {
  const piiIndicators = [
    'name',
    'email',
    'password',
    'phone',
    'address',
    'birth',
    'age',
    'avatar',
    'photo',
    'image',
    'ip',
    'device',
    'location',
    'consent',
    'uid',
    'player',
    'teacher',
    'creator',
    'assignedTo',
    'grantedBy',
    'guardian',
    'fingerprint',
    'token',
    'credential',
    'login'
  ];

  const lowerPath = fieldPath.toLowerCase();
  return piiIndicators.some(indicator => lowerPath.includes(indicator));
};

/**
 * Determina si un campo debe ser ignorado en la auditoría.
 *
 * @param {string} fieldPath - Ruta del campo
 * @returns {boolean} true si el campo debe ignorarse
 */
const shouldIgnoreField = fieldPath => {
  if (IGNORED_FIELDS.has(fieldPath)) {
    return true;
  }

  return IGNORED_PREFIXES.some(prefix => fieldPath === prefix);
};

/**
 * Extrae todos los paths de un esquema Mongoose, incluyendo subdocumentos.
 *
 * @param {import('mongoose').Schema} schema - Esquema Mongoose
 * @returns {string[]} Lista de paths del esquema
 */
const extractSchemaPaths = schema => {
  const paths = [];

  for (const [pathName] of Object.entries(schema.paths)) {
    if (!shouldIgnoreField(pathName)) {
      paths.push(pathName);
    }
  }

  return paths;
};

/**
 * Audita un modelo individual: cruza los campos del esquema contra la
 * clasificación PII y detecta gaps.
 *
 * @param {string} modelName - Nombre del modelo (ej. "User")
 * @param {import('mongoose').Model} Model - Modelo Mongoose
 * @returns {{ classified: Array, gaps: Array }} Campos clasificados y gaps encontrados
 */
const auditModel = (modelName, Model) => {
  const schemaPaths = extractSchemaPaths(Model.schema);
  const classification = PII_CLASSIFICATION[modelName] || {};

  const classified = [];
  const gaps = [];

  // Registrar campos que están en la clasificación PII
  for (const [field, info] of Object.entries(classification)) {
    classified.push({
      field,
      classification: info.classification,
      purpose: info.purpose,
      ratReference: info.ratReference,
      existsInSchema: schemaPaths.includes(field)
    });
  }

  // Detectar campos del esquema que podrían contener PII pero no están clasificados
  for (const path of schemaPaths) {
    const isClassified = Object.hasOwn(classification, path);

    if (!isClassified && isPotentialPiiField(path)) {
      gaps.push(path);
    }
  }

  return { classified, gaps };
};

/**
 * Imprime la tabla de clasificación de un modelo con formato legible.
 *
 * @param {string} modelName - Nombre del modelo
 * @param {Array} classified - Campos clasificados
 */
const printClassificationTable = (modelName, classified) => {
  logger.info(`--- Modelo: ${modelName} ---`);

  // Encabezado de tabla
  const header =
    'Campo'.padEnd(40) +
    '| ' +
    'Clasificación'.padEnd(18) +
    '| ' +
    'Propósito'.padEnd(50) +
    '| ' +
    'RAT';

  const separator = '-'.repeat(header.length);

  logger.info(header);
  logger.info(separator);

  for (const entry of classified) {
    const schemaNote = entry.existsInSchema ? '' : ' [NO EN ESQUEMA]';
    const line =
      (entry.field + schemaNote).padEnd(40) +
      '| ' +
      entry.classification.padEnd(18) +
      '| ' +
      entry.purpose.padEnd(50) +
      '| ' +
      entry.ratReference;

    logger.info(line);
  }

  logger.info('');
};

/**
 * Imprime los gaps encontrados (campos sin clasificar que podrían ser PII).
 *
 * @param {string} modelName - Nombre del modelo
 * @param {string[]} gaps - Campos sin clasificar
 */
const printGaps = (modelName, gaps) => {
  if (gaps.length === 0) {
    logger.info(`[${modelName}] Sin gaps — todos los campos PII potenciales están clasificados`);
  } else {
    logger.warn(`[${modelName}] ${gaps.length} campo(s) sin clasificar (GAPS):`);
    for (const gap of gaps) {
      logger.warn(`  - ${gap}`);
    }
  }

  logger.info('');
};

/**
 * Ejecuta las consultas de métricas de cumplimiento contra la base de datos.
 *
 * @async
 * @param {import('mongoose').Model} User - Modelo User
 * @param {import('mongoose').Model} GamePlay - Modelo GamePlay
 * @returns {Promise<Object>} Métricas de cumplimiento
 */
const queryComplianceMetrics = async (User, GamePlay) => {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - ANONYMIZATION_THRESHOLD_MONTHS);

  const [totalStudents, withBirthdate, withoutConsent, anonymizationCandidates] = await Promise.all(
    [
      // Total de estudiantes
      User.countDocuments({ role: 'student' }),

      // Estudiantes con birthdate definido (debería ser 0 tras migración)
      User.countDocuments({
        role: 'student',
        'profile.birthdate': { $exists: true, $ne: null }
      }),

      // Estudiantes sin consentimiento registrado (debería ser 0)
      User.countDocuments({
        role: 'student',
        'consent.granted': { $ne: true }
      }),

      // GamePlays completados hace más de 12 meses (candidatos a anonimización)
      GamePlay.countDocuments({
        playerId: { $exists: true, $ne: null },
        completedAt: { $lt: twelveMonthsAgo }
      })
    ]
  );

  return { totalStudents, withBirthdate, withoutConsent, anonymizationCandidates };
};

/**
 * Imprime las métricas de cumplimiento con indicadores de estado.
 *
 * @param {Object} metrics - Métricas de cumplimiento
 * @returns {boolean} true si todas las métricas son correctas
 */
const printComplianceMetrics = metrics => {
  logger.info('--- Métricas de cumplimiento ---');

  logger.info(`Estudiantes totales: ${metrics.totalStudents}`);

  const birthdateOk = metrics.withBirthdate === 0;
  logger.info(
    `Con birthdate (debería ser 0): ${metrics.withBirthdate} ${birthdateOk ? '[OK]' : '[ALERTA]'}`
  );

  const consentOk = metrics.withoutConsent === 0;
  logger.info(
    `Sin consentimiento (debería ser 0): ${metrics.withoutConsent} ${consentOk ? '[OK]' : '[ALERTA]'}`
  );

  logger.info(
    `GamePlays candidatos a anonimización (>12 meses): ${metrics.anonymizationCandidates}`
  );

  if (metrics.anonymizationCandidates > 0) {
    logger.warn(
      `Hay ${metrics.anonymizationCandidates} partida(s) que superan el umbral de ${ANONYMIZATION_THRESHOLD_MONTHS} meses y deberían considerarse para anonimización`
    );
  }

  logger.info('');

  return birthdateOk && consentOk;
};

/**
 * Función principal de auditoría. Ejecuta todas las verificaciones.
 *
 * @async
 * @returns {Promise<void>}
 */
const audit = async () => {
  logger.info('=== AUDITORÍA DE DATOS PERSONALES ===');
  logger.info(`Fecha: ${new Date().toISOString().split('T')[0]}`);
  logger.info('');

  let hasGaps = false;
  let metricsOk = true;

  try {
    // Importar modelos (se hace aquí para que mongoose esté registrado)
    const User = require('../src/models/User');
    const GamePlay = require('../src/models/GamePlay');
    const GameSession = require('../src/models/GameSession');

    const models = { User, GamePlay, GameSession };

    // --- Fase 1: Auditoría de esquemas (no requiere conexión a BD) ---
    logger.info('--- Fase 1: Clasificación de campos PII ---');
    logger.info('');

    const allGaps = [];

    for (const [modelName, Model] of Object.entries(models)) {
      const { classified, gaps } = auditModel(modelName, Model);

      printClassificationTable(modelName, classified);
      printGaps(modelName, gaps);

      if (gaps.length > 0) {
        hasGaps = true;
        allGaps.push(...gaps.map(g => `${modelName}.${g}`));
      }
    }

    // --- Fase 2: Métricas de cumplimiento (requiere conexión a BD) ---
    logger.info('--- Fase 2: Métricas de cumplimiento (conexión a BD) ---');
    logger.info('');

    await connect();

    const metrics = await queryComplianceMetrics(User, GamePlay);
    metricsOk = printComplianceMetrics(metrics);

    // --- Resumen final ---
    logger.info('=== RESUMEN DE AUDITORÍA ===');

    if (hasGaps) {
      logger.error(`GAPS encontrados: ${allGaps.length} campo(s) PII sin clasificar`);
      for (const gap of allGaps) {
        logger.error(`  - ${gap}`);
      }
    } else {
      logger.info('Clasificación PII: COMPLETA — sin gaps');
    }

    if (!metricsOk) {
      logger.error('Métricas de cumplimiento: FUERA DE RANGO — revisar alertas');
    } else {
      logger.info('Métricas de cumplimiento: CORRECTAS');
    }

    // Determinar exit code
    if (hasGaps || !metricsOk) {
      logger.error('Auditoría finalizada con ERRORES — exit code 1');
      process.exitCode = 1;
    } else {
      logger.info('Auditoría finalizada correctamente — exit code 0');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error durante la auditoría');
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
};

audit();
