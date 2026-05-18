/**
 * @fileoverview Detector NUEVO (T-941): estancamiento detectado.
 *
 * Detecta cuando un alumno ha jugado al menos 5 partidas con scores muy
 * similares entre sí (desviación estándar ≤ 5). Indica contenido demasiado
 * fácil o demasiado difícil para su nivel.
 *
 * Antes de T-941, `plateau_detected` figuraba en ALERT_TYPES pero ningún
 * detector lo implementaba. Esta clase cierra ese pendiente histórico.
 *
 * @module services/analytics/detectors/plateauDetected
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const gamePlayRepository = require('../../../repositories/gamePlayRepository');
const { toObjectId } = require('../analyticsHelpers');

class PlateauDetectedDetector extends AlertDetector {
  constructor() {
    super({ type: 'plateau_detected' });
  }

  async run({ students } = {}) {
    if (!students?.length) {
      return [];
    }

    const { info: stdDevThreshold, minGames } = ALERT_TYPES.plateau_detected.thresholds;
    const studentIds = students.map(s => toObjectId(s._id));

    const pipeline = [
      { $match: { playerId: { $in: studentIds }, status: 'completed' } },
      { $sort: { completedAt: -1 } },
      {
        $group: {
          _id: '$playerId',
          recentScores: { $push: '$score' },
          lastCompletedAt: { $max: '$completedAt' }
        }
      },
      {
        $project: {
          recent: { $slice: ['$recentScores', minGames] },
          lastCompletedAt: 1
        }
      }
    ];

    const results = await gamePlayRepository.aggregate(pipeline);
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const findings = [];

    for (const r of results) {
      if (!Array.isArray(r.recent) || r.recent.length < minGames) {
        continue;
      }

      const mean = r.recent.reduce((a, b) => a + b, 0) / r.recent.length;
      const variance = r.recent.reduce((a, b) => a + (b - mean) ** 2, 0) / r.recent.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > stdDevThreshold) {
        continue;
      }

      const sid = r._id.toString();
      if (!studentMap.has(sid)) {
        continue;
      }

      findings.push({
        studentId: sid,
        type: this.type,
        severity: 'info',
        description: `Lleva ${r.recent.length} partidas con score muy similar (media ${Math.round(mean)})`,
        recommendation:
          'Considerar incrementar la dificultad o introducir un contexto nuevo para reactivar el progreso',
        detectedAt: new Date(r.lastCompletedAt),
        data: {
          gamesAnalyzed: r.recent.length,
          averageScore: Math.round(mean),
          stdDev: Math.round(stdDev * 10) / 10
        }
      });
    }

    return findings;
  }
}

module.exports = new PlateauDetectedDetector();
