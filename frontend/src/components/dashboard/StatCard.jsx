import { memo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, motionConfig } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import AnimatedNumber from '../ui/AnimatedNumber';

/**
 * Tarjeta de estadísticas del dashboard
 * @param {Object} props
 * @param {string} props.title - Título de la estadística
 * @param {string|number} props.value - Valor a mostrar
 * @param {string} props.trend - Tendencia (ej: "+12%" o "-5%")
 * @param {React.ReactNode} props.icon - Icono de la tarjeta
 * @param {string} props.color - Clase de color para el fondo del icono
 * @param {string} [props.periodLabel] - Etiqueta del periodo comparativo (ej: "vs semana pasada")
 */
function StatCard({ title, value, trend, icon, color, periodLabel = 'vs semana pasada', compact = false, onClick }) {
  // Determinar si el trend es positivo o negativo
  const isPositive = !trend.startsWith('-');
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <motion.article
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={motionConfig.spring}
      onClick={onClick}
      aria-label={`${title}: ${value}`}
      className="group cursor-pointer relative block h-full"
    >
      <GlassCard
        variant="default"
        padding="none"
        className={cn(
          "h-full transition-[box-shadow,border-color] duration-300",
          compact ? "p-4" : "p-6",
          "hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)] hover:border-border-strong"
        )}
      >
        {/* Indicador de navegacion (solo si la tarjeta es clickable) */}
        {onClick && (
          <ChevronRight
            className="absolute top-5 right-5 size-4 text-text-muted opacity-0 group-hover:opacity-60 transition-opacity duration-200"
            aria-hidden="true"
          />
        )}

        {/* Icon Badge */}
        <div className={cn(
          compact ? "absolute top-4 right-4" : "absolute top-5 right-5",
          compact ? "size-10 rounded-lg" : "size-12 rounded-xl",
          "flex items-center justify-center",
          "transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3",
          color,
          "shadow-lg"
        )}>
          {icon}
        </div>

        {/* Content */}
        <div className={cn("relative z-10", compact ? "pr-12" : "pr-14")}>
          <h3 className={cn("text-text-muted font-semibold tracking-wide uppercase", compact ? "text-xs mb-1" : "text-sm mb-2")}>{title}</h3>
          <div className={cn("font-bold text-text-primary font-display tracking-tight tabular-nums", compact ? "text-2xl mb-2" : "text-3xl mb-3")}>
            <AnimatedNumber value={value} />
          </div>
          <div className={cn(
            "inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap",
            isPositive
              ? "text-success-base bg-success-base/10"
              : "text-error-base bg-error-base/10"
          )}>
            <TrendIcon size={14} strokeWidth={3} />
            <span>{trend}</span>
            <span className="text-text-muted font-medium ml-1 text-xs">{periodLabel}</span>
          </div>
        </div>

        {/* Glow effect fallback for visual flair */}
        <div
          className={cn(
            "absolute -bottom-16 -right-16 w-40 h-40 rounded-full blur-3xl",
            "opacity-20 transition-[opacity,transform] duration-500 group-hover:opacity-40 group-hover:scale-110 pointer-events-none",
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
  periodLabel: PropTypes.string,
  compact: PropTypes.bool,
  onClick: PropTypes.func,
};

export default memo(StatCard);
