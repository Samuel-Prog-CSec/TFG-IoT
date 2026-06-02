/**
 * @fileoverview Contexto de autenticación para gestión de sesión de usuario
 * Proporciona estado de autenticación, funciones de login/logout/registro,
 * auto-refresh de tokens y manejo de sesión invalidada.
 * 
 * @module context/AuthContext
 */

import { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import {
  authAPI,
  setTokens,
  clearTokens,
  getAccessToken,
  extractData,
  extractErrorMessage,
  API_BASE_URL,
  AUTH_EVENTS
} from '../services/api';
import { socketService } from '../services/socket';
import { ROUTES, isSafeRedirectPath } from '../constants/routes';
import { setUserContext, captureException } from '../lib/sentry';

// T-957: ventana de cortesía del logout con undo. El cliente espera este
// número de ms antes de invalidar tokens en el backend; si el usuario pulsa
// "Deshacer" en el toast antes del timeout, el estado queda intacto.
const DEFAULT_LOGOUT_UNDO_MS = 5000;

// ============================================
// TIPOS Y CONSTANTES
// ============================================

const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_USER: 'SET_USER',
  SET_ERROR: 'SET_ERROR',
  LOGOUT: 'LOGOUT',
  CLEAR_ERROR: 'CLEAR_ERROR',
};

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true, // true inicialmente para verificar sesión existente
  error: null,
};

// Tiempo antes de expiración para refrescar token (5 minutos)
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000;

// Marcador local de "sesion iniciada alguna vez" para evitar llamar a /auth/refresh
// sin refresh token y generar 401 ruidosos en consola en landing/login.
const SESSION_MARKER_KEY = 'eduplay:hasSession';
const hasSessionMarker = () => {
  try { return globalThis.localStorage?.getItem(SESSION_MARKER_KEY) === '1'; } catch { return false; }
};
const setSessionMarker = () => {
  try { globalThis.localStorage?.setItem(SESSION_MARKER_KEY, '1'); } catch { /* noop */ }
};
const clearSessionMarker = () => {
  try { globalThis.localStorage?.removeItem(SESSION_MARKER_KEY); } catch { /* noop */ }
};

// ============================================
// REDUCER
// ============================================

function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
        error: null,
      };
    
    case AUTH_ACTIONS.SET_USER:
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        isLoading: false,
        error: null,
      };
    
    case AUTH_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        isLoading: false,
      };
    
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...initialState,
        isLoading: false,
      };
    
    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
    
    default:
      return state;
  }
}

// ============================================
// CONTEXTO
// ============================================

const AuthContext = createContext(null);

/**
 * Hook para usar el contexto de autenticación
 * @returns {Object} Estado y funciones de autenticación
 */
// eslint-disable-next-line react-refresh/only-export-components -- standard context+hook pattern
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}

// ============================================
// PROVIDER
// ============================================

/**
 * Proveedor de contexto de autenticación
 * @param {Object} props
 * @param {React.ReactNode} props.children - Componentes hijos
 */
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const navigate = useNavigate();
  const location = useLocation();
  const refreshTimeoutRef = useRef(null);
  // Guardia single-flight: evita que React.StrictMode (en dev) ejecute
  // checkExistingSession dos veces en paralelo — el backend rota el
  // refreshToken en cada POST /auth/refresh, así que la segunda llamada
  // recibe 401 con la cookie ya inválida y provocaba logout espurio.
  const didCheckSessionRef = useRef(false);
  // T-957: estado del logout diferido (toast con "Deshacer").
  // pendingLogoutRef guarda { timeoutId } cuando hay un logout planificado.
  // pageHideHandlerRef guarda la referencia al listener de `pagehide` que
  // dispara el beacon — necesaria para poder hacer removeEventListener si
  // el usuario pulsa "Deshacer" antes de que la pestaña se cierre.
  const pendingLogoutRef = useRef(null);
  const pageHideHandlerRef = useRef(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // ============================================
  // FUNCIONES AUXILIARES
  // ============================================

  /**
   * Programa el refresh automático del token
   * @param {number} expiresIn - Tiempo en ms hasta expiración
   */
  const scheduleTokenRefresh = useCallback((expiresIn = 15 * 60 * 1000) => {
    // Limpiar timeout anterior
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    // Programar refresh antes de expiración
    const refreshTime = Math.max(expiresIn - TOKEN_REFRESH_THRESHOLD, 0);
    
    refreshTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await authAPI.refreshToken();
        const { accessToken, accessTokenExpiresIn } = extractData(response);
        if (accessToken) {
          setTokens(accessToken);
          socketService.updateAuth(accessToken);
        }
        scheduleTokenRefresh((accessTokenExpiresIn || 15 * 60) * 1000);
      } catch (error) {
        captureException(error);
        // El interceptor de API manejará el logout si es necesario
      }
    }, refreshTime);
  }, []);

  /**
   * Redirige según el rol del usuario
   * @param {Object} user - Usuario autenticado
   * @param {string} from - Ruta de origen (para volver después de login)
   */
  const redirectByRole = useCallback((user, from = null) => {
    // T-905 B6: whitelist positiva contra open redirect. Bloquea esquemas
    // peligrosos (`javascript:`, `data:`), URLs protocol-relative (`//evil.com`)
    // y cualquier path no incluido en `SAFE_REDIRECT_PREFIXES`.
    //
    // BUG-AUTH-A (QA Sprint 0 post-v0.5.0): además de validar la URL, la
    // ruta `from` debe ser COMPATIBLE con el rol. Si un super_admin viene
    // de /dashboard (teacher) o un teacher viene de /admin/* (super_admin),
    // ignoramos el `from` y vamos al landing del rol. Sin esto el super_admin
    // aterrizaba en /dashboard con KPIs a 0 porque no tiene partidas propias.
    const isAdminPath = path => path.startsWith('/admin');
    const isFromCompatible = path => {
      if (!path) return false;
      if (user.role === 'super_admin') return isAdminPath(path);
      return !isAdminPath(path);
    };

    if (from && isSafeRedirectPath(from) && isFromCompatible(from)) {
      navigate(from, { replace: true });
      return;
    }

    // Redirigir según rol. T-942 Fase D: super_admin aterriza en AdminDashboard
    // (vista del centro con KPIs agregados); las aprobaciones quedan a un click.
    if (user.role === 'super_admin') {
      navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
    } else {
      navigate(ROUTES.DASHBOARD, { replace: true });
    }
  }, [navigate]);

  // ============================================
  // EFECTOS
  // ============================================

  /**
   * Verificar sesión existente al montar
   */
  useEffect(() => {
    const checkExistingSession = async () => {
      // StrictMode en dev monta dos veces; sin este guard el segundo intento
      // rotaría la cookie en medio del flujo y dejaría al usuario fuera.
      if (didCheckSessionRef.current) return;
      didCheckSessionRef.current = true;

      // Evita llamar a /auth/refresh si nunca hubo una sesion en este navegador.
      // Sin el marker el endpoint devolvera 401 y ensucia la consola del usuario
      // en landing/login/register.
      if (!hasSessionMarker()) {
        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: null });
        return;
      }
      try {
        const refreshResponse = await authAPI.refreshToken();
        const { accessToken, accessTokenExpiresIn } = extractData(refreshResponse);
        if (accessToken) {
          setTokens(accessToken);
          socketService.updateAuth(accessToken);
        }

        const response = await authAPI.getProfile();
        const user = extractData(response);

        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: user });
        scheduleTokenRefresh((accessTokenExpiresIn || 15 * 60) * 1000);

        // Conectar WebSocket
        try {
          await socketService.connect();
        } catch (socketError) {
          captureException(socketError);
        }
      } catch (error) {
        // 401 en checkExistingSession es esperado cuando el refresh token
        // expiro o no existe (cookie limpiada externamente). No reportar a
        // Sentry porque no es accionable. Solo limpiar estado local.
        const status = error?.response?.status ?? error?.cause?.response?.status;
        if (status !== 401 && status !== 403) {
          captureException(error);
        }
        clearTokens();
        clearSessionMarker();
        setUserContext(null);
        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: null });
      }
    };

    checkExistingSession();

    // Cleanup
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [scheduleTokenRefresh]);

  /**
   * Escuchar eventos de autenticación (sesión expirada, invalidada, etc.)
   */
  useEffect(() => {
    const handleSessionExpired = () => {
      toast.error('Tu sesión ha expirado. Inicia sesión de nuevo para continuar.');
      setUserContext(null);
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      clearTokens();
      clearSessionMarker();
      socketService.disconnect();
      navigate(ROUTES.LOGIN, { replace: true });
    };

    const handleSessionInvalidated = (event) => {
      const detail = event.detail || {};
      toast.warning(
        detail.message || 'Tu sesión ha sido cerrada porque iniciaste sesión en otro dispositivo.',
        { duration: 6000 }
      );
      setUserContext(null);
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      clearTokens();
      clearSessionMarker();
      socketService.disconnect();
      navigate(ROUTES.LOGIN, { 
        replace: true,
        state: { sessionInvalidated: true }
      });
    };

    const handleUnauthorized = () => {
      setUserContext(null);
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      clearTokens();
      clearSessionMarker();
      socketService.disconnect();
      navigate(ROUTES.LOGIN, { replace: true });
    };

    window.addEventListener(AUTH_EVENTS.SESSION_EXPIRED, handleSessionExpired);
    window.addEventListener(AUTH_EVENTS.SESSION_INVALIDATED, handleSessionInvalidated);
    window.addEventListener(AUTH_EVENTS.UNAUTHORIZED, handleUnauthorized);

    return () => {
      window.removeEventListener(AUTH_EVENTS.SESSION_EXPIRED, handleSessionExpired);
      window.removeEventListener(AUTH_EVENTS.SESSION_INVALIDATED, handleSessionInvalidated);
      window.removeEventListener(AUTH_EVENTS.UNAUTHORIZED, handleUnauthorized);
    };
  }, [navigate]);

  // ============================================
  // ACCIONES
  // ============================================

  /**
   * Iniciar sesión
   * @param {string} email - Email del usuario
   * @param {string} password - Contraseña
   * @returns {Promise<Object>} Usuario autenticado
   */
  const login = useCallback(async (email, password, captchaToken = null) => {
    // BUG-LOGIN-A (QA Sprint 0 post-v0.5.0): no usamos `SET_LOADING: true`
    // aquí porque `GuestRoute` reacciona a `isLoading` mostrando `<AuthLoader />`,
    // lo que DESMONTA Login.jsx mientras corre la petición. Tras un 401, el
    // remount crea un formData fresh y se pierde el email tecleado.
    //
    // El formulario ya gestiona su propio estado de submit (`isSubmitting`)
    // y deshabilita el botón en consecuencia. El loading global del context
    // sólo debe activarse en el bootstrap inicial (cargando user desde /me).
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      // T-905 B6: captchaToken se adjunta solo cuando el widget Turnstile ya
      // generó uno; el backend lo exige tras 3 fallos previos del mismo email.
      const credentials = captchaToken ? { email, password, captchaToken } : { email, password };
      const response = await authAPI.login(credentials);
      const { user, accessToken, accessTokenExpiresIn } = extractData(response);

      // Guardar tokens
      setTokens(accessToken);
      socketService.updateAuth(accessToken);
      setSessionMarker();

      // Actualizar estado
      dispatch({ type: AUTH_ACTIONS.SET_USER, payload: user });
      
      // Programar refresh
      scheduleTokenRefresh((accessTokenExpiresIn || 15 * 60) * 1000);

      // Conectar WebSocket
      try {
        await socketService.connect();
      } catch (socketError) {
        captureException(socketError);
      }

      // Mensaje de bienvenida
      toast.success(`¡Bienvenido, ${user.name}!`);

      // Redirigir
      const from = location.state?.from?.pathname;
      redirectByRole(user, from);

      return user;
    } catch (error) {
      const message = extractErrorMessage(error);
      const errorCode = error?.response?.data?.code || error?.code;

      // T-905 B6: backend pide CAPTCHA tras 3 fallos. Si Turnstile está configurado
      // y el frontend tiene VITE_TURNSTILE_SITEKEY, aquí se renderizará el widget
      // (implementación frontend completa diferida a v1.0.x). De momento mensaje claro.
      if (errorCode === 'CAPTCHA_REQUIRED' || errorCode === 'CAPTCHA_INVALID') {
        dispatch({
          type: AUTH_ACTIONS.SET_ERROR,
          payload:
            'Demasiados intentos. Se requiere verificación adicional. Si el problema persiste, contacta con un administrador.'
        });
        toast.warning('Verificación adicional requerida');
      } else if (error.accountStatus === 'pending_approval') {
        dispatch({
          type: AUTH_ACTIONS.SET_ERROR,
          payload: 'Tu cuenta está pendiente de aprobación. Un administrador la revisará pronto.'
        });
        toast.warning('Cuenta pendiente de aprobación');
      } else if (error.accountStatus === 'rejected') {
        dispatch({
          type: AUTH_ACTIONS.SET_ERROR,
          payload: 'Tu cuenta ha sido rechazada. Contacta con el administrador para más información.'
        });
        toast.error('Cuenta rechazada', {
          description: 'Contacta con un administrador si crees que es un error.'
        });
      } else {
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: message });
        toast.error(message);
      }

      throw error;
    }
  }, [location.state, scheduleTokenRefresh, redirectByRole]);

  /**
   * Registrar nuevo profesor
   * @param {Object} data - { name, email, password }
   * @returns {Promise<Object>} Respuesta del servidor
   */
  const register = useCallback(async (data) => {
    // BUG-LOGIN-A: misma razón que en login() — no activar SET_LOADING aquí
    // porque GuestRoute desmonta Register.jsx mientras corre la petición y
    // se pierde formData. El formulario maneja su propio `isSubmitting`.
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      const response = await authAPI.register(data);
      const result = extractData(response);

      toast.success(
        '¡Registro completado! Tu cuenta está pendiente de aprobación por un administrador.',
        { duration: 6000 }
      );

      // Navegar a login con mensaje
      navigate(ROUTES.LOGIN, { 
        replace: true,
        state: { registrationSuccess: true }
      });

      return result;
    } catch (error) {
      const message = extractErrorMessage(error);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: message });
      toast.error(message);
      throw error;
    }
  }, [navigate]);

  /**
   * Limpia cualquier listener de `pagehide` registrado por `deferLogout`.
   * Idempotente: si no había handler, no hace nada.
   * @private
   */
  const clearPageHideHandler = useCallback(() => {
    if (pageHideHandlerRef.current) {
      window.removeEventListener('pagehide', pageHideHandlerRef.current);
      pageHideHandlerRef.current = null;
    }
  }, []);

  // T-957: al desmontar el provider, garantiza que no quede un listener
  // de `pagehide` colgando (importante en tests con re-mounts y en
  // hot-reload de Vite). El `pagehide` real del cierre de pestaña se
  // dispara ANTES del unmount, por lo que el beacon sigue funcionando
  // en producción.
  useEffect(() => () => clearPageHideHandler(), [clearPageHideHandler]);

  /**
   * Ejecuta el cierre de sesión real: revoca tokens en backend, limpia
   * estado local, desconecta socket y navega a /login. Esta función es la
   * que materializa el logout — la usan tanto `logout` (inmediato) como
   * `deferLogout` (al expirar la ventana de 5 s).
   *
   * Idempotente respecto al listener de `pagehide`: si había uno
   * registrado, se desregistra antes de hacer la petición HTTP normal.
   */
  const finalizeLogout = useCallback(async () => {
    // Cancelar timeout pendiente y listener de pagehide si los había.
    if (pendingLogoutRef.current) {
      clearTimeout(pendingLogoutRef.current.timeoutId);
      pendingLogoutRef.current = null;
    }
    clearPageHideHandler();
    setIsLoggingOut(false);

    try {
      await authAPI.logout();
    } catch (error) {
      // Continuar con logout local aunque falle en servidor
      captureException(error);
    }

    // Limpiar estado local
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    clearTokens();
    clearSessionMarker();
    socketService.disconnect();
    dispatch({ type: AUTH_ACTIONS.LOGOUT });

    toast.info('Sesión cerrada correctamente');
    navigate(ROUTES.LOGIN, { replace: true });
  }, [navigate, clearPageHideHandler]);

  /**
   * Cierre de sesión inmediato (sin ventana de undo).
   *
   * Conservado para casos administrativos o flujos automáticos donde no
   * tiene sentido ofrecer "Deshacer": expiración de sesión gestionada por
   * el backend, force-logout por single-session collision, errores de
   * autorización irrecuperables, tests. Para el cierre voluntario desde
   * la UI usar `deferLogout` (T-957).
   */
  const logout = useCallback(() => finalizeLogout(), [finalizeLogout]);

  /**
   * T-957: cierre de sesión con ventana de undo.
   *
   * Planifica el logout real dentro de `delayMs` y registra un listener
   * `pagehide` que dispara `fetch keepalive: true` contra `/auth/logout`
   * para garantizar la revocación incluso si el usuario cierra la pestaña
   * antes de que la cuenta atrás expire.
   *
   * Mientras la ventana está abierta:
   * - `isLoggingOut === true` (la UI puede deshabilitar el botón).
   * - El estado de auth permanece intacto (`isAuthenticated`, tokens en
   *   memoria, cookies, sessionMarker) — un refresh de pestaña dentro
   *   de esos segundos NO desloguea al usuario.
   *
   * Idempotente: clicks repetidos durante el periodo abierto son no-op.
   *
   * @param {{ delayMs?: number }} [options]
   * @returns {boolean} true si se programó, false si ya había uno pendiente.
   */
  const deferLogout = useCallback(({ delayMs = DEFAULT_LOGOUT_UNDO_MS } = {}) => {
    if (pendingLogoutRef.current) return false;
    setIsLoggingOut(true);

    const beaconHandler = () => {
      // Red de seguridad: si la pestaña se cierra antes del timeout, el
      // backend recibe la petición igualmente. `keepalive: true` deja la
      // request en vuelo aunque el documento se descargue. No leemos la
      // respuesta (estamos saliendo); cualquier excepción se ignora.
      try {
        const accessToken = getAccessToken();
        fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          credentials: 'include',
          keepalive: true,
          headers: accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {}
        }).catch(() => {});
      } catch {
        /* silencioso: la pestaña ya se está cerrando */
      }
    };
    pageHideHandlerRef.current = beaconHandler;
    window.addEventListener('pagehide', beaconHandler);

    const timeoutId = setTimeout(() => {
      finalizeLogout();
    }, delayMs);
    pendingLogoutRef.current = { timeoutId };
    return true;
  }, [finalizeLogout]);

  /**
   * T-957: cancela un logout planificado por `deferLogout`. No-op si no
   * había uno pendiente. Tras invocarse, el usuario permanece autenticado
   * con todos sus tokens y sesión socket intactos.
   *
   * @returns {boolean} true si se canceló, false si no había logout pendiente.
   */
  const undoLogout = useCallback(() => {
    if (!pendingLogoutRef.current) return false;
    clearTimeout(pendingLogoutRef.current.timeoutId);
    pendingLogoutRef.current = null;
    clearPageHideHandler();
    setIsLoggingOut(false);
    return true;
  }, [clearPageHideHandler]);

  /**
   * Limpiar errores
   */
  const clearError = useCallback(() => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  }, []);

  /**
   * Actualizar datos del usuario en el estado
   * @param {Object} userData - Datos actualizados del usuario
   */
  const updateUser = useCallback((userData) => {
    dispatch({ type: AUTH_ACTIONS.SET_USER, payload: userData });
  }, []);

  // ============================================
  // VALOR DEL CONTEXTO (memoizado para evitar re-renders)
  // ============================================

  const value = useMemo(() => ({
    // Estado
    user: state.user,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    error: state.error,
    // T-957: true entre el click en "Cerrar sesión" y la materialización
    // efectiva del logout (5 s después o al pulsar Deshacer). La UI lo usa
    // para deshabilitar el botón y evitar dobles clicks.
    isLoggingOut,

    // Helpers
    isTeacher: state.user?.role === 'teacher',
    isSuperAdmin: state.user?.role === 'super_admin',

    // Acciones
    login,
    register,
    logout,           // cierre inmediato (administrativo / expirados)
    deferLogout,      // T-957: cierre con ventana de undo (5 s)
    undoLogout,       // T-957: cancela un deferLogout en curso
    clearError,
    updateUser,
  }), [
    state.user,
    state.isAuthenticated,
    state.isLoading,
    state.error,
    isLoggingOut,
    login,
    register,
    logout,
    deferLogout,
    undoLogout,
    clearError,
    updateUser,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
