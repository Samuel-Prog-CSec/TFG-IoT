/**
 * @fileoverview Contexto de autenticación para gestión de sesión de usuario
 * Proporciona estado de autenticación, funciones de login/logout/registro,
 * auto-refresh de tokens y manejo de sesión invalidada.
 * 
 * @module context/AuthContext
 */

import { createContext, useContext, useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  authAPI, 
  setTokens, 
  clearTokens,
  extractData, 
  extractErrorMessage,
  AUTH_EVENTS 
} from '../services/api';
import { socketService } from '../services/socket';
import { ROUTES } from '../constants/routes';

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
        const { accessToken, refreshToken, accessTokenExpiresIn } = extractData(response);
        if (accessToken) {
          setTokens(accessToken, refreshToken);
          socketService.updateAuth(accessToken);
        }
        scheduleTokenRefresh((accessTokenExpiresIn || 15 * 60) * 1000);
      } catch (error) {
        console.error('[Auth] Error al refrescar token:', error);
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
    // Si hay una ruta guardada y no es de auth, ir ahí
    if (from && !from.startsWith('/login') && !from.startsWith('/register')) {
      navigate(from, { replace: true });
      return;
    }

    // Redirigir según rol
    if (user.role === 'super_admin') {
      navigate(ROUTES.ADMIN_APPROVALS, { replace: true });
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
      try {
        const refreshResponse = await authAPI.refreshToken();
        const { accessToken, refreshToken, accessTokenExpiresIn } = extractData(refreshResponse);
        if (accessToken) {
          setTokens(accessToken, refreshToken);
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
          console.warn('[Auth] No se pudo conectar WebSocket:', socketError);
        }
      } catch (error) {
        console.error('[Auth] Sesión expirada o inválida:', error);
        clearTokens();
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
      toast.error('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      clearTokens();
      socketService.disconnect();
      navigate(ROUTES.LOGIN, { replace: true });
    };

    const handleSessionInvalidated = (event) => {
      const detail = event.detail || {};
      toast.warning(
        detail.message || 'Tu sesión ha sido cerrada porque iniciaste sesión en otro dispositivo.',
        { duration: 6000 }
      );
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      clearTokens();
      socketService.disconnect();
      navigate(ROUTES.LOGIN, { 
        replace: true,
        state: { sessionInvalidated: true }
      });
    };

    const handleUnauthorized = () => {
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      clearTokens();
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
  const login = useCallback(async (email, password) => {
    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      const response = await authAPI.login({ email, password });
      const { user, accessToken, refreshToken, accessTokenExpiresIn } = extractData(response);

      // Guardar tokens
      setTokens(accessToken, refreshToken);
      socketService.updateAuth(accessToken);
      
      // Actualizar estado
      dispatch({ type: AUTH_ACTIONS.SET_USER, payload: user });
      
      // Programar refresh
      scheduleTokenRefresh((accessTokenExpiresIn || 15 * 60) * 1000);

      // Conectar WebSocket
      try {
        await socketService.connect();
      } catch (socketError) {
        console.warn('[Auth] No se pudo conectar WebSocket:', socketError);
      }

      // Mensaje de bienvenida
      toast.success(`¡Bienvenido, ${user.name}!`);

      // Redirigir
      const from = location.state?.from?.pathname;
      redirectByRole(user, from);

      return user;
    } catch (error) {
      const message = extractErrorMessage(error);
      
      // Manejar estados especiales de cuenta
      if (error.accountStatus === 'pending_approval') {
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
        toast.error('Cuenta rechazada');
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
    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      const response = await authAPI.register(data);
      const result = extractData(response);

      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      
      toast.success(
        'Registro exitoso. Tu cuenta está pendiente de aprobación por un administrador.',
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
   * Cerrar sesión
   */
  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      // Continuar con logout local aunque falle en servidor
      console.warn('[Auth] Error en logout del servidor:', error);
    }

    // Limpiar estado local
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    
    clearTokens();
    socketService.disconnect();
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
    
    toast.info('Sesión cerrada correctamente');
    navigate(ROUTES.LOGIN, { replace: true });
  }, [navigate]);

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
    
    // Helpers
    isTeacher: state.user?.role === 'teacher',
    isSuperAdmin: state.user?.role === 'super_admin',
    
    // Acciones
    login,
    register,
    logout,
    clearError,
    updateUser,
  }), [
    state.user,
    state.isAuthenticated,
    state.isLoading,
    state.error,
    login,
    register,
    logout,
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
