/**
 * @fileoverview Tests del hook useSystemAlertActions (T-942).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSystemAlertActions } from '../useSystemAlertActions';
import systemAlertsService from '../../services/systemAlerts';

vi.mock('sonner', () => {
  const toastFn = vi.fn();
  toastFn.success = vi.fn();
  toastFn.error = vi.fn();
  toastFn.warning = vi.fn();
  return { toast: toastFn };
});

vi.mock('../../services/systemAlerts', () => ({
  default: {
    dismissSystemAlert: vi.fn().mockResolvedValue({ status: 'dismissed' }),
    resolveSystemAlert: vi.fn().mockResolvedValue({ status: 'resolved' }),
    snoozeSystemAlert: vi.fn().mockResolvedValue({ status: 'snoozed' }),
    pinSystemAlert: vi.fn().mockResolvedValue({ status: 'active', pinned: true }),
    unpinSystemAlert: vi.fn().mockResolvedValue({ status: 'active', pinned: false }),
    bulkSystemAlertAction: vi
      .fn()
      .mockResolvedValue({ ok: 2, failed: 0, results: [] }),
    runDetectionNow: vi.fn().mockResolvedValue({})
  }
}));

const sampleAlert = (overrides = {}) => ({
  id: 'sys-alert-1',
  type: 'redis_high_latency',
  source: 'redis',
  severity: 'warning',
  status: 'active',
  title: 'Latencia',
  ...overrides
});

describe('useSystemAlertActions (T-942)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dismissWithUndo: optimistic remove inmediato', () => {
    const onListChange = vi.fn();
    const { result } = renderHook(() =>
      useSystemAlertActions({ onListChange })
    );

    act(() => {
      result.current.dismissWithUndo(sampleAlert());
    });

    expect(onListChange).toHaveBeenCalledTimes(1);
    const updater = onListChange.mock.calls[0][0];
    const filtered = updater([sampleAlert(), sampleAlert({ id: 'sys-2' })]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('sys-2');
  });

  it('dismissWithUndo: commit tras 5s', async () => {
    const onListChange = vi.fn();
    const onRefetch = vi.fn().mockResolvedValue();
    const { result } = renderHook(() =>
      useSystemAlertActions({ onListChange, onRefetch })
    );

    act(() => {
      result.current.dismissWithUndo(sampleAlert(), { reason: 'false_positive' });
    });

    expect(systemAlertsService.dismissSystemAlert).not.toHaveBeenCalled();

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(systemAlertsService.dismissSystemAlert).toHaveBeenCalledWith(
      'sys-alert-1',
      { reason: 'false_positive' }
    );
    expect(onRefetch).toHaveBeenCalled();
  });

  it('snoozeAlert prefiere untilHours sobre untilDays cuando ambos vienen', async () => {
    vi.useRealTimers();
    const onListChange = vi.fn();
    const { result } = renderHook(() =>
      useSystemAlertActions({ onListChange })
    );

    await act(async () => {
      await result.current.snoozeAlert(sampleAlert(), {
        untilHours: 6,
        untilDays: 2
      });
    });

    expect(systemAlertsService.snoozeSystemAlert).toHaveBeenCalledWith(
      'sys-alert-1',
      expect.objectContaining({ untilHours: 6, untilDays: 2 })
    );
  });

  it('snoozeAlert default a 24h cuando no se especifica unidad', async () => {
    vi.useRealTimers();
    const onListChange = vi.fn();
    const { result } = renderHook(() =>
      useSystemAlertActions({ onListChange })
    );

    await act(async () => {
      await result.current.snoozeAlert(sampleAlert());
    });

    expect(systemAlertsService.snoozeSystemAlert).toHaveBeenCalledWith(
      'sys-alert-1',
      expect.objectContaining({ untilHours: 24 })
    );
  });

  it('pinAlert llama al endpoint y triggera refetch', async () => {
    vi.useRealTimers();
    const onRefetch = vi.fn().mockResolvedValue();
    const { result } = renderHook(() =>
      useSystemAlertActions({ onListChange: vi.fn(), onRefetch })
    );

    await act(async () => {
      await result.current.pinAlert(sampleAlert());
    });

    expect(systemAlertsService.pinSystemAlert).toHaveBeenCalledWith('sys-alert-1');
    expect(onRefetch).toHaveBeenCalled();
  });

  it('bulkDismiss usa bulkSystemAlertAction con action=dismiss', async () => {
    vi.useRealTimers();
    const { result } = renderHook(() =>
      useSystemAlertActions({ onListChange: vi.fn() })
    );

    await act(async () => {
      await result.current.bulkDismiss([
        sampleAlert({ id: 'a' }),
        sampleAlert({ id: 'b' })
      ]);
    });

    expect(systemAlertsService.bulkSystemAlertAction).toHaveBeenCalledWith({
      ids: ['a', 'b'],
      action: 'dismiss',
      reason: 'other'
    });
  });
});
