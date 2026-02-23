import React from 'react';
import { cn } from '../../lib/utils';

/**
 * @fileoverview Componente InputPremium
 * Campos de texto principales del diseño, utilizando tokens OKLCH del @theme central.
 * Se elimina la dependencia excesiva de framer-motion para los anillos de enfoque,
 * priorizando las utilidades de pseudoclases CSS nativas (focus-within) para el máximo rendimiento.
 */

const InputPremium = React.forwardRef(({ 
  label,
  error,
  hint,
  icon,
  iconPosition = 'left',
  className,
  inputClassName,
  id,
  type = "text",
  ...props 
}, ref) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const hasError = Boolean(error);

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
      
      <div className="relative group flex items-center">
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
          aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(
            'w-full bg-background-elevated border rounded-xl px-4 py-3',
            'text-text-primary placeholder:text-text-muted',
            'transition-all duration-200 ease-in-out',
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
      
      {/* Hint o Error contextualizado */}
      {hasError ? (
        <p id={`${inputId}-error`} className="mt-1.5 text-sm text-error-base animate-fade-in-up">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

InputPremium.displayName = "InputPremium";

export default InputPremium;
