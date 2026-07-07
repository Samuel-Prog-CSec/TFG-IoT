/**
 * @fileoverview Detector: pico de aprobaciones/rechazos administrativos en
 * la última hora.
 *
 * Vigila el contador `admin_approval` de `securityCountersService`, que
 * `adminController` incrementa en cada `approveTeacher` / `rejectTeacher`.
 * Un super_admin con sesión activa procesa típicamente 1-2 aprobaciones
 * por hora; picos por encima del umbral sugieren:
 *  - sesión comprometida y procesamiento automatizado de solicitudes,
 *  - script externo abusando del endpoint con un token válido robado,
 *  - error humano en una operación masiva (separable por contexto).
 *
 * @module services/analytics/systemDetectors/adminApprovalSpike
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');

class AdminApprovalSpikeDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'admin_approval_spike', source: 'admin' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.admin_approval_spike;
    const count = ctx.securityCounters?.admin_approval ?? 0;

    if (count < cfg.thresholds.warningPerHour) {
      return [];
    }

    const severity = count >= cfg.thresholds.criticalPerHour ? 'critical' : 'warning';
    const threshold =
      severity === 'critical' ? cfg.thresholds.criticalPerHour : cfg.thresholds.warningPerHour;

    return [
      {
        type: this.type,
        severity,
        source: this.source,
        component: 'admin:approval',
        title: cfg.label,
        description: `${count} aprobaciones/rechazos en la última hora (umbral ${threshold}).`,
        recommendation:
          severity === 'critical'
            ? 'Posible sesión comprometida. Revoca sesiones de super_admin y revisa la auditoría de aprobaciones recientes.'
            : 'Verifica si hubo una operación masiva planificada. Si no, escala medidas y revisa la auditoría.',
        data: { approvalsLastHour: count, threshold },
        runbookUrl: cfg.defaultRunbook,
        detectedAt: now
      }
    ];
  }
}

module.exports = new AdminApprovalSpikeDetector();
