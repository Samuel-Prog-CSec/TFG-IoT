/**
 * @fileoverview Página de inicio de sesión
 * Diseño premium con validación, estados de carga, manejo de errores
 * y rate limiting para protección contra fuerza bruta.
 * 
 * @module pages/Login
 */

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle, Info, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ButtonPremium, InputPremium, GlassCard } from '../components/ui';
import { ROUTES } from '../constants/routes';

// ============================================
// CONSTANTES DE RATE LIMITING
// ============================================

const RATE_LIMIT_KEY = 'login_rate_limit';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 1000; // 30 segundos

/**
 * Validación básica de email
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Obtiene el estado de rate limiting del sessionStorage
 * @returns {{ attempts: number, lockoutUntil: number | null }}
 */
const getRateLimitState = () => {
  try {
    const stored = sessionStorage.getItem(RATE_LIMIT_KEY);
    if (!stored) return { attempts: 0, lockoutUntil: null };
    
    const state = JSON.parse(stored);
    
    // Si el lockout expiró, resetear
    if (state.lockoutUntil && Date.now() > state.lockoutUntil) {
      sessionStorage.removeItem(RATE_LIMIT_KEY);
      return { attempts: 0, lockoutUntil: null };
    }
    
    return state;
  } catch {
    return { attempts: 0, lockoutUntil: null };
  }
};

/**
 * Actualiza el estado de rate limiting en sessionStorage
 * @param {{ attempts: number, lockoutUntil: number | null }} state
 */
const setRateLimitState = (state) => {
  sessionStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
};

/**
 * Registra un intento fallido de login
 * @returns {{ isLocked: boolean, remainingAttempts: number, lockoutUntil: number | null }}
 */
const recordFailedAttempt = () => {
  const state = getRateLimitState();
  const newAttempts = state.attempts + 1;
  
  if (newAttempts >= MAX_ATTEMPTS) {
    const lockoutUntil = Date.now() + LOCKOUT_DURATION;
    setRateLimitState({ attempts: newAttempts, lockoutUntil });
    return { isLocked: true, remainingAttempts: 0, lockoutUntil };
  }
  
  setRateLimitState({ attempts: newAttempts, lockoutUntil: null });
  return { 
    isLocked: false, 
    remainingAttempts: MAX_ATTEMPTS - newAttempts,
    lockoutUntil: null 
  };
};

/**
 * Resetea el contador de intentos (tras login exitoso)
 */
const resetRateLimit = () => {
  sessionStorage.removeItem(RATE_LIMIT_KEY);
};

/**
 * Página de Login
 */
export default function Login() {
  const { login, error, clearError, isLoading } = useAuth();
  const location = useLocation();

  // Estado del formulario
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Estado de rate limiting
  const [rateLimitState, setRateLimitStateLocal] = useState(getRateLimitState);
  const [countdown, setCountdown] = useState(0);

  // Mensajes de estado desde navegación
  const registrationSuccess = location.state?.registrationSuccess;
  const sessionInvalidated = location.state?.sessionInvalidated;

  // Verificar y actualizar estado de lockout
  useEffect(() => {
    const checkLockout = () => {
      const state = getRateLimitState();
      setRateLimitStateLocal(state);
      
      if (state.lockoutUntil) {
        const remaining = Math.ceil((state.lockoutUntil - Date.now()) / 1000);
        setCountdown(Math.max(remaining, 0));
      } else {
        setCountdown(0);
      }
    };
    
    checkLockout();
    
    // Actualizar countdown cada segundo si está bloqueado
    const interval = setInterval(() => {
      if (rateLimitState.lockoutUntil) {
        const remaining = Math.ceil((rateLimitState.lockoutUntil - Date.now()) / 1000);
        if (remaining <= 0) {
          resetRateLimit();
          setRateLimitStateLocal({ attempts: 0, lockoutUntil: null });
          setCountdown(0);
        } else {
          setCountdown(remaining);
        }
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [rateLimitState.lockoutUntil]);

  // Limpiar error al cambiar inputs
  useEffect(() => {
    if (error) {
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.email, formData.password]);

  // Limpiar estado de navegación después de mostrar mensaje
  useEffect(() => {
    if (registrationSuccess || sessionInvalidated) {
      window.history.replaceState({}, document.title);
    }
  }, [registrationSuccess, sessionInvalidated]);

  /**
   * Validar formulario
   * @returns {boolean} true si es válido
   */
  const validateForm = () => {
    const errors = {};

    if (!formData.email.trim()) {
      errors.email = 'El email es requerido';
    } else if (!isValidEmail(formData.email)) {
      errors.email = 'Introduce un email válido';
    }

    if (!formData.password) {
      errors.password = 'La contraseña es requerida';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Manejar cambio en inputs
   * @param {Event} e
   */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Limpiar error de validación del campo
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  /**
   * Manejar envío del formulario
   * @param {Event} e
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Verificar rate limiting
    const currentState = getRateLimitState();
    if (currentState.lockoutUntil && Date.now() < currentState.lockoutUntil) {
      return; // Bloqueado
    }

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await login(formData.email.trim().toLowerCase(), formData.password);
      // Login exitoso - resetear rate limiting
      resetRateLimit();
      setRateLimitStateLocal({ attempts: 0, lockoutUntil: null });
    } catch {
      // Registrar intento fallido
      const result = recordFailedAttempt();
      setRateLimitStateLocal({
        attempts: MAX_ATTEMPTS - result.remainingAttempts,
        lockoutUntil: result.lockoutUntil,
      });
      if (result.lockoutUntil) {
        setCountdown(Math.ceil(LOCKOUT_DURATION / 1000));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calcular si está bloqueado
  const isLocked = rateLimitState.lockoutUntil && Date.now() < rateLimitState.lockoutUntil;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
      {/* Fondo con efectos */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradiente radial principal */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
          }}
        />
        
        {/* Orbes decorativos */}
        <motion.div
          className="absolute top-20 left-20 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-20 right-20 w-80 h-80 rounded-full bg-purple-500/10 blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.4, 0.2, 0.4],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      {/* Contenido principal */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo y título */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 mb-4 shadow-lg shadow-purple-500/30"
          >
            <span className="text-4xl">🎮</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold font-display bg-gradient-to-r from-white via-purple-200 to-indigo-200 bg-clip-text text-transparent"
          >
            EduPlay RFID
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-slate-400 mt-2"
          >
            Plataforma de Juegos Educativos
          </motion.p>
        </div>

        {/* Alertas de estado */}
        <AnimatePresence>
          {registrationSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mb-4"
            >
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-emerald-300 font-medium text-sm">
                    ¡Registro exitoso!
                  </p>
                  <p className="text-emerald-400/80 text-sm mt-1">
                    Tu cuenta está pendiente de aprobación. Recibirás acceso cuando un administrador la apruebe.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {sessionInvalidated && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mb-4"
            >
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 font-medium text-sm">
                    Sesión cerrada
                  </p>
                  <p className="text-amber-400/80 text-sm mt-1">
                    Tu sesión fue cerrada porque iniciaste sesión en otro dispositivo.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Alerta de rate limiting */}
          {isLocked && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="mb-4"
            >
              <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Clock className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-rose-300 font-medium text-sm">
                    Demasiados intentos fallidos
                  </p>
                  <p className="text-rose-400/80 text-sm mt-1">
                    Por seguridad, debes esperar {countdown} segundo{countdown === 1 ? '' : 's'} antes de intentar nuevamente.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card del formulario */}
        <GlassCard className="p-8" variant="solid">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Título del formulario */}
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-white">Iniciar Sesión</h2>
              <p className="text-slate-400 text-sm mt-1">
                Accede a tu cuenta de profesor
              </p>
            </div>

            {/* Error general */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20"
                >
                  <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <p className="text-rose-300 text-sm">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Campo Email */}
            <InputPremium
              label="Email"
              name="email"
              type="email"
              placeholder="tu@email.com"
              value={formData.email}
              onChange={handleChange}
              error={validationErrors.email}
              icon={<Mail className="w-5 h-5" />}
              autoComplete="email"
              autoFocus
            />

            {/* Campo Contraseña */}
            <div className="relative">
              <InputPremium
                label="Contraseña"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                error={validationErrors.password}
                icon={<Lock className="w-5 h-5" />}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-slate-400 hover:text-white transition-colors p-1"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Botón de submit */}
            <ButtonPremium
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              loading={isSubmitting || isLoading}
              disabled={isSubmitting || isLoading || isLocked}
              icon={<LogIn className="w-5 h-5" />}
            >
              {isSubmitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </ButtonPremium>
          </form>

          {/* Separador */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-slate-800/80 text-slate-400">
                ¿No tienes cuenta?
              </span>
            </div>
          </div>

          {/* Link a registro */}
          <Link to={ROUTES.REGISTER}>
            <ButtonPremium
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
            >
              Crear cuenta de profesor
            </ButtonPremium>
          </Link>
        </GlassCard>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-slate-500 text-sm mt-6"
        >
          © {new Date().getFullYear()} EduPlay RFID · Proyecto TFG
        </motion.p>
      </motion.div>
    </div>
  );
}
