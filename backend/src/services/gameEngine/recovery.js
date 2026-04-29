/**
 * @fileoverview Recuperación de partidas tras reinicio del servidor.
 * Gestiona la detección y marcado de partidas huérfanas tanto en Redis como
 * en MongoDB, y la re-registración de card locks tras reconexión de Redis.
 * @module services/gameEngine/recovery
 */

const logger = require('../../utils/logger').child({ component: 'gameEngine:recovery' });
const gamePlayRepository = require('../../repositories/gamePlayRepository');
const gameSessionRepository = require('../../repositories/gameSessionRepository');
const redisService = require('../redisService');
const { recalculateSessionStatusFromPlays } = require('../sessionStatusService');

// ============================================================================
// RECUPERACIÓN PRINCIPAL
// ============================================================================

/**
 * Recupera las partidas activas de Redis y las marca como abandonadas.
 * Este método se llama durante el arranque del servidor para limpiar
 * partidas que quedaron huérfanas tras un reinicio.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 * @returns {Promise<number>} Número de partidas recuperadas/abandonadas
 */
async function recoverActivePlays(engine) {
  try {
    const playKeys = await redisService.scanByNamespace(redisService.NAMESPACES.PLAY);
    let recoveredCount = 0;

    // 1) Recuperar partidas con estado en Redis
    if (playKeys.length > 0) {
      logger.info(`Recuperando ${playKeys.length} partidas de Redis...`);

      const recoveredResults = [];
      await engine.processInBatches(playKeys, async key => {
        const playId = key.replace(`${redisService.NAMESPACES.PLAY}:`, '');
        const recovered = await recoverPlayFromRedis(engine, playId);
        recoveredResults.push(recovered);
      });

      recoveredCount = recoveredResults.filter(Boolean).length;
    }

    // 2) Recuperar partidas huérfanas en DB sin estado en Redis
    const orphanedCount = await recoverOrphanedPlaysFromDB(engine);
    recoveredCount += orphanedCount;

    if (recoveredCount > 0) {
      logger.info(`Recuperación completada: ${recoveredCount} partidas marcadas como abandonadas`);
    } else {
      logger.info('No hay partidas activas para recuperar');
    }

    return recoveredCount;
  } catch (error) {
    logger.error('Error durante la recuperación de partidas:', { error: error.message });
    return 0;
  }
}

// ============================================================================
// RECUPERACIÓN DESDE REDIS
// ============================================================================

/**
 * Recupera una partida individual desde Redis.
 * Busca el documento en MongoDB, lo marca como abandonado y limpia Redis.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 * @param {string} playId - ID de la partida a recuperar
 * @returns {Promise<boolean>} true si la partida fue recuperada y marcada como abandonada
 */
async function recoverPlayFromRedis(engine, playId) {
  try {
    const redisState = await redisService.hgetall(redisService.NAMESPACES.PLAY, playId);
    if (!redisState) {
      return false;
    }

    const playDoc = await gamePlayRepository.findById(redisState.playDocId);
    if (!playDoc) {
      logger.warn(`Partida ${playId} en Redis pero no en MongoDB, limpiando...`);
      await redisService.del(redisService.NAMESPACES.PLAY, playId);
      await cleanupSessionCardMappings(engine, redisState.sessionDocId, playId);
      return false;
    }

    const wasRecovered = await markPlayAbandonedIfNeeded(engine, playId, playDoc);

    await redisService.del(redisService.NAMESPACES.PLAY, playId);
    await cleanupSessionCardMappings(engine, redisState.sessionDocId, playId);

    return wasRecovered;
  } catch (err) {
    logger.error(`Error al recuperar partida ${playId}:`, { error: err.message });
    return false;
  }
}

// ============================================================================
// RECUPERACIÓN DESDE MONGODB
// ============================================================================

/**
 * Recupera partidas atascadas en estado in-progress/paused en DB
 * que no tienen entrada correspondiente en Redis (p.ej. tras reinicio de Redis).
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 * @returns {Promise<number>} Número de partidas huérfanas marcadas como abandonadas
 */
async function recoverOrphanedPlaysFromDB(engine) {
  try {
    const orphanedPlays = await gamePlayRepository.find({
      status: { $in: ['in-progress', 'paused'] }
    });

    if (orphanedPlays.length === 0) {
      return 0;
    }

    // Pipeline batch: verificar todas las plays en Redis en 1 round-trip
    // en vez del patrón N+1 anterior (hgetall individual por partida).
    const playIds = orphanedPlays.map(p => p._id.toString());
    const redisStates = await redisService.hgetallMany(redisService.NAMESPACES.PLAY, playIds);
    engine.metrics.pipelineRecoveryBatchSize = playIds.length;

    let count = 0;
    for (const play of orphanedPlays) {
      const playId = play._id.toString();
      const redisState = redisStates.get(playId);
      // Solo marcar como abandonada si realmente no está en Redis (huérfana)
      if (!redisState) {
        await markPlayAbandonedIfNeeded(engine, playId, play);
        count++;
      }
    }

    if (count > 0) {
      logger.info(`${count} partidas huérfanas en DB marcadas como abandonadas`);
    }
    return count;
  } catch (err) {
    logger.error('Error al recuperar partidas huérfanas de DB:', { error: err.message });
    return 0;
  }
}

// ============================================================================
// MARCADO Y LIMPIEZA
// ============================================================================

/**
 * Marca una partida como abandonada si su estado actual lo permite (in-progress o paused).
 * Registra un evento de server_restart y notifica al cliente si Socket.IO está disponible.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 * @param {string} playId - ID de la partida
 * @param {Object} playDoc - Documento Mongoose de GamePlay
 * @returns {Promise<boolean>} true si la partida fue marcada como abandonada
 */
async function markPlayAbandonedIfNeeded(engine, playId, playDoc) {
  if (playDoc.status !== 'in-progress' && playDoc.status !== 'paused') {
    return false;
  }

  playDoc.status = 'abandoned';
  playDoc.completedAt = new Date();
  playDoc.events.push({
    timestamp: new Date(),
    eventType: 'server_restart',
    roundNumber: playDoc.currentRound,
    pointsAwarded: 0
  });

  await playDoc.save();
  await recalculateSessionStatusFromPlays(playDoc.sessionId);

  logger.info(`Partida ${playId} marcada como abandonada (reinicio del servidor)`);

  if (engine.io) {
    engine.io.to(`play_${playId}`).emit('play_interrupted', {
      playId,
      reason: 'server_restart',
      message: 'La partida fue interrumpida por un reinicio del servidor.',
      finalScore: playDoc.score
    });
  }

  return true;
}

/**
 * Limpia las reservas de tarjetas RFID en Redis para una sesión.
 * Si se proporciona playId, usa liberación atómica Lua (owner-aware).
 * Si no hay playId, borra todas las keys de card sin verificación de owner.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 * @param {string} sessionDocId - ID del documento de sesión
 * @param {string} [playId=null] - ID de la partida (opcional, para liberación owner-aware)
 * @returns {Promise<void>}
 */
async function cleanupSessionCardMappings(engine, sessionDocId, playId = null) {
  if (!sessionDocId) {
    return;
  }

  const sessionDoc = await gameSessionRepository.findById(sessionDocId);
  if (!sessionDoc?.cardMappings) {
    return;
  }

  const cardUids = sessionDoc.cardMappings.map(mapping => mapping.uid);

  if (playId) {
    // Usar liberación atómica Lua (owner-aware) para consistencia
    await engine.releaseDistributedCardMappings(playId, cardUids);
    return;
  }

  // Sin playId conocido: borrar todas las keys de card sin verificación de owner
  await redisService.delMany(redisService.NAMESPACES.CARD, cardUids);
}

// ============================================================================
// RE-REGISTRO DE CARD LOCKS
// ============================================================================

/**
 * Re-registra las card locks en Redis para todas las partidas activas en memoria.
 * Se invoca tras una reconexión de Redis para restaurar las reservas de tarjetas
 * que expiraron durante la desconexión.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 * @returns {Promise<void>}
 */
async function reRegisterCardLocks(engine) {
  const activePlaysCount = engine.activePlays.size;
  if (activePlaysCount === 0) {
    return;
  }

  logger.info(
    `Re-registrando card locks para ${activePlaysCount} partidas activas tras reconexión Redis`
  );
  let restored = 0;

  for (const [playId, playState] of engine.activePlays.entries()) {
    try {
      const cardUids = Array.from(playState.uidToMapping.keys());
      if (cardUids.length === 0) {
        continue;
      }

      // Intentar reservar — si ya están libres o expiradas, se reservan de nuevo
      const result = await engine.reserveDistributedCardMappings(playId, playState.sessionDoc);
      if (result.ok) {
        restored++;
      } else {
        logger.warn(`No se pudieron re-registrar card locks para partida ${playId}`, {
          conflicts: result.conflicts
        });
      }
    } catch (error) {
      logger.error(`Error re-registrando card locks para partida ${playId}`, {
        error: error.message
      });
    }
  }

  logger.info(`Card locks restauradas: ${restored}/${activePlaysCount} partidas`);
}

module.exports = {
  recoverActivePlays,
  recoverOrphanedPlaysFromDB,
  recoverPlayFromRedis,
  markPlayAbandonedIfNeeded,
  cleanupSessionCardMappings,
  reRegisterCardLocks
};
