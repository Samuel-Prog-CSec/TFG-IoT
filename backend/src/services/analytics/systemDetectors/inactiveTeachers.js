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
          // Si nunca hizo login (`lastLoginAt` ausente) la antigüedad se mide por
          // `createdAt`: solo cuenta como inactivo cuando además la cuenta lleva
          // creada más del umbral info — una cuenta recién creada no es "inactiva
          // hace >90 días", simplemente aún no ha entrado (OBS-9, QA 2026-06-27).
          $or: [
            { lastLoginAt: { $lte: infoCutoff } },
            { lastLoginAt: { $exists: false }, createdAt: { $lte: infoCutoff } }
          ]
        },
        { select: 'name email lastLoginAt createdAt', lean: true }
      );

      if (!teachers.length) {
        return [];
      }

      // Misma regla en el filtro de severidad: la fecha de referencia es el
      // último login o, si nunca entró, la creación de la cuenta (OBS-9).
      const inactiveSince = t => new Date(t.lastLoginAt || t.createdAt);
      const warningTeachers = teachers.filter(t => inactiveSince(t) <= warningCutoff);

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

      // Concordancia singular/plural (QA 2026-05-21 BUG-QA-NUEVO-1): antes
      // se escribia "1 profesor(es) llevan" — feo en singular y un parentesis
      // de tipo formularistico que no encaja en mensajes para humanos.
      const isSingular = list.length === 1;
      const teacherWord = isSingular ? 'profesor' : 'profesores';
      const verbWord = isSingular ? 'lleva' : 'llevan';
      const thresholdDays =
        severity === 'warning' ? cfg.thresholds.warningDays : cfg.thresholds.infoDays;

      return [
        {
          type: this.type,
          severity,
          source: this.source,
          component: 'moderation:teachers',
          title: cfg.label,
          description: `${list.length} ${teacherWord} ${verbWord} más de ${thresholdDays} días sin entrar.`,
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
