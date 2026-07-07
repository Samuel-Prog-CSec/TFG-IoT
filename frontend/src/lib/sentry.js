/**
 * @fileoverview Sentry configuration for error monitoring and tracing in the frontend.
 * Only active if VITE_SENTRY_ENABLED=true and a valid DSN is provided.
 * Incorporates GDPR compliance by filtering PII and disabling replays.
 *
 * T-904 Fase A: sampling per-environment vía `VITE_APP_ENV` con defaults
 * alineados al backend (0.1 prod / 0.5 staging / 1.0 dev/test).
 *
 * @module lib/sentry
 */

import * as Sentry from '@sentry/react';
import { getId } from './entityId';

let isSentryEnabled = false;

/**
 * Resuelve el environment efectivo del frontend. Orden de precedencia:
 *
 *  1. `VITE_APP_ENV` explícito (build-time override). Lo usamos para
 *     diferenciar staging del production deploy estable.
 *  2. Heurística Cloudflare Pages: si la build se hizo en CF Pages
 *     (`VITE_CF_PAGES=1`) y la rama NO es `main`, etiquetamos como
 *     `preview`. Estas builds las dispara una PR y suelen tener muy
 *     poco tráfico real; etiquetar aparte evita que sus traces inflen el
 *     panel de Sentry de producción y desperdicien cuota.
 *  3. `import.meta.env.MODE` (vite — dev/test/production) como fallback.
 *
 * @returns {string}
 */
const resolveEnvironment = () => {
  const explicit = import.meta.env.VITE_APP_ENV;
  if (explicit) {
    return explicit;
  }
  const isCfPagesBuild = import.meta.env.VITE_CF_PAGES === '1';
  const cfBranch = import.meta.env.VITE_CF_PAGES_BRANCH;
  if (isCfPagesBuild && cfBranch && cfBranch !== 'main') {
    return 'preview';
  }
  return import.meta.env.MODE || 'development';
};

/**
 * Calcula el sample rate Sentry para traces:
 *  - production → 0.1
 *  - staging    → 0.5
 *  - preview    → 0.01  (PR deploys: visibilidad mínima, no inflar cuota)
 *  - resto      → 1.0
 *
 * @param {string} env
 * @returns {number}
 */
const sampleRateFor = (env) => {
  if (env === 'production') return 0.1;
  if (env === 'staging') return 0.5;
  if (env === 'preview') return 0.01;
  return 1.0;
};

/**
 * Initializes Sentry configuration based on environment variables.
 */
export function initSentry() {
  if (import.meta.env.VITE_SENTRY_ENABLED !== 'true') {
    return;
  }

  if (!import.meta.env.VITE_SENTRY_DSN) {
    if (import.meta.env.DEV) {
      console.warn('[Sentry] VITE_SENTRY_DSN not configured. Sentry disabled.');
    }
    return;
  }

  const environment = resolveEnvironment();
  const tracesSampleRate = sampleRateFor(environment);

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment,

    integrations: [
      Sentry.browserTracingIntegration(),
      // Session Replay disabled entirely to comply with strict GDPR rules regarding minors
    ],

    // Performance Monitoring (T-904 Fase A)
    tracesSampleRate,

    // Session replay rates set to 0.0 explicitly (PII de menores)
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.0,

    beforeSend(event) {
      // Remove any sensitive headers that might get captured by default
      if (event.request?.headers) {
        delete event.request.headers['Authorization'];
        delete event.request.headers['X-CSRF-Token'];
      }

      // Limit breadcrumb URLs if they contain sensitive tokens in query params/paths
      if (event.breadcrumbs) {
        event.breadcrumbs.forEach((breadcrumb) => {
          if (breadcrumb.data?.url) {
            breadcrumb.data.url = breadcrumb.data.url.replaceAll(/token=([^&]+)/g, 'token=HIDDEN');
          }
        });
      }

      return event;
    },
  });

  isSentryEnabled = true;
  if (import.meta.env.DEV) {
    console.warn(`[Sentry] Initialized (env=${environment}, tracesSampleRate=${tracesSampleRate})`);
  }
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
        id: getId(user),
        role: user.role
      });
    } else {
      Sentry.setUser(null);
    }
  }
};
