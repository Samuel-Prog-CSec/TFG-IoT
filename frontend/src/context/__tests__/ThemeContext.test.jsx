import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { THEME_STORAGE_KEY } from '../../constants/theme';

/**
 * Tests del ThemeContext (T-951 Fase 1).
 *
 * Cubre los tres modos (auto / light / dark), persistencia en localStorage,
 * resolución de "auto" según la preferencia del SO via matchMedia, y
 * sincronización del atributo data-theme y meta theme-color en <html>.
 */

let changeHandler = null;

function mockMatchMedia(prefersLight) {
  Object.defineProperty(globalThis, 'matchMedia', {
    writable: true,
    value: vi.fn((query) => ({
      matches: query === '(prefers-color-scheme: light)' ? prefersLight : false,
      media: query,
      addEventListener: vi.fn((event, handler) => {
        if (event === 'change') changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;

describe('ThemeContext', () => {
  beforeEach(() => {
    changeHandler = null;
    localStorage.clear();
    document.documentElement.dataset.theme = '';
    // Asegurar que existe la meta theme-color para el test de actualización
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', '#0f172a');
    mockMatchMedia(false);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('arranca en modo "auto" si no hay nada en localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe('auto');
  });

  it('lee el modo guardado de localStorage al inicializar', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
    expect(result.current.isLight).toBe(true);
  });

  it('en modo "auto" sigue la preferencia del sistema (light)', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe('auto');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('en modo "auto" sigue la preferencia del sistema (dark)', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current.mode).toBe('auto');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.isDark).toBe(true);
  });

  it('setMode persiste el valor en localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setMode('dark');
    });

    expect(result.current.mode).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('setMode ignora valores inválidos', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setMode('rainbow');
    });

    expect(result.current.mode).toBe('auto');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('aplica data-theme="light" al <html> cuando se elige light', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setMode('light');
    });

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('actualiza meta theme-color al cambiar de tema', () => {
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setMode('light');
    });

    const meta = document.querySelector('meta[name="theme-color"]');
    expect(meta?.getAttribute('content')).toBe('#fbf7ee');

    act(() => {
      result.current.setMode('dark');
    });

    expect(meta?.getAttribute('content')).toBe('#0f172a');
  });

  it('reacciona al evento change de matchMedia en modo auto', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.resolvedTheme).toBe('dark');

    // Simula que el SO cambia a tema claro mientras la app está abierta
    act(() => {
      changeHandler?.({ matches: true });
    });

    expect(result.current.resolvedTheme).toBe('light');
  });
});
