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
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Listeners de eventos de conexión
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    // Cierre controlado de la aplicación (Ctrl+C)
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
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
