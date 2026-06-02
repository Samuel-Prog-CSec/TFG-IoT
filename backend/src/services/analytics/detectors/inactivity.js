/**
 * @fileoverview Detector: inactividad prolongada (T-941).
 *
 * Evalúa `studentMetrics.lastPlayedAt`. Sincrónico (no requiere BD adicional).
 * Umbrales por defecto: 7 días → info, 14 días → warning.
 *
 * @module services/analytics/detectors/inactivity
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');

class InactivityDetector extends AlertDetector {
  constructor() {
    super({ type: 'inactivity' });
  }

  async run({ students, referenceDate = new Date() } = {}) {
    if (!students?.length) {
      return [];
    }

    const { info: infoDays, warning: warningDays } = ALERT_TYPES.inactivity.thresholds;
    const findings = [];

    // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
    for (const student of students) {
      const lastPlayed = student.studentMetrics?.lastPlayedAt;
      if (!lastPlayed) {
        continue;
      }

      const daysSince = Math.floor((referenceDate - new Date(lastPlayed)) / (1000 * 60 * 60 * 24));
      if (daysSince < infoDays) {
        continue;
      }

      const severity = daysSince >= warningDays ? 'warning' : 'info';

      findings.push({
        studentId: student._id.toString(),
        type: this.type,
        severity,
        description: `No ha jugado en ${daysSince} días`,
        recommendation:
          daysSince >= warningDays
            ? 'Verificar si el alumno tiene algún problema para acceder a las sesiones'
            : 'Considerar asignar una sesión de juego motivadora',
        detectedAt: new Date(lastPlayed),
        data: { daysSinceLastPlay: daysSince, lastPlayedAt: lastPlayed }
      });
    }

    return findings;
  }
}

module.exports = new InactivityDetector();
