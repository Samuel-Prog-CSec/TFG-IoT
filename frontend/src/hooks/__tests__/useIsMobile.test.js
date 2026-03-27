import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../useIsMobile';

describe('useIsMobile', () => {
  let changeHandler;
  const mockMatchMedia = vi.fn((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn((event, handler) => { changeHandler = handler; }),
    removeEventListener: vi.fn()
  }));

  beforeEach(() => {
    changeHandler = null;
    Object.defineProperty(globalThis, 'matchMedia', { value: mockMatchMedia, writable: true });
  });

  it('returns true when innerWidth is below breakpoint', () => {
    Object.defineProperty(globalThis, 'innerWidth', { value: 768, writable: true });
    const { result } = renderHook(() => useIsMobile(1024));

    expect(result.current).toBe(true);
  });

  it('returns false when innerWidth is at or above breakpoint', () => {
    Object.defineProperty(globalThis, 'innerWidth', { value: 1024, writable: true });
    const { result } = renderHook(() => useIsMobile(1024));

    expect(result.current).toBe(false);
  });

  it('reacts to media query changes', () => {
    Object.defineProperty(globalThis, 'innerWidth', { value: 1200, writable: true });
    const { result } = renderHook(() => useIsMobile(1024));

    expect(result.current).toBe(false);

    // Simulate resize below breakpoint
    Object.defineProperty(globalThis, 'innerWidth', { value: 800, writable: true });
    act(() => {
      changeHandler?.();
    });

    expect(result.current).toBe(true);
  });
});
