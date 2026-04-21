/**
 * @fileoverview Página de inicio de sesión
 * Diseño premium con validación, estados de carga, manejo de errores
 * y rate limiting para protección contra fuerza bruta.
 * 
 * @module pages/Login
 */

import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogIn, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle, Info, Clock,
  Target, BarChart3, ShieldCheck,
} from 'lucide-react';
import EduPlayIcon from '../components/icons/EduPlayIcon';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFormFocusFirstError } from '../hooks/useFormFocusFirstError';
import { cn, formFieldVariants } from '../lib/utils';
import ButtonPremium from '../components/ui/ButtonPremium';
import InputPremium from '../components/ui/InputPremium';
import GlassCard from '../components/ui/GlassCard';
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
  return /^[^\s@]+@[^\s@]+$/.test(email) && email.includes('.');
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
  const navigate = useNavigate();
  const { shouldReduceMotion } = useReducedMotion();
  useDocumentTitle('Iniciar Sesión');

  // Estado del formulario
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useFormFocusFirstError(validationErrors);
  
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
      errors.email = 'Introduce tu email';
    } else if (!isValidEmail(formData.email)) {
      errors.email = 'Introduce un email válido';
    }

    if (!formData.password) {
      errors.password = 'Introduce tu contraseña';
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
    <div className="min-h-screen flex bg-background-deep relative overflow-hidden">
      {/* Fondo con efectos */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradiente radial principal */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
          style={{
            background: `radial-gradient(circle, var(--color-brand-glow) 0%, transparent 70%)`,
          }}
        />
        
        {/* Orbes decorativos */}
        <motion.div
          className="absolute top-20 left-20 w-64 h-64 rounded-full bg-accent-indigo/10 blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-20 right-20 w-80 h-80 rounded-full bg-brand-base/10 blur-3xl"
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
            backgroundImage: `linear-gradient(var(--color-border-default) 1px, transparent 1px),
                             linear-gradient(90deg, var(--color-border-default) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      {/* Panel de branding — solo desktop */}
      <motion.aside
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="hidden lg:flex lg:w-1/2 relative z-10 flex-col justify-center px-16 xl:px-24"
      >
        <div className="max-w-lg">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-gradient-to-br from-accent-indigo via-brand-base to-accent-pink mb-8 shadow-lg shadow-brand-glow">
            <EduPlayIcon size={32} className="text-white" />
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold font-display text-text-primary leading-tight mb-6">
            Aprende jugando con <span className="bg-gradient-to-r from-brand-light to-accent-indigo bg-clip-text text-transparent">tecnología RFID</span>
          </h1>
          <p className="text-lg text-text-muted leading-relaxed mb-10">
            Crea experiencias educativas interactivas para tus alumnos. Tarjetas físicas, juegos digitales, resultados en tiempo real.
          </p>
          <div className="space-y-4">
            {[
              { Icon: Target, tint: 'text-accent-indigo', text: 'Mecánicas de asociación y memoria adaptadas por edades' },
              { Icon: BarChart3, tint: 'text-brand-light', text: 'Analytics en tiempo real del progreso de cada alumno' },
              { Icon: ShieldCheck, tint: 'text-accent-pink', text: 'Protección de datos de menores (RGPD / LOPDGDD)' },
            ].map(({ Icon, tint, text }, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-start gap-3"
              >
                <span
                  className={`flex-shrink-0 mt-0.5 inline-flex size-8 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 ${tint}`}
                  aria-hidden="true"
                >
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                <span className="text-text-secondary text-sm leading-relaxed">{text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.aside>

      {/* Panel del formulario */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full lg:w-1/2 flex items-center justify-center p-4 relative z-10"
      >
      <div className="w-full max-w-md">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className={cn(
              'inline-flex items-center justify-center size-20 rounded-2xl mb-4',
              'bg-gradient-to-br from-accent-indigo via-brand-base to-accent-pink',
              'shadow-lg shadow-brand-glow',
              // Pulse-glow como firma: el logo "respira" refuerza identidad del producto
              // y lo diferencia de auth genericos. Respeta reduced-motion via reset global.
              !shouldReduceMotion && 'animate-pulse-glow'
            )}
          >
            <EduPlayIcon size={40} className="text-white" />
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold font-display bg-gradient-to-r from-white via-brand-light to-accent-indigo bg-clip-text text-transparent"
          >
            EduPlay RFID
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-text-muted mt-2"
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
              <div className="flex items-start gap-3 p-4 rounded-xl bg-success-base/10 border border-success-base/20">
                <CheckCircle className="size-5 text-success-base flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-success-base font-medium text-sm">
                    ¡Registro exitoso!
                  </p>
                  <p className="text-success-base/80 text-sm mt-1">
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
              <div className="flex items-start gap-3 p-4 rounded-xl bg-warning-base/10 border border-warning-base/20">
                <Info className="size-5 text-warning-base flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-warning-base font-medium text-sm">
                    Sesión cerrada
                  </p>
                  <p className="text-warning-base/80 text-sm mt-1">
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
              <div className="flex items-start gap-3 p-4 rounded-xl bg-error-base/10 border border-error-base/20">
                <Clock className="size-5 text-error-base flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-error-base font-medium text-sm">
                    Demasiados intentos fallidos
                  </p>
                  <p className="text-error-base/80 text-sm mt-1">
                    Por seguridad, debes esperar {countdown} segundo{countdown === 1 ? '' : 's'} antes de intentar nuevamente.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card del formulario */}
        <GlassCard className="p-8" variant="solid">
          <motion.form
            ref={formRef}
            onSubmit={handleSubmit}
            className="space-y-6"
            initial={shouldReduceMotion ? false : "hidden"}
            animate="visible"
          >
            {/* Título del formulario */}
            <motion.div variants={shouldReduceMotion ? {} : formFieldVariants(0)} className="text-center mb-6">
              <h2 className="text-xl font-semibold text-text-primary">Iniciar Sesión</h2>
              <p className="text-text-muted text-sm mt-1">
                Accede a tu cuenta de profesor
              </p>
            </motion.div>

            {/* Error general */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -10, height: 0 }}
                  className="flex items-start gap-3 p-4 rounded-xl bg-error-base/10 border border-error-base/20"
                >
                  <AlertCircle className="size-5 text-error-base flex-shrink-0 mt-0.5" />
                  <p className="text-error-base text-sm">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Campo Email */}
            <motion.div variants={shouldReduceMotion ? {} : formFieldVariants(1)}>
              <InputPremium
                label="Email"
                name="email"
                type="email"
                placeholder="tu@email.com"
                value={formData.email}
                onChange={handleChange}
                error={validationErrors.email}
                icon={<Mail className="size-5" />}
                autoComplete="email"
                spellCheck={false}
              />
            </motion.div>

            {/* Campo Contraseña */}
            <motion.div variants={shouldReduceMotion ? {} : formFieldVariants(2)} className="relative">
              <InputPremium
                label="Contraseña"
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                error={validationErrors.password}
                icon={<Lock className="size-5" />}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-text-muted hover:text-text-primary transition-colors p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base rounded"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="size-5" aria-hidden="true" />
                ) : (
                  <Eye className="size-5" aria-hidden="true" />
                )}
              </button>
            </motion.div>

            {/* Botón de submit */}
            <motion.div variants={shouldReduceMotion ? {} : formFieldVariants(3)}>
              <ButtonPremium
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                loading={isSubmitting || isLoading}
                disabled={isSubmitting || isLoading || isLocked}
                icon={<LogIn className="size-5" />}
              >
                {isSubmitting ? 'Iniciando sesión…' : 'Iniciar Sesión'}
              </ButtonPremium>
            </motion.div>
          </motion.form>

          {/* Separador */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-default" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-background-elevated/80 text-text-muted">
                ¿No tienes cuenta?
              </span>
            </div>
          </div>

          {/* Link a registro */}
          <ButtonPremium
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => navigate(ROUTES.REGISTER)}
          >
            Crear cuenta de profesor
          </ButtonPremium>
        </GlassCard>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-text-muted text-sm mt-6"
        >
          © {new Date().getFullYear()} EduPlay RFID · Proyecto TFG
        </motion.p>
      </div>
      </motion.div>
    </div>
  );
}
