import { memo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';

/**
 * Tarjeta de estadísticas del dashboard
 * @param {Object} props
 * @param {string} props.title - Título de la estadística
 * @param {string|number} props.value - Valor a mostrar
 * @param {string} props.trend - Tendencia (ej: "+12%" o "-5%")
 * @param {React.ReactNode} props.icon - Icono de la tarjeta
 * @param {string} props.color - Clase de color para el fondo del icono
 */
function StatCard({ title, value, trend, icon, color }) {
  // Determinar si el trend es positivo o negativo
  const isPositive = !trend.startsWith('-');
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <motion.article
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      aria-label={`${title}: ${value}`}
      className="group cursor-pointer relative block h-full"
    >
      <GlassCard 
        variant="default" 
        padding="none" 
        className={cn(
          "h-full p-6 transition-all duration-300",
          "hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-border-strong"
        )}
      >
        {/* Icon Badge */}
        <div className={cn(
          "absolute top-5 right-5",
          "w-12 h-12 rounded-xl",
          "flex items-center justify-center",
          "transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3",
          color,
          "shadow-lg"
        )}>
          {icon}
        </div>

        {/* Content */}
        <div className="relative z-10 pr-14">
          <h3 className="text-text-muted text-sm font-semibold tracking-wide uppercase mb-2">{title}</h3>
          <motion.div 
            key={value}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-bold text-text-primary mb-3 font-display tracking-tight"
          >
            {value}
          </motion.div>
          <div className={cn(
            "inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded-lg",
            isPositive 
              ? "text-success-base bg-success-base/10" 
              : "text-error-base bg-error-base/10"
          )}>
            <TrendIcon size={14} strokeWidth={3} />
            <span>{trend}</span>
            <span className="text-text-muted font-medium ml-1">vs semana pasada</span>
          </div>
        </div>
        
        {/* Glow effect fallback for visual flair */}
        <div 
          className={cn(
            "absolute -bottom-16 -right-16 w-40 h-40 rounded-full blur-3xl",
            "opacity-20 transition-all duration-500 group-hover:opacity-40 group-hover:scale-110 pointer-events-none",
            color
          )} 
          aria-hidden="true"
        />
      </GlassCard>
    </motion.article>
  );
}

StatCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  trend: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  color: PropTypes.string,
};

export default memo(StatCard);
