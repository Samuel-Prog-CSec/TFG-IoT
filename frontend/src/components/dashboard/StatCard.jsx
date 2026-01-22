import { memo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

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
      className={cn(
        "relative overflow-hidden",
        "bg-slate-800/40 backdrop-blur-xl",
        "p-6 rounded-2xl",
        "border border-white/5",
        "group cursor-pointer",
        "hover:border-white/10 hover:shadow-lg hover:shadow-black/20"
      )}
    >
      {/* Icon Badge */}
      <div className={cn(
        "absolute top-4 right-4",
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
        <h3 className="text-slate-400 text-sm font-medium mb-2">{title}</h3>
        <motion.div 
          key={value}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold text-white mb-3 font-display"
        >
          {value}
        </motion.div>
        <div className={cn(
          "inline-flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-lg",
          isPositive 
            ? "text-emerald-400 bg-emerald-400/10" 
            : "text-rose-400 bg-rose-400/10"
        )}>
          <TrendIcon size={14} />
          <span>{trend}</span>
          <span className="text-slate-500 font-normal ml-1">vs semana pasada</span>
        </div>
      </div>
      
      {/* Glow effect */}
      <div 
        className={cn(
          "absolute -bottom-16 -right-16 w-40 h-40 rounded-full blur-3xl",
          "opacity-20 transition-all duration-500 group-hover:opacity-40 group-hover:scale-110",
          color
        )} 
        aria-hidden="true"
      />

      {/* Subtle top highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" aria-hidden="true" />
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
