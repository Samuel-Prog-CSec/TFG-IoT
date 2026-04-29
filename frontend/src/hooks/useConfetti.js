/**
 * Hook centralizado para efectos de confetti
 * Usa canvas-confetti (Canvas 2D con aceleracion hardware)
 * Respeta preferencia de movimiento reducido
 */
import confetti from 'canvas-confetti';
import { useCallback } from 'react';
import { useReducedMotion } from './useReducedMotion';

const BRAND_COLORS = ['#8b5cf6', '#22d3ee', '#f472b6', '#facc15', '#4ade80'];

export function useConfetti() {
  const { shouldReduceMotion } = useReducedMotion();

  const fireConfetti = useCallback((options = {}) => {
    if (shouldReduceMotion) return;
    confetti({
      particleCount: 40,
      spread: 55,
      colors: BRAND_COLORS,
      gravity: 1.2,
      disableForReducedMotion: true,
      ...options,
    });
  }, [shouldReduceMotion]);

  const fireBurst = useCallback((options = {}) => {
    if (shouldReduceMotion) return;
    confetti({
      particleCount: 25,
      spread: 70,
      origin: { y: 0.6 },
      colors: BRAND_COLORS,
      gravity: 1.2,
      disableForReducedMotion: true,
      ...options,
    });
  }, [shouldReduceMotion]);

  const fireSuccess = useCallback(() => {
    if (shouldReduceMotion) return;
    confetti({
      particleCount: 30,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors: BRAND_COLORS,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 30,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors: BRAND_COLORS,
      disableForReducedMotion: true,
    });
  }, [shouldReduceMotion]);

  const fireFromElement = useCallback((element, options = {}) => {
    if (shouldReduceMotion || !element) return;
    const rect = element.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;
    confetti({
      particleCount: 25,
      spread: 55,
      origin: { x, y },
      colors: BRAND_COLORS,
      gravity: 1.2,
      disableForReducedMotion: true,
      ...options,
    });
  }, [shouldReduceMotion]);

  /**
   * Efecto fireworks: rafagas aleatorias multiples durante `durationMs`.
   * Pensado para celebrar score perfecto (100%) en la pantalla post-partida.
   * Respeta reduced-motion: no dispara nada si el usuario lo prefiere.
   */
  const fireFireworks = useCallback((durationMs = 1800) => {
    if (shouldReduceMotion) return () => {};
    const end = Date.now() + durationMs;
    const interval = setInterval(() => {
      if (Date.now() > end) {
        clearInterval(interval);
        return;
      }
      // Dos rafagas (izquierda/derecha) por tick para densidad visual.
      // Math.random aqui es puramente decorativo (posicion de particulas);
      // no tiene implicaciones de seguridad.
      /* eslint-disable sonarjs/pseudo-random */
      const leftX = Math.random() * 0.3;
      const leftY = Math.random() * 0.4;
      const rightX = 0.7 + Math.random() * 0.3;
      const rightY = Math.random() * 0.4;
      /* eslint-enable sonarjs/pseudo-random */
      confetti({
        particleCount: 20,
        startVelocity: 40,
        spread: 360,
        ticks: 60,
        origin: { x: leftX, y: leftY },
        colors: BRAND_COLORS,
        shapes: ['star', 'circle'],
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 20,
        startVelocity: 40,
        spread: 360,
        ticks: 60,
        origin: { x: rightX, y: rightY },
        colors: BRAND_COLORS,
        shapes: ['star', 'circle'],
        disableForReducedMotion: true,
      });
    }, 280);
    return () => clearInterval(interval);
  }, [shouldReduceMotion]);

  return { fireConfetti, fireBurst, fireSuccess, fireFromElement, fireFireworks };
}
