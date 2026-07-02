/**
 * @fileoverview Blindaje del arranque de partida (las 3 mecánicas).
 *
 * Cuando el docente pulsa EMPEZAR, el backend prepara la partida y envía el
 * tablero (Memoria), la secuencia (Secuencia) o el reto (Asociación). Si ese
 * arranque falla —tarjeta en uso por una partida interrumpida previa, config o
 * plan inválido, límite de partidas, o simplemente un corte de red— el frontend
 * se quedaba en el skeleton "Preparando cartas…" para SIEMPRE, sin explicación:
 * el docente no entiende qué ocurre y percibe el sistema como roto.
 *
 * Este hook detecta ese fallo y expone un `startupError` para mostrar un panel
 * claro con reintento en su lugar. Dos vías de detección:
 *   1. El backend emite un `error` de arranque (con mensaje legible) → se muestra
 *      de inmediato.
 *   2. Watchdog: si no llega ni tablero/reto ni error en un tiempo prudente, el
 *      arranque se considera colgado → mensaje genérico + reintento.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';

// El estado de partida llega por socket (payload pequeño); 10s es holgado para
// un arranque sano incluso en redes lentas de aula.
const STARTUP_WATCHDOG_MS = 10000;

// Errores en tiempo real que NO son fallos de arranque: transitorios o
// gestionados por otra UI (overlay de reconexión, banners de rate-limit,
// takeover de RFID). Un fallo de arranque real llega SIN estos códigos.
const TRANSIENT_ERROR_CODES = new Set([
  'SOCKET_DISCONNECTED',
  'RATE_LIMITED',
  'TEMP_BLOCKED',
  'DUPLICATE_RFID_EVENT',
  'RFID_MODE_TAKEN_OVER',
  'READER_NOT_READY'
]);

const isStartupFatalError = error =>
  Boolean(error?.message) && !TRANSIENT_ERROR_CODES.has(error.code);

/**
 * @param {Object} params
 * @param {string} params.gameState - Estado de partida ('waiting'|'playing'|…).
 * @param {string|null} params.playId - Id de la partida (reset al cambiar).
 * @param {Object|null} params.realtimeError - Último error de socket normalizado.
 * @param {boolean} params.sessionIsMemory
 * @param {boolean} params.sessionIsSequence
 * @param {number} params.memoryBoardLength - Nº de slots del tablero de Memoria.
 * @param {number} params.sequenceLength - Longitud de la secuencia recibida.
 * @param {boolean} params.hasChallenge - Si ya hay reto de Asociación.
 * @param {() => void} params.onRetry - Re-emite start_play (limpiar estado fuera).
 * @returns {{ startupError: {message:string}|null, gameplayReady: boolean, handleStartupRetry: () => void }}
 */
export function useStartupGuard({
  gameState,
  playId,
  realtimeError,
  sessionIsMemory,
  sessionIsSequence,
  memoryBoardLength,
  sequenceLength,
  hasChallenge,
  onRetry
}) {
  const [startupError, setStartupError] = useState(null);

  // "Gameplay listo": el tablero/secuencia/reto ya llegó del backend. Mientras es
  // false y estamos en 'playing', la partida está ARRANCANDO.
  const gameplayReady = useMemo(() => {
    if (sessionIsMemory) return memoryBoardLength > 0;
    if (sessionIsSequence) return sequenceLength > 0;
    return hasChallenge;
  }, [sessionIsMemory, sessionIsSequence, memoryBoardLength, sequenceLength, hasChallenge]);

  // Reset al empezar una partida nueva (cambio de playId).
  useEffect(() => {
    setStartupError(null);
  }, [playId]);

  // En cuanto llega el tablero/reto, el arranque fue bien: limpiar el error (cubre
  // el reintento exitoso tras reclamar tarjetas huérfanas en el backend).
  useEffect(() => {
    if (gameplayReady) setStartupError(null);
  }, [gameplayReady]);

  // Watchdog + captura de error de arranque. Solo activo mientras arranca.
  useEffect(() => {
    if (gameState !== 'playing' || gameplayReady || startupError) return undefined;
    if (isStartupFatalError(realtimeError)) {
      setStartupError({ message: realtimeError.message });
      return undefined;
    }
    const timer = globalThis.setTimeout(() => {
      setStartupError({
        message: 'No se pudo iniciar la partida. Comprueba la conexión y vuelve a intentarlo.'
      });
    }, STARTUP_WATCHDOG_MS);
    return () => globalThis.clearTimeout(timer);
  }, [gameState, gameplayReady, startupError, realtimeError]);

  const handleStartupRetry = useCallback(() => {
    setStartupError(null);
    onRetry();
  }, [onRetry]);

  return { startupError, gameplayReady, handleStartupRetry };
}
