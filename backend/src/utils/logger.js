/**
 * @fileoverview Configuración del sistema de logging con Pino.
 * Logging estructurado con redacción de datos sensibles y trazabilidad.
 *
 * T-904 Fase B: multistream opcional con `pino-loki` para log shipping a
 * Grafana Cloud Loki. Si `LOG_SHIPPING_ENABLED!=true` o faltan credenciales,
 * el logger degrada silenciosamente a stdout-only sin romper el proceso.
 *
 * @module utils/logger
 */

const pino = require('pino');
const pkg = require('../../package.json');

const isTest = process.env.NODE_ENV === 'test';
const isProduction = process.env.NODE_ENV === 'production';

// En tests, por defecto se silencia. Permite override explícito:
//   LOG_LEVEL=debug npm test
const isSilentInTest = isTest && !process.env.LOG_LEVEL;

let logLevel;
if (isSilentInTest) {
  logLevel = 'silent';
} else if (process.env.LOG_LEVEL) {
  logLevel = process.env.LOG_LEVEL;
} else {
  logLevel = isProduction ? 'info' : 'debug';
}

const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers.set-cookie',
  'req.headers["x-csrf-token"]',
  'req.headers["x-mfa-token"]',
  'req.body.password',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.token',
  'req.body.accessToken',
  'req.body.refreshToken',
  'req.body.captchaToken',
  'req.body.code',
  'req.body.backupCode',
  'req.body.mfa',
  'res.headers.set-cookie',
  'user.password',
  'user.email',
  'user.mfa',
  'user.mfa.secret',
  'user.mfa.backupCodes',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'mfaSecret',
  'backupCodes'
];

/**
 * Regex para chars de control U+0000-U+001F y U+007F. Construida en runtime
 * con `String.fromCharCode` para evitar que herramientas de edición que
 * procesan escapes Unicode (escapes literales como U+0000) interpreten los literales y los
 * sustituyan por bytes reales en el archivo fuente — eso ha roto el redactor
 * previamente.
 */
// eslint-disable-next-line regexp/no-obscure-range -- Intencional: el rango U+0000-U+001F cubre TODO el control set ASCII (NUL, BS, TAB, LF, VT, FF, CR, ESC, etc.). Es el redactor canónico contra log injection y debe ser explícito.
const CONTROL_CHAR_RANGE = `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`;
const CONTROL_CHARS_REGEX = new RegExp(CONTROL_CHAR_RANGE, 'g');

/**
 * Resuelve si `pino-pretty` está disponible. En contenedores production con
 * `npm ci --only=production` no se instala, así que evitamos el require fatal.
 *
 * @returns {boolean}
 */
const hasPinoPretty = () => {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
};

/**
 * Resuelve si `pino-loki` está instalado.
 *
 * @returns {boolean}
 */
const hasPinoLoki = () => {
  try {
    require.resolve('pino-loki');
    return true;
  } catch {
    return false;
  }
};

/**
 * Decide si los logs deben enviarse a Grafana Cloud Loki. Requiere:
 * - LOG_SHIPPING_ENABLED=true
 * - LOG_SHIPPING_HOST + LOG_SHIPPING_TOKEN definidos
 * - `pino-loki` instalado
 *
 * Si falta cualquiera, degradamos a stdout-only sin lanzar.
 *
 * @returns {boolean}
 */
const shouldShipToLoki = () => {
  if (process.env.LOG_SHIPPING_ENABLED !== 'true') {
    return false;
  }
  if (!process.env.LOG_SHIPPING_HOST || !process.env.LOG_SHIPPING_TOKEN) {
    // Aviso directo a stderr — el logger todavía no existe en este punto del boot.
    process.stderr.write(
      '[logger] LOG_SHIPPING_ENABLED=true pero faltan LOG_SHIPPING_HOST o LOG_SHIPPING_TOKEN — shipping deshabilitado.\n'
    );
    return false;
  }
  if (!hasPinoLoki()) {
    process.stderr.write(
      '[logger] LOG_SHIPPING_ENABLED=true pero `pino-loki` no está instalado — shipping deshabilitado.\n'
    );
    return false;
  }
  return true;
};

/**
 * Construye el transport (o multistream) de Pino según entorno y env vars.
 *
 * - dev/test con pino-pretty: pretty colorize a stdout.
 * - dev/test sin pino-pretty: JSON a stdout (sin transport, Pino default).
 * - prod sin Loki: JSON a stdout (sin transport, Pino default).
 * - prod con Loki: multistream → JSON stdout + pino-loki batch.
 *
 * @param {Object} [options]
 * @param {string} [options.serviceLabel] Override del label `service` (backend|worker).
 * @returns {import('pino').DestinationStream|undefined}
 */
function buildTransport({ serviceLabel = 'backend' } = {}) {
  const targets = [];

  // Pretty en dev/test sólo si la dep está disponible.
  if (!isProduction && !isTest && hasPinoPretty()) {
    targets.push({
      target: 'pino-pretty',
      level: logLevel,
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    });
  }

  // Loki opt-in.
  if (shouldShipToLoki()) {
    targets.push({
      target: 'pino-loki',
      level: process.env.LOG_SHIPPING_LEVEL || 'info',
      options: {
        host: process.env.LOG_SHIPPING_HOST,
        basicAuth: {
          username: process.env.LOG_SHIPPING_USER || '',
          password: process.env.LOG_SHIPPING_TOKEN
        },
        labels: {
          app: 'eduplay-rfid',
          env: process.env.APP_ENV || process.env.NODE_ENV || 'development',
          service: serviceLabel,
          version: pkg.version
        },
        batching: true,
        interval: Number.parseInt(process.env.LOG_SHIPPING_INTERVAL_S, 10) || 5,
        // Promueve a label cualquier campo `component` del log (útil para LogQL).
        propsToLabels: ['component']
      }
    });
    process.stderr.write(
      `[logger] Loki shipping inicializado (host=${process.env.LOG_SHIPPING_HOST}, service=${serviceLabel}).\n`
    );
  }

  if (targets.length === 0) {
    return undefined;
  }
  if (targets.length === 1) {
    return pino.transport(targets[0]);
  }
  return pino.transport({ targets });
}

/**
 * Crea una instancia de logger Pino base con redacción, bindings de servicio
 * y soporte multistream opcional. Exportado como factoría para que `worker.js`
 * pueda crear un logger con `serviceLabel='worker'` sin reabrir el archivo.
 *
 * @param {Object} [options]
 * @param {string} [options.serviceLabel='backend']
 * @returns {import('pino').Logger}
 */
function buildLogger({ serviceLabel = process.env.LOG_SERVICE_LABEL || 'backend' } = {}) {
  const transport = buildTransport({ serviceLabel });
  return pino(
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
        res: pino.stdSerializers.res,
        // Sanitiza chars de control en inputs de usuario para prevenir log
        // injection/forgery. Usar: logger.info({ userInput: name }, 'msg').
        userInput: value => {
          if (typeof value !== 'string') {
            return value;
          }
          return value.replaceAll(CONTROL_CHARS_REGEX, '');
        }
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
}

const logger = buildLogger();

module.exports = logger;
module.exports.buildLogger = buildLogger;
module.exports.__internals = {
  shouldShipToLoki,
  hasPinoPretty,
  hasPinoLoki,
  buildTransport,
  CONTROL_CHARS_REGEX
};
