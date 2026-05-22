/**
 * @fileoverview Endpoint receptor de violaciones CSP (T-905 B5).
 *
 * El navegador envía un POST a `/api/csp-report` cuando una política CSP bloquea
 * algún recurso. El payload sigue el formato W3C (Reporting API) — JSON con la
 * estructura `csp-report` o el nuevo `application/reports+json` para Report-To.
 *
 * Esta ruta:
 * - Acepta sin autenticación (el navegador no envía cookies a este endpoint).
 * - Loguea con Pino al nivel `warn` y tag `cspViolation: true`.
 * - Reenvía a Sentry con tag `type: csp_violation` para alerting.
 * - Tiene rate limit dedicado (60/min/IP) — los navegadores pueden ser muy verbosos.
 * - Responde 204 No Content sin body (el navegador descarta la respuesta).
 *
 * @module routes/cspReport
 */

const express = require('express');
const logger = require('../utils/logger').child({ component: 'cspReport' });
const { Sentry } = require('../config/sentry');

const router = express.Router();

const MAX_BODY_BYTES = 16 * 1024; // 16KB es suficiente para un report típico

/**
 * Extrae los campos más útiles del payload para logs concisos.
 */
const summarize = body => {
  if (!body || typeof body !== 'object') {
    return {};
  }
  // Formato clásico: { "csp-report": { ... } }
  const report = body['csp-report'] || body;
  return {
    documentUri: report['document-uri'] || report.documentURL,
    violatedDirective: report['violated-directive'] || report.violatedDirective,
    effectiveDirective: report['effective-directive'] || report.effectiveDirective,
    blockedUri: report['blocked-uri'] || report.blockedURL,
    sourceFile: report['source-file'] || report.sourceFile,
    lineNumber: report['line-number'] || report.lineNumber,
    disposition: report.disposition // "enforce" o "report"
  };
};

/**
 * Body parser específico para los Content-Types que envía el navegador.
 * `express.raw` da control sobre cómo se decodifica; el JSON.parse manual
 * nos permite manejar payloads inválidos sin crashear el handler global.
 */
const rawBody = express.raw({
  type: ['application/csp-report', 'application/reports+json', 'application/json'],
  limit: MAX_BODY_BYTES
});

router.post('/', rawBody, (req, res) => {
  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).send();
    }
    const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      logger.warn({ cspViolation: true, parseError: true }, 'CSP report con JSON malformado');
      return res.status(400).send();
    }

    // Algunos navegadores envían un array (Report-To) en lugar de objeto único.
    const reports = Array.isArray(parsed) ? parsed : [parsed];
    for (const report of reports) {
      const summary = summarize(report);
      logger.warn(
        {
          cspViolation: true,
          ...summary,
          userAgent: req.headers['user-agent']
        },
        'CSP violation reportada'
      );

      // Sentry: capturar como mensaje warning con tag dedicado para filtrado.
      Sentry.captureMessage?.('CSP violation', {
        level: 'warning',
        tags: { type: 'csp_violation' },
        extra: summary
      });
    }

    return res.status(204).send();
  } catch (err) {
    logger.error('Error procesando CSP report', { error: err.message });
    return res.status(500).send();
  }
});

module.exports = router;
