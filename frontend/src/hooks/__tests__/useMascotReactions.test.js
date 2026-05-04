/**
 * @fileoverview Tests del hook `useMascotReactions` (ADR-D).
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useMascotReactions } from '../useMascotReactions';
import { MASCOT_DIALOG } from '../../lib/mascotDialog';

describe('useMascotReactions', () => {
  it('devuelve mood idle por defecto cuando no hay evento', () => {
    const { result } = renderHook(() => useMascotReactions({ mechanicType: 'memory' }));
    expect(result.current.mood).toBe('idle');
    expect(result.current.message).toBeNull();
  });

  it('reacciona a un correctAnswer con mood happy y frase de Memoria', () => {
    const virtualNow = 1000;
    const { result, rerender } = renderHook(
      ({ event }) =>
        useMascotReactions(
          { mechanicType: 'memory', lastEvent: event, streak: 1 },
          { now: () => virtualNow }
        ),
      { initialProps: { event: null } }
    );

    rerender({ event: { type: 'correctAnswer', id: 1 } });
    expect(result.current.mood).toBe('happy');
    expect(MASCOT_DIALOG.memory.correctAnswer).toContain(result.current.message);
  });

  it('promueve a celebrating + streakReached cuando streak >= umbral', () => {
    const virtualNow = 1000;
    const { result, rerender } = renderHook(
      ({ event, streak }) =>
        useMascotReactions(
          { mechanicType: 'sequence', lastEvent: event, streak },
          { now: () => virtualNow }
        ),
      { initialProps: { event: null, streak: 0 } }
    );

    rerender({ event: { type: 'correctAnswer', id: 1 }, streak: 3 });
    expect(result.current.mood).toBe('celebrating');
    expect(MASCOT_DIALOG.sequence.streakReached).toContain(result.current.message);
  });

  it('respeta cooldown: ignora un segundo evento dentro del intervalo', () => {
    let virtualNow = 1000;
    const { result, rerender } = renderHook(
      ({ event }) =>
        useMascotReactions(
          { mechanicType: 'association', lastEvent: event },
          { cooldownMs: 1000, now: () => virtualNow }
        ),
      { initialProps: { event: null } }
    );

    rerender({ event: { type: 'correctAnswer', id: 1 } });
    const firstMessage = result.current.message;

    // Pasamos 500ms (todavía dentro del cooldown)
    virtualNow = 1500;
    rerender({ event: { type: 'errorAnswer', id: 2 } });
    expect(result.current.message).toBe(firstMessage);
    expect(result.current.mood).toBe('happy');

    // Pasamos otros 600ms (cooldown ya cumplido)
    virtualNow = 2100;
    rerender({ event: { type: 'errorAnswer', id: 3 } });
    expect(result.current.mood).toBe('encouraging');
  });

  it('un timeout coloca a la mascota en sad con frase de timeout', () => {
    const virtualNow = 1000;
    const { result, rerender } = renderHook(
      ({ event }) =>
        useMascotReactions(
          { mechanicType: 'memory', lastEvent: event },
          { now: () => virtualNow }
        ),
      { initialProps: { event: null } }
    );

    rerender({ event: { type: 'timeout', id: 1 } });
    expect(result.current.mood).toBe('sad');
    expect(MASCOT_DIALOG.memory.timeout).toContain(result.current.message);
  });

  it('un evento gameOver con tier alto usa frases gameOverHigh', () => {
    const virtualNow = 1000;
    const { result, rerender } = renderHook(
      ({ event, tier }) =>
        useMascotReactions(
          { mechanicType: 'memory', lastEvent: event, gameOverTier: tier },
          { now: () => virtualNow }
        ),
      { initialProps: { event: null, tier: null } }
    );

    rerender({ event: { type: 'gameOver', id: 1 }, tier: 'high' });
    expect(result.current.mood).toBe('celebrating');
    expect(MASCOT_DIALOG.memory.gameOverHigh).toContain(result.current.message);
  });
});
