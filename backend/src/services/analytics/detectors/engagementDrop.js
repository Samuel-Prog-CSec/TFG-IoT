/**
 * @fileoverview Detector NUEVO (T-941): caída de engagement.
 *
 * Compara el `engagementScore` actual (últimos 30 días) con el periodo anterior
 * (60-30 días). Si la caída supera el 25 % genera alerta warning. Reusa el
 * cache de `engagementService` (TTL 600 s), por lo que el coste por alumno
 * es marginal tras la primera ejecución del día.
 *
 * @module services/analytics/detectors/engagementDrop
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const engagementService = require('../engagementService');

class EngagementDropDetector extends AlertDetector {
  constructor() {
    super({ type: 'engagement_drop' });
  }

  async run({ students, referenceDate = new Date() } = {}) {
    if (!students?.length) {
      return [];
    }

    const threshold = ALERT_TYPES.engagement_drop.thresholds.warning;
    const findings = [];

    // engagementService no soporta paralelización masiva en cache miss; vamos
    // estudiante a estudiante. Si no hay engagement previo (poca data), skip.
    for (const student of students) {
      const sid = student._id.toString();
      let current = null;
      let previous = null;
      try {
        current = await engagementService.getStudentEngagement(sid, '30d');
        previous = await engagementService.getStudentEngagement(sid, '90d');
      } catch {
        continue;
      }

      const currentScore = Number(current?.engagementScore ?? current?.score ?? 0);
      const previousScore = Number(previous?.engagementScore ?? previous?.score ?? 0);

      if (previousScore < 20) {
        continue;
      } // datos insuficientes
      const dropPercent = ((previousScore - currentScore) / previousScore) * 100;
      if (dropPercent <= threshold) {
        continue;
      }

      findings.push({
        studentId: sid,
        type: this.type,
        severity: 'warning',
        description: `Su engagement bajó un ${Math.round(dropPercent)}% respecto al periodo anterior`,
        recommendation:
          'Hablar con el alumno y revisar si la dificultad o la temática siguen siendo motivadoras',
        detectedAt: referenceDate,
        data: {
          currentScore: Math.round(currentScore),
          previousScore: Math.round(previousScore),
          dropPercent: Math.round(dropPercent * 10) / 10
        }
      });
    }

    return findings;
  }
}

module.exports = new EngagementDropDetector();
