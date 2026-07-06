/**
 * @fileoverview Configuración y gestión de la conexión a MongoDB.
 * Maneja conexión, desconexión y eventos de la base de datos.
 * @module config/database
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Establece la conexión con la base de datos MongoDB.
 *
 * La URI de conexión se obtiene de la variable de entorno MONGODB_URI.
 * Configura event listeners para monitorear el estado de la conexión.
 *
 * @async
 * @returns {Promise<mongoose.Connection>} Promesa que resuelve con la conexión establecida
 * @throws {Error} Si falla la conexión inicial, termina el proceso con exit(1)
 * @example
 * const { connectDB } = require('./config/database');
 *
 * await connectDB();
 * // MongoDB conectado y listo para usar
 */
/**
 * Opciones de pool y resiliencia para producción.
 * Tuneadas originalmente para MongoDB Atlas M0 free tier (replica set de 3
 * nodos en red compartida); siguen aplicando con Mongo autoalojado en el
 * mismo host (VPS) porque gobiernan el pool y los timeouts, no el transporte.
 * - maxPoolSize 10: holgado para 1 instancia api; M0 permitía hasta 500 conexiones.
 * - minPoolSize 2: mantiene 2 conexiones calientes para evitar cold start en cada query tras idle.
 * - serverSelectionTimeoutMS 10s: tolera cold start ocasional (Atlas M0 o arranque del contenedor).
 * - socketTimeoutMS 45s: corta queries colgadas sin matar la conexión.
 * - heartbeatFrequencyMS 30s: detecta failover del replica set sin saturar.
 * - retryReads/Writes + w:'majority': requiere replica set (Atlas y el rs0 de un
 *   solo nodo autoalojado lo cumplen).
 * - A.7 — maxIdleTimeMS 60s: libera conexiones idle del pool tras 60s sin
 *   uso. Bajo carga normal mantiene minPoolSize=2 vivas; bajo carga puntual
 *   permite re-uso eficiente sin acaparar el budget de 100 conn del cluster.
 *   Relevante para escala horizontal futura (T-908 multi-pod).
 *
 * NO hay `compressors` (a diferencia de la versión pre-VPS, ADR-176): el
 * driver `mongodb` v7 exige que el módulo nativo opcional del compresor
 * negociado (`snappy` / `@mongodb-js/zstd`) esté instalado — si no lo está,
 * NO degrada a wire sin comprimir, lanza `MongoMissingDependencyError` en el
 * primer comando real (verificado: `GameSession.updateMany` reventaba en
 * cada arranque de `migrate:sessions` bajo NODE_ENV=production). Esos módulos
 * son `peerDependencies` opcionales del propio paquete `mongodb`
 * (`peerDependenciesMeta.optional: true`) — npm NUNCA los instala
 * automáticamente en ningún modo de instalación (no es un efecto de `npm ci
 * --only=production`; ni siquiera un `npm install` completo con devDependencies
 * los trae). Con Mongo autoalojado en la misma red Docker que el backend (sin
 * el salto WAN de Atlas que motivó ADR-176) el ahorro de bytes ya no compensa
 * el coste de añadir esa dependencia nativa opcional a mano (toolchain de
 * compilación en la imagen Alpine, superficie de código nativo adicional).
 *
 * En desarrollo y test se usan defaults de Mongoose para no asumir replica set
 * (mongodb-memory-server y MongoDB local single-node pueden no soportar w:'majority').
 */
const productionConnectOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 60_000,
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  heartbeatFrequencyMS: 30_000,
  retryReads: true,
  retryWrites: true,
  w: 'majority'
};

const connectDB = async () => {
  try {
    const connectOptions = process.env.NODE_ENV === 'production' ? productionConnectOptions : {};
    const conn = await mongoose.connect(process.env.MONGO_URI, connectOptions);

    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Listeners de eventos de conexión
    mongoose.connection.on('error', err => {
      logger.error(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    return process.exit(1);
  }
};

/**
 * Cierra la conexión con MongoDB de forma controlada.
 * Debe ser llamado al finalizar la aplicación para liberar recursos.
 *
 * @async
 * @returns {Promise<void>}
 * @example
 * const { disconnectDB } = require('./config/database');
 *
 * // Al cerrar el servidor
 * await disconnectDB();
 */
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    logger.info('Conexión a MongoDB cerrada');
  } catch (error) {
    logger.error(`Error al cerrar la conexión a MongoDB: ${error.message}`);
  }
};

module.exports = { connectDB, disconnectDB };
