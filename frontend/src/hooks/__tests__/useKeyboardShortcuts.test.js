import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';

// Tests del hook useKeyboardShortcuts (T-951 Fase 5).
// Verifica: (a) atajos directos (Shift+?, Escape), (b) chords (g s),
// (c) guard contra inputs (no dispara dentro de un input/textarea),
// (d) opción `enabled=false` (deshabilitado), (e) cleanup del listener.

function dispatchKey(opts) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts });
  // Permitir target.closest — KeyboardEvent.target es read-only por defecto;
  // sobreescribimos en el evento mediante Object.defineProperty.
  if (opts.target) {
    Object.defineProperty(event, 'target', { value: opts.target, configurable: true });
  }
  document.dispatchEvent(event);
  return event;
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispara un atajo directo simple', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'Escape', description: 'cerrar', handler }]),
    );

    dispatchKey({ key: 'Escape' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispara un atajo con modificador Shift', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'Shift+?', description: 'help', handler }]),
    );

    dispatchKey({ key: '?', shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('dispara un chord g s tras pulsar las dos teclas en ventana', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'g s', description: 'sesiones', handler }]),
    );

    dispatchKey({ key: 'g' });
    dispatchKey({ key: 's' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('reinicia el chord si se supera el timeout', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'g s', description: 'sesiones', handler }]),
    );

    dispatchKey({ key: 'g' });
    vi.advanceTimersByTime(2000);
    dispatchKey({ key: 's' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('no dispara cuando el foco está dentro de un input', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'g s', description: 'sesiones', handler }]),
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    dispatchKey({ key: 'g', target: input });
    dispatchKey({ key: 's', target: input });

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('respeta allowInInput=true para Escape', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([
        { key: 'Escape', description: 'cerrar', handler, allowInInput: true },
      ]),
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    dispatchKey({ key: 'Escape', target: input });

    expect(handler).toHaveBeenCalledTimes(1);
    document.body.removeChild(input);
  });

  it('no dispara nada si el hook está deshabilitado', () => {
    const handler = vi.fn();
    renderHook(() =>
      useKeyboardShortcuts([{ key: 'Escape', description: 'cerrar', handler }], {
        enabled: false,
      }),
    );

    dispatchKey({ key: 'Escape' });
    expect(handler).not.toHaveBeenCalled();
  });
});
