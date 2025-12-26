/**
 * @fileoverview Configuración del sistema de logging con Winston.
 * Gestiona logs en consola y archivos con diferentes niveles de severidad.
 * @module utils/logger
 */

const winston = require('winston');

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

// En tests, por defecto se silencia. Permite override explícito para debugging:
//   LOG_LEVEL=debug npm test
const isSilentInTest = isTest && !process.env.LOG_LEVEL;
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

/**
 * Logger centralizado de la aplicación.
 *
 * Configuración:
 * - En desarrollo: nivel 'debug', logs coloridos en consola
 * - En producción: nivel 'info', logs en JSON
 * - Guarda errores en 'logs/error.log'
 * - Guarda todos los logs en 'logs/combined.log'
 * - Rotación automática de archivos (máximo 5 archivos de 5MB cada uno)
 *
 * Niveles de log disponibles (menor a mayor severidad):
 * - debug: Información detallada para debugging
 * - info: Mensajes informativos generales
 * - warn: Advertencias que no impiden la ejecución
 * - error: Errores que requieren atención
 *
 * @type {winston.Logger}
 * @example
 * const logger = require('./utils/logger');
 *
 * logger.debug('Información detallada de debugging');
 * logger.info('Servidor iniciado en puerto 5000');
 * logger.warn('La base de datos está respondiendo lento');
 * logger.error('Error al conectar con el sensor RFID', { error: err.message });
 */
const logger = winston.createLogger({
  level: logLevel,
  silent: isSilentInTest,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'rfid-games-backend' },
  transports: isTest
    ? [new winston.transports.Console({ silent: isSilentInTest })]
    : [
        // Salida a consola con formato legible y colores
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(
              ({ timestamp, level, message, ...meta }) =>
                `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`
            )
          )
        }),
        // Archivo para solo errores
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        // Archivo para todos los logs
        new winston.transports.File({
          filename: 'logs/combined.log',
          maxsize: 5242880,
          maxFiles: 5
        })
      ]
});

module.exports = logger;
