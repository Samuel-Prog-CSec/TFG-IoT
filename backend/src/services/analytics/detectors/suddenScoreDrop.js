/**
 * @fileoverview Detector: caída repentina de puntuación (T-941).
 *
 * Última partida del alumno (en los últimos 7 días) está >30 puntos por debajo
 * de su `studentMetrics.averageScore` histórico. Indica una sesión anómala
 * (frustración, cansancio, dificultad nueva).
 *
 * @module services/analytics/detectors/suddenScoreDrop
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const gamePlayRepository = require('../../../repositories/gamePlayRepository');
const { toObjectId, getStartDate } = require('../analyticsHelpers');

class SuddenScoreDropDetector extends AlertDetector {
  constructor() {
    super({ type: 'sudden_score_drop' });
  }

  async run({ students, referenceDate = new Date() } = {}) {
    if (!students?.length) {
      return [];
    }

    const threshold = ALERT_TYPES.sudden_score_drop.thresholds.warning;
    const since = getStartDate('7d', referenceDate);

    const candidates = students.filter(s => s.studentMetrics?.averageScore > 0);
    if (!candidates.length) {
      return [];
    }

    const studentIds = candidates.map(s => toObjectId(s._id));

    const pipeline = [
      {
        $match: {
          playerId: { $in: studentIds },
          status: 'completed',
          completedAt: { $gte: since }
        }
      },
      { $sort: { completedAt: -1 } },
      { $group: { _id: '$playerId', lastGame: { $first: '$$ROOT' } } }
    ];

    const results = await gamePlayRepository.aggregate(pipeline);
    const studentMap = new Map(candidates.map(s => [s._id.toString(), s]));
    const findings = [];

    // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
    for (const r of results) {
      const sid = r._id.toString();
      const student = studentMap.get(sid);
      if (!student) {
        continue;
      }

      const avg = student.studentMetrics.averageScore;
      const last = r.lastGame.score || 0;
      const drop = avg - last;
      if (drop <= threshold) {
        continue;
      }

      findings.push({
        studentId: sid,
        type: this.type,
        severity: 'warning',
        description: `Obtuvo ${last} puntos en su última partida (media: ${Math.round(avg)})`,
        recommendation: 'Revisar si hubo alguna dificultad específica en la última sesión',
        detectedAt: new Date(r.lastGame.completedAt),
        gamePlayId: r.lastGame._id?.toString() || null,
        data: {
          lastScore: last,
          averageScore: Math.round(avg),
          dropPoints: Math.round(drop)
        }
      });
    }

    return findings;
  }
}

module.exports = new SuddenScoreDropDetector();
