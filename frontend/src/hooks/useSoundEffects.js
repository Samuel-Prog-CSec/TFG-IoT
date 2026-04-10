/**
 * Hook para efectos de sonido del juego
 * Respeta soundEnabled del juego y shouldReduceMotion de accesibilidad
 */
import { useCallback, useEffect } from 'react';
import { useReducedMotion } from './useReducedMotion';
import soundEffectsService from '../services/soundEffectsService';

export function useSoundEffects(soundEnabled = true) {
  const { shouldReduceMotion } = useReducedMotion();
  const isEnabled = soundEnabled && !shouldReduceMotion;

  useEffect(() => {
    soundEffectsService.setEnabled(isEnabled);
  }, [isEnabled]);

  useEffect(() => {
    return () => soundEffectsService.dispose();
  }, []);

  const playCorrect = useCallback(() => soundEffectsService.playCorrect(), []);
  const playIncorrect = useCallback(() => soundEffectsService.playIncorrect(), []);
  const playTick = useCallback(() => soundEffectsService.playTick(), []);
  const playRoundStart = useCallback(() => soundEffectsService.playRoundStart(), []);
  const playGameOver = useCallback(() => soundEffectsService.playGameOver(), []);
  const playSuccess = useCallback(() => soundEffectsService.playSuccess(), []);

  return { playCorrect, playIncorrect, playTick, playRoundStart, playGameOver, playSuccess, isEnabled };
}
