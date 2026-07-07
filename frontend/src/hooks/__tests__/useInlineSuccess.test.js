import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useInlineSuccess } from '../useInlineSuccess';

describe('useInlineSuccess', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('arranca invisible y se hace visible al disparar trigger()', () => {
    const { result } = renderHook(() => useInlineSuccess());

    expect(result.current.visible).toBe(false);

    act(() => {
      result.current.trigger();
    });

    expect(result.current.visible).toBe(true);
  });

  it('se oculta automáticamente tras la duración por defecto (2000ms)', () => {
    const { result } = renderHook(() => useInlineSuccess());

    act(() => {
      result.current.trigger();
    });

    expect(result.current.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.visible).toBe(false);
  });

  it('respeta una duración personalizada', () => {
    const { result } = renderHook(() => useInlineSuccess({ duration: 500 }));

    act(() => {
      result.current.trigger();
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.visible).toBe(false);
  });

  it('un nuevo trigger reinicia el timer sin flicker', () => {
    const { result } = renderHook(() => useInlineSuccess({ duration: 1000 }));

    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.visible).toBe(true);

    // Re-trigger reinicia el timer
    act(() => {
      result.current.trigger();
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(result.current.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.visible).toBe(false);
  });
});
