/**
 * @fileoverview Configuración de Sentry para monitoreo y tracking de errores.
 * Sentry captura errores en producción y desarrollo, con profiling y tracing.
 * @module config/sentry
 */

const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');
const logger = require('../utils/logger');

/**
 * Flag para saber si Sentry está activo
 * @type {boolean}
 */
let isSentryEnabled = false;

/**
 * Inicializa Sentry con la configuración apropiada según el entorno.
 * Sentry v10: auto-instrumentación via OpenTelemetry v2, sin Handlers legacy.
 *
 * @returns {void}
 */
function initSentry() {
  // Sprint 1.5: Sentry deshabilitado por defecto (Sprint 3: seguridad)
  if (process.env.SENTRY_ENABLED !== 'true') {
    isSentryEnabled = false;
    logger.info('Sentry deshabilitado (SENTRY_ENABLED!=true).');
    return;
  }

  // Solo inicializar si hay DSN configurado
  if (!process.env.SENTRY_DSN) {
    logger.warn('SENTRY_DSN no configurado. Sentry deshabilitado.');
    isSentryEnabled = false;
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Integraciones (v10+ usa funciones en lugar de clases)
    integrations: [nodeProfilingIntegration()],

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% en prod, 100% en dev
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Filtrar datos sensibles antes de enviar a Sentry
    beforeSend(event, _hint) {
      // Remover cookies
      if (event.request) {
        delete event.request.cookies;

        // Remover datos sensibles del body (incluye T-905 B2 + B7: MFA, CAPTCHA, etc.)
        if (event.request.data) {
          delete event.request.data.password;
          delete event.request.data.currentPassword;
          delete event.request.data.newPassword;
          delete event.request.data.token;
          delete event.request.data.accessToken;
          delete event.request.data.refreshToken;
          delete event.request.data.captchaToken;
          delete event.request.data.code; // TOTP MFA
          delete event.request.data.backupCode;
          delete event.request.data.mfa;
        }

        // Remover query strings con tokens en URL
        if (event.request.query_string) {
          event.request.query_string = String(event.request.query_string).replaceAll(
            /(token|code|secret)=[^&]+/gi,
            '$1=HIDDEN'
          );
        }

        // Remover headers de auth/MFA en respuestas capturadas
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.Authorization;
          delete event.request.headers['x-csrf-token'];
          delete event.request.headers['X-CSRF-Token'];
          delete event.request.headers['x-mfa-token'];
          delete event.request.headers['X-MFA-Token'];
        }
      }

      // Remover información sensible de contextos adicionales
      if (event.contexts?.user) {
        delete event.contexts.user.password;
        delete event.contexts.user.email; // Opcional: remover email por GDPR
        delete event.contexts.user.mfa;
        delete event.contexts.user.mfaSecret;
        delete event.contexts.user.backupCodes;
      }

      // Filtrar PII de menores y secretos en breadcrumbs y extras
      // (Art. 25 RGPD, AT-06 RAT). Sentry es procesador internacional (Art. 28):
      // minimizar datos transferidos.
      const piiKeys = [
        'studentName',
        'playerName',
        'name',
        'classroom',
        'mfa',
        'mfaSecret',
        'backupCodes',
        'password',
        'token',
        'refreshToken'
      ];
      if (event.breadcrumbs) {
        for (const bc of event.breadcrumbs) {
          if (bc.data) {
            for (const key of piiKeys) {
              delete bc.data[key];
            }
          }
        }
      }
      if (event.extra) {
        for (const key of piiKeys) {
          delete event.extra[key];
        }
      }
      if (event.tags) {
        for (const key of piiKeys) {
          delete event.tags[key];
        }
      }

      return event;
    }
  });

  isSentryEnabled = true;
  logger.info(`Sentry inicializado en modo ${process.env.NODE_ENV || 'development'}`);
}

/**
 * Registra el error handler de Sentry en la app Express.
 * En Sentry v10+ requestHandler/tracingHandler ya no existen;
 * la auto-instrumentación de OpenTelemetry los reemplaza.
 * Solo queda setupExpressErrorHandler para capturar errores.
 *
 * @param {import('express').Application} app
 */
function setupSentryErrorHandler(app) {
  if (!isSentryEnabled) {
    return;
  }

  Sentry.setupExpressErrorHandler(app, {
    shouldHandleError(error) {
      // Solo capturar errores no-operacionales o con status >= 500.
      // Errores 4xx operacionales (validación, 404, CSRF, auth) no van a Sentry.
      const status = error.statusCode || error.status || 500;
      return status >= 500 || error.isOperational === false;
    }
  });
}

/**
 * Wrapper para captureException que no hace nada si Sentry está deshabilitado
 * @param {Error} exception
 * @param {Object} [hint]
 */
const captureException = (exception, hint) => {
  if (isSentryEnabled) {
    Sentry.captureException(exception, hint);
  }
};

/**
 * Wrapper para captureMessage que no hace nada si Sentry está deshabilitado
 * @param {string} message
 * @param {Object} [hint]
 */
const captureMessage = (message, hint) => {
  if (isSentryEnabled) {
    Sentry.captureMessage(message, hint);
  }
};

module.exports = {
  initSentry,
  setupSentryErrorHandler,
  Sentry: {
    ...Sentry,
    captureException,
    captureMessage
  }
};
