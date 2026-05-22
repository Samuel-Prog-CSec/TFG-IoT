/**
 * @fileoverview Detector: tasa de timeout sostenida (T-941).
 *
 * Promedia el timeout rate de las últimas 5 partidas completadas. Si supera
 * el umbral (30 % por defecto) y hay al menos 3 partidas analizables,
 * genera alerta warning.
 *
 * @module services/analytics/detectors/consistentTimeout
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const gamePlayRepository = require('../../../repositories/gamePlayRepository');
const { toObjectId } = require('../analyticsHelpers');

class ConsistentTimeoutDetector extends AlertDetector {
  constructor() {
    super({ type: 'consistent_timeout' });
  }

  async run({ teacherId: _teacherId, students } = {}) {
    if (!students?.length) {
      return [];
    }

    const threshold = ALERT_TYPES.consistent_timeout.thresholds.warning;
    const studentIds = students.map(s => toObjectId(s._id));

    const pipeline = [
      {
        $match: {
          playerId: { $in: studentIds },
          status: 'completed',
          'metrics.totalAttempts': { $gt: 0 }
        }
      },
      { $sort: { completedAt: -1 } },
      {
        $group: {
          _id: '$playerId',
          recentGames: {
            $push: {
              timeoutRate: {
                $cond: [
                  { $gt: ['$metrics.totalAttempts', 0] },
                  { $divide: ['$metrics.timeoutAttempts', '$metrics.totalAttempts'] },
                  0
                ]
              }
            }
          },
          lastCompletedAt: { $max: '$completedAt' }
        }
      },
      {
        $project: {
          last5: { $slice: ['$recentGames', 5] },
          lastCompletedAt: 1
        }
      }
    ];

    const results = await gamePlayRepository.aggregate(pipeline);
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const findings = [];

    for (const r of results) {
      if (r.last5.length < 3) {
        continue;
      }

      const avg = r.last5.reduce((sum, g) => sum + g.timeoutRate, 0) / r.last5.length;
      if (avg <= threshold) {
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
        description: `Tasa de timeout del ${Math.round(avg * 100)}% en sus últimas ${r.last5.length} partidas`,
        recommendation:
          'Verificar si el tiempo límite es adecuado o si el alumno necesita apoyo adicional',
        detectedAt: new Date(r.lastCompletedAt),
        data: {
          avgTimeoutRate: Math.round(avg * 100 * 10) / 10,
          gamesAnalyzed: r.last5.length
        }
      });
    }

    return findings;
  }
}

module.exports = new ConsistentTimeoutDetector();
