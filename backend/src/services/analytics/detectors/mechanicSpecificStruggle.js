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
const { toObjectId, getStartDate } = require('../analyticsHelpers');

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

    // Agrupar por (alumno, mecánica). Necesitamos game_sessions para sacar mechanicId,
    // y mechanics para sacar el slug (memory/association/sequence).
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
      {
        $group: {
          _id: { playerId: '$playerId', mechanicSlug: '$mechanic.slug' },
          avgScore: { $avg: '$score' },
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
        mechanic: r._id.mechanicSlug,
        avgScore: r.avgScore,
        plays: r.plays,
        lastCompletedAt: r.lastCompletedAt
      });
    }

    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const findings = [];

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
        description: `Domina ${strongLabel} (${Math.round(strong.avgScore)}) pero le cuesta ${weakLabel} (${Math.round(weak.avgScore)})`,
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
