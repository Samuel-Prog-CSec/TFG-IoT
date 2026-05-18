/**
 * @fileoverview Detector: profesores aprobados inactivos prolongadamente (T-942).
 *
 * Profesores con `accountStatus='approved'` cuyo `lastLoginAt` está más allá
 * de los umbrales. Emite finding agregado (no por usuario) con el conteo y
 * un ejemplo.
 *
 * Umbrales: info ≥30 días, warning ≥90 días.
 *
 * @module services/analytics/systemDetectors/inactiveTeachers
 */

const { SystemAlertDetector } = require('./_base');
const { SYSTEM_ALERT_TYPES } = require('../../../config/systemAlerts');
const userRepository = require('../../../repositories/userRepository');
const logger = require('../../../utils/logger').child({ component: 'detector.inactiveTeachers' });

const dayMs = 24 * 60 * 60 * 1000;

class InactiveTeachersDetector extends SystemAlertDetector {
  constructor() {
    super({ type: 'inactive_teachers', source: 'moderation' });
  }

  async run(ctx = {}) {
    const now = ctx.now || new Date();
    const cfg = SYSTEM_ALERT_TYPES.inactive_teachers;
    try {
      const warningCutoff = new Date(now.getTime() - cfg.thresholds.warningDays * dayMs);
      const infoCutoff = new Date(now.getTime() - cfg.thresholds.infoDays * dayMs);

      const teachers = await userRepository.find(
        {
          role: 'teacher',
          accountStatus: 'approved',
          $or: [{ lastLoginAt: { $lte: infoCutoff } }, { lastLoginAt: { $exists: false } }]
        },
        { select: 'name email lastLoginAt createdAt', lean: true }
      );

      if (!teachers.length) {
        return [];
      }

      const warningTeachers = teachers.filter(
        t => !t.lastLoginAt || new Date(t.lastLoginAt) <= warningCutoff
      );

      const severity = warningTeachers.length > 0 ? 'warning' : 'info';
      const list = severity === 'warning' ? warningTeachers : teachers;

      // Si solo hay un único profesor inactivo y la severity es info, lo
      // ignoramos para no generar ruido.
      if (severity === 'info' && list.length < 3) {
        return [];
      }

      const example = list[0];
      const exampleAgeDays = example.lastLoginAt
        ? Math.floor((now.getTime() - new Date(example.lastLoginAt).getTime()) / dayMs)
        : Math.floor((now.getTime() - new Date(example.createdAt).getTime()) / dayMs);

      return [
        {
          type: this.type,
          severity,
          source: this.source,
          component: 'moderation:teachers',
          title: cfg.label,
          description: `${list.length} profesor(es) llevan más de ${
            severity === 'warning' ? cfg.thresholds.warningDays : cfg.thresholds.infoDays
          } días sin entrar.`,
          recommendation: 'Considera contactarles o archivar cuentas si ya no usan la plataforma.',
          data: {
            inactiveCount: list.length,
            example: { id: String(example._id), email: example.email, ageDays: exampleAgeDays },
            severity
          },
          runbookUrl: cfg.defaultRunbook,
          detectedAt: now
        }
      ];
    } catch (err) {
      logger.warn('inactiveTeachers: error de query', { error: err.message });
      return [];
    }
  }
}

module.exports = new InactiveTeachersDetector();
