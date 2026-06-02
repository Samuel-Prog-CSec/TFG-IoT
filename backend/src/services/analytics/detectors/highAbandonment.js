/**
 * @fileoverview Detector: alta tasa de abandono (T-941).
 *
 * Analiza partidas iniciadas (status `completed` o `abandoned`) en los últimos
 * 7 días. Si abandono > 25 % con al menos 3 partidas → alerta warning.
 *
 * @module services/analytics/detectors/highAbandonment
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const gamePlayRepository = require('../../../repositories/gamePlayRepository');
const { toObjectId, getStartDate } = require('../analyticsHelpers');

class HighAbandonmentDetector extends AlertDetector {
  constructor() {
    super({ type: 'high_abandonment' });
  }

  async run({ students, referenceDate = new Date() } = {}) {
    if (!students?.length) {
      return [];
    }

    const threshold = ALERT_TYPES.high_abandonment.thresholds.warning;
    const since = getStartDate('7d', referenceDate);
    const studentIds = students.map(s => toObjectId(s._id));

    const pipeline = [
      {
        $match: {
          playerId: { $in: studentIds },
          startedAt: { $gte: since },
          status: { $in: ['completed', 'abandoned'] }
        }
      },
      {
        $group: {
          _id: '$playerId',
          total: { $sum: 1 },
          abandoned: { $sum: { $cond: [{ $eq: ['$status', 'abandoned'] }, 1, 0] } },
          lastEventAt: { $max: '$startedAt' }
        }
      },
      { $match: { total: { $gte: 3 } } }
    ];

    const results = await gamePlayRepository.aggregate(pipeline);
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const findings = [];

    // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
    for (const r of results) {
      const rate = r.abandoned / r.total;
      if (rate <= threshold) {
        continue;
      }

      const sid = r._id.toString();
      if (!studentMap.has(sid)) {
        continue;
      }

      findings.push({
        studentId: sid,
        type: this.type,
        severity: 'warning',
        description: `Ha abandonado ${r.abandoned} de ${r.total} partidas en los últimos 7 días (${Math.round(rate * 100)}%)`,
        recommendation:
          'Revisar si las sesiones son demasiado largas o si el contenido genera frustración',
        detectedAt: new Date(r.lastEventAt),
        data: {
          abandonedGames: r.abandoned,
          totalGames: r.total,
          abandonmentRate: Math.round(rate * 100 * 10) / 10
        }
      });
    }

    return findings;
  }
}

module.exports = new HighAbandonmentDetector();
