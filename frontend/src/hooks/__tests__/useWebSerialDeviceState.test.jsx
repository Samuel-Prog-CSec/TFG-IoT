/**
 * @fileoverview Tests del hook useWebSerialDeviceState.
 *
 * Regresión clave (issue 4): si el sensor ya estaba `ready` ANTES de montar el
 * componente, el indicador debe reflejarlo — el bug era inicializar a `false`
 * y depender solo del evento edge-triggered `device_state_change`, que nunca
 * llega si no hay un cambio de estado posterior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../services/socket', () => ({
  socketService: {
    emitGameFireAndForget: vi.fn(),
    isGameSocketConnected: vi.fn(() => false)
  }
}));

vi.mock('../../lib/pendingScansStore', () => ({
  add: vi.fn().mockResolvedValue(null),
  getAll: vi.fn().mockResolvedValue([]),
  remove: vi.fn().mockResolvedValue(),
  purgeOlderThan: vi.fn().mockResolvedValue(0),
  clear: vi.fn().mockResolvedValue()
}));

import webSerialService from '../../services/webSerialService';
import useWebSerialDeviceState from '../useWebSerialDeviceState';

beforeEach(() => {
  // Reset del estado del singleton entre tests (persiste por diseño).
  webSerialService.deviceState = 'unknown';
  webSerialService.status = 'disconnected';
  webSerialService.firmwareVersion = null;
  webSerialService.hmacEnabled = false;
});

describe('useWebSerialDeviceState', () => {
  it('inicializa isReady=true si el sensor YA estaba ready antes de montar', () => {
    webSerialService.deviceState = 'ready';

    const { result } = renderHook(() => useWebSerialDeviceState());

    expect(result.current.isReady).toBe(true);
    expect(result.current.deviceState).toBe('ready');
  });

  it('parte de isReady=false cuando el sensor no está conectado', () => {
    const { result } = renderHook(() => useWebSerialDeviceState());

    expect(result.current.isReady).toBe(false);
    expect(result.current.deviceState).toBe('unknown');
  });

  it('refleja las transiciones posteriores de device_state_change', () => {
    const { result } = renderHook(() => useWebSerialDeviceState());
    expect(result.current.isReady).toBe(false);

    act(() => {
      webSerialService.setDeviceState('ready');
    });

    expect(result.current.isReady).toBe(true);
  });

  it('expone firmwareVersion y hmacEnabled leídos del singleton al montar', () => {
    webSerialService.deviceState = 'ready';
    webSerialService.firmwareVersion = '0xB2';
    webSerialService.hmacEnabled = true;

    const { result } = renderHook(() => useWebSerialDeviceState());

    expect(result.current.firmwareVersion).toBe('0xB2');
    expect(result.current.hmacEnabled).toBe(true);
  });
});
