import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// T-957: flujo de logout con ventana de undo (5s) + beacon en pagehide.
// Los mocks aíslan AuthContext de Socket.IO, Sentry, react-router y la
// implementación real de axios. `fetch` global se sustituye en cada test
// para inspeccionar la llamada del beacon.

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: null, pathname: '/' })
  };
});

const socketDisconnectMock = vi.fn();
vi.mock('../../services/socket', () => ({
  socketService: {
    connect: vi.fn().mockResolvedValue(),
    disconnect: socketDisconnectMock,
    updateAuth: vi.fn()
  }
}));

const captureExceptionMock = vi.fn();
vi.mock('../../lib/sentry', () => ({
  setUserContext: vi.fn(),
  captureException: captureExceptionMock
}));

const authLogoutMock = vi.fn().mockResolvedValue({ data: { success: true } });
const refreshTokenMock = vi.fn().mockRejectedValue({ response: { status: 401 } });
const getProfileMock = vi.fn();
vi.mock('../../services/api', () => ({
  authAPI: {
    logout: authLogoutMock,
    refreshToken: refreshTokenMock,
    getProfile: getProfileMock,
    login: vi.fn(),
    register: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn()
  },
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  getAccessToken: vi.fn(() => 'fake-access-token'),
  extractData: (response) => response?.data?.data || response?.data,
  extractErrorMessage: (err) => err?.message || 'error',
  API_BASE_URL: 'http://localhost:5000/api',
  AUTH_EVENTS: {
    SESSION_EXPIRED: 'auth:session_expired',
    SESSION_INVALIDATED: 'auth:session_invalidated',
    UNAUTHORIZED: 'auth:unauthorized'
  }
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn()
  }
}));

vi.mock('../../constants/routes', () => ({
  ROUTES: { LOGIN: '/login', DASHBOARD: '/dashboard', ADMIN_APPROVALS: '/admin/approvals' }
}));

// Import después de los mocks
const { AuthProvider, useAuth } = await import('../AuthContext');

function HookExposer({ onReady }) {
  const auth = useAuth();
  // Exponer toda la API en cuanto está disponible.
  if (auth) onReady(auth);
  return (
    <div>
      <span data-testid="logging-out">{auth.isLoggingOut ? 'yes' : 'no'}</span>
    </div>
  );
}

function renderProvider() {
  let api = null;
  const captureApi = (a) => { api = a; };
  render(
    <MemoryRouter>
      <AuthProvider>
        <HookExposer onReady={captureApi} />
      </AuthProvider>
    </MemoryRouter>
  );
  return () => api;
}

describe('AuthContext T-957 logout con undo', () => {
  let fetchSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    navigateMock.mockClear();
    socketDisconnectMock.mockClear();
    captureExceptionMock.mockClear();
    authLogoutMock.mockClear();
    fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchSpy;
    // Limpia el marker para evitar que checkExistingSession dispare refresh
    try { window.localStorage.removeItem('eduplay:hasSession'); } catch { /* noop */ }
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('deferLogout activa isLoggingOut=true sin cerrar sesión inmediatamente', async () => {
    const getApi = renderProvider();
    await act(async () => { await Promise.resolve(); });

    act(() => {
      getApi().deferLogout({ delayMs: 5000 });
    });

    expect(getApi().isLoggingOut).toBe(true);
    expect(authLogoutMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(socketDisconnectMock).not.toHaveBeenCalled();
  });

  it('a los delayMs el logout se materializa (authAPI.logout + navigate)', async () => {
    const getApi = renderProvider();
    await act(async () => { await Promise.resolve(); });

    act(() => {
      getApi().deferLogout({ delayMs: 5000 });
    });

    // Avanzar el timeout completo
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    // Esperar a que la promesa interna de authLogout resuelva
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(authLogoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    expect(socketDisconnectMock).toHaveBeenCalledTimes(1);
    expect(getApi().isLoggingOut).toBe(false);
  });

  it('undoLogout antes del timeout cancela el logout y mantiene la sesión', async () => {
    const getApi = renderProvider();
    await act(async () => { await Promise.resolve(); });

    act(() => {
      getApi().deferLogout({ delayMs: 5000 });
    });
    expect(getApi().isLoggingOut).toBe(true);

    // Cancelar antes de los 5s
    let cancelled;
    act(() => {
      cancelled = getApi().undoLogout();
    });

    expect(cancelled).toBe(true);
    expect(getApi().isLoggingOut).toBe(false);

    // Aunque pasen 5s, no debe materializarse el logout
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    expect(authLogoutMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(socketDisconnectMock).not.toHaveBeenCalled();
  });

  it('deferLogout es idempotente: el segundo click durante la ventana es no-op', async () => {
    const getApi = renderProvider();
    await act(async () => { await Promise.resolve(); });

    let firstResult;
    let secondResult;
    act(() => {
      firstResult = getApi().deferLogout({ delayMs: 5000 });
    });
    act(() => {
      secondResult = getApi().deferLogout({ delayMs: 5000 });
    });

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);
  });

  it('undoLogout sin logout pendiente es no-op (devuelve false)', async () => {
    const getApi = renderProvider();
    await act(async () => { await Promise.resolve(); });

    let result;
    act(() => {
      result = getApi().undoLogout();
    });

    expect(result).toBe(false);
    expect(getApi().isLoggingOut).toBe(false);
  });

  it('pagehide durante la ventana dispara fetch keepalive contra /auth/logout', async () => {
    const getApi = renderProvider();
    await act(async () => { await Promise.resolve(); });

    act(() => {
      getApi().deferLogout({ delayMs: 5000 });
    });

    // Simular cierre de pestaña antes del timeout
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:5000/api/auth/logout');
    expect(options.method).toBe('POST');
    expect(options.keepalive).toBe(true);
    expect(options.credentials).toBe('include');
    expect(options.headers.Authorization).toBe('Bearer fake-access-token');
  });

  it('pagehide sin logout pendiente NO dispara fetch (listener removido)', async () => {
    const getApi = renderProvider();
    await act(async () => { await Promise.resolve(); });

    act(() => {
      getApi().deferLogout({ delayMs: 5000 });
    });
    act(() => {
      getApi().undoLogout();
    });

    // Tras undo, el listener debe estar desregistrado
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('logout (inmediato) sigue funcionando como fallback administrativo', async () => {
    const getApi = renderProvider();
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      await getApi().logout();
    });

    expect(authLogoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
    expect(socketDisconnectMock).toHaveBeenCalledTimes(1);
  });
});
