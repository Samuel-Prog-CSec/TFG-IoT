/**
 * @fileoverview Funciones auxiliares de estado para el motor de juego.
 * Provee utilidades para consultar, calcular y emitir el estado de las partidas
 * sin modificar el ciclo de vida principal del GameEngine.
 * @module services/gameEngine/stateHelpers
 */

// ============================================================================
// CONSULTAS DE ESTADO
// ============================================================================

/**
 * Obtiene el estado actual de una partida.
 * Retorna una versión simplificada sin exponer los documentos Mongoose internos.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 * @param {string} playId - ID de la partida
 * @returns {Object|null} Estado simplificado de la partida, o null si no existe
 * @property {string} playId - ID de la partida
 * @property {number} currentRound - Ronda actual
 * @property {number} score - Puntuación actual
 * @property {number} maxRounds - Total de rondas configuradas
 */
function getPlayState(engine, playId) {
  const playState = engine.activePlays.get(playId);
  if (!playState) {
    return null;
  }

  const isMemoryMode = isMemoryPlay(playState);
  const remainingTimeMs = getRealtimeRemainingTimeMs(playState);

  const snapshot = {
    playId: playState.playDoc._id.toString(),
    status: playState.playDoc.status,
    isPaused: Boolean(playState.paused || playState.playDoc?.status === 'paused'),
    mechanicName: playState.mechanicName,
    currentRound: playState.playDoc.currentRound,
    score: playState.playDoc.score,
    maxRounds: isMemoryMode
      ? Number(playState.strategyState?.totalGroups || 0)
      : playState.sessionDoc.config.numberOfRounds,
    awaitingResponse: Boolean(playState.awaitingResponse),
    remainingTimeMs,
    timeLimitSeconds: isMemoryMode
      ? Number(playState.playDurationMs || 0) / 1000
      : Number(playState.sessionDoc?.config?.timeLimit || 0),
    currentChallenge: playState.currentChallenge
      ? {
          uid: playState.currentChallenge.uid || null,
          assignedValue: playState.currentChallenge.assignedValue || null,
          displayData: playState.currentChallenge.displayData || null
        }
      : null
  };

  if (isMemoryMode) {
    const board = playState.mechanicStrategy.buildBoardForClient(playState.strategyState);
    snapshot.memoryState = {
      board,
      attempts: Number(playState.strategyState?.attempts || 0),
      matchedCount: Number(playState.strategyState?.matchedUids?.length || 0),
      totalCards: Number(playState.strategyState?.totalCards || board.length || 0)
    };
  }

  // Secuencia: NO filtrar la respuesta. El `displayData` del challenge conserva
  // `sequence` (la secuencia ordenada COMPLETA = la respuesta a reproducir) también
  // en reproducing —nunca se limpia al cambiar de fase—, así que viajaba en el
  // payload `play_state`/`play_state_sync` y era inspeccionable en red/DOM aunque
  // el panel no la pintara. En reproducing la redactamos (solo `length`).
  if (snapshot.currentChallenge?.displayData) {
    const redacted = redactChallengeDisplayData(playState, snapshot.currentChallenge.displayData);
    if (redacted !== snapshot.currentChallenge.displayData) {
      snapshot.currentChallenge = { ...snapshot.currentChallenge, displayData: redacted };
    }
  }

  // Secuencia: estado intra-ronda (fase/cursor/cardStatuses, respuesta redactada)
  // para que el cliente REHIDRATE el tablero tras una recarga (F5)/reconexión. Sin
  // esto Memoria/Asociación se recuperaban pero Secuencia quedaba en blanco el
  // resto de la ronda mientras el backend seguía contando.
  if (
    playState.mechanicName === 'sequence' &&
    typeof playState.mechanicStrategy?.buildClientRehydrationState === 'function'
  ) {
    snapshot.sequenceState = playState.mechanicStrategy.buildClientRehydrationState(
      playState.strategyState,
      playState.playDoc.currentRound
    );
  }

  return snapshot;
}

/**
 * Redacta el `displayData` de un challenge antes de enviarlo al cliente.
 *
 * Para Secuencia en fase `reproducing`, elimina `sequence` (la secuencia ordenada
 * COMPLETA = la respuesta que el alumno debe reproducir) dejando solo `length`; en
 * el resto de fases/mecánicas lo devuelve intacto. Fuente ÚNICA de la redacción,
 * compartida por `getPlayState` (payload `play_state`/`play_state_sync`) y por el
 * emit de `play_resumed` en `resumePlayInternal` — este último NO redactaba (WS-4),
 * así que pausar/reanudar durante reproducing filtraba el orden en los frames WS.
 *
 * @param {Object} playState - Estado de la partida
 * @param {Object|null} displayData - `currentChallenge.displayData`
 * @returns {Object|null} Copia redactada, o el mismo objeto si no procede redactar
 */
function redactChallengeDisplayData(playState, displayData) {
  if (!displayData) {
    return displayData;
  }
  if (
    playState?.mechanicName === 'sequence' &&
    playState?.strategyState?.phase === 'reproducing' &&
    Array.isArray(displayData.sequence)
  ) {
    return {
      ...displayData,
      sequence: undefined,
      length: displayData.length ?? displayData.sequence.length
    };
  }
  return displayData;
}

/**
 * Obtiene contexto runtime ampliado para validaciones de seguridad socket.
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 * @param {string} playId
 * @returns {{ playId: string, sessionId: string, ownerId: string|null, sensorId: string|null, isPaused: boolean, awaitingResponse: boolean }|null}
 */
function getPlayRuntimeContext(engine, playId) {
  const playState = engine.activePlays.get(playId);
  if (!playState) {
    return null;
  }

  return {
    playId: playState.playDoc._id.toString(),
    sessionId: playState.sessionDoc?._id?.toString?.() || null,
    ownerId: playState.sessionDoc?.createdBy?.toString?.() || null,
    sensorId: playState.sessionDoc?.sensorId || null,
    isPaused: Boolean(playState.paused || playState.playDoc?.status === 'paused'),
    awaitingResponse: Boolean(playState.awaitingResponse)
  };
}

// ============================================================================
// CÁLCULOS DE TIEMPO
// ============================================================================

/**
 * Calcula el tiempo restante en tiempo real para una partida activa.
 * Tiene en cuenta si es modo memory, si está pausada o si está en ronda activa.
 *
 * @param {Object} playState - Estado de la partida
 * @returns {number|null} Milisegundos restantes, o null si no aplica
 */
function getRealtimeRemainingTimeMs(playState) {
  if (!playState) {
    return null;
  }

  // WS-10: comprobar la PAUSA antes que Memoria. Durante una pausa de Memoria,
  // `executePause` pone `playEndsAt=null`, así que `getMemoryRemainingTimeMs`
  // devolvía null aunque `playState.remainingTimeMs` guarde el tiempo congelado
  // real → F5/reconexión en pausa de Memoria rehidrataba sin barra de tiempo (la
  // UI no podía pintarla hasta el `play_resumed`).
  if (playState.paused || playState.playDoc?.status === 'paused') {
    return getPlayRemainingTimeMs(playState);
  }

  if (isMemoryPlay(playState)) {
    return getMemoryRemainingTimeMs(playState);
  }

  if (
    !playState.awaitingResponse ||
    !playState.roundStartTime ||
    !playState.sessionDoc?.config?.timeLimit
  ) {
    return null;
  }

  const totalMs = Number(playState.sessionDoc.config.timeLimit) * 1000;
  const elapsedMs = Math.max(0, Date.now() - playState.roundStartTime);
  return Math.max(0, totalMs - elapsedMs);
}

/**
 * Obtiene el tiempo restante almacenado en el estado de pausa.
 *
 * @param {Object} playState - Estado de la partida
 * @returns {number|null} Milisegundos restantes, o null si no hay dato
 */
function getPlayRemainingTimeMs(playState) {
  return playState.remainingTimeMs ?? playState.playDoc.remainingTime ?? null;
}

/**
 * Calcula el tiempo restante para una partida de memoria.
 *
 * @param {Object} playState - Estado de la partida
 * @returns {number|null} Milisegundos restantes, o null si no hay playEndsAt
 */
function getMemoryRemainingTimeMs(playState) {
  if (!playState?.playEndsAt) {
    return null;
  }

  return Math.max(0, playState.playEndsAt - Date.now());
}

/**
 * Restaura el roundStartTime tras reanudar una pausa,
 * para que el cálculo de timeElapsed NO incluya el tiempo pausado.
 *
 * @param {Object} playState - Estado de la partida
 */
function restoreRoundStartTime(playState) {
  if (playState.currentChallenge && typeof playState.roundElapsedBeforePauseMs === 'number') {
    playState.roundStartTime = Date.now() - playState.roundElapsedBeforePauseMs;
  }
}

// ============================================================================
// VERIFICACIONES Y EMISIONES
// ============================================================================

/**
 * Comprueba si una partida usa la mecánica de memoria.
 *
 * @param {Object} playState - Estado de la partida
 * @returns {boolean}
 */
function isMemoryPlay(playState) {
  return playState?.mechanicName === 'memory';
}

/**
 * Comprueba si una partida usa la mecánica de secuencia.
 *
 * @param {Object} playState - Estado de la partida
 * @returns {boolean}
 */
function isSequencePlay(playState) {
  return playState?.mechanicName === 'sequence';
}

/**
 * Emite el estado del tablero de memoria al cliente vía Socket.IO.
 *
 * @param {import('../gameEngine')} engine - Instancia del GameEngine
 * @param {string} playId - ID de la partida
 * @param {Object} playState - Estado de la partida
 * @param {Object} [extra={}] - Campos adicionales a incluir en el evento
 */
function emitMemoryTurnState(engine, playId, playState, extra = {}) {
  const board = playState.mechanicStrategy.buildBoardForClient(playState.strategyState);
  const matchedCount = Number(playState.strategyState?.matchedUids?.length || 0);
  const totalCards = Number(playState.strategyState?.totalCards || board.length || 0);

  engine.io.to(`play_${playId}`).emit('memory_turn_state', {
    playId,
    board,
    matchedCount,
    totalCards,
    attempts: Number(playState.strategyState?.attempts || 0),
    remainingTimeMs: getMemoryRemainingTimeMs(playState),
    awaitingResponse: Boolean(playState.awaitingResponse),
    score: playState.playDoc.score,
    ...extra
  });
}

/**
 * Verifica si el usuario solicitante es el propietario de la sesión de la partida.
 *
 * @param {Object} playState - Estado de la partida
 * @param {string} [requestedBy] - userId del profesor (opcional)
 * @returns {boolean} true si es propietario o si no se proporcionó requestedBy
 */
function isPlayOwner(playState, requestedBy) {
  if (!requestedBy) {
    return true;
  }

  const ownerId = playState.sessionDoc?.createdBy?.toString?.() || playState.sessionDoc?.createdBy;
  if (!ownerId) {
    return true;
  }

  return ownerId.toString() === requestedBy.toString();
}

/**
 * Calcula el tiempo restante al momento de pausar.
 *
 * @param {Object} playState - Estado de la partida
 * @returns {number|null} Milisegundos restantes, o null si no aplica
 */
function calculatePauseRemainingTime(playState) {
  if (isMemoryPlay(playState)) {
    return getMemoryRemainingTimeMs(playState);
  }

  if (
    playState.currentChallenge &&
    playState.roundStartTime &&
    playState.sessionDoc?.config?.timeLimit &&
    playState.awaitingResponse
  ) {
    const totalMs = playState.sessionDoc.config.timeLimit * 1000;
    const elapsedMs = Math.max(0, Date.now() - playState.roundStartTime);
    playState.roundElapsedBeforePauseMs = Math.min(totalMs, elapsedMs);
    return Math.max(0, totalMs - playState.roundElapsedBeforePauseMs);
  }

  return null;
}

module.exports = {
  getPlayState,
  getPlayRuntimeContext,
  getRealtimeRemainingTimeMs,
  getPlayRemainingTimeMs,
  getMemoryRemainingTimeMs,
  restoreRoundStartTime,
  redactChallengeDisplayData,
  isMemoryPlay,
  isSequencePlay,
  emitMemoryTurnState,
  isPlayOwner,
  calculatePauseRemainingTime
};
