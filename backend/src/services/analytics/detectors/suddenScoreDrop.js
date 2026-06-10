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
      // Reducir el documento a los 4 campos que consume el detector ANTES del
      // `$group { $first: '$$ROOT' }`: sin esto, `$$ROOT` arrastraba el array
      // `events[]` (hasta 500 sub-docs) de la última partida de cada alumno por
      // el pipeline, egress evitable en el cron de detección.
      { $project: { playerId: 1, score: 1, maxScore: 1, completedAt: 1 } },
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

      // `studentMetrics.averageScore` ya es % (ADR-201); normalizamos también la
      // última partida a % (`score/maxScore×100`) para restar en la MISMA escala.
      // Antes se restaba `avg(%) - lastGame.score(crudo)`: en Secuencia (techo
      // 210-420) nunca disparaba, y en Asociación una partida perfecta (50/50)
      // disparaba una falsa "caída". El umbral 30 ahora son 30 puntos porcentuales.
      const avg = student.studentMetrics.averageScore;
      const lastPct = r.lastGame.maxScore > 0 ? (r.lastGame.score / r.lastGame.maxScore) * 100 : 0;
      const drop = avg - lastPct;
      if (drop <= threshold) {
        continue;
      }

      findings.push({
        studentId: sid,
        type: this.type,
        severity: 'warning',
        description: `Obtuvo ${Math.round(lastPct)}% en su última partida (media: ${Math.round(avg)}%)`,
        recommendation: 'Revisar si hubo alguna dificultad específica en la última sesión',
        detectedAt: new Date(r.lastGame.completedAt),
        gamePlayId: r.lastGame._id?.toString() || null,
        data: {
          lastScorePercent: Math.round(lastPct),
          averageScore: Math.round(avg),
          dropPoints: Math.round(drop)
        }
      });
    }

    return findings;
  }
}

module.exports = new SuddenScoreDropDetector();
