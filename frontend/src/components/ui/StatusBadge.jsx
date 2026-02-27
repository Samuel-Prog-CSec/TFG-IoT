import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * @fileoverview Componente StatusBadge
 * Indicador de estado para tablas y paneles. 
 * Estandarizado con CVA y los tokens OKLCH del sistema de diseño.
 */

const badgeVariants = cva(
  'inline-flex items-center gap-2 rounded-full font-medium border',
  {
    variants: {
      status: {
        active: 'bg-success-dark/10 border-success-dark/20 text-success-base',
        inactive: 'bg-text-disabled/10 border-text-disabled/20 text-text-secondary',
        success: 'bg-success-dark/10 border-success-dark/20 text-success-base',
        warning: 'bg-warning-dark/10 border-warning-dark/20 text-warning-base',
        error: 'bg-error-dark/10 border-error-dark/20 text-error-base',
        info: 'bg-info-dark/10 border-info-dark/20 text-info-base'
      },
      size: {
        sm: 'px-2.5 py-0.5 text-[11px] uppercase tracking-wider',
        md: 'px-3 py-1 text-xs',
      },
    },
    defaultVariants: {
      status: 'active',
      size: 'md',
    },
  }
);

const dotColors = {
  active: 'bg-success-base',
  inactive: 'bg-text-disabled',
  success: 'bg-success-base',
  warning: 'bg-warning-base',
  error: 'bg-error-base',
  info: 'bg-info-base'
};

const labelDefaults = {
  active: 'Activo',
  inactive: 'Inactivo',
  success: 'Completado',
  warning: 'Pendiente',
  error: 'Error',
  info: 'Info'
};

/**
 * Badge de estado con punto opcional, utilizando colores OKLCH.
 * @param {Object} props
 * @param {'active'|'inactive'|'success'|'warning'|'error'|'info'} props.status 
 * @param {boolean} props.pulse - Animación intermitente en el dot
 * @param {'sm'|'md'} props.size 
 */
export default function StatusBadge({
  status = 'active',
  children,
  pulse = true,
  size = 'md',
  className,
  ...props
}) {
  const shouldPulse = pulse && (status === 'active' || status === 'warning');
  const dotColor = dotColors[status];
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <div
      className={cn(badgeVariants({ status, size, className }))}
      {...props}
    >
      {/* Dot indicator */}
      <span className="relative flex">
        {shouldPulse && (
          <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', dotColor)} />
        )}
        <span className={cn('relative inline-flex rounded-full', dotColor, dotSize)} />
      </span>
      
      {/* Label */}
      {children || labelDefaults[status]}
    </div>
  );
}

/**
 * Badge numérico para contadores.
 */
export function CountBadge({ 
  count, 
  max = 99,
  className,
  ...props 
}) {
  const displayCount = count > max ? `${max}+` : count;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[24px] h-6 px-2',
        'rounded-full bg-background-elevated border border-border-default',
        'text-brand-light text-xs font-bold',
        className
      )}
      {...props}
    >
      {displayCount}
    </span>
  );
}
