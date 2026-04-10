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

  return { fireConfetti, fireBurst, fireSuccess, fireFromElement };
}
