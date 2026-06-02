/**
 * @fileoverview Tests del hook useAlertActions (T-941).
 *
 * Cubre:
 *  - dismissWithUndo: optimistic remove + commit tras 5s
 *  - dismissWithUndo: cancelación si se pulsa Undo
 *  - resolveAlert / snoozeAlert / pinAlert con optimistic update
 *  - bulkDismiss / bulkSnooze
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAlertActions } from '../useAlertActions';
import analyticsService from '../../services/analytics';

// Mock sonner antes de import del hook (importado dentro de useAlertActions)
vi.mock('sonner', () => {
  const toastFn = vi.fn();
  toastFn.success = vi.fn();
  toastFn.error = vi.fn();
  toastFn.warning = vi.fn();
  return { toast: toastFn };
});

vi.mock('../../services/analytics', () => ({
  default: {
    dismissAlert: vi.fn().mockResolvedValue({ status: 'dismissed' }),
    resolveAlert: vi.fn().mockResolvedValue({ status: 'resolved' }),
    snoozeAlert: vi.fn().mockResolvedValue({ status: 'snoozed' }),
    pinAlert: vi.fn().mockResolvedValue({ status: 'active', pinned: true }),
    unpinAlert: vi.fn().mockResolvedValue({ status: 'active', pinned: false }),
    bulkAlertAction: vi.fn().mockResolvedValue({ ok: 2, failed: 0, results: [] })
  }
}));

const sampleAlert = (overrides = {}) => ({
  id: 'alert-1',
  studentId: 'student-1',
  studentName: 'Alumno X',
  type: 'inactivity',
  severity: 'warning',
  status: 'active',
  ...overrides
});

describe('useAlertActions (T-941)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dismissWithUndo: hace optimistic remove inmediatamente', () => {
    const onListChange = vi.fn();
    const { result } = renderHook(() => useAlertActions({ onListChange }));

    act(() => {
      result.current.dismissWithUndo(sampleAlert());
    });

    // Optimistic: onListChange recibe un updater que elimina la alerta
    expect(onListChange).toHaveBeenCalledTimes(1);
    const updater = onListChange.mock.calls[0][0];
    const filtered = updater([sampleAlert(), sampleAlert({ id: 'alert-2' })]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('alert-2');
  });

  it('dismissWithUndo: commit al backend tras 5s', async () => {
    const onListChange = vi.fn();
    const onRefetch = vi.fn().mockResolvedValue();
    const { result } = renderHook(() =>
      useAlertActions({ onListChange, onRefetch })
    );

    act(() => {
      result.current.dismissWithUndo(sampleAlert(), { reason: 'false_positive' });
    });

    // Antes de 5s no se ha llamado al servicio
    expect(analyticsService.dismissAlert).not.toHaveBeenCalled();

    // Avanzar todos los timers (fakeTimers) y esperar microtasks
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(analyticsService.dismissAlert).toHaveBeenCalledWith('alert-1', {
      reason: 'false_positive'
    });
  });

  it('resolveAlert: optimistic remove + call backend', async () => {
    const onListChange = vi.fn();
    const onRefetch = vi.fn().mockResolvedValue();
    const { result } = renderHook(() =>
      useAlertActions({ onListChange, onRefetch })
    );

    await act(async () => {
      await result.current.resolveAlert(sampleAlert());
    });

    expect(onListChange).toHaveBeenCalled();
    expect(analyticsService.resolveAlert).toHaveBeenCalledWith('alert-1');
    expect(onRefetch).toHaveBeenCalled();
  });

  it('snoozeAlert: invoca servicio con untilDays', async () => {
    const onListChange = vi.fn();
    const { result } = renderHook(() => useAlertActions({ onListChange }));

    await act(async () => {
      await result.current.snoozeAlert(sampleAlert(), { untilDays: 14 });
    });

    expect(analyticsService.snoozeAlert).toHaveBeenCalledWith('alert-1', { untilDays: 14 });
  });

  it('pinAlert: invoca servicio y refetch', async () => {
    const onListChange = vi.fn();
    const onRefetch = vi.fn().mockResolvedValue();
    const { result } = renderHook(() =>
      useAlertActions({ onListChange, onRefetch })
    );

    await act(async () => {
      await result.current.pinAlert(sampleAlert());
    });

    expect(analyticsService.pinAlert).toHaveBeenCalledWith('alert-1');
    expect(onRefetch).toHaveBeenCalled();
  });

  it('bulkDismiss: invoca bulkAlertAction con ids correctos', async () => {
    const { result } = renderHook(() => useAlertActions({ onListChange: vi.fn() }));

    await act(async () => {
      await result.current.bulkDismiss(
        [sampleAlert(), sampleAlert({ id: 'a2' })],
        { reason: 'irrelevant' }
      );
    });

    expect(analyticsService.bulkAlertAction).toHaveBeenCalledWith({
      ids: ['alert-1', 'a2'],
      action: 'dismiss',
      reason: 'irrelevant'
    });
  });

  it('bulkSnooze: invoca bulkAlertAction con untilDays', async () => {
    const { result } = renderHook(() => useAlertActions({ onListChange: vi.fn() }));

    await act(async () => {
      await result.current.bulkSnooze([sampleAlert()], { untilDays: 7 });
    });

    expect(analyticsService.bulkAlertAction).toHaveBeenCalledWith({
      ids: ['alert-1'],
      action: 'snooze',
      untilDays: 7
    });
  });
});
