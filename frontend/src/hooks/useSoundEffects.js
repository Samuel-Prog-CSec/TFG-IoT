/**
 * Hook para efectos de sonido del juego.
 *
 * Respeta unicamente la preferencia `soundEnabled` del toggle de juego.
 * NO se acopla a `prefers-reduced-motion`: son preferencias de accesibilidad
 * independientes. Un niño puede preferir animaciones reducidas pero quiere
 * seguir oyendo el feedback sonoro (al contrario, el sonido gana importancia
 * cuando se reduce el feedback visual). WCAG 2.5 trata motion y sound como
 * ejes separados.
 */
import { useCallback, useEffect } from 'react';
import soundEffectsService from '../services/soundEffectsService';

export function useSoundEffects(soundEnabled = true) {
  const isEnabled = soundEnabled;

  useEffect(() => {
    soundEffectsService.setEnabled(isEnabled);
  }, [isEnabled]);

  // (D-10-B7) NO disponer del singleton en cleanup: `soundEffectsService`
  // es una instancia compartida. Si dos componentes consumen este hook (ej.
  // GameSession + un panel hijo que también lo usa) y uno desmonta, el
  // `dispose()` cerraría el AudioContext y dejaría al otro componente sin
  // sonido. El AudioContext se libera implícitamente al cerrar la pestaña
  // del navegador — no necesita cleanup explícito a nivel de hook.

  const playCorrect = useCallback(() => soundEffectsService.playCorrect(), []);
  const playIncorrect = useCallback(() => soundEffectsService.playIncorrect(), []);
  const playTick = useCallback(() => soundEffectsService.playTick(), []);
  const playRoundStart = useCallback(() => soundEffectsService.playRoundStart(), []);
  const playGameOver = useCallback(() => soundEffectsService.playGameOver(), []);
  const playSuccess = useCallback(() => soundEffectsService.playSuccess(), []);
  const playCardDeal = useCallback(() => soundEffectsService.playCardDeal(), []);
  const playCardSweep = useCallback(() => soundEffectsService.playCardSweep(), []);
  const playSequenceComplete = useCallback(() => soundEffectsService.playSequenceComplete(), []);

  return {
    playCorrect,
    playIncorrect,
    playTick,
    playRoundStart,
    playGameOver,
    playSuccess,
    playCardDeal,
    playCardSweep,
    playSequenceComplete,
    isEnabled
  };
}
