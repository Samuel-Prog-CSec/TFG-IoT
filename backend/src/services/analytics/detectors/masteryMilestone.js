/**
 * @fileoverview Detector NUEVO (T-941): hito de dominio por contexto.
 *
 * El alumno ha alcanzado ≥80 % de acierto sostenido en un contexto temático
 * concreto (con al menos 5 partidas en ese contexto). Alerta `info`
 * celebratoria que el docente puede compartir con el alumno.
 *
 * Nota sobre dedup: el unique partial index del modelo SmartAlert es por
 * `(studentId, type, status='active')`. Como un alumno puede dominar varios
 * contextos, este detector NO encaja en ese índice — la dedup se hace a nivel
 * detector verificando contra alertas ya activas del mismo `data.contextId`.
 *
 * @module services/analytics/detectors/masteryMilestone
 */

const { AlertDetector } = require('./_base');
const { ALERT_TYPES } = require('../../../config/alerts');
const gamePlayRepository = require('../../../repositories/gamePlayRepository');
const smartAlertRepository = require('../../../repositories/smartAlertRepository');
const { toObjectId } = require('../analyticsHelpers');

class MasteryMilestoneDetector extends AlertDetector {
  constructor() {
    super({ type: 'mastery_milestone' });
  }

  async run({ teacherId, students, referenceDate: _referenceDate = new Date() } = {}) {
    if (!students?.length) {
      return [];
    }

    const { accuracyMin, minPlays } = ALERT_TYPES.mastery_milestone.thresholds;
    const studentIds = students.map(s => toObjectId(s._id));

    // Pipeline: agrupa partidas por (alumno, contexto). Necesitamos hacer
    // $lookup a game_sessions para acceder al contextId que NO está en
    // GamePlay directamente.
    const pipeline = [
      {
        $match: {
          playerId: { $in: studentIds },
          status: 'completed'
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
        $group: {
          _id: { playerId: '$playerId', contextId: '$session.contextId' },
          totalAttempts: { $sum: '$metrics.totalAttempts' },
          correctAttempts: { $sum: '$metrics.correctAttempts' },
          plays: { $sum: 1 },
          lastCompletedAt: { $max: '$completedAt' }
        }
      },
      { $match: { plays: { $gte: minPlays }, totalAttempts: { $gt: 0 } } },
      {
        $project: {
          accuracy: { $divide: ['$correctAttempts', '$totalAttempts'] },
          plays: 1,
          lastCompletedAt: 1
        }
      },
      { $match: { accuracy: { $gte: accuracyMin } } }
    ];

    const results = await gamePlayRepository.aggregate(pipeline);
    if (!results.length) {
      return [];
    }

    // Filtrar combinaciones ya celebradas (active) para evitar duplicar
    // — dedup a nivel detector porque el unique index es por (student,type) único.
    const existingActive = await smartAlertRepository.find({
      teacherId,
      type: this.type,
      status: 'active'
    });
    const already = new Set(existingActive.map(a => `${a.studentId}:${a.data?.contextId || ''}`));

    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    const findings = [];
    // Solo emitimos 1 milestone por estudiante por corrida — evita unique index.
    const seenPerStudent = new Set();

    // eslint-disable-next-line sonarjs/too-many-break-or-continue-in-loop -- guard clauses (early-continue) más legibles que anidar el cuerpo del bucle
    for (const r of results) {
      const sid = r._id.playerId.toString();
      const contextId = r._id.contextId ? r._id.contextId.toString() : null;
      if (!contextId) {
        continue;
      }
      if (seenPerStudent.has(sid)) {
        continue;
      }
      if (already.has(`${sid}:${contextId}`)) {
        continue;
      }
      if (!studentMap.has(sid)) {
        continue;
      }

      findings.push({
        studentId: sid,
        type: this.type,
        severity: 'info',
        description: `Ha dominado un contexto con ${Math.round(r.accuracy * 100)}% de acierto en ${r.plays} partidas`,
        recommendation:
          'Reconocer el logro con el alumno y proponerle un contexto nuevo más exigente',
        detectedAt: new Date(r.lastCompletedAt),
        data: {
          contextId,
          accuracy: Math.round(r.accuracy * 100 * 10) / 10,
          plays: r.plays
        }
      });
      seenPerStudent.add(sid);
    }

    return findings;
  }
}

module.exports = new MasteryMilestoneDetector();
