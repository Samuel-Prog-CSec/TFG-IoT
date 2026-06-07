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
const { toObjectId, getStartDate } = require('../analyticsHelpers');

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

    // Único $lookup a game_sessions con sub-pipeline que solo proyecta
    // mechanicType (ADR-193): sustituye el doble join game_sessions →
    // game_mechanics por mechanic.name y evita arrastrar el doc de sesión.
    // Cota temporal 90d: el índice {playerId,status,completedAt} limita el
    // scan a partidas recientes; un alumno inactivo >90d no genera alerta.
    const pipeline = [
      {
        $match: {
          playerId: { $in: studentIds },
          status: 'completed',
          completedAt: { $gte: getStartDate('90d') },
          'metrics.partialReproductions': { $exists: true, $gte: 0 }
        }
      },
      {
        $lookup: {
          from: 'game_sessions',
          let: { sid: '$sessionId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$sid'] } } },
            { $project: { mechanicType: 1, _id: 0 } }
          ],
          as: 'session'
        }
      },
      { $unwind: '$session' },
      { $match: { 'session.mechanicType': 'sequence' } },
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

    // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
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
