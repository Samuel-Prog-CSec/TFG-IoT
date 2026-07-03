import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameFeedback } from '../useGameFeedback';
import { MASCOT_DIALOG } from '../../lib/mascotDialog';

// Verificación de la MATRIZ DE DISPARO de la mascota "Otto" (ADR-204): que
// cada disparador produzca el MOOD correcto y una frase del POOL correcto.
// Incluye corrección cross-mecánica (no mezclar frases de otra mecánica) y
// verificación inversa (reset → idle). `useConfetti` se mockea para evitar
// el canvas en jsdom (solo nos interesa mood + frase).

vi.mock('../useConfetti', () => ({
  useConfetti: () => ({
    fireFromElement: vi.fn(),
    fireBurst: vi.fn(),
    fireSuccess: vi.fn(),
    fireFireworks: vi.fn()
  })
}));

const setup = (mechanicType = 'sequence') =>
  renderHook(() => useGameFeedback({ mechanicType, shouldReduceMotion: true }));

const ctx = { currentRound: 1, totalRounds: 5 };
const CORRECT = { isCorrect: true, timeout: false, pointsAwarded: 10, newScore: 10 };
const WRONG = { isCorrect: false, timeout: false, pointsAwarded: 0, newScore: 0 };
const TIMEOUT = { isCorrect: false, timeout: true, pointsAwarded: 0, newScore: 0 };

describe('useGameFeedback — matriz de disparo de Otto (mood + frase por evento)', () => {
  it('primer acierto → happy + frase de firstCorrect', () => {
    const { result } = setup('sequence');
    act(() => result.current.processValidationResult(CORRECT, ctx));
    expect(result.current.mascotMood).toBe('happy');
    expect(MASCOT_DIALOG.sequence.firstCorrect).toContain(result.current.mascotMessage);
  });

  it('acierto posterior (ni primero ni racha) → happy + correctAnswer', () => {
    const { result } = setup('sequence');
    act(() => {
      result.current.processValidationResult(CORRECT, ctx);
      result.current.processValidationResult(CORRECT, ctx);
    });
    expect(result.current.mascotMood).toBe('happy');
    expect(MASCOT_DIALOG.sequence.correctAnswer).toContain(result.current.mascotMessage);
  });

  it('racha >=3 → celebrating + streakReached', () => {
    const { result } = setup('sequence');
    act(() => {
      result.current.processValidationResult(CORRECT, ctx);
      result.current.processValidationResult(CORRECT, ctx);
      result.current.processValidationResult(CORRECT, ctx);
    });
    expect(result.current.mascotMood).toBe('celebrating');
    expect(MASCOT_DIALOG.sequence.streakReached).toContain(result.current.mascotMessage);
  });

  it('racha rota (venía >=3) → surprised + streakBroken', () => {
    const { result } = setup('sequence');
    act(() => {
      result.current.processValidationResult(CORRECT, ctx);
      result.current.processValidationResult(CORRECT, ctx);
      result.current.processValidationResult(CORRECT, ctx);
    });
    act(() => result.current.processValidationResult(WRONG, ctx));
    expect(result.current.mascotMood).toBe('surprised');
    expect(MASCOT_DIALOG.sequence.streakBroken).toContain(result.current.mascotMessage);
  });

  it('timeout → encouraging + frase de timeout (AS-3: consuelo, no llanto)', () => {
    const { result } = setup('sequence');
    act(() => result.current.processValidationResult(TIMEOUT, ctx));
    // AS-3: el timeout usa mood de consuelo (`encouraging`), no `sad` (llanto). Una
    // cara de llanto al agotarse el tiempo transmitía castigo en vez de ánimo.
    expect(result.current.mascotMood).toBe('encouraging');
    expect(MASCOT_DIALOG.sequence.timeout).toContain(result.current.mascotMessage);
  });

  it('5+ errores con racha 0 → worried + worriedRebound', () => {
    const { result } = setup('sequence');
    act(() => {
      for (let i = 0; i < 5; i++) result.current.processValidationResult(WRONG, ctx);
    });
    expect(result.current.mascotMood).toBe('worried');
    expect(MASCOT_DIALOG.sequence.worriedRebound).toContain(result.current.mascotMessage);
  });

  it('signalSequencePhase: memorizar → thinking, reproducir → pointing', () => {
    const { result } = setup('sequence');
    act(() => result.current.signalSequencePhase('memorizing'));
    expect(result.current.mascotMood).toBe('thinking');
    expect(MASCOT_DIALOG.sequence.memorizing).toContain(result.current.mascotMessage);
    act(() => result.current.signalSequencePhase('reproducing'));
    expect(result.current.mascotMood).toBe('pointing');
    expect(MASCOT_DIALOG.sequence.reproducing).toContain(result.current.mascotMessage);
  });

  it('signalRoundStart: última ronda → encouraging + nearWin', () => {
    const { result } = setup('association');
    act(() => result.current.signalRoundStart({ currentRound: 6, totalRounds: 6 }));
    expect(result.current.mascotMood).toBe('encouraging');
    expect(MASCOT_DIALOG.association.nearWin).toContain(result.current.mascotMessage);
  });

  it('nearWin NO degrada un mood positivo: tras celebrating (racha), última ronda lo mantiene + frase nearWin', () => {
    const { result } = setup('association');
    act(() => {
      result.current.processValidationResult(CORRECT, ctx);
      result.current.processValidationResult(CORRECT, ctx);
      result.current.processValidationResult(CORRECT, ctx); // racha 3 → celebrating
    });
    expect(result.current.mascotMood).toBe('celebrating');
    act(() => result.current.signalRoundStart({ currentRound: 6, totalRounds: 6 }));
    // mantiene celebrating (no bajón a encouraging) pero añade la frase de cierre
    expect(result.current.mascotMood).toBe('celebrating');
    expect(MASCOT_DIALOG.association.nearWin).toContain(result.current.mascotMessage);
  });

  it('signalRoundStart: primera ronda → idle + roundStart', () => {
    const { result } = setup('memory');
    act(() => result.current.signalRoundStart({ currentRound: 1, totalRounds: 6 }));
    expect(result.current.mascotMood).toBe('idle');
    expect(MASCOT_DIALOG.memory.roundStart).toContain(result.current.mascotMessage);
  });

  it('signalIdleNudge → pointing + idleNudge', () => {
    const { result } = setup('memory');
    act(() => result.current.signalIdleNudge());
    expect(result.current.mascotMood).toBe('pointing');
    expect(MASCOT_DIALOG.memory.idleNudge).toContain(result.current.mascotMessage);
  });

  it('corrección cross-mecánica: en sequence la frase sale del pool de sequence (no association)', () => {
    const { result } = setup('sequence');
    act(() => result.current.processValidationResult(CORRECT, ctx));
    expect(MASCOT_DIALOG.sequence.firstCorrect).toContain(result.current.mascotMessage);
  });

  it('verificación inversa: resetForNewPlay vuelve a idle', () => {
    const { result } = setup('sequence');
    act(() => result.current.processValidationResult(CORRECT, ctx));
    expect(result.current.mascotMood).not.toBe('idle');
    act(() => result.current.resetForNewPlay());
    expect(result.current.mascotMood).toBe('idle');
  });

  // Memoria reacciona por `signalMemoryResult` (el backend emite memory_turn_state,
  // no validation_result). Antes Otto se quedaba mudo ante las parejas.
  it('Memoria: primera pareja → happy + firstCorrect', () => {
    const { result } = setup('memory');
    act(() => result.current.signalMemoryResult(true));
    expect(result.current.mascotMood).toBe('happy');
    expect(MASCOT_DIALOG.memory.firstCorrect).toContain(result.current.mascotMessage);
  });

  it('Memoria: 3 parejas seguidas → celebrating + streakReached', () => {
    const { result } = setup('memory');
    act(() => {
      result.current.signalMemoryResult(true);
      result.current.signalMemoryResult(true);
      result.current.signalMemoryResult(true);
    });
    expect(result.current.mascotMood).toBe('celebrating');
    expect(MASCOT_DIALOG.memory.streakReached).toContain(result.current.mascotMessage);
  });

  it('Memoria: fallo de pareja → encouraging + errorAnswer (del pool de memory)', () => {
    const { result } = setup('memory');
    act(() => result.current.signalMemoryResult(false));
    expect(result.current.mascotMood).toBe('encouraging');
    expect(MASCOT_DIALOG.memory.errorAnswer).toContain(result.current.mascotMessage);
  });

  it('Memoria: racha rota (venía >=3) → surprised + streakBroken', () => {
    const { result } = setup('memory');
    act(() => {
      result.current.signalMemoryResult(true);
      result.current.signalMemoryResult(true);
      result.current.signalMemoryResult(true);
    });
    act(() => result.current.signalMemoryResult(false));
    expect(result.current.mascotMood).toBe('surprised');
    expect(MASCOT_DIALOG.memory.streakBroken).toContain(result.current.mascotMessage);
  });
});
