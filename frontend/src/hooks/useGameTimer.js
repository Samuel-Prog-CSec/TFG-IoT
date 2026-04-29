/**
 * @fileoverview Hook para gestionar el temporizador visual de la ronda
 * y los anuncios de accesibilidad asociados al tiempo restante.
 *
 * @module hooks/useGameTimer
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/** Umbrales de tiempo restante que disparan anuncios de screen reader */
const TIMER_ANNOUNCEMENT_THRESHOLDS = new Set([10, 5, 3, 2, 1, 0]);

/**
 * @param {Object} options
 * @param {string} options.gameState - Estado actual del juego ('waiting'|'playing'|'paused'|'finished')
 * @param {boolean} options.isAwaitingResponse - Si se espera respuesta del jugador
 * @param {boolean} options.isMemoryMode - Si la mecánica es memoria
 * @param {boolean} options.memoryFeedbackActive - Si el feedback de memoria está activo
 * @param {number} options.roundTime - Duración total de la ronda en segundos
 * @param {Function} options.playTick - Función para reproducir sonido de tick
 */
export function useGameTimer({
  gameState,
  isAwaitingResponse,
  isMemoryMode,
  memoryFeedbackActive,
  roundTime,
  playTick,
  /**
   * Modo Memoria: senal externa que indica si el backend ha confirmado
   * board_ready y el timer del lado servidor esta activo. Mientras sea
   * false, NO decrementamos en el cliente para evitar el bug visual de
   * "TimerBar vacia en bucle" que aparecia cuando el `playEndsAt` del
   * backend aun era null (ver GameEngine.confirmBoardReady).
   */
  memoryTimerArmed = false
}) {
  const [timeLeft, setTimeLeft] = useState(roundTime);
  const announcedThresholdsRef = useRef(new Set());
  const previousRoundTimeRef = useRef(roundTime);

  // Sincronizar timeLeft con roundTime cada vez que el prop cambia. Casos:
  // - Primera ronda tras cargar la sesion (stale 1s -> valor real).
  // - Nueva ronda con distinta duracion.
  // La version anterior solo re-sincronizaba si `prev === 0 || prev > roundTime`,
  // dejando un timer fosilizado en 1s cuando la UI arrancaba con un valor
  // pequeno y luego recibia el timeLimit real (QA 22/04/2026: "Quedan 1 segundos"
  // aparecia brevemente en aria-live al entrar a la partida).
  useEffect(() => {
    if (previousRoundTimeRef.current !== roundTime) {
      setTimeLeft(roundTime);
      previousRoundTimeRef.current = roundTime;
    }
  }, [roundTime]);

  // Temporizador visual: decrementa cada segundo mientras se juega.
  // En Memoria esperamos ademas a que el backend haya confirmado el arranque
  // del timer (`memoryTimerArmed`); antes de eso, la UI muestra la barra
  // completa en lugar de contar hacia cero con un valor invalido.
  useEffect(() => {
    const inActivePhase = isMemoryMode ? !memoryFeedbackActive : isAwaitingResponse;
    const memoryGatePasses = !isMemoryMode || memoryTimerArmed;
    const shouldRunVisualTimer = gameState === 'playing' && inActivePhase && memoryGatePasses;

    if (!shouldRunVisualTimer) {
      return undefined;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        const newTimeLeft = Math.max(0, prev - 1);
        if (newTimeLeft <= 5 && newTimeLeft > 0) { playTick(); }
        return newTimeLeft;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, isAwaitingResponse, isMemoryMode, memoryFeedbackActive, memoryTimerArmed, playTick, roundTime]);

  /**
   * Comprueba si el tiempo restante actual debe generar un anuncio de accesibilidad.
   * Devuelve el string del anuncio o null si no hay anuncio pendiente.
   */
  const announceTimerThreshold = useCallback(() => {
    const shouldRunVisualTimer =
      gameState === 'playing' && (isMemoryMode ? !memoryFeedbackActive : isAwaitingResponse);

    if (!shouldRunVisualTimer) {
      return null;
    }

    if (!TIMER_ANNOUNCEMENT_THRESHOLDS.has(timeLeft)) {
      return null;
    }

    if (announcedThresholdsRef.current.has(timeLeft)) {
      return null;
    }

    announcedThresholdsRef.current.add(timeLeft);

    if (timeLeft === 0) {
      if (gameState === 'playing') {
        return 'Tiempo agotado.';
      }
      return null;
    }

    return `Quedan ${timeLeft} segundos.`;
  }, [gameState, isAwaitingResponse, isMemoryMode, memoryFeedbackActive, timeLeft]);

  /** Limpia los umbrales anunciados (útil al iniciar nueva ronda) */
  const clearAnnouncedThresholds = useCallback(() => {
    announcedThresholdsRef.current.clear();
  }, []);

  return {
    timeLeft,
    setTimeLeft,
    announceTimerThreshold,
    clearAnnouncedThresholds
  };
}
