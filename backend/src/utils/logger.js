/**
 * @fileoverview Configuración del sistema de logging con Pino.
 * Logging estructurado con redacción de datos sensibles y trazabilidad.
 * @module utils/logger
 */

const pino = require('pino');
const pkg = require('../../package.json');

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

// En tests, por defecto se silencia. Permite override explícito:
//   LOG_LEVEL=debug npm test
const isSilentInTest = isTest && !process.env.LOG_LEVEL;
const logLevel = isSilentInTest
  ? 'silent'
  : process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const transport =
  !isProduction && !isTest
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      })
    : undefined;

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.set-cookie',
  'req.body.password',
  'req.body.token',
  'req.body.accessToken',
  'req.body.refreshToken',
  'res.headers.set-cookie',
  'user.password',
  'user.email',
  'token',
  'accessToken',
  'refreshToken',
  'authorization'
];

const logger = pino(
  {
    level: logLevel,
    base: {
      service: 'rfid-games-backend',
      env: process.env.NODE_ENV || 'development',
      version: pkg.version
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: redactPaths,
      censor: '[REDACTED]'
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res
    },
    hooks: {
      logMethod(args, method) {
        const [first, second, ...rest] = args;
        const isFirstString = typeof first === 'string';
        const isSecondObject = second && typeof second === 'object' && !Array.isArray(second);

        // Compatibilidad con firma logger.info('msg', { meta })
        if (isFirstString && isSecondObject) {
          return method.apply(this, [second, first, ...rest]);
        }

        return method.apply(this, args);
      }
    }
  },
  transport
);

module.exports = logger;
