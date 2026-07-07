/**
 * @fileoverview Detector: token comprometido / reuso sospechoso (T-942).
 *
 * Lee `ctx.securityCounters.token_theft` (sliding 1h). Cualquier ocurrencia
 * dispara una alerta critical inmediata: el robo de tokens es un incidente
 * grave de seguridad y no admite degradación.
 *
 * @module services/analytics/systemDetectors/tokenTheftDetected
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

class TokenTheftDetectedDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'token_theft_detected', source: 'auth' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.token_theft_detected;
    const count = ctx.securityCounters?.token_theft ?? 0;
    if (count < 1) {
      return [];
    }

    return [
      {
        type: this.type,
        severity: 'critical',
        source: this.source,
        component: 'auth:tokens',
        title: cfg.label,
        description: `Se detectaron ${count} reutilizaciones sospechosas de refresh token en la última hora.`,
        recommendation:
          'Revisa Sentry y los logs AUTH_TOKEN_THEFT_DETECTED. Considera revocación global y obligar reset de contraseñas afectadas.',
        data: { occurrencesLastHour: count },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new TokenTheftDetectedDetector();
