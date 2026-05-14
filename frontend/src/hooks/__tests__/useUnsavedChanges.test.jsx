import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUnsavedChanges } from '../useUnsavedChanges';

describe('useUnsavedChanges', () => {
  describe('beforeunload protection', () => {
    let addSpy;
    let removeSpy;

    beforeEach(() => {
      addSpy = vi.spyOn(window, 'addEventListener');
      removeSpy = vi.spyOn(window, 'removeEventListener');
    });

    afterEach(() => {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('registra listener beforeunload al montar', () => {
      renderHook(() => useUnsavedChanges(false));
      const beforeUnloadCalls = addSpy.mock.calls.filter(([event]) => event === 'beforeunload');
      expect(beforeUnloadCalls.length).toBeGreaterThan(0);
    });

    it('llama a preventDefault en beforeunload solo cuando isDirty es true', () => {
      // Caso isDirty=false: no debe llamar preventDefault
      const { rerender } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
        initialProps: { dirty: false }
      });

      const eventNotDirty = new Event('beforeunload', { cancelable: true });
      const preventNotDirty = vi.spyOn(eventNotDirty, 'preventDefault');
      window.dispatchEvent(eventNotDirty);
      expect(preventNotDirty).not.toHaveBeenCalled();

      // Caso isDirty=true: sí debe llamar preventDefault
      rerender({ dirty: true });
      const eventDirty = new Event('beforeunload', { cancelable: true });
      const preventDirty = vi.spyOn(eventDirty, 'preventDefault');
      window.dispatchEvent(eventDirty);
      expect(preventDirty).toHaveBeenCalled();
    });

    it('desregistra listener al desmontar', () => {
      const { unmount } = renderHook(() => useUnsavedChanges(true));
      const beforeRemove = removeSpy.mock.calls.filter(([event]) => event === 'beforeunload').length;
      unmount();
      const afterRemove = removeSpy.mock.calls.filter(([event]) => event === 'beforeunload').length;
      expect(afterRemove).toBeGreaterThan(beforeRemove);
    });
  });

  describe('confirmExit helper', () => {
    it('ejecuta el callback inmediatamente cuando isDirty es false', () => {
      const { result } = renderHook(() => useUnsavedChanges(false));
      const callback = vi.fn();

      act(() => {
        result.current.confirmExit(callback);
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(result.current.confirmExitModalProps.open).toBe(false);
    });

    it('NO ejecuta el callback inmediatamente cuando isDirty es true; abre el modal', () => {
      const { result } = renderHook(() => useUnsavedChanges(true));
      const callback = vi.fn();

      act(() => {
        result.current.confirmExit(callback);
      });

      expect(callback).not.toHaveBeenCalled();
      expect(result.current.confirmExitModalProps.open).toBe(true);
    });

    it('el callback se ejecuta tras confirmar (onConfirm del modal)', async () => {
      const { result } = renderHook(() => useUnsavedChanges(true));
      const callback = vi.fn();

      act(() => {
        result.current.confirmExit(callback);
      });

      await act(async () => {
        await result.current.confirmExitModalProps.onConfirm();
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(result.current.confirmExitModalProps.open).toBe(false);
    });

    it('cancelar (onClose) cierra el modal sin invocar el callback', () => {
      const { result } = renderHook(() => useUnsavedChanges(true));
      const callback = vi.fn();

      act(() => {
        result.current.confirmExit(callback);
      });
      expect(result.current.confirmExitModalProps.open).toBe(true);

      act(() => {
        result.current.confirmExitModalProps.onClose();
      });

      expect(callback).not.toHaveBeenCalled();
      expect(result.current.confirmExitModalProps.open).toBe(false);
    });

    it('respeta opciones personalizadas (title, description, confirmText)', () => {
      const { result } = renderHook(() => useUnsavedChanges(true, 'Mensaje por defecto'));

      act(() => {
        result.current.confirmExit(() => {}, {
          title: 'Título custom',
          description: 'Descripción custom',
          confirmText: 'Descartar',
          cancelText: 'Volver',
          variant: 'danger'
        });
      });

      expect(result.current.confirmExitModalProps.title).toBe('Título custom');
      expect(result.current.confirmExitModalProps.description).toBe('Descripción custom');
      expect(result.current.confirmExitModalProps.confirmText).toBe('Descartar');
      expect(result.current.confirmExitModalProps.cancelText).toBe('Volver');
      expect(result.current.confirmExitModalProps.variant).toBe('danger');
    });

    it('usa el mensaje por defecto del hook cuando no se pasa description', () => {
      const customMessage = 'Tus filtros se perderán';
      const { result } = renderHook(() => useUnsavedChanges(true, customMessage));

      act(() => {
        result.current.confirmExit(() => {});
      });

      expect(result.current.confirmExitModalProps.description).toBe(customMessage);
      expect(result.current.confirmExitModalProps.variant).toBe('warning');
    });

    it('ignora callbacks no función sin lanzar', () => {
      const { result } = renderHook(() => useUnsavedChanges(true));

      expect(() => {
        act(() => {
          result.current.confirmExit(null);
        });
      }).not.toThrow();
      expect(result.current.confirmExitModalProps.open).toBe(false);
    });
  });

  describe('compatibilidad legacy', () => {
    it('mantiene blocker stub (state idle) e isBlocked=false', () => {
      const { result } = renderHook(() => useUnsavedChanges(true));
      expect(result.current.blocker.state).toBe('idle');
      expect(result.current.isBlocked).toBe(false);
      expect(typeof result.current.blocker.proceed).toBe('function');
      expect(typeof result.current.blocker.reset).toBe('function');
    });
  });
});
