import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

/**
 * Botón premium con efectos de glow y animaciones
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Contenido del botón
 * @param {string} props.className - Clases adicionales
 * @param {'primary' | 'secondary' | 'ghost' | 'success' | 'danger'} props.variant - Variante de estilo
 * @param {'sm' | 'md' | 'lg'} props.size - Tamaño del botón
 * @param {boolean} props.loading - Estado de carga
 * @param {boolean} props.disabled - Estado deshabilitado
 * @param {React.ReactNode} props.icon - Icono a mostrar
 * @param {'left' | 'right'} props.iconPosition - Posición del icono
 */
export default function ButtonPremium({ 
  children, 
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  onClick,
  ...props 
}) {
  const variants = {
    primary: cn(
      'bg-gradient-to-r from-indigo-500 via-purple-500 to-purple-600',
      'text-white font-semibold',
      'shadow-lg shadow-indigo-500/30',
      'hover:shadow-[0_0_30px_rgba(139,92,246,0.4),0_8px_25px_rgba(99,102,241,0.3)]',
      'border border-white/10'
    ),
    secondary: cn(
      'bg-slate-800/80 backdrop-blur-sm',
      'text-slate-200 font-medium',
      'border border-white/10',
      'hover:bg-slate-700/80 hover:border-white/20'
    ),
    ghost: cn(
      'bg-transparent',
      'text-slate-300 font-medium',
      'hover:bg-white/5 hover:text-white'
    ),
    success: cn(
      'bg-gradient-to-r from-emerald-500 to-cyan-500',
      'text-white font-semibold',
      'shadow-lg shadow-emerald-500/30',
      'hover:shadow-[0_0_30px_rgba(74,222,128,0.4)]',
      'border border-white/10'
    ),
    danger: cn(
      'bg-gradient-to-r from-rose-500 to-pink-500',
      'text-white font-semibold',
      'shadow-lg shadow-rose-500/30',
      'hover:shadow-[0_0_30px_rgba(251,113,133,0.4)]',
      'border border-white/10'
    ),
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm rounded-xl gap-1.5',
    md: 'px-6 py-3 text-base rounded-xl gap-2',
    lg: 'px-8 py-4 text-lg rounded-2xl gap-2.5',
  };

  const isDisabled = disabled || loading;

  return (
    <motion.button
      whileHover={!isDisabled ? { scale: 1.02, y: -2 } : {}}
      whileTap={!isDisabled ? { scale: 0.98 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        'relative inline-flex items-center justify-center',
        'transition-all duration-300',
        'focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-slate-900',
        variants[variant],
        sizes[size],
        isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className
      )}
      {...props}
    >
      {/* Loading spinner */}
      {loading && (
        <svg 
          className="animate-spin h-5 w-5 mr-2" 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24"
        >
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
          />
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      
      {/* Icon left */}
      {icon && iconPosition === 'left' && !loading && (
        <span className="flex-shrink-0">{icon}</span>
      )}
      
      {/* Content */}
      <span>{children}</span>
      
      {/* Icon right */}
      {icon && iconPosition === 'right' && !loading && (
        <span className="flex-shrink-0">{icon}</span>
      )}
    </motion.button>
  );
}
