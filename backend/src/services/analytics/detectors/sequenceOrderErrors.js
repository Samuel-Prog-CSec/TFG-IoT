/**
 * @fileoverview Detector NUEVO (T-941 / cierra T-923): errores de orden en Secuencia.
 *
 * El alumno acierta los elementos individualmente (cartas correctas) pero
 * falla el ORDEN de la secuencia con alta frecuencia. Indica un problema
 * cognitivo de secuenciación distinto al de memoria pura.
 *
 * Métrica utilizada: `metrics.partialReproductions` (campo poblado por
 * la mecánica Secuencia). Una "partial reproduction" significa que el
 * alumno completó la secuencia con cartas correctas pero en orden
 * incorrecto o incompleto.
 *
 * @module services/analytics/detectors/sequenceOrderErrors
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const gamePlayRepository = require('../../../repositories/gamePlayRepository');
const { toObjectId } = require('../analyticsHelpers');

class SequenceOrderErrorsDetector extends AlertDetector {
  constructor() {
    super({ type: 'sequence_order_errors' });
  }

  async run({ students } = {}) {
    if (!students?.length) {
      return [];
    }

    const { partialRatio } = ALERT_TYPES.sequence_order_errors.thresholds;
    const studentIds = students.map(s => toObjectId(s._id));

    const pipeline = [
      {
        $match: {
          playerId: { $in: studentIds },
          status: 'completed',
          'metrics.partialReproductions': { $exists: true, $gte: 0 }
        }
      },
      {
        $lookup: {
          from: 'game_sessions',
          localField: 'sessionId',
          foreignField: '_id',
          as: 'session'
        }
      },
      { $unwind: '$session' },
      {
        $lookup: {
          from: 'game_mechanics',
          localField: 'session.mechanicId',
          foreignField: '_id',
          as: 'mechanic'
        }
      },
      { $unwind: '$mechanic' },
      { $match: { 'mechanic.slug': 'sequence' } },
      { $sort: { completedAt: -1 } },
      {
        $group: {
          _id: '$playerId',
          partials: { $push: '$metrics.partialReproductions' },
          attempts: { $push: '$metrics.totalAttempts' },
          lastCompletedAt: { $max: '$completedAt' }
        }
      },
      {
        $project: {
          recentPartials: { $slice: ['$partials', 5] },
          recentAttempts: { $slice: ['$attempts', 5] },
          lastCompletedAt: 1
        }
      }
    ];

    const results = await gamePlayRepository.aggregate(pipeline);
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const findings = [];

    for (const r of results) {
      if (!Array.isArray(r.recentPartials) || r.recentPartials.length < 3) {
        continue;
      }

      const totalPartials = r.recentPartials.reduce((a, b) => a + (b || 0), 0);
      const totalAttempts = r.recentAttempts.reduce((a, b) => a + (b || 0), 0);
      if (totalAttempts === 0) {
        continue;
      }

      const ratio = totalPartials / totalAttempts;
      if (ratio < partialRatio) {
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
        description: `${Math.round(ratio * 100)}% de sus intentos en Secuencia son por orden incorrecto`,
        recommendation:
          'Reforzar con secuencias visuales paso a paso (numeradas o con flechas) antes de la fase de reproducción',
        detectedAt: new Date(r.lastCompletedAt),
        data: {
          partialRatio: Math.round(ratio * 100 * 10) / 10,
          gamesAnalyzed: r.recentPartials.length,
          totalPartials,
          totalAttempts
        }
      });
    }

    return findings;
  }
}

module.exports = new SequenceOrderErrorsDetector();
