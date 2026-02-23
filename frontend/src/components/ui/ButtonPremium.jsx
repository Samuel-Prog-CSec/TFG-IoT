import React from 'react';
import { motion } from 'framer-motion';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * @fileoverview Componente ButtonPremium
 * Implementación basada en CVA (Class Variance Authority) para estandarización de diseño.
 * Se utilizan tokens cromáticos OKLCH definidos en Tailwind v4 para garantizar consistencia.
 * Enfoque de "profundidad sutil" en lugar de sombras pesadas continuas.
 */

const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center whitespace-nowrap',
    'transition-all duration-300',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background-base',
    'disabled:opacity-50 disabled:pointer-events-none'
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-gradient-to-r from-brand-base to-accent-indigo',
          'text-white font-semibold',
          'border border-white/10',
          'shadow-[0_4px_16px_var(--color-brand-glow)]',
          'hover:shadow-[0_4px_24px_var(--color-brand-glow),_inset_0_1px_0_rgba(255,255,255,0.2)]'
        ],
        secondary: [
          'bg-background-elevated/80 backdrop-blur-sm',
          'text-text-primary font-medium',
          'border border-border-default',
          'hover:bg-background-surface/80 hover:border-border-strong'
        ],
        ghost: [
          'bg-transparent',
          'text-text-secondary font-medium',
          'hover:bg-glass-bg hover:text-text-primary'
        ],
        success: [
          'bg-gradient-to-r from-success-dark to-accent-cyan',
          'text-white font-semibold',
          'border border-white/10',
          'shadow-[0_4px_16px_var(--color-success-glow)]',
          'hover:shadow-[0_4px_24px_var(--color-success-glow)]'
        ],
        danger: [
          'bg-gradient-to-r from-error-dark to-accent-pink',
          'text-white font-semibold',
          'border border-white/10',
          'shadow-[0_4px_16px_var(--color-error-glow)]',
          'hover:shadow-[0_4px_24px_var(--color-error-glow)]'
        ]
      },
      size: {
        sm: 'h-9 px-4 text-sm rounded-lg gap-1.5',
        md: 'h-11 px-6 text-base rounded-xl gap-2',
        lg: 'h-14 px-8 text-lg rounded-2xl gap-2.5',
        icon: 'size-11 rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

/**
 * Componente principal de Botón.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Texto o contenido del botón
 * @param {string} props.className - Clases de Tailwind adicionales de sobrescritura
 * @param {'primary'|'secondary'|'ghost'|'success'|'danger'} props.variant 
 * @param {'sm'|'md'|'lg'|'icon'} props.size 
 * @param {boolean} props.loading - Estado visual de carga (muestra spinner)
 * @param {React.ReactNode} props.icon - Componente de ícono (ej. <LucideIcon />)
 * @param {'left'|'right'} props.iconPosition - Posición del icono
 */
const ButtonPremium = React.forwardRef(({ 
  children, 
  className,
  variant,
  size,
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  ...props 
}, ref) => {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      ref={ref}
      whileHover={!isDisabled ? { scale: 1.02, y: -2 } : {}}
      whileTap={!isDisabled ? { scale: 0.98 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      disabled={isDisabled}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && (
        <svg 
          className="animate-spin h-5 w-5 mr-2" 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      
      {icon && iconPosition === 'left' && !loading && (
        <span className="flex-shrink-0">{icon}</span>
      )}
      
      {children && <span>{children}</span>}
      
      {icon && iconPosition === 'right' && !loading && (
        <span className="flex-shrink-0">{icon}</span>
      )}
    </motion.button>
  );
});

ButtonPremium.displayName = "ButtonPremium";

export default ButtonPremium;
