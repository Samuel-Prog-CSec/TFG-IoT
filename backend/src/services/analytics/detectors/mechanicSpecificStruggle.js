/**
 * @fileoverview Detector NUEVO (T-941): dificultad específica por mecánica.
 *
 * Cross-mecánica: detecta alumnos con gran disparidad entre mecánicas
 * (ej: 78 puntos de media en Memoria pero 42 en Secuencia). Aporta lectura
 * pedagógica única — ningún otro detector cruza mecánicas.
 *
 * Umbral por defecto:
 *  - gap mínimo entre mecánica fuerte y débil: 30 puntos.
 *  - media de la débil debajo de 50 (tier "risk").
 *  - al menos 3 partidas en cada mecánica considerada.
 *
 * @module services/analytics/detectors/mechanicSpecificStruggle
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const gamePlayRepository = require('../../../repositories/gamePlayRepository');
const { toObjectId, getStartDate, SCORE_PERCENT_EXPR } = require('../analyticsHelpers');

const MECHANIC_LABELS = {
  memory: 'Memoria',
  association: 'Asociación',
  sequence: 'Secuencia'
};

class MechanicSpecificStruggleDetector extends AlertDetector {
  constructor() {
    super({ type: 'mechanic_specific_struggle' });
  }

  async run({ students, referenceDate = new Date() } = {}) {
    if (!students?.length) {
      return [];
    }

    const { minGap, minPlaysPerMechanic, weakBelow } =
      ALERT_TYPES.mechanic_specific_struggle.thresholds;
    const since = getStartDate('30d', referenceDate);
    const studentIds = students.map(s => toObjectId(s._id));

    // Agrupar por (alumno, mecánica). El mechanicType denormalizado (ADR-193)
    // sustituye el doble join game_sessions → game_mechanics: un único $lookup
    // con sub-pipeline trae solo mechanicType y agrupamos por él. Los valores
    // ('memory'|'association'|'sequence') coinciden con las claves de
    // MECHANIC_LABELS, por lo que el contrato de findings se conserva.
    // La cota temporal `since` (30d) ya filtra por completedAt y aprovecha el
    // índice {playerId,status,completedAt}.
    const pipeline = [
      {
        $match: {
          playerId: { $in: studentIds },
          status: 'completed',
          completedAt: { $gte: since }
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
      {
        $group: {
          _id: { playerId: '$playerId', mechanicName: '$session.mechanicType' },
          // Normalizado a % (score/maxScore×100) para comparar mecánicas con techos
          // de puntos distintos de forma justa (ADR-201). Antes el avg crudo hacía
          // que Secuencia (techo 210-420) saliera siempre "fuerte" y Asociación
          // (techo 50) siempre "débil", invirtiendo el dominio real.
          avgScore: { $avg: SCORE_PERCENT_EXPR },
          plays: { $sum: 1 },
          lastCompletedAt: { $max: '$completedAt' }
        }
      },
      { $match: { plays: { $gte: minPlaysPerMechanic } } }
    ];

    const results = await gamePlayRepository.aggregate(pipeline);

    // Agrupar por estudiante
    const byStudent = new Map();
    for (const r of results) {
      const sid = r._id.playerId.toString();
      if (!byStudent.has(sid)) {
        byStudent.set(sid, []);
      }
      byStudent.get(sid).push({
        mechanic: r._id.mechanicName,
        avgScore: r.avgScore,
        plays: r.plays,
        lastCompletedAt: r.lastCompletedAt
      });
    }

    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const findings = [];

    // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
    for (const [sid, mechs] of byStudent.entries()) {
      if (mechs.length < 2) {
        continue;
      }

      // Buscar la fuerte (mejor avg) y la débil (peor avg)
      let strong = mechs[0];
      let weak = mechs[0];
      for (const m of mechs) {
        if (m.avgScore > strong.avgScore) {
          strong = m;
        }
        if (m.avgScore < weak.avgScore) {
          weak = m;
        }
      }

      const gap = strong.avgScore - weak.avgScore;
      if (gap < minGap) {
        continue;
      }
      if (weak.avgScore >= weakBelow) {
        continue;
      }
      if (!studentMap.has(sid)) {
        continue;
      }

      const strongLabel = MECHANIC_LABELS[strong.mechanic] || strong.mechanic;
      const weakLabel = MECHANIC_LABELS[weak.mechanic] || weak.mechanic;

      findings.push({
        studentId: sid,
        type: this.type,
        severity: 'warning',
        description: `Domina ${strongLabel} (${Math.round(strong.avgScore)}%) pero le cuesta ${weakLabel} (${Math.round(weak.avgScore)}%)`,
        recommendation: `Diseñar refuerzo específico para ${weakLabel.toLowerCase()}: ejercicios cortos, baja dificultad, repetición espaciada.`,
        detectedAt: new Date(
          Math.max(
            new Date(strong.lastCompletedAt).getTime(),
            new Date(weak.lastCompletedAt).getTime()
          )
        ),
        data: {
          strongMechanic: strong.mechanic,
          strongScore: Math.round(strong.avgScore),
          weakMechanic: weak.mechanic,
          weakScore: Math.round(weak.avgScore),
          gap: Math.round(gap),
          playsStrong: strong.plays,
          playsWeak: weak.plays
        }
      });
    }

    return findings;
  }
}

module.exports = new MechanicSpecificStruggleDetector();
