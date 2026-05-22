/**
 * @fileoverview Tests del hook useActiveAnnouncements (T-942).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useActiveAnnouncements } from '../useActiveAnnouncements';
import announcementsService from '../../services/announcements';

vi.mock('../../services/announcements', () => ({
  default: {
    listActiveAnnouncements: vi.fn()
  }
}));

const localMock = () => {
  const store = new Map();
  return {
    getItem: vi.fn(key => store.get(key) ?? null),
    setItem: vi.fn((key, value) => store.set(key, value)),
    removeItem: vi.fn(key => store.delete(key)),
    clear: vi.fn(() => store.clear())
  };
};

describe('useActiveAnnouncements (T-942)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: localMock(),
      writable: true
    });
  });

  it('carga avisos al montar', async () => {
    announcementsService.listActiveAnnouncements.mockResolvedValue({
      items: [{ id: 'a1', title: 'Aviso 1', severity: 'info' }]
    });

    const { result } = renderHook(() => useActiveAnnouncements());

    await waitFor(() => {
      expect(result.current.announcements).toHaveLength(1);
    });
    expect(result.current.announcements[0].id).toBe('a1');
  });

  it('filtra los ya descartados via localStorage', async () => {
    window.localStorage.setItem('announcement-dismissed:a1', '1');
    announcementsService.listActiveAnnouncements.mockResolvedValue({
      items: [
        { id: 'a1', title: 'Visto', severity: 'info' },
        { id: 'a2', title: 'Nuevo', severity: 'urgent' }
      ]
    });

    const { result } = renderHook(() => useActiveAnnouncements());

    await waitFor(() => {
      expect(result.current.announcements).toHaveLength(1);
    });
    expect(result.current.announcements[0].id).toBe('a2');
  });

  it('dismissOne persiste el id en localStorage y remueve del estado', async () => {
    announcementsService.listActiveAnnouncements.mockResolvedValue({
      items: [
        { id: 'a1', title: 'Aviso 1', severity: 'info' },
        { id: 'a2', title: 'Aviso 2', severity: 'urgent' }
      ]
    });

    const { result } = renderHook(() => useActiveAnnouncements());

    await waitFor(() => {
      expect(result.current.announcements).toHaveLength(2);
    });

    act(() => {
      result.current.dismissOne('a1');
    });

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'announcement-dismissed:a1',
      '1'
    );
    expect(result.current.announcements).toHaveLength(1);
    expect(result.current.announcements[0].id).toBe('a2');
  });

  it('no rompe si la API falla', async () => {
    announcementsService.listActiveAnnouncements.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useActiveAnnouncements());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.announcements).toHaveLength(0);
    expect(result.current.error).toBeDefined();
  });

  it('respeta enabled=false', async () => {
    const { result } = renderHook(() =>
      useActiveAnnouncements({ enabled: false })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(announcementsService.listActiveAnnouncements).not.toHaveBeenCalled();
  });
});
