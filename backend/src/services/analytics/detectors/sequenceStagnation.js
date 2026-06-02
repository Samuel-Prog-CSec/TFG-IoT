/**
 * @fileoverview Detector NUEVO (T-941 / cierra T-923): estancamiento en Secuencia.
 *
 * El alumno no supera una longitud máxima de secuencia tras N partidas
 * consecutivas (default: 5). Indica que se ha "topado con un techo" y
 * requiere intervención específica de la mecánica Secuencia.
 *
 * T-923 marcó este detector como criterio de aceptación pendiente
 * "post-T-941". T-941 lo cierra.
 *
 * @module services/analytics/detectors/sequenceStagnation
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const gamePlayRepository = require('../../../repositories/gamePlayRepository');
const { toObjectId } = require('../analyticsHelpers');

class SequenceStagnationDetector extends AlertDetector {
  constructor() {
    super({ type: 'sequence_stagnation' });
  }

  async run({ students } = {}) {
    if (!students?.length) {
      return [];
    }

    const { minStagnantGames } = ALERT_TYPES.sequence_stagnation.thresholds;
    const studentIds = students.map(s => toObjectId(s._id));

    // Join con game_sessions → game_mechanics para filtrar mechanicType=sequence
    const pipeline = [
      {
        $match: {
          playerId: { $in: studentIds },
          status: 'completed',
          'metrics.maxSequenceLengthAchieved': { $exists: true, $gt: 0 }
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
          recentLengths: { $push: '$metrics.maxSequenceLengthAchieved' },
          lastCompletedAt: { $max: '$completedAt' }
        }
      },
      {
        $project: {
          last: { $slice: ['$recentLengths', minStagnantGames] },
          lastCompletedAt: 1
        }
      }
    ];

    const results = await gamePlayRepository.aggregate(pipeline);
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const findings = [];

    // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
    for (const r of results) {
      if (!Array.isArray(r.last) || r.last.length < minStagnantGames) {
        continue;
      }

      // Estancamiento: max de las últimas N == max de la N-1 anterior
      // (es decir, no ha mejorado el máximo histórico en este lote).
      const maxRecent = Math.max(...r.last);
      const allEqual = r.last.every(v => v === maxRecent);
      if (!allEqual) {
        continue;
      } // si hay variación arriba/abajo, no es estancamiento "topado"

      const sid = r._id.toString();
      if (!studentMap.has(sid)) {
        continue;
      }

      findings.push({
        studentId: sid,
        type: this.type,
        severity: 'warning',
        description: `Lleva ${r.last.length} partidas de Secuencia sin superar la longitud ${maxRecent}`,
        recommendation:
          'Probar contextos con menos ruido visual o reducir el tamaño del mazo para forzar nueva curva',
        detectedAt: new Date(r.lastCompletedAt),
        data: {
          stagnationLength: maxRecent,
          gamesAtThisLength: r.last.length
        }
      });
    }

    return findings;
  }
}

module.exports = new SequenceStagnationDetector();
