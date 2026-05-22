/**
 * @fileoverview Tests del reducer y custom hook de estado del juego.
 * Extraído en Sprint 0 pre-v1.0.0 (C2 parcial). Verifica las transiciones
 * atómicas del reducer y la coherencia del ref espejado.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  gameReducer,
  INITIAL_GAME_STATE,
  useGameSessionState
} from '../useGameSessionState';

describe('gameReducer', () => {
  it('NEW_ROUND establece estado playing + isAwaitingResponse=true', () => {
    const next = gameReducer(INITIAL_GAME_STATE, { type: 'NEW_ROUND', round: 2, score: 10 });
    expect(next.gameState).toBe('playing');
    expect(next.currentRound).toBe(2);
    expect(next.score).toBe(10);
    expect(next.isAwaitingResponse).toBe(true);
  });

  it('ANSWER_CORRECT incrementa correctAnswers y limpia isAwaitingResponse', () => {
    const after = gameReducer(
      { ...INITIAL_GAME_STATE, isAwaitingResponse: true, correctAnswers: 3 },
      { type: 'ANSWER_CORRECT', score: 20 }
    );
    expect(after.correctAnswers).toBe(4);
    expect(after.isAwaitingResponse).toBe(false);
    expect(after.score).toBe(20);
  });

  it('ANSWER_INCORRECT actualiza score sin tocar correctAnswers', () => {
    const after = gameReducer(
      { ...INITIAL_GAME_STATE, correctAnswers: 5, isAwaitingResponse: true },
      { type: 'ANSWER_INCORRECT', score: -5 }
    );
    expect(after.correctAnswers).toBe(5);
    expect(after.score).toBe(-5);
    expect(after.isAwaitingResponse).toBe(false);
  });

  it('PAUSE → RESUME alterna isAwaitingResponse correctamente', () => {
    const paused = gameReducer(
      { ...INITIAL_GAME_STATE, gameState: 'playing', isAwaitingResponse: true },
      { type: 'PAUSE' }
    );
    expect(paused.gameState).toBe('paused');
    expect(paused.isAwaitingResponse).toBe(false);

    const resumed = gameReducer(paused, { type: 'RESUME' });
    expect(resumed.gameState).toBe('playing');
    expect(resumed.isAwaitingResponse).toBe(true);
  });

  it('FINISH marca finished + isAwaitingResponse=false + actualiza score', () => {
    const finished = gameReducer(
      { ...INITIAL_GAME_STATE, gameState: 'playing', isAwaitingResponse: true },
      { type: 'FINISH', score: 50 }
    );
    expect(finished.gameState).toBe('finished');
    expect(finished.isAwaitingResponse).toBe(false);
    expect(finished.score).toBe(50);
  });

  it('PLAY_STATE_SYNC solo actualiza campos presentes', () => {
    const partial = gameReducer(
      { ...INITIAL_GAME_STATE, gameState: 'playing', currentRound: 3, score: 30 },
      { type: 'PLAY_STATE_SYNC', score: 40 }
    );
    expect(partial.score).toBe(40);
    expect(partial.gameState).toBe('playing');
    expect(partial.currentRound).toBe(3);
  });

  it('RESET vuelve al estado inicial', () => {
    const reset = gameReducer(
      { gameState: 'finished', score: 99, correctAnswers: 10, currentRound: 5, isAwaitingResponse: false },
      { type: 'RESET' }
    );
    expect(reset).toEqual(INITIAL_GAME_STATE);
  });

  it('acción desconocida no muta el estado', () => {
    const before = { ...INITIAL_GAME_STATE, score: 7 };
    const after = gameReducer(before, { type: 'ALGO_QUE_NO_EXISTE' });
    expect(after).toBe(before);
  });
});

describe('useGameSessionState', () => {
  it('expone game inicial + gameStateRef sincronizado', () => {
    const { result } = renderHook(() => useGameSessionState());
    expect(result.current.game).toEqual(INITIAL_GAME_STATE);
    expect(result.current.gameStateRef.current).toBe('waiting');
  });

  it('dispatch NEW_ROUND actualiza game y refleja en gameStateRef tras render', () => {
    const { result } = renderHook(() => useGameSessionState());

    act(() => {
      result.current.dispatch({ type: 'NEW_ROUND', round: 1, score: 0 });
    });

    expect(result.current.game.gameState).toBe('playing');
    expect(result.current.gameStateRef.current).toBe('playing');
  });

  it('gameStateRef refleja gameState tras múltiples dispatches', () => {
    const { result } = renderHook(() => useGameSessionState());
    act(() => result.current.dispatch({ type: 'NEW_ROUND', round: 1, score: 0 }));
    act(() => result.current.dispatch({ type: 'PAUSE' }));
    expect(result.current.gameStateRef.current).toBe('paused');
    act(() => result.current.dispatch({ type: 'RESUME' }));
    expect(result.current.gameStateRef.current).toBe('playing');
    act(() => result.current.dispatch({ type: 'FINISH', score: 100 }));
    expect(result.current.gameStateRef.current).toBe('finished');
  });
});
