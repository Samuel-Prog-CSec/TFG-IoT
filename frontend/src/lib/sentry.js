/**
 * @fileoverview Sentry configuration for error monitoring and tracing in the frontend.
 * Only active if VITE_SENTRY_ENABLED=true and a valid DSN is provided.
 * Incorporates GDPR compliance by filtering PII and disabling replays.
 * @module lib/sentry
 */

import * as Sentry from '@sentry/react';

let isSentryEnabled = false;

/**
 * Initializes Sentry configuration based on environment variables.
 */
export function initSentry() {
  if (import.meta.env.VITE_SENTRY_ENABLED !== 'true') {
    return;
  }

  if (!import.meta.env.VITE_SENTRY_DSN) {
    console.warn('[Sentry] VITE_SENTRY_DSN not configured. Sentry disabled.');
    return;
  }

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE || 'development',
    
    integrations: [
      Sentry.browserTracingIntegration(),
      // Session Replay disabled entirely to comply with strict GDPR rules regarding minors
    ],

    // Performance Monitoring
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.2 : 1.0,

    // Session replay rates set to 0.0 explicitly
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.0,

    beforeSend(event) {
      // Remove any sensitive headers that might get captured by default
      if (event.request && event.request.headers) {
        delete event.request.headers['Authorization'];
        delete event.request.headers['X-CSRF-Token'];
      }
      
      // Limit breadcrumb URLs if they contain sensitive tokens in query params/paths
      if (event.breadcrumbs) {
        event.breadcrumbs.forEach(breadcrumb => {
          if (breadcrumb.data && breadcrumb.data.url) {
            breadcrumb.data.url = breadcrumb.data.url.replace(/token=([^&]+)/g, 'token=HIDDEN');
          }
        });
      }

      return event;
    },
  });

  isSentryEnabled = true;
  console.warn(`[Sentry] Initialized in mode: ${import.meta.env.MODE}`);
}

/**
 * Safe wrapper to capture exceptions. Does nothing natively if Sentry is disabled.
 * @param {Error} error 
 * @param {Object} [contexts] 
 */
export const captureException = (error, contexts) => {
  if (isSentryEnabled) {
    Sentry.captureException(error, contexts ? { contexts } : undefined);
  }
};

/**
 * Safe wrapper to set user context for errors. 
 * Strips PII (email, name) and only sends system identity.
 * @param {Object|null} user 
 */
export const setUserContext = (user) => {
  if (isSentryEnabled) {
    if (user) {
      Sentry.setUser({ 
        id: user._id || user.id, 
        role: user.role 
      });
    } else {
      Sentry.setUser(null);
    }
  }
};
