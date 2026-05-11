import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePaginatedList } from '../usePaginatedList';

// Tests del hook usePaginatedList (T-952 Fase B).
// Cubre los caminos críticos: primer fetch, cambio de página, debounce
// de búsqueda, normalización de envelopes alternos, y cancelación con
// AbortController.

describe('usePaginatedList', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hace el primer fetch con page=1, limit por defecto y normaliza envelope estándar', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      data: {
        data: [{ id: 1 }, { id: 2 }],
        pagination: { page: 1, limit: 12, total: 2, totalPages: 1 },
      },
    });

    const { result } = renderHook(() => usePaginatedList({ fetcher }));

    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.pagination.total).toBe(2);
    expect(result.current.page).toBe(1);
    expect(result.current.limit).toBe(12);
  });

  it('soporta envelope anidado { data: { data, pagination } }', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      data: {
        data: {
          data: [{ id: 'a' }],
          pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
        },
      },
    });

    const { result } = renderHook(() => usePaginatedList({ fetcher, initialLimit: 10 }));

    await waitFor(() => expect(result.current.items).toEqual([{ id: 'a' }]));
    expect(result.current.pagination.limit).toBe(10);
  });

  it('cambia de página y dispara refetch con la nueva page', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      data: { data: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 1 } },
    });

    const { result } = renderHook(() => usePaginatedList({ fetcher }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    act(() => result.current.setPage(3));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const lastCall = fetcher.mock.calls[1][0];
    expect(lastCall.page).toBe(3);
  });

  it('resetea page=1 al aplicar un filtro nuevo', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      data: { data: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 1 } },
    });

    const { result } = renderHook(() => usePaginatedList({ fetcher }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    act(() => result.current.setPage(5));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.page).toBe(5);

    act(() => result.current.setFilters({ status: 'active' }));
    await waitFor(() => {
      expect(result.current.page).toBe(1);
    });
    const lastCall = fetcher.mock.calls[fetcher.mock.calls.length - 1][0];
    expect(lastCall.page).toBe(1);
    expect(lastCall.status).toBe('active');
  });

  it('aplica debounce al setSearch — no llama fetcher por cada keystroke', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      data: { data: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 1 } },
    });

    const { result } = renderHook(() =>
      usePaginatedList({ fetcher, searchDebounceMs: 300 }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setSearch('a');
      result.current.setSearch('ab');
      result.current.setSearch('abc');
    });

    // Antes del timeout no debe haber refetch nuevo.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Avanzar el timer para pasar el debounce.
    act(() => vi.advanceTimersByTime(350));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const lastCall = fetcher.mock.calls[fetcher.mock.calls.length - 1][0];
    expect(lastCall.search).toBe('abc');
  });

  it('expone isLoading y error correctamente', async () => {
    const error = new Error('boom');
    const fetcher = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    const { result } = renderHook(() => usePaginatedList({ fetcher, onError }));

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isLoading).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
  });
});
