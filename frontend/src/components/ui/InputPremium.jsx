import { useId, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @fileoverview Componente InputPremium
 * Campos de texto principales del diseño, utilizando tokens OKLCH del @theme central.
 * Usa Framer Motion para shake de error y AnimatePresence para mensajes de error.
 */

const InputPremium = ({
  ref,
  label,
  error,
  hint,
  helperText,
  icon,
  iconPosition = 'left',
  className,
  inputClassName,
  id,
  type = "text",
  ...props
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;
  const hasError = Boolean(error);
  const { shouldReduceMotion } = useReducedMotion();
  const wrapperRef = useRef(null);
  const prevErrorRef = useRef(hasError);

  // Shake when error transitions from false -> true
  useEffect(() => {
    if (hasError && !prevErrorRef.current && !shouldReduceMotion && wrapperRef.current) {
      // Trigger shake via CSS animation as a lightweight alternative
      wrapperRef.current.animate?.(
        [
          { transform: 'translateX(-4px)' },
          { transform: 'translateX(4px)' },
          { transform: 'translateX(-3px)' },
          { transform: 'translateX(3px)' },
          { transform: 'translateX(-1px)' },
          { transform: 'translateX(1px)' },
          { transform: 'translateX(0)' },
        ],
        { duration: 400 }
      );
    }
    prevErrorRef.current = hasError;
  }, [hasError, shouldReduceMotion]);

  return (
    <div className={cn('relative w-full text-left flex flex-col', className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-text-secondary mb-1.5"
        >
          {label}
        </label>
      )}

      <div ref={wrapperRef} className="relative group flex items-center">
        {icon && iconPosition === 'left' && (
          <div className="absolute left-4 text-text-muted transition-colors group-focus-within:text-brand-base z-10 pointer-events-none">
            {icon}
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={type}
          aria-invalid={hasError}
          aria-describedby={(() => {
            if (hasError) return `${inputId}-error`;
            if (hint) return `${inputId}-hint`;
            if (helperText) return `${inputId}-helper`;
            return undefined;
          })()}
          className={cn(
            'w-full bg-background-elevated border rounded-xl px-4 py-3',
            'text-text-primary placeholder:text-text-muted',
            'transition-[color,border-color,box-shadow] duration-200 ease-in-out',
            'focus:outline-none focus:ring-4 focus:ring-brand-glow focus:border-brand-base',
            // Estados normales vs Errores
            hasError
              ? 'border-error-base text-error-base focus:ring-error-glow focus:border-error-base'
              : 'border-border-default hover:border-border-strong',
            // Espaciado dinámico basado incrustado de iconos
            icon && iconPosition === 'left' ? 'pl-11' : '',
            icon && iconPosition === 'right' ? 'pr-11' : '',
            inputClassName
          )}
          {...props}
        />

        {icon && iconPosition === 'right' && (
          <div className="absolute right-4 text-text-muted transition-colors group-focus-within:text-brand-base z-10 pointer-events-none">
            {icon}
          </div>
        )}
      </div>

      {/* Hint o Error con AnimatePresence */}
      <AnimatePresence mode="wait">
        {(() => {
          if (hasError) return (
            <motion.p
              key="error"
              initial={shouldReduceMotion ? false : { opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4, height: 0 }}
              transition={{ duration: DURATION.feedback, ease: EASING.outQuart }}
              id={`${inputId}-error`}
              role="alert"
              className="mt-1.5 text-sm text-error-base"
            >
              {error}
            </motion.p>
          );
          if (hint) return (
            <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-text-muted">
              {hint}
            </p>
          );
          return null;
        })()}
      </AnimatePresence>
      {helperText && !hasError && !hint && (
        <p id={`${inputId}-helper`} className="mt-1.5 text-xs text-text-muted">{helperText}</p>
      )}
    </div>
  );
};

export default InputPremium;
