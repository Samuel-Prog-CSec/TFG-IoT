/**
 * @fileoverview Servicio para recalcular y persistir el estado de GameSession
 * en base al estado real de sus partidas (GamePlay).
 * @module services/sessionStatusService
 */

const gameSessionRepository = require('../repositories/gameSessionRepository');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const logger = require('../utils/logger').child({ component: 'sessionStatusService' });
const mongoose = require('mongoose');

/**
 * Obtiene el siguiente estado de sesión según recuento de partidas.
 *
 * Reglas de negocio T-053:
 * - active: existe al menos una partida in-progress o paused.
 * - completed: no hay partidas activas/pausadas y existe al menos una partida.
 * - created: no existen partidas asociadas.
 *
 * @param {{ totalPlays: number, activeOrPausedPlays: number }} counters
 * @returns {'created'|'active'|'completed'}
 */
function resolveSessionStatus(counters) {
  if (counters.activeOrPausedPlays > 0) {
    return 'active';
  }

  if (counters.totalPlays > 0) {
    return 'completed';
  }

  return 'created';
}

/**
 * Recuenta partidas totales y activas/pausadas para una sesión.
 *
 * @param {string|import('mongoose').Types.ObjectId} sessionId
 * @returns {Promise<{ totalPlays: number, activeOrPausedPlays: number }>}
 */
async function getPlayCountersBySession(sessionId) {
  const normalizedSessionId =
    typeof sessionId === 'string' && mongoose.Types.ObjectId.isValid(sessionId)
      ? new mongoose.Types.ObjectId(sessionId)
      : sessionId;

  const [result] = await gamePlayRepository.aggregate([
    {
      $match: {
        sessionId: normalizedSessionId
      }
    },
    {
      $group: {
        _id: null,
        totalPlays: { $sum: 1 },
        activeOrPausedPlays: {
          $sum: {
            $cond: [{ $in: ['$status', ['in-progress', 'paused']] }, 1, 0]
          }
        }
      }
    }
  ]);

  if (!result) {
    return { totalPlays: 0, activeOrPausedPlays: 0 };
  }

  return {
    totalPlays: result.totalPlays,
    activeOrPausedPlays: result.activeOrPausedPlays
  };
}

/**
 * Recalcula y persiste el estado de una sesión a partir de sus partidas.
 *
 * @param {string|import('mongoose').Types.ObjectId} sessionId
 * @returns {Promise<{ sessionId: string, status: string|null, changed: boolean, counters: { totalPlays: number, activeOrPausedPlays: number } }|null>}
 */
async function recalculateSessionStatusFromPlays(sessionId) {
  if (!sessionId) {
    return null;
  }

  // DB-4: leer SOLO los campos de estado (lean). Antes `findById` sin `select`
  // traía la sesión ENTERA (los 4 arrays pesados cardMappings/boardLayout/
  // sequencePlan/associationChallengePlan, 8-16 KB) y `session.save()` re-ejecutaba
  // sus validadores en CADA transición de partida (createPlay/complete/abandon/pause
  // y endPlay del motor). Con `select` + `updateOne` ($set/$unset), solo movemos los
  // 3 campos de estado y solo esos se validan.
  const session = await gameSessionRepository.findById(sessionId, {
    lean: true,
    select: 'status startedAt endedAt'
  });
  if (!session) {
    return null;
  }

  const counters = await getPlayCountersBySession(session._id);
  const nextStatus = resolveSessionStatus(counters);
  const previousStatus = session.status;
  const changed = previousStatus !== nextStatus;

  if (changed) {
    const set = { status: nextStatus };
    const unset = {};

    if (nextStatus === 'active') {
      if (!session.startedAt) {
        set.startedAt = new Date();
      }
      unset.endedAt = '';
    } else if (nextStatus === 'completed') {
      if (!session.endedAt) {
        set.endedAt = new Date();
      }
    } else if (nextStatus === 'created') {
      unset.startedAt = '';
      unset.endedAt = '';
    }

    const updateDoc = { $set: set };
    if (Object.keys(unset).length > 0) {
      updateDoc.$unset = unset;
    }

    // findOneAndUpdate ($set/$unset) en vez de read-modify-write con save(): evita
    // traer/validar los arrays y ENCOGE la ventana de carrera del recálculo previo
    // (dos transiciones concurrentes podían dejar `status` desfasado con last-write-wins).
    await gameSessionRepository.updateOne({ _id: session._id }, updateDoc);

    logger.info('Estado de sesión recalculado', {
      sessionId: session._id,
      previousStatus,
      nextStatus,
      counters
    });
  }

  return {
    sessionId: session._id.toString(),
    status: nextStatus,
    changed,
    counters
  };
}

module.exports = {
  recalculateSessionStatusFromPlays,
  resolveSessionStatus
};
