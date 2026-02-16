/**
 * @fileoverview Servicio para recalcular y persistir el estado de GameSession
 * en base al estado real de sus partidas (GamePlay).
 * @module services/sessionStatusService
 */

const gameSessionRepository = require('../repositories/gameSessionRepository');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const logger = require('../utils/logger').child({ component: 'sessionStatusService' });

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
  const [totalPlays, activeOrPausedPlays] = await Promise.all([
    gamePlayRepository.count({ sessionId }),
    gamePlayRepository.count({ sessionId, status: { $in: ['in-progress', 'paused'] } })
  ]);

  return { totalPlays, activeOrPausedPlays };
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

  const session = await gameSessionRepository.findById(sessionId);
  if (!session) {
    return null;
  }

  const counters = await getPlayCountersBySession(session._id);
  const nextStatus = resolveSessionStatus(counters);
  const previousStatus = session.status;
  const changed = previousStatus !== nextStatus;

  if (changed) {
    session.status = nextStatus;

    if (nextStatus === 'active') {
      if (!session.startedAt) {
        session.startedAt = new Date();
      }
      session.endedAt = undefined;
    }

    if (nextStatus === 'completed') {
      if (!session.endedAt) {
        session.endedAt = new Date();
      }
    }

    if (nextStatus === 'created') {
      session.startedAt = undefined;
      session.endedAt = undefined;
    }

    await session.save();

    logger.info('Estado de sesión recalculado', {
      sessionId: session._id,
      previousStatus,
      nextStatus,
      counters
    });
  }

  return {
    sessionId: session._id.toString(),
    status: session.status,
    changed,
    counters
  };
}

module.exports = {
  recalculateSessionStatusFromPlays,
  resolveSessionStatus
};
