import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSharedLayoutTransition, sharedLayoutId } from '../useSharedLayoutTransition';

// Mock del hook useReducedMotion para controlar el valor en cada test.
vi.mock('../useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => ({ shouldReduceMotion: false }))
}));

import { useReducedMotion } from '../useReducedMotion';

describe('useSharedLayoutTransition', () => {
  beforeEach(() => {
    useReducedMotion.mockReturnValue({ shouldReduceMotion: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('genera un layoutId estable cuando hay kind + id', () => {
    const { result } = renderHook(() => useSharedLayoutTransition('deck', 'abc123'));
    expect(result.current).toBe('deck-abc123');
  });

  it('devuelve undefined si shouldReduceMotion=true', () => {
    useReducedMotion.mockReturnValue({ shouldReduceMotion: true });
    const { result } = renderHook(() => useSharedLayoutTransition('deck', 'abc123'));
    expect(result.current).toBeUndefined();
  });

  it('devuelve undefined si falta el id', () => {
    const { result } = renderHook(() => useSharedLayoutTransition('deck', null));
    expect(result.current).toBeUndefined();
  });

  it('devuelve undefined si falta el kind', () => {
    const { result } = renderHook(() => useSharedLayoutTransition('', 'abc'));
    expect(result.current).toBeUndefined();
  });

  it('sharedLayoutId (helper puro) genera el mismo formato', () => {
    expect(sharedLayoutId('session', '999')).toBe('session-999');
  });
});
