/**
 * @fileoverview Gestión de timers del motor de juego.
 * Incluye el cleanup automático de partidas abandonadas, el heartbeat de leases
 * distribuidos en Redis, y utilidades para limpiar y programar timers transitorios.
 * @module services/gameEngine/timerManager
 */

const logger = require('../../utils/logger').child({ component: 'gameEngine:timerManager' });
const redisService = require('../redisService');

// Constantes de configuración (duplicadas desde gameEngine.js para independencia del módulo)
const PLAY_TIMEOUT_MS = Number.parseInt(process.env.PLAY_TIMEOUT_MS, 10) || 3600000; // 1 hora
const CLEANUP_INTERVAL_MS = 300000; // 5 minutos
const DISTRIBUTED_LOCK_TTL_SECONDS =
  Number.parseInt(process.env.GAME_ENGINE_LOCK_TTL_SECONDS, 10) || 90;
// Heartbeat a 45s (antes 30s): con TTL de 90s mantiene un margen 2× de seguridad
// ante blips de red, pero renueva el lease de cada partida ~10 veces (en vez de
// ~20) por partida de 10 min. En `scale=1` el lease solo sirve para recovery tras
// reinicio de Koyeb, no para coordinación entre instancias; su renovación es el
// consumidor DOMINANTE de comandos Upstash por partida — recortarlo a la mitad
// alivia el techo free-tier de 10k comandos/día sin coste funcional real.
const LOCK_HEARTBEAT_INTERVAL_MS =
  Number.parseInt(process.env.GAME_ENGINE_LOCK_HEARTBEAT_MS, 10) || 45000;

// ============================================================================
// CLEANUP DE PARTIDAS ABANDONADAS
// ============================================================================

/**
 * Inicia el timer de cleanup para detectar y finalizar partidas abandonadas.
 * Se ejecuta cada CLEANUP_INTERVAL_MS (5 minutos por defecto).
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 */
function startCleanupTimer(engine) {
  engine.cleanupInterval = setInterval(() => {
    cleanupAbandonedPlays(engine);
  }, CLEANUP_INTERVAL_MS);
  engine.cleanupInterval.unref();
}

/**
 * Detiene el cleanup timer. Llamado durante el shutdown del servidor.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 */
function stopCleanupTimer(engine) {
  if (engine.cleanupInterval) {
    clearInterval(engine.cleanupInterval);
    logger.info('Cleanup timer detenido');
  }
}

/**
 * Detecta y limpia partidas que han estado activas por más tiempo del permitido.
 * Previene memory leaks de partidas que nunca finalizaron correctamente.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 */
async function cleanupAbandonedPlays(engine) {
  const now = Date.now();
  const abandonedPlays = [];

  for (const [playId, playState] of engine.activePlays.entries()) {
    const timeSinceCreation = now - playState.createdAt;

    if (timeSinceCreation > PLAY_TIMEOUT_MS) {
      abandonedPlays.push(playId);
    }
  }

  if (abandonedPlays.length > 0) {
    logger.warn(`Detectadas ${abandonedPlays.length} partidas abandonadas, limpiando...`, {
      playIds: abandonedPlays
    });

    // endPlay bajo el lock de la partida (WS-5): el cron corre FUERA de cualquier
    // lock, así que sin esto podía finalizar una partida mientras un scan seguía
    // en vuelo bajo el lock → validation_result emitido DESPUÉS de game_over y
    // escritura sobre un playDoc ya completado. El lock serializa cleanup con el
    // scan en curso. Un fallo/timeout de lock de una partida no debe abortar el
    // resto del batch.
    await engine.processInBatches(abandonedPlays, async playId => {
      try {
        await engine.executeWithPlayLock(playId, 'cleanup_end_play', () =>
          engine.endPlay(playId, { abandoned: true })
        );
      } catch (err) {
        logger.warn('Cleanup: no se pudo finalizar partida abandonada bajo lock', {
          playId,
          error: err?.message
        });
      }
    });
  }

  logger.debug('Cleanup ejecutado', {
    activePlays: engine.activePlays.size,
    cardMappings: engine.cardUidToPlayId.size,
    metrics: engine.metrics
  });
}

// ============================================================================
// HEARTBEAT DE LEASES DISTRIBUIDOS
// ============================================================================

/**
 * Inicia el timer de heartbeat para renovar leases distribuidos en Redis.
 * Se ejecuta cada LOCK_HEARTBEAT_INTERVAL_MS (30 segundos por defecto).
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 */
function startLockHeartbeatTimer(engine) {
  engine.lockHeartbeatInterval = setInterval(() => {
    refreshActivePlayLeases(engine);
  }, LOCK_HEARTBEAT_INTERVAL_MS);
  engine.lockHeartbeatInterval.unref();
}

/**
 * Detiene el heartbeat timer. Llamado durante el shutdown del servidor.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 */
function stopLockHeartbeatTimer(engine) {
  if (engine.lockHeartbeatInterval) {
    clearInterval(engine.lockHeartbeatInterval);
    logger.info('Lock heartbeat timer detenido');
  }
}

/**
 * Renueva los leases distribuidos de todas las partidas activas.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 */
async function refreshActivePlayLeases(engine) {
  const activeEntries = Array.from(engine.activePlays.entries());
  if (activeEntries.length === 0) {
    return;
  }

  await engine.processInBatches(activeEntries, async ([playId, playState]) => {
    await refreshPlayLease(engine, playId, playState);
  });
}

/**
 * Renueva el lease distribuido de una partida individual y sus card locks en Redis.
 * Usa operación atómica Lua para renovar play key + card keys en un solo comando.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 * @param {string} playId - ID de la partida
 * @param {Object} playState - Estado de la partida
 */
async function refreshPlayLease(engine, playId, playState) {
  try {
    const cardUids = (playState?.sessionDoc?.cardMappings || []).map(m => m.uid);

    // Usar operación atómica Lua que renueva play key + todas las card keys en 1 EVALSHA.
    // Con 20 tarjetas, pasa de ~61 round-trips a 1 solo comando.
    const result = await redisService.renewLeaseAtomic(
      redisService.NAMESPACES.PLAY,
      playId,
      redisService.NAMESPACES.CARD,
      cardUids,
      DISTRIBUTED_LOCK_TTL_SECONDS
    );

    engine.metrics.luaRenewLeaseExecutions++;

    if (result.playRenewed && result.cardsSkipped === 0) {
      engine.metrics.distributedLockLeaseRenewed++;
    } else {
      engine.metrics.distributedLockLeaseFailed++;
      if (result.cardsSkipped > 0) {
        engine.metrics.luaRenewLeasePartialFailures++;
        logger.warn('Renovación parcial de lease: cards con owner distinto', {
          playId,
          cardsRenewed: result.cardsRenewed,
          cardsSkipped: result.cardsSkipped
        });
      }
    }
  } catch (error) {
    engine.metrics.distributedLockLeaseFailed++;
    logger.warn('No se pudo renovar lease distribuido de partida', {
      playId,
      error: error.message
    });
  }
}

// ============================================================================
// UTILIDADES DE TIMERS
// ============================================================================

/**
 * Limpia todos los timers activos de una partida (ronda, siguiente ronda,
 * timer de partida y timers transitorios).
 *
 * @param {Object} playState - Estado de la partida
 */
function clearPlayTimers(playState) {
  if (playState.roundTimer) {
    clearTimeout(playState.roundTimer);
    playState.roundTimer = null;
  }
  if (playState.nextRoundTimer) {
    clearTimeout(playState.nextRoundTimer);
    playState.nextRoundTimer = null;
  }
  if (playState.playTimer) {
    clearTimeout(playState.playTimer);
    playState.playTimer = null;
  }
  if (playState.sequenceMemorizingTimer) {
    clearTimeout(playState.sequenceMemorizingTimer);
    playState.sequenceMemorizingTimer = null;
  }
  if (playState.transientTimers) {
    for (const timer of playState.transientTimers) {
      clearTimeout(timer);
    }
    playState.transientTimers.clear();
  }
}

/**
 * Programa un timer transitorio asociado al estado de una partida.
 * Se auto-elimina del Set al dispararse y se limpia con clearPlayTimers().
 * Uso principal: delays de ocultación de cartas en modo memory.
 *
 * @param {Object} playState - Estado de la partida
 * @param {Function} callback - Función a ejecutar tras el delay
 * @param {number} delayMs - Milisegundos de espera
 * @returns {NodeJS.Timeout} Referencia al timer
 */
function scheduleTransientTimer(playState, callback, delayMs) {
  const timer = setTimeout(() => {
    playState.transientTimers.delete(timer);
    callback();
  }, delayMs);
  playState.transientTimers.add(timer);
  return timer;
}

module.exports = {
  startCleanupTimer,
  stopCleanupTimer,
  cleanupAbandonedPlays,
  startLockHeartbeatTimer,
  stopLockHeartbeatTimer,
  refreshActivePlayLeases,
  refreshPlayLease,
  clearPlayTimers,
  scheduleTransientTimer
};
