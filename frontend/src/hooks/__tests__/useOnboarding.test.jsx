import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOnboarding } from '../useOnboarding';
import { useAuth } from '../../context/AuthContext';
import { usersAPI } from '../../services/api';

// Tests del hook useOnboarding (T-951 Fase 4).
//
// Verifica el contrato clave: detecta el rol → selecciona track,
// hidrata desde profile.onboarding del backend, persiste cambios via
// PATCH debounced, y migra el flag legacy localStorage al primer mount.

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../services/api', () => ({
  usersAPI: {
    updateMyOnboarding: vi.fn().mockResolvedValue({ data: { data: {} } }),
  },
}));

describe('useOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('no hace nada mientras isLoading=true', () => {
    useAuth.mockReturnValue({ user: null, isLoading: true });
    const { result } = renderHook(() => useOnboarding({ totalSteps: 4 }));
    expect(result.current.isVisible).toBe(false);
    expect(result.current.track).toBeNull();
  });

  it('selecciona el track teacher para un profesor sin onboarding completado', () => {
    useAuth.mockReturnValue({
      user: {
        role: 'teacher',
        profile: { onboarding: { teacherCompleted: false, currentStep: 0 } },
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useOnboarding({ totalSteps: 6 }));

    expect(result.current.track).toBe('teacher');
    expect(result.current.isVisible).toBe(true);
    expect(result.current.currentStep).toBe(0);
    expect(result.current.hasCompleted).toBe(false);
  });

  it('selecciona el track super_admin y respeta currentStep guardado', () => {
    useAuth.mockReturnValue({
      user: {
        role: 'super_admin',
        profile: { onboarding: { superAdminCompleted: false, currentStep: 2 } },
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useOnboarding({ totalSteps: 5 }));

    expect(result.current.track).toBe('super_admin');
    expect(result.current.isVisible).toBe(true);
    expect(result.current.currentStep).toBe(2);
  });

  it('no muestra el tour si ya está completado', () => {
    useAuth.mockReturnValue({
      user: {
        role: 'teacher',
        profile: { onboarding: { teacherCompleted: true, currentStep: 0 } },
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useOnboarding({ totalSteps: 6 }));

    expect(result.current.isVisible).toBe(false);
    expect(result.current.hasCompleted).toBe(true);
  });

  it('completeOnboarding marca el track como completado', async () => {
    useAuth.mockReturnValue({
      user: {
        role: 'teacher',
        profile: { onboarding: { teacherCompleted: false, currentStep: 0 } },
      },
      isLoading: false,
      updateUser: vi.fn(),
    });

    const { result } = renderHook(() => useOnboarding({ totalSteps: 6 }));

    act(() => {
      result.current.completeOnboarding();
    });

    expect(result.current.isVisible).toBe(false);
    expect(result.current.hasCompleted).toBe(true);
    await waitFor(() => {
      expect(usersAPI.updateMyOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({ teacherCompleted: true, currentStep: 0, currentTrack: null }),
      );
    });
  });

  it('completeOnboarding propaga el estado completado al AuthContext', () => {
    const updateUser = vi.fn();
    useAuth.mockReturnValue({
      user: {
        role: 'teacher',
        name: 'María',
        profile: { onboarding: { teacherCompleted: false, currentStep: 3 } },
      },
      isLoading: false,
      updateUser,
    });

    const { result } = renderHook(() => useOnboarding({ totalSteps: 6 }));

    act(() => {
      result.current.completeOnboarding();
    });

    // El user del context debe reflejar el completado (sin perder otros
    // campos) para que la marca sobreviva a un remount de AppLayout.
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'María',
        profile: expect.objectContaining({
          onboarding: expect.objectContaining({
            teacherCompleted: true,
            currentStep: 0,
            currentTrack: null,
          }),
        }),
      }),
    );
  });

  it('no re-muestra el tour tras completar y remontar (salida de partida)', () => {
    // Reproduce el bug: al entrar en una partida, /game usa GameLayout y
    // desmonta AppLayout (donde vive useOnboarding); al salir con la "X",
    // AppLayout se remonta. AuthProvider está por encima, así que su `user`
    // sobrevive. Simulamos ese context con un `user` mutable que updateUser
    // reemplaza — igual que el reducer real de AuthContext.
    let currentUser = {
      role: 'teacher',
      profile: { onboarding: { teacherCompleted: false, currentStep: 0 } },
    };
    const updateUser = vi.fn((next) => {
      currentUser = next;
    });
    useAuth.mockImplementation(() => ({
      user: currentUser,
      isLoading: false,
      updateUser,
    }));

    const first = renderHook(() => useOnboarding({ totalSteps: 6 }));
    expect(first.result.current.isVisible).toBe(true);

    act(() => {
      first.result.current.completeOnboarding();
    });
    expect(first.result.current.isVisible).toBe(false);
    expect(currentUser.profile.onboarding.teacherCompleted).toBe(true);

    // Desmonta (entrar en la partida) y remonta (salir con la "X").
    first.unmount();
    const second = renderHook(() => useOnboarding({ totalSteps: 6 }));

    expect(second.result.current.isVisible).toBe(false);
    expect(second.result.current.hasCompleted).toBe(true);
  });

  it('migra el flag legacy de localStorage al backend', async () => {
    localStorage.setItem('eduplay:onboarding-completed', 'true');
    useAuth.mockReturnValue({
      user: {
        role: 'teacher',
        profile: { onboarding: { teacherCompleted: false, currentStep: 0 } },
      },
      isLoading: false,
      updateUser: vi.fn(),
    });

    renderHook(() => useOnboarding({ totalSteps: 6 }));

    await waitFor(() => {
      expect(usersAPI.updateMyOnboarding).toHaveBeenCalledWith({ teacherCompleted: true });
    });
    await waitFor(() => {
      expect(localStorage.getItem('eduplay:onboarding-completed')).toBeNull();
    });
  });

  it('resetOnboarding vuelve a paso 0 y hace visible el overlay', () => {
    useAuth.mockReturnValue({
      user: {
        role: 'teacher',
        profile: { onboarding: { teacherCompleted: true, currentStep: 0 } },
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useOnboarding({ totalSteps: 6 }));

    expect(result.current.isVisible).toBe(false);

    act(() => {
      result.current.resetOnboarding();
    });

    expect(result.current.isVisible).toBe(true);
    expect(result.current.currentStep).toBe(0);
  });

  it('devuelve track=null para un rol student', () => {
    useAuth.mockReturnValue({
      user: { role: 'student', profile: { onboarding: {} } },
      isLoading: false,
    });

    const { result } = renderHook(() => useOnboarding({ totalSteps: 0 }));

    expect(result.current.track).toBeNull();
    expect(result.current.isVisible).toBe(false);
  });
});
