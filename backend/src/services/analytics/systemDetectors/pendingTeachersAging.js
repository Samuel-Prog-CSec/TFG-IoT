/**
 * @fileoverview Detector: profesores pendientes envejecidos (T-942).
 *
 * Consulta `User.find({role:'teacher', accountStatus:'pending_approval'})`
 * ordenado por `createdAt` ASC y mide la antigüedad del más viejo.
 *
 * Umbrales: warning ≥48h, critical ≥7 días.
 *
 * @module services/analytics/systemDetectors/pendingTeachersAging
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');
const userRepository = require('../../../repositories/userRepository');
const logger = require('../../../utils/logger').child({
  component: 'detector.pendingTeachersAging'
});

class PendingTeachersAgingDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'pending_teachers_aging', source: 'moderation' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.pending_teachers_aging;
    try {
      const oldest = await userRepository.findOne(
        { role: 'teacher', accountStatus: 'pending_approval' },
        { select: 'name email createdAt', sort: { createdAt: 1 }, lean: true }
      );
      if (!oldest) {
        return [];
      }
      const ageMs = now - new Date(oldest.createdAt).getTime();
      const ageHours = ageMs / (60 * 60 * 1000);
      const ageDays = ageHours / 24;

      if (ageHours < cfg.thresholds.warningHours) {
        return [];
      }

      // count() en lugar de traer todos los docs solo para `.length`: la query la
      // sirve el índice {role, accountStatus} sin materializar documentos.
      const total = await userRepository.count({
        role: 'teacher',
        accountStatus: 'pending_approval'
      });

      const severity = ageDays >= cfg.thresholds.criticalDays ? 'critical' : 'warning';

      return [
        {
          type: this.type,
          severity,
          source: this.source,
          component: 'moderation:teachers',
          title: cfg.label,
          description:
            severity === 'critical'
              ? `${total} solicitud(es) pendientes; la más antigua lleva ${Math.floor(ageDays)} día(s).`
              : `${total} solicitud(es) pendientes; la más antigua lleva ${Math.floor(ageHours)} h.`,
          recommendation: 'Revisa el panel de aprobaciones y aprueba/rechaza las solicitudes.',
          data: {
            totalPending: total,
            oldestAgeHours: Math.round(ageHours),
            oldestEmail: oldest.email,
            oldestId: String(oldest._id)
          },
          runbookUrl: cfg.defaultRunbook,
          detectedAt: new Date(oldest.createdAt)
        }
      ];
    } catch (err) {
      logger.warn('pendingTeachersAging: error de query', { error: err.message });
      return [];
    }
  }
}

module.exports = new PendingTeachersAgingDetector();
