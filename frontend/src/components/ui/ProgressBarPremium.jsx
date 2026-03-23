import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Progress bar premium con gradiente y animaciones
 * 
 * @param {Object} props
 * @param {number} props.value - Valor actual (0-100)
 * @param {number} props.max - Valor máximo (default: 100)
 * @param {string} props.label - Label opcional
 * @param {boolean} props.showValue - Mostrar valor numérico
 * @param {'sm' | 'md' | 'lg'} props.size - Tamaño de la barra
 * @param {'default' | 'success' | 'warning' | 'danger' | 'gradient'} props.variant - Variante de color
 * @param {boolean} props.animated - Animación de entrada
 * @param {string} props.className - Clases adicionales
 */
export default function ProgressBarPremium({
  value = 0,
  max = 100,
  label,
  showValue = true,
  size = 'md',
  variant = 'default',
  animated = true,
  className,
  ...props
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const sizes = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  const variants = {
    default: 'bg-gradient-to-r from-accent-indigo to-brand-base',
    success: 'bg-gradient-to-r from-success-base to-accent-cyan',
    warning: 'bg-gradient-to-r from-warning-base to-accent-orange',
    danger: 'bg-gradient-to-r from-error-base to-accent-pink',
    gradient: 'bg-gradient-to-r from-accent-indigo via-brand-base to-accent-pink',
  };

  const barColor = variant === 'gradient' ? variants.gradient : variants[variant];

  return (
    <div className={cn('w-full', className)} {...props}>
      {/* Header */}
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-2">
          {label && (
            <span className="text-sm font-medium text-text-secondary">{label}</span>
          )}
          {showValue && (
            <motion.span
              key={value}
              initial={animated ? { opacity: 0, y: -10 } : false}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm font-bold text-text-primary tabular-nums"
            >
              {Math.round(percentage)}%
            </motion.span>
          )}
        </div>
      )}

      {/* Track */}
      <div
        className={cn(
          'w-full rounded-full overflow-hidden',
          'bg-background-surface/60 backdrop-blur-sm',
          'border border-border-subtle',
          sizes[size]
        )}
      >
        {/* Fill */}
        <motion.div
          initial={animated ? { width: 0 } : false}
          animate={{ width: `${percentage}%` }}
          transition={{
            duration: 0.8,
            ease: [0.4, 0, 0.2, 1],
            delay: 0.1
          }}
          className={cn(
            'h-full rounded-full relative',
            'shadow-lg',
            barColor
          )}
          style={{
            boxShadow: percentage > 0 ? '0 0 20px var(--color-brand-glow)' : 'none',
          }}
        >
          {percentage > 0 && !shouldReduceMotion && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2.5s_infinite]"
              aria-hidden="true"
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Progress bar para juegos con colores dinámicos (timer)
 */
export function GameTimerBar({
  timeLeft,
  timeLimit,
  className,
  ...props
}) {
  const percentage = (timeLeft / timeLimit) * 100;
  
  // Determinar color según tiempo restante
  let variant = 'success';
  let pulseClass = '';
  
  if (percentage <= 20) {
    variant = 'danger';
    pulseClass = 'animate-pulse';
  } else if (percentage <= 40) {
    variant = 'warning';
  }

  return (
    <div className={cn('relative', pulseClass, className)} {...props}>
      <ProgressBarPremium
        value={timeLeft}
        max={timeLimit}
        variant={variant}
        showValue={false}
        size="lg"
        animated={false}
      />
      {/* Glow effect when low */}
      {percentage <= 20 && (
        <div className="absolute inset-0 rounded-full bg-error-base/20 blur-md -z-10" />
      )}
    </div>
  );
}
