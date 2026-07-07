import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useSidebarMode } from '../useSidebarMode';

const setViewportWidth = (width) => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
};

describe('useSidebarMode', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewportWidth(1920);
  });

  it('por defecto (auto) → expanded en ≥1440px', () => {
    setViewportWidth(1920);
    const { result } = renderHook(() => useSidebarMode());
    expect(result.current.layout).toBe('expanded');
    expect(result.current.preference).toBe('auto');
  });

  it('por defecto (auto) → rail entre 1024-1439px (incluye 1366×768)', () => {
    setViewportWidth(1366);
    const { result } = renderHook(() => useSidebarMode());
    expect(result.current.layout).toBe('rail');
  });

  it('por defecto (auto) → drawer en <1024px', () => {
    setViewportWidth(800);
    const { result } = renderHook(() => useSidebarMode());
    expect(result.current.layout).toBe('drawer');
  });

  it('preferencia compact override (incluso en ≥1440px)', () => {
    setViewportWidth(1920);
    const { result } = renderHook(() => useSidebarMode());
    act(() => result.current.setPreference('compact'));
    expect(result.current.layout).toBe('rail');
    expect(result.current.preference).toBe('compact');
  });

  it('preferencia expanded override (incluso en 1366px)', () => {
    setViewportWidth(1366);
    const { result } = renderHook(() => useSidebarMode());
    act(() => result.current.setPreference('expanded'));
    expect(result.current.layout).toBe('expanded');
  });

  it('preferencia drawer no se override en <1024px (siempre drawer)', () => {
    setViewportWidth(800);
    const { result } = renderHook(() => useSidebarMode());
    act(() => result.current.setPreference('expanded'));
    expect(result.current.layout).toBe('drawer');
  });

  it('persistencia en localStorage', () => {
    setViewportWidth(1920);
    const { result, rerender } = renderHook(() => useSidebarMode());
    act(() => result.current.setPreference('compact'));
    rerender();
    expect(localStorage.getItem('sidebar:mode')).toBe('compact');

    const { result: result2 } = renderHook(() => useSidebarMode());
    expect(result2.current.preference).toBe('compact');
  });

  it('toggle() cicla auto → compact → expanded → auto', () => {
    const { result } = renderHook(() => useSidebarMode());
    expect(result.current.preference).toBe('auto');
    act(() => result.current.toggle());
    expect(result.current.preference).toBe('compact');
    act(() => result.current.toggle());
    expect(result.current.preference).toBe('expanded');
    act(() => result.current.toggle());
    expect(result.current.preference).toBe('auto');
  });
});
