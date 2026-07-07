/**
 * @fileoverview Tests del hook useStartupGuard (blindaje del arranque de partida).
 * Cubre las 3 mecánicas: nunca dejar al docente ante un skeleton infinito cuando
 * el arranque falla (tarjeta en uso, config/plan inválido) o se cuelga.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStartupGuard } from '../useStartupGuard';

const base = {
  gameState: 'playing',
  playId: 'p1',
  realtimeError: null,
  sessionIsMemory: true,
  sessionIsSequence: false,
  memoryBoardLength: 0,
  sequenceLength: 0,
  hasChallenge: false,
  onRetry: () => {}
};

describe('useStartupGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('muestra error de arranque de inmediato ante un error FATAL del backend', () => {
    const { result } = renderHook(() =>
      useStartupGuard({ ...base, realtimeError: { message: 'La tarjeta Círculo ya está en uso en otra partida' } })
    );
    expect(result.current.startupError).toEqual({
      message: 'La tarjeta Círculo ya está en uso en otra partida'
    });
  });

  it('watchdog: sin tablero/reto ni error, tras 10s marca un error genérico', () => {
    const { result } = renderHook(() => useStartupGuard({ ...base }));
    expect(result.current.startupError).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.startupError?.message).toMatch(/No se pudo iniciar/);
  });

  it('NO marca error si el gameplay ya está listo (Memoria: tablero poblado)', () => {
    const { result } = renderHook(() =>
      useStartupGuard({ ...base, memoryBoardLength: 12, realtimeError: { message: 'algo' } })
    );
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(result.current.startupError).toBeNull();
  });

  it('un error TRANSITORIO (desconexión) no es fatal de arranque', () => {
    const { result } = renderHook(() =>
      useStartupGuard({ ...base, realtimeError: { code: 'SOCKET_DISCONNECTED', message: 'reconectando' } })
    );
    // No se marca de inmediato; el overlay de reconexión lo gestiona.
    expect(result.current.startupError).toBeNull();
  });

  it('readiness por mecánica — Secuencia usa sequenceLength', () => {
    const { result } = renderHook(() =>
      useStartupGuard({
        ...base,
        sessionIsMemory: false,
        sessionIsSequence: true,
        sequenceLength: 3,
        realtimeError: { message: 'x' }
      })
    );
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    // La secuencia ya llegó → listo → sin panel de error.
    expect(result.current.startupError).toBeNull();
    expect(result.current.gameplayReady).toBe(true);
  });

  it('readiness por mecánica — Asociación usa hasChallenge', () => {
    const { result } = renderHook(() =>
      useStartupGuard({
        ...base,
        sessionIsMemory: false,
        sessionIsSequence: false,
        hasChallenge: true,
        realtimeError: { message: 'x' }
      })
    );
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(result.current.startupError).toBeNull();
    expect(result.current.gameplayReady).toBe(true);
  });

  it('fuera de "playing" (waiting) no arma el watchdog', () => {
    const { result } = renderHook(() => useStartupGuard({ ...base, gameState: 'waiting' }));
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(result.current.startupError).toBeNull();
  });

  it('reintento llama a onRetry; si el reintento tiene éxito (llega el tablero) el panel se limpia', () => {
    const onRetry = vi.fn();
    const { result, rerender } = renderHook(props => useStartupGuard(props), {
      initialProps: { ...base, realtimeError: { message: 'La tarjeta X ya está en uso' }, onRetry }
    });
    expect(result.current.startupError).not.toBeNull();

    act(() => {
      result.current.handleStartupRetry();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Reintento exitoso: el backend reclama la tarjeta huérfana y envía el tablero
    // → gameplayReady pasa a true → el panel de error se limpia.
    rerender({ ...base, memoryBoardLength: 12, realtimeError: null, onRetry });
    expect(result.current.startupError).toBeNull();
  });
});
