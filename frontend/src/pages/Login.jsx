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
  Target, BarChart3, ShieldCheck, Sparkles, ArrowRight,
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
import ThemeToggle from '../components/ui/ThemeToggle';
import { ROUTES } from '../constants/routes';

// ============================================
// CONSTANTES DE RATE LIMITING
// ============================================

const RATE_LIMIT_KEY = 'login_rate_limit';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 1000;

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+$/.test(email) && email.includes('.');

const getRateLimitState = () => {
  try {
    const stored = sessionStorage.getItem(RATE_LIMIT_KEY);
    if (!stored) return { attempts: 0, lockoutUntil: null };
    const state = JSON.parse(stored);
    if (state.lockoutUntil && Date.now() > state.lockoutUntil) {
      sessionStorage.removeItem(RATE_LIMIT_KEY);
      return { attempts: 0, lockoutUntil: null };
    }
    return state;
  } catch {
    return { attempts: 0, lockoutUntil: null };
  }
};

const setRateLimitState = (state) => {
  sessionStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
};

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
    lockoutUntil: null,
  };
};

const resetRateLimit = () => sessionStorage.removeItem(RATE_LIMIT_KEY);

const FEATURES = [
  {
    Icon: Target,
    tint: 'text-accent-indigo',
    bg: 'bg-accent-indigo/10',
    text: 'Tres mecánicas adaptables',
    detail: 'Asociación, memoria y secuencia para edades 4-8 años',
  },
  {
    Icon: BarChart3,
    tint: 'text-brand-base',
    bg: 'bg-brand-base/10',
    text: 'Análisis pedagógico en tiempo real',
    detail: 'Aciertos, ritmo y rondas por alumno tras cada partida',
  },
  {
    Icon: ShieldCheck,
    tint: 'text-success-base',
    bg: 'bg-success-base/10',
    text: 'Datos de menores protegidos',
    detail: 'Cumplimiento RGPD Art. 8 y LOPDGDD Art. 7',
  },
];

export default function Login() {
  const { login, error, clearError, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { shouldReduceMotion } = useReducedMotion();
  useDocumentTitle('Iniciar Sesión');

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useFormFocusFirstError(validationErrors);

  const [rateLimitState, setRateLimitStateLocal] = useState(getRateLimitState);
  const [countdown, setCountdown] = useState(0);

  const registrationSuccess = location.state?.registrationSuccess;
  const sessionInvalidated = location.state?.sessionInvalidated;

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

  useEffect(() => {
    if (error) clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.email, formData.password]);

  useEffect(() => {
    if (registrationSuccess || sessionInvalidated) {
      window.history.replaceState({}, document.title);
    }
  }, [registrationSuccess, sessionInvalidated]);

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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const currentState = getRateLimitState();
    if (currentState.lockoutUntil && Date.now() < currentState.lockoutUntil) return;
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      await login(formData.email.trim().toLowerCase(), formData.password);
      resetRateLimit();
      setRateLimitStateLocal({ attempts: 0, lockoutUntil: null });
    } catch {
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

  const isLocked = rateLimitState.lockoutUntil && Date.now() < rateLimitState.lockoutUntil;

  return (
    <div className="min-h-screen flex bg-background-base relative overflow-hidden">
      {/* Aurora background (consume tokens semánticos --color-aurora-*) */}
      <div
        className="aurora-layer fixed inset-0 pointer-events-none overflow-hidden opacity-40"
        aria-hidden="true"
      >
        <div
          className="absolute -top-32 -left-20 w-[40rem] h-[40rem] rounded-full blur-[140px] opacity-80"
          style={{ backgroundColor: 'var(--color-aurora-1)' }}
        />
        <div
          className="absolute -bottom-32 -right-20 w-[36rem] h-[36rem] rounded-full blur-[140px] opacity-70"
          style={{ backgroundColor: 'var(--color-aurora-2)' }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50rem] h-[50rem] rounded-full blur-[160px] opacity-50"
          style={{ backgroundColor: 'var(--color-aurora-3)' }}
        />
      </div>

      {/* Grid pattern sutil — más visible en light gracias al borde 0.16 */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-border-default) 1px, transparent 1px), linear-gradient(90deg, var(--color-border-default) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
        aria-hidden="true"
      />

      {/* Theme toggle flotante en esquina inferior derecha — permite al
          usuario elegir tema antes incluso de hacer login. Reposicionado
          desde top-right (QA 2026-05-07): los toasts Sonner viven en
          `top-right` por 4 s y tapaban el toggle al hacer login fallido
          o tras un registro completado. Bottom-right libera la zona de
          notificaciones y se mantiene fuera del flujo central del form. */}
      <div className="absolute bottom-6 right-6 z-30">
        <ThemeToggle />
      </div>

      {/* Panel de branding (desktop) */}
      <motion.aside
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="hidden lg:flex lg:w-1/2 relative z-10 flex-col justify-center px-12 xl:px-20 2xl:px-28"
      >
        <div className="max-w-xl">
          {/* Logo + tagline */}
          <div className="flex items-center gap-3 mb-10">
            <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-accent-indigo via-brand-base to-accent-pink shadow-[0_0_28px_var(--color-brand-glow)]">
              <EduPlayIcon size={28} className="text-white" />
            </div>
            <div>
              <span className="block text-xl font-bold font-display gradient-text-brand tracking-tight">
                EduPlay RFID
              </span>
              <span className="block text-xs text-text-muted uppercase tracking-widest">
                Proyecto TFG · 2026
              </span>
            </div>
          </div>

          {/* Tagline principal */}
          <h1 className="text-4xl xl:text-5xl 2xl:text-6xl font-bold font-display text-text-primary leading-[1.1] mb-6">
            Aprende jugando con{' '}
            <span className="bg-gradient-to-r from-brand-base via-accent-indigo to-accent-pink bg-clip-text text-transparent">
              tarjetas RFID
            </span>
          </h1>

          <p className="text-lg text-text-secondary leading-relaxed mb-10 max-w-lg">
            Diseña juegos educativos con tarjetas físicas. Tu alumnado aprende
            tocando; tú obtienes su progreso al instante.
          </p>

          {/* Lista de features con iconos coloreados por contexto */}
          <ul className="space-y-5">
            {FEATURES.map(({ Icon, tint, bg, text, detail }, i) => (
              <motion.li
                key={text}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-4"
              >
                <span
                  className={cn(
                    'flex-shrink-0 mt-0.5 inline-flex size-10 items-center justify-center rounded-xl',
                    'border border-border-default backdrop-blur-sm',
                    bg,
                    tint,
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="text-text-primary font-medium leading-snug">{text}</p>
                  <p className="text-text-muted text-sm leading-relaxed mt-0.5">
                    {detail}
                  </p>
                </div>
              </motion.li>
            ))}
          </ul>

          {/* Pie del panel hero */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-12 pt-8 border-t border-border-subtle flex items-center gap-2 text-text-muted text-xs"
          >
            <Sparkles size={14} aria-hidden="true" className="text-brand-base" />
            <span>Compatible con cualquier lector RFID conectado por USB</span>
          </motion.div>
        </div>
      </motion.aside>

      {/* Panel del formulario */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full lg:w-1/2 flex items-center justify-center p-4 lg:p-12 relative z-10"
      >
        <div className="w-full max-w-md">
          {/* Logo compacto solo en mobile */}
          <div className="lg:hidden text-center mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className={cn(
                'inline-flex items-center justify-center size-14 rounded-2xl mb-3',
                'bg-gradient-to-br from-accent-indigo via-brand-base to-accent-pink',
                'shadow-[0_0_24px_var(--color-brand-glow)]',
                !shouldReduceMotion && 'animate-pulse-glow',
              )}
            >
              <EduPlayIcon size={28} className="text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold font-display gradient-text-brand">
              EduPlay RFID
            </h1>
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
                <div className="flex items-start gap-3 p-4 rounded-xl bg-success-base/10 border border-success-base/30">
                  <CheckCircle className="size-5 text-success-base flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-success-base font-medium text-sm">
                      ¡Registro exitoso!
                    </p>
                    <p className="text-text-secondary text-sm mt-1">
                      Tu cuenta está pendiente de aprobación. La dirección del centro la revisará pronto.
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
                <div className="flex items-start gap-3 p-4 rounded-xl bg-warning-base/10 border border-warning-base/30">
                  <Info className="size-5 text-warning-base flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-warning-base font-medium text-sm">Sesión cerrada</p>
                    <p className="text-text-secondary text-sm mt-1">
                      Tu sesión se cerró porque iniciaste sesión en otro dispositivo.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {isLocked && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mb-4"
              >
                <div className="flex items-start gap-3 p-4 rounded-xl bg-error-base/10 border border-error-base/30">
                  <Clock className="size-5 text-error-base flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-error-base font-medium text-sm">
                      Demasiados intentos fallidos
                    </p>
                    <p className="text-text-secondary text-sm mt-1">
                      Por seguridad, espera {countdown} segundo{countdown === 1 ? '' : 's'} antes de volver a intentarlo.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Card del formulario */}
          <GlassCard className="p-8 lg:p-10" variant="solid">
            <motion.form
              ref={formRef}
              onSubmit={handleSubmit}
              className="space-y-6"
              initial={shouldReduceMotion ? false : 'hidden'}
              animate="visible"
            >
              {/* Título del formulario */}
              <motion.div
                variants={shouldReduceMotion ? {} : formFieldVariants(0)}
                className="mb-2"
              >
                <h2 className="text-2xl font-bold font-display text-text-primary">
                  Iniciar sesión
                </h2>
                <p className="text-text-muted text-sm mt-1.5">
                  Bienvenido de nuevo. Accede para gestionar tu aula.
                </p>
              </motion.div>

              {/* Error general */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    className="flex items-start gap-3 p-3.5 rounded-xl bg-error-base/10 border border-error-base/30"
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
              <motion.div
                variants={shouldReduceMotion ? {} : formFieldVariants(2)}
                className="relative"
              >
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

              {/* Botón submit */}
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
                  {isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
                </ButtonPremium>
              </motion.div>
            </motion.form>

            {/* Separador */}
            <div className="relative my-7">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-subtle" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-background-elevated text-text-muted uppercase tracking-widest">
                  o
                </span>
              </div>
            </div>

            {/* Link a registro */}
            <button
              type="button"
              onClick={() => navigate(ROUTES.REGISTER)}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl',
                'border border-border-default bg-background-base/30 hover:bg-background-surface/40',
                'text-text-primary font-medium text-sm',
                'transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base',
              )}
            >
              <span>¿Aún no tienes cuenta?</span>
              <span className="text-brand-base inline-flex items-center gap-1">
                Crear cuenta de docente
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
            </button>
          </GlassCard>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center mt-6"
          >
            <p className="text-text-muted text-xs">
              © {new Date().getFullYear()} EduPlay RFID · Proyecto TFG ·{' '}
              <button
                type="button"
                onClick={() => navigate('/privacy')}
                className="text-text-secondary hover:text-text-primary transition-colors underline-offset-2 hover:underline"
              >
                Política de privacidad
              </button>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
