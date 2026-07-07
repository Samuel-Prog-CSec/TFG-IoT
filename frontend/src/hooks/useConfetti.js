/**
 * Hook centralizado para efectos de confetti.
 * Usa canvas-confetti (Canvas 2D con aceleracion hardware).
 * Respeta preferencia de movimiento reducido.
 *
 * Sprint 0 pre-v1.0.0 (M8): registra los intervals lanzados por
 * `fireFireworks` y los cancela en unmount, evitando que un componente
 * desmontado mid-celebración deje un setInterval activo que siga
 * pintando partículas hasta el `durationMs`. canvas-confetti gestiona
 * su propio rAF interno (autopara cuando las partículas mueren), por
 * lo que solo necesitamos limpiar nuestros intervals.
 */
import confetti from 'canvas-confetti';
import { useCallback, useEffect, useRef } from 'react';
import { useReducedMotion } from './useReducedMotion';

const BRAND_COLORS = ['#8b5cf6', '#22d3ee', '#f472b6', '#facc15', '#4ade80'];

export function useConfetti() {
  const { shouldReduceMotion } = useReducedMotion();
  /**
   * Set de intervalos activos lanzados desde `fireFireworks`. Los limpiamos
   * todos en el cleanup de useEffect para que un unmount durante la
   * celebración no deje setIntervals huérfanos.
   */
  const activeIntervalsRef = useRef(new Set());

  useEffect(() => {
    const intervals = activeIntervalsRef.current;
    return () => {
      for (const id of intervals) {
        clearInterval(id);
      }
      intervals.clear();
    };
  }, []);

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

  // T-953 Fase 2.11: aceptar `colors` por llamada (paleta de mecánica
  // en GameOver tier 2). Default sigue siendo BRAND_COLORS.
  const fireSuccess = useCallback((options = {}) => {
    if (shouldReduceMotion) return;
    const { colors, ...rest } = options;
    confetti({
      particleCount: 30,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors: colors || BRAND_COLORS,
      disableForReducedMotion: true,
      ...rest,
    });
    confetti({
      particleCount: 30,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors: colors || BRAND_COLORS,
      disableForReducedMotion: true,
      ...rest,
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
  // T-953 Fase 2.11: acepta `options` con `colors` opcional para tintar
  // los fireworks con la paleta de la mecánica (3⭐ GameOver). Sin
  // `colors`, mantiene la paleta brand.
  const fireFireworks = useCallback((durationMs = 1800, options = {}) => {
    if (shouldReduceMotion) return () => {};
    const palette = options?.colors || BRAND_COLORS;
    const end = Date.now() + durationMs;
    const intervals = activeIntervalsRef.current;
    const interval = setInterval(() => {
      if (Date.now() > end) {
        clearInterval(interval);
        intervals.delete(interval);
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
        colors: palette,
        shapes: ['star', 'circle'],
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 20,
        startVelocity: 40,
        spread: 360,
        ticks: 60,
        origin: { x: rightX, y: rightY },
        colors: palette,
        shapes: ['star', 'circle'],
        disableForReducedMotion: true,
      });
    }, 280);
    intervals.add(interval);
    return () => {
      clearInterval(interval);
      intervals.delete(interval);
    };
  }, [shouldReduceMotion]);

  return { fireConfetti, fireBurst, fireSuccess, fireFromElement, fireFireworks };
}
