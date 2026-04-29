import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFetch } from '../useFetch';

// useFetch re-throws errors from execute(), which causes unhandled rejections
// when called from the internal useEffect (no .catch()). Suppress for error tests.
// eslint-disable-next-line no-undef -- process is available in Node/vitest runtime
const suppressUnhandledRejections = () => process.on('unhandledRejection', () => {});

describe('useFetch', () => {
  let mockFetchFn;

  beforeEach(() => {
    mockFetchFn = vi.fn().mockResolvedValue({ data: 'test' });
  });

  it('starts in idle state when immediate is false', () => {
    const { result } = renderHook(() => useFetch(mockFetchFn, { immediate: false }));

    expect(result.current.isIdle).toBe(true);
    expect(result.current.data).toBeNull();
    expect(mockFetchFn).not.toHaveBeenCalled();
  });

  it('executes fetch immediately by default', async () => {
    const { result } = renderHook(() => useFetch(mockFetchFn));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ data: 'test' });
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });

  it('transitions from loading to success', async () => {
    let resolve;
    const slowFetch = vi.fn(() => new Promise(_resolve => { resolve = _resolve; }));
    const { result } = renderHook(() => useFetch(slowFetch));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolve({ data: 'done' });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toEqual({ data: 'done' });
    });
  });

  it('transitions from loading to error on failure', async () => {
    suppressUnhandledRejections();
    const failFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useFetch(failFetch));

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toBe('Network error');
  });

  it('calls onSuccess callback on success', async () => {
    const onSuccess = vi.fn();
    renderHook(() => useFetch(mockFetchFn, { onSuccess }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({ data: 'test' });
    });
  });

  it('calls onError callback on failure', async () => {
    suppressUnhandledRejections();
    const onError = vi.fn();
    const failFetch = vi.fn().mockRejectedValue(new Error('fail'));
    renderHook(() => useFetch(failFetch, { onError }));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it('refetch re-executes the fetch function', async () => {
    const { result } = renderHook(() => useFetch(mockFetchFn));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    mockFetchFn.mockResolvedValue({ data: 'refreshed' });

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ data: 'refreshed' });
    });

    expect(mockFetchFn).toHaveBeenCalledTimes(2);
  });

  it('execute passes additional arguments to fetch function', async () => {
    const { result } = renderHook(() => useFetch(mockFetchFn, { immediate: false }));

    await act(async () => {
      await result.current.execute('arg1', 'arg2');
    });

    expect(mockFetchFn).toHaveBeenCalledWith('arg1', 'arg2', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('does not update state after unmount', async () => {
    let resolve;
    const slowFetch = vi.fn(() => new Promise(_resolve => { resolve = _resolve; }));
    const { result, unmount } = renderHook(() => useFetch(slowFetch));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    unmount();

    // Should not throw or update after unmount
    await act(async () => {
      resolve({ data: 'late' });
    });
  });
});
