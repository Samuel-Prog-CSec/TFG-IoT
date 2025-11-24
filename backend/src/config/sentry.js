/**
 * @fileoverview Configuración de Sentry para monitoreo y tracking de errores.
 * Sentry captura errores en producción y desarrollo, con profiling y tracing.
 * @module config/sentry
 */

const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');
const logger = require('../utils/logger');

/**
 * Inicializa Sentry con la configuración apropiada según el entorno.
 * Actualizado para Sentry v10+ con nueva API de integraciones.
 *
 * @returns {void}
 */
function initSentry() {
  // Solo inicializar si hay DSN configurado
  if (!process.env.SENTRY_DSN) {
    logger.warn('SENTRY_DSN no configurado. Sentry deshabilitado.');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Integraciones (v10+ usa funciones en lugar de clases)
    integrations: [
      nodeProfilingIntegration(),
    ],

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% en prod, 100% en dev
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Filtrar datos sensibles antes de enviar a Sentry
    beforeSend(event, hint) {
      // Remover cookies
      if (event.request) {
        delete event.request.cookies;

        // Remover datos sensibles del body
        if (event.request.data) {
          delete event.request.data.password;
          delete event.request.data.token;
          delete event.request.data.accessToken;
          delete event.request.data.refreshToken;
        }
      }

      // Remover información sensible de contextos adicionales
      if (event.contexts) {
        if (event.contexts.user) {
          delete event.contexts.user.password;
          delete event.contexts.user.email; // Opcional: remover email por GDPR
        }
      }

      return event;
    },
  });

  logger.info(`Sentry inicializado en modo ${process.env.NODE_ENV || 'development'}`);
}

module.exports = { initSentry, Sentry };
