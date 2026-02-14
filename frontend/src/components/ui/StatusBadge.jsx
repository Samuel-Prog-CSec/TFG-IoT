import { cn } from '../../lib/utils';

/**
 * Badge de estado con punto pulsante
 * 
 * @param {Object} props
 * @param {'active' | 'inactive' | 'success' | 'warning' | 'error' | 'info'} props.status - Estado del badge
 * @param {string} props.children - Texto del badge
 * @param {boolean} props.pulse - Mostrar animación de pulso
 * @param {'sm' | 'md'} props.size - Tamaño del badge
 * @param {string} props.className - Clases adicionales
 */
export default function StatusBadge({
  status = 'active',
  children,
  pulse = true,
  size = 'md',
  className,
  ...props
}) {
  const statusConfig = {
    active: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      dot: 'bg-emerald-400',
      label: 'Activo',
    },
    inactive: {
      bg: 'bg-slate-500/10',
      border: 'border-slate-500/20',
      text: 'text-slate-400',
      dot: 'bg-slate-500',
      label: 'Inactivo',
    },
    success: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      dot: 'bg-emerald-400',
      label: 'Completado',
    },
    warning: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      dot: 'bg-amber-400',
      label: 'Pendiente',
    },
    error: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      text: 'text-rose-400',
      dot: 'bg-rose-400',
      label: 'Error',
    },
    info: {
      bg: 'bg-sky-500/10',
      border: 'border-sky-500/20',
      text: 'text-sky-400',
      dot: 'bg-sky-400',
      label: 'Info',
    },
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1.5 text-xs',
  };

  const dotSizes = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
  };

  const config = statusConfig[status];
  const shouldPulse = pulse && (status === 'active' || status === 'warning');

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full font-medium',
        'border',
        config.bg,
        config.border,
        config.text,
        sizes[size],
        className
      )}
      {...props}
    >
      {/* Dot indicator */}
      <span className="relative flex">
        {shouldPulse && (
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping',
              config.dot
            )}
          />
        )}
        <span
          className={cn(
            'relative inline-flex rounded-full',
            config.dot,
            dotSizes[size]
          )}
        />
      </span>
      
      {/* Label */}
      {children || config.label}
    </div>
  );
}

/**
 * Badge numérico para contadores
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
        'inline-flex items-center justify-center',
        'min-w-[24px] h-6 px-2',
        'rounded-full',
        'bg-gradient-to-r from-indigo-500 to-purple-500',
        'text-white text-xs font-bold',
        'shadow-lg shadow-indigo-500/30',
        className
      )}
      {...props}
    >
      {displayCount}
    </span>
  );
}
