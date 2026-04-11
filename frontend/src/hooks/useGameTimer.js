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
  playTick
}) {
  const [timeLeft, setTimeLeft] = useState(roundTime);
  const announcedThresholdsRef = useRef(new Set());

  // Temporizador visual: decrementa cada segundo mientras se juega
  useEffect(() => {
    const shouldRunVisualTimer =
      gameState === 'playing' && (isMemoryMode ? !memoryFeedbackActive : isAwaitingResponse);

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
  }, [gameState, isAwaitingResponse, isMemoryMode, memoryFeedbackActive, playTick]);

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
