/**
 * @fileoverview Página de inicio de sesión
 * Layout 5/7 con escena signature `AuthBackground` (constelación de
 * tarjetas RFID + scanline + wave). Form en card propia con borde
 * superior de marca.
 *
 * @module pages/Login
 */

import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Turnstile from 'react-turnstile';
import {
  LogIn, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle, Info, Clock,
  ShieldCheck, ArrowRight, Sparkles, Wifi,
} from 'lucide-react';
import EduPlayIcon from '../components/icons/EduPlayIcon';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFormFocusFirstError } from '../hooks/useFormFocusFirstError';
import { cn, formFieldVariants } from '../lib/utils';
import ButtonPremium from '../components/ui/ButtonPremium';
import InputPremium from '../components/ui/InputPremium';
import ThemeToggle from '../components/ui/ThemeToggle';
import AuthBackground from '../components/auth/AuthBackground';
import { ROUTES } from '../constants/routes';

// T-905 B6: CAPTCHA Turnstile tras 3 fallos previos.
// Si la env var no está set (típico en dev), la verificación queda off — el
// backend tampoco la exigirá porque `TURNSTILE_SECRET` server-side va emparejada.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITEKEY || '';
const TURNSTILE_THRESHOLD = 3;

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

// Tres "proof points" cortos para el hero. Antes era una lista
// descriptiva con 3 features detallados; ahora son chips comprimidos
// que dejan el protagonismo a la constelación visual.
const PROOF_POINTS = [
  { Icon: Wifi, label: 'Lectura RFID instantánea' },
  { Icon: Sparkles, label: '3 mecánicas adaptables' },
  { Icon: ShieldCheck, label: 'RGPD · datos de menores' },
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
  // T-905 B6: captchaToken válido de Turnstile (vigente 5min según Cloudflare).
  // Se resetea al reset de rate limit y a cada submit fallido (un token es one-shot).
  const [captchaToken, setCaptchaToken] = useState(null);

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

  // BUG (QA 2026-05-16): este efecto borraba el error de credenciales
  // inmediatamente después del fallo, porque el handler de submit limpia
  // `formData.password` para forzar al usuario a reescribirla (BUG-LOGIN-1)
  // y eso disparaba el efecto, ejecutando clearError() antes de que el
  // mensaje "Credenciales inválidas" llegara a renderizarse al usuario.
  // El comportamiento deseado es limpiar el error sólo cuando el usuario
  // edita el campo manualmente — ahora lo hacemos desde `handleChange`
  // que sólo se invoca en eventos de teclado, no en resets programáticos.

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
    // Limpiar el error general sólo cuando el usuario edita manualmente
    // — los resets programáticos (catch del submit) no deben borrarlo.
    if (error) clearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const currentState = getRateLimitState();
    if (currentState.lockoutUntil && Date.now() < currentState.lockoutUntil) return;
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      // T-905 B6: pasamos captchaToken si el widget Turnstile lo ha generado.
      // El backend lo exige solo si TURNSTILE_SECRET está set Y hubo ≥3 fallos.
      await login(formData.email.trim().toLowerCase(), formData.password, captchaToken);
      resetRateLimit();
      setRateLimitStateLocal({ attempts: 0, lockoutUntil: null });
      setCaptchaToken(null);
    } catch {
      const result = recordFailedAttempt();
      setRateLimitStateLocal({
        attempts: MAX_ATTEMPTS - result.remainingAttempts,
        lockoutUntil: result.lockoutUntil,
      });
      if (result.lockoutUntil) {
        setCountdown(Math.ceil(LOCKOUT_DURATION / 1000));
      }
      // BUG-LOGIN-1 (QA 2026-05-14): tras un fallo, preservar el email para
      // que el usuario sólo reescriba la contraseña; limpiar la contraseña
      // por seguridad y para enfocar la corrección.
      setFormData((prev) => ({ ...prev, password: '' }));
      // Turnstile genera tokens one-shot: tras cada fallo, resetear para que
      // el widget pida nueva verificación si vuelve a ser necesario.
      setCaptchaToken(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  // T-905 B6: el widget Turnstile aparece a partir del 3er fallo (alineado con
  // backend TURNSTILE_FAILURE_THRESHOLD=3). Si la sitekey no está configurada
  // (dev sin Turnstile), no se renderiza nada — el guard backend tampoco aplica.
  const showCaptcha = Boolean(TURNSTILE_SITE_KEY) && rateLimitState.attempts >= TURNSTILE_THRESHOLD;

  const isLocked = rateLimitState.lockoutUntil && Date.now() < rateLimitState.lockoutUntil;

  return (
    <div className="min-h-screen flex bg-background-base relative overflow-hidden">
      {/* Escena signature: constelación de tarjetas RFID + scanline + wave.
          Substituye el aurora-de-tres-orbes genérico anterior. */}
      <AuthBackground variant="login" />

      {/* Theme toggle flotante en esquina superior derecha — el primer
          golpe de vista del docente al entrar. Wrapper card sólido para
          destacar sobre la escena AuthBackground.

          Fix QA 2026-05-10: antes vivía en bottom-right pero el usuario
          no lo veía. El toaster Sonner se movió a bottom-right en App.jsx
          para liberar este espacio. El top-right queda como ubicación
          natural ("ajustes globales") sin competir con el form. */}
      <div className="absolute top-6 right-6 z-30">
        <div className="rounded-2xl bg-background-elevated/90 backdrop-blur-md border border-border-default shadow-[var(--shadow-md)] px-2 py-1.5">
          <ThemeToggle />
        </div>
      </div>

      {/* Wrapper centrador con dos columnas en lg+ — 7/5 hero/form para que
          el form no se sienta perdido y el hero respire mejor. */}
      <div className="relative z-10 w-full mx-auto grid lg:grid-cols-12 items-center gap-0 max-w-[1500px] px-6 lg:px-12 xl:px-16 py-10">
        {/* Panel hero — sólo desktop. Mantiene la silueta lateral pero
            usa el espacio para narrativa breve y proof points concisos. */}
        <motion.aside
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="hidden lg:flex lg:col-span-7 flex-col justify-center pr-8 xl:pr-16"
        >
          {/* Eyebrow + logo en línea — brevedad por encima del headline */}
          <div className="flex items-center gap-3 mb-8">
            <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-gradient-to-br from-accent-indigo via-brand-base to-accent-pink shadow-[0_0_28px_var(--color-brand-glow)]">
              <EduPlayIcon size={24} className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold font-display gradient-text-brand tracking-tight leading-none">
                EduPlay RFID
              </span>
              <span className="text-[10px] text-text-muted uppercase tracking-[0.18em] mt-1">
                Plataforma educativa · TFG 2026
              </span>
            </div>
          </div>

          {/* Headline más vertical — apoya en la constelación visual */}
          <h1 className="font-display font-bold text-text-primary leading-[1.05] mb-6"
              style={{ fontSize: 'var(--text-fluid-hero)' }}>
            Acerca el cartón.
            <br />
            <span className="bg-gradient-to-br from-brand-light via-brand-base to-accent-pink bg-clip-text text-transparent">
              Suceden cosas.
            </span>
          </h1>

          <p className="text-text-secondary leading-relaxed mb-10 max-w-md"
             style={{ fontSize: 'var(--text-fluid-base)' }}>
            Diseña juegos educativos con tarjetas RFID que tu alumnado
            de 4 a 8 años toca con sus manos. Tú ves el progreso al instante.
          </p>

          {/* Proof points como chips horizontales — denso, no listón vertical */}
          <ul className="flex flex-wrap gap-2.5">
            {PROOF_POINTS.map(({ Icon, label }, i) => (
              <motion.li
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
                  'bg-background-elevated/60 backdrop-blur-md',
                  'border border-border-default text-text-secondary text-sm',
                )}
              >
                <Icon size={14} className="text-brand-base" strokeWidth={1.75} />
                {label}
              </motion.li>
            ))}
          </ul>
        </motion.aside>

        {/* Panel form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="lg:col-span-5 w-full flex justify-center"
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

            {/* Card del formulario — auth-form-card aporta la barra superior
                de marca y sombras tematizadas. */}
            <div className="auth-form-card p-8 lg:p-10">
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

                {/* T-905 B6: widget CAPTCHA Turnstile tras 3 fallos previos.
                    Si VITE_TURNSTILE_SITEKEY no está set en build, no se
                    renderiza nada (backend tampoco exige captcha). */}
                {showCaptcha && (
                  <motion.div
                    variants={shouldReduceMotion ? {} : formFieldVariants(3)}
                    className="flex flex-col items-center gap-2 py-2"
                    role="region"
                    aria-label="Verificación anti-robot"
                  >
                    <p className="text-xs text-text-muted text-center">
                      Detectamos varios intentos. Confirma que no eres un robot para continuar.
                    </p>
                    <Turnstile
                      sitekey={TURNSTILE_SITE_KEY}
                      onVerify={setCaptchaToken}
                      onExpire={() => setCaptchaToken(null)}
                      onError={() => setCaptchaToken(null)}
                      theme="auto"
                      retry="auto"
                      refreshExpired="auto"
                    />
                  </motion.div>
                )}

                {/* Botón submit */}
                <motion.div variants={shouldReduceMotion ? {} : formFieldVariants(3)}>
                  <ButtonPremium
                    type="submit"
                    variant="primary"
                    size="lg"
                    className="w-full"
                    loading={isSubmitting || isLoading}
                    disabled={isSubmitting || isLoading || isLocked || (showCaptcha && !captchaToken)}
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
            </div>

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
    </div>
  );
}
