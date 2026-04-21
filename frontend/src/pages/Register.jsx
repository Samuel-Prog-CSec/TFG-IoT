/**
 * @fileoverview Página de registro de profesores
 * Incluye validación completa, requisitos de contraseña visuales y UX premium.
 * 
 * @module pages/Register
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  User,
  Check,
  X,
  ArrowLeft,
  Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useFormFocusFirstError } from '../hooks/useFormFocusFirstError';
import ButtonPremium from '../components/ui/ButtonPremium';
import InputPremium from '../components/ui/InputPremium';
import GlassCard from '../components/ui/GlassCard';
import { ROUTES } from '../constants/routes';
import { cn, formFieldVariants } from '../lib/utils';

/**
 * Requisitos de contraseña
 */
const PASSWORD_REQUIREMENTS = [
  { id: 'length', label: 'Mínimo 8 caracteres', test: (p) => p.length >= 8 },
  { id: 'uppercase', label: 'Una letra mayúscula', test: (p) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: 'Una letra minúscula', test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'Un número', test: (p) => /\d/.test(p) },
];

/**
 * Validación de email
 * @param {string} email
 * @returns {boolean}
 */
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+$/.test(email) && email.includes('.');
};

/**
 * Componente de indicador de requisito de contraseña
 */
function PasswordRequirement({ met, label }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'flex items-center gap-2 text-sm transition-colors',
        met ? 'text-success-base' : 'text-text-disabled'
      )}
    >
      {met ? (
        <Check className="size-4" />
      ) : (
        <X className="size-4" />
      )}
      <span>{label}</span>
    </motion.div>
  );
}

/**
 * Componente de medidor de fortaleza de contraseña
 */
function PasswordStrengthMeter({ password }) {
  const strength = useMemo(() => {
    let score = 0;
    PASSWORD_REQUIREMENTS.forEach((req) => {
      if (req.test(password)) score++;
    });
    return score;
  }, [password]);

  const getColor = () => {
    if (strength === 0) return 'bg-background-surface';
    if (strength === 1) return 'bg-error-base';
    if (strength === 2) return 'bg-warning-base';
    if (strength === 3) return 'bg-warning-base';
    return 'bg-success-base';
  };

  const getLabel = () => {
    if (strength === 0) return '';
    if (strength === 1) return 'Muy débil';
    if (strength === 2) return 'Débil';
    if (strength === 3) return 'Media';
    return 'Fuerte';
  };

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              level <= strength ? getColor() : 'bg-background-surface'
            )}
          />
        ))}
      </div>
      <p className={cn(
        'text-xs transition-colors',
        strength <= 2 ? 'text-text-disabled' : 'text-success-base'
      )}>
        {getLabel()}
      </p>
    </div>
  );
}

/**
 * Página de Registro
 */
export default function Register() {
  const { register, error, clearError, isLoading } = useAuth();
  const { shouldReduceMotion } = useReducedMotion();
  useDocumentTitle('Registro');

  // Estado del formulario
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const formRef = useFormFocusFirstError(validationErrors);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);

  // Verificar requisitos de contraseña
  const passwordMet = useMemo(() => {
    return PASSWORD_REQUIREMENTS.map((req) => ({
      ...req,
      met: req.test(formData.password),
    }));
  }, [formData.password]);

  const allRequirementsMet = passwordMet.every((req) => req.met);

  // Limpiar error al cambiar inputs
  useEffect(() => {
    if (error) {
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.email, formData.password, formData.name]);

  /**
   * Validar formulario
   * @returns {boolean} true si es válido
   */
  const validateForm = () => {
    const errors = {};

    // Nombre
    if (!formData.name.trim()) {
      errors.name = 'Introduce tu nombre';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'El nombre debe tener al menos 2 caracteres';
    } else if (formData.name.trim().length > 100) {
      errors.name = 'El nombre no puede exceder 100 caracteres';
    }

    // Email
    if (!formData.email.trim()) {
      errors.email = 'Introduce tu email';
    } else if (!isValidEmail(formData.email)) {
      errors.email = 'Introduce un email válido';
    }

    // Contraseña
    if (!formData.password) {
      errors.password = 'Introduce tu contraseña';
    } else if (!allRequirementsMet) {
      errors.password = 'La contraseña debe cumplir todos los requisitos de seguridad';
    }

    // Confirmar contraseña
    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Confirma tu contraseña';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Las contraseñas no coinciden';
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

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      await register({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });
    } catch {
      // Error ya manejado en AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-deep p-4 relative overflow-hidden">
      {/* Fondo con efectos */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradiente radial principal */}
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
          style={{
            background: 'radial-gradient(circle, color-mix(in srgb, var(--color-accent-indigo) 15%, transparent) 0%, transparent 70%)',
          }}
        />
        
        {/* Orbes decorativos */}
        <motion.div
          className="absolute top-32 right-20 w-72 h-72 rounded-full bg-accent-cyan/10 blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-32 left-20 w-64 h-64 rounded-full bg-accent-indigo/10 blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.4, 0.2, 0.4],
          }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
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

      {/* Contenido principal */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Botón volver */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Link 
            to={ROUTES.LOGIN}
            className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors text-sm group"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
            Volver al inicio de sesión
          </Link>
        </motion.div>

        {/* Logo y título */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="inline-flex items-center justify-center size-20 rounded-2xl bg-gradient-to-br from-accent-cyan via-accent-indigo to-brand-base mb-4 shadow-lg shadow-brand-glow"
          >
            <UserPlus className="size-10 text-text-primary" />
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold font-display bg-gradient-to-r from-text-primary via-accent-cyan to-accent-indigo bg-clip-text text-transparent"
          >
            Crear Cuenta
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-text-muted mt-2"
          >
            Regístrate como profesor en EduPlay
          </motion.p>
        </div>

        {/* Card del formulario */}
        <GlassCard className="p-8" variant="solid">
          <motion.form
            ref={formRef}
            onSubmit={handleSubmit}
            className="space-y-5"
            initial={shouldReduceMotion ? false : "hidden"}
            animate="visible"
          >
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

            {/* Campo Nombre */}
            <motion.div variants={shouldReduceMotion ? {} : formFieldVariants(0)}>
              <InputPremium
                label="Nombre completo"
                name="name"
                type="text"
                placeholder="Tu nombre"
                value={formData.name}
                onChange={handleChange}
                error={validationErrors.name}
                icon={<User className="size-5" />}
                autoComplete="name"
              />
            </motion.div>

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
            <motion.div variants={shouldReduceMotion ? {} : formFieldVariants(2)} className="space-y-2">
              <div className="relative">
                <InputPremium
                  label="Contraseña"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  onFocus={() => setShowRequirements(true)}
                  error={validationErrors.password}
                  icon={<Lock className="size-5" />}
                  autoComplete="new-password"
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
              </div>

              {/* Medidor de fortaleza */}
              <PasswordStrengthMeter password={formData.password} />

              {/* Requisitos de contraseña */}
              <AnimatePresence>
                {showRequirements && formData.password && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1.5 pt-2"
                  >
                    {passwordMet.map((req, index) => (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <PasswordRequirement met={req.met} label={req.label} />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Campo Confirmar Contraseña */}
            <motion.div variants={shouldReduceMotion ? {} : formFieldVariants(3)} className="relative">
              <InputPremium
                label="Confirmar contraseña"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                error={validationErrors.confirmPassword}
                icon={<Shield className="size-5" />}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-[38px] text-text-muted hover:text-text-primary transition-colors p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base rounded"
                aria-label={showConfirmPassword ? 'Ocultar confirmación' : 'Mostrar confirmación'}
                aria-pressed={showConfirmPassword}
              >
                {showConfirmPassword ? (
                  <EyeOff className="size-5" aria-hidden="true" />
                ) : (
                  <Eye className="size-5" aria-hidden="true" />
                )}
              </button>
            </motion.div>

            {/* Indicador de coincidencia */}
            <AnimatePresence>
              {formData.confirmPassword && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    formData.password === formData.confirmPassword
                      ? 'text-success-base'
                      : 'text-error-base'
                  )}
                >
                  {formData.password === formData.confirmPassword ? (
                    <>
                      <Check className="size-4" />
                      Las contraseñas coinciden
                    </>
                  ) : (
                    <>
                      <X className="size-4" />
                      Las contraseñas no coinciden
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Aviso de aprobación */}
            <motion.div variants={shouldReduceMotion ? {} : formFieldVariants(4)} className="flex items-start gap-3 p-4 rounded-xl bg-accent-indigo/10 border border-accent-indigo/20">
              <Shield className="size-5 text-accent-indigo flex-shrink-0 mt-0.5" />
              <p className="text-accent-indigo/90 text-sm">
                Tu cuenta requerirá <strong>aprobación de un administrador</strong> antes de poder acceder a la plataforma.
              </p>
            </motion.div>

            {/* Botón de submit */}
            <motion.div variants={shouldReduceMotion ? {} : formFieldVariants(5)}>
              <ButtonPremium
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                loading={isSubmitting || isLoading}
                disabled={isSubmitting || isLoading}
                icon={<UserPlus className="size-5" />}
              >
                {isSubmitting ? 'Registrando…' : 'Crear cuenta'}
              </ButtonPremium>
            </motion.div>
          </motion.form>

          {/* Link a login */}
          <p className="text-center text-text-muted text-sm mt-6">
            ¿Ya tienes cuenta?{' '}
            <Link 
              to={ROUTES.LOGIN}
              className="text-accent-indigo hover:text-accent-indigo transition-colors font-medium"
            >
              Inicia sesión
            </Link>
          </p>
        </GlassCard>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-text-disabled text-sm mt-6"
        >
          © {new Date().getFullYear()} EduPlay RFID · Proyecto TFG
        </motion.p>
      </motion.div>
    </div>
  );
}
