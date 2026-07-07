/**
 * @fileoverview Detector NUEVO (T-941): caída de engagement.
 *
 * Compara el `engagementScore` actual (ventana 30d) con el del periodo más
 * amplio (90d). Si la caída supera el 25 % genera alerta warning.
 *
 * Perf (refactor): antes iteraba alumno a alumno haciendo `getStudentEngagement`
 * para 30d y 90d → N×2 agregaciones con `$facet` + doble `$lookup`. La ventana de
 * 90d nunca estaba caliente en caché, así que cada corrida garantizaba N
 * agregaciones pesadas. Ahora se resuelve con `computeStudentEngagementBatch`:
 * 2 agregaciones agrupadas por jugador (una por ventana), y el resto del trabajo
 * es en memoria. El `engagementScore` por alumno es byte-idéntico al del cómputo
 * individual (mismo núcleo `computeEngagementComponents`), por lo que los
 * findings no cambian respecto al comportamiento previo.
 *
 * @module services/analytics/detectors/engagementDrop
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const engagementService = require('../engagementService');
const logger = require('../../../utils/logger').child({ component: 'engagementDropDetector' });

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
    const ids = students.map(s => s._id.toString());

    // Dos agregaciones batch (30d + 90d) en vez de N×2. La de 90d nunca está
    // caliente en caché, así que el batch es donde está el ahorro real.
    let currentScores;
    let previousScores;
    try {
      [currentScores, previousScores] = await Promise.all([
        engagementService.computeStudentEngagementBatch(ids, '30d'),
        engagementService.computeStudentEngagementBatch(ids, '90d')
      ]);
    } catch (error) {
      // Mismo contrato que antes: si la fuente falla, no abortamos la corrida
      // del resto de detectores; devolvemos [] y dejamos rastro.
      logger.warn({ err: error }, 'engagement_drop: fallo al calcular batch de engagement');
      return [];
    }

    // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
    for (const sid of ids) {
      const currentScore = Number(currentScores.get(sid) ?? 0);
      const previousScore = Number(previousScores.get(sid) ?? 0);

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
