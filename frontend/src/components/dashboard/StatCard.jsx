import { memo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, motionConfig } from '../../lib/utils';
import { isNeutralDelta } from '../../lib/formatDelta';
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
 * @param {boolean} [props.higherIsBetter=true] - Semantica del delta. false para
 *   metricas donde subir es peor (tiempo medio, alumnos en riesgo, abandono).
 */
function StatCard({ title, value, trend, icon, color, periodLabel = 'vs semana pasada', compact = false, onClick, higherIsBetter = true }) {
  // Determinar si hay valor de tendencia para renderizar el pill RAG.
  // Si trend es vacio (caso "Alumnos en Riesgo" / "Partidas Hoy" sin histórico),
  // renderizamos un pill neutro con sólo el periodLabel para preservar la altura
  // de la card y evitar el bug de pill verde con flecha sin valor numerico.
  //
  // PROP-88: cuando el helper `formatDelta` devuelve "—" (sin baseline, primer
  // dato), tratamos el trend como un valor pero lo pintamos en pill neutro
  // (sin verde/rojo, sin flecha) — comunica "no hay comparación posible aún"
  // sin transmitir ni positividad ni alarma.
  const hasTrendValue = typeof trend === 'string' && trend.length > 0;
  const isNeutralTrend = hasTrendValue && isNeutralDelta(trend);
  const trendGoesUp = hasTrendValue && !isNeutralTrend && !trend.startsWith('-');
  // isPositive = delta "bueno" segun la semantica de la metrica.
  // Para metricas donde subir es peor (tiempo medio, alumnos en riesgo),
  // un delta positivo se pinta en rojo y uno negativo en verde.
  const isPositive = hasTrendValue && !isNeutralTrend && (higherIsBetter ? trendGoesUp : !trendGoesUp);
  const TrendIcon = trendGoesUp ? ArrowUpRight : ArrowDownRight;

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
          // Hover usa --shadow-lg (token por tema) para que en light no
          // aparezca una sombra negra agresiva sobre fondo blanco.
          "hover:shadow-[var(--shadow-lg)] hover:border-border-strong",
          // Sweep RFID en hover — refuerza la firma del producto (lector
          // de tarjetas) en cada KPI sin invadir el resto del componente.
          // La utility `.rfid-hover` vive en index.css y respeta
          // prefers-reduced-motion.
          "rfid-hover"
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
          {/* h2 (no h3): el contenedor padre (Dashboard, AdminDashboard) tiene
              h1 como título de página. Las KPI cards son la segunda jerarquía;
              saltar a h3 viola heading-order WCAG 1.3.1 (auditoría 24/05/2026). */}
          <h2 className={cn("text-text-muted font-semibold tracking-[0.08em] uppercase", compact ? "text-[11px] mb-1" : "text-xs mb-2")}>{title}</h2>
          <div className={cn("font-bold text-text-primary font-display tracking-tight tabular-nums leading-none", compact ? "text-2xl mb-2" : "text-5xl mb-3")}>
            <AnimatedNumber value={value} />
          </div>
          {(() => {
            if (!hasTrendValue) {
              return (
                <div className="inline-flex items-center text-xs font-medium text-text-muted px-2.5 py-1 rounded-lg ring-1 ring-inset ring-border-subtle">
                  {periodLabel}
                </div>
              );
            }
            // PROP-88: pill neutro cuando el delta es "—" (sin baseline)
            if (isNeutralTrend) {
              return (
                <div className="inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ring-1 ring-inset text-text-muted bg-background-surface/40 ring-border-subtle">
                  <span aria-label="Sin baseline disponible">—</span>
                  <span className="text-text-muted font-medium ml-1 text-xs">{periodLabel}</span>
                </div>
              );
            }
            return (
              <div className={cn(
                "inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ring-1 ring-inset",
                isPositive
                  ? "text-success-base bg-success-base/10 ring-success-base/20"
                  : "text-error-base bg-error-base/10 ring-error-base/20"
              )}>
                <TrendIcon size={14} strokeWidth={3} />
                <span>{trend}</span>
                <span className="text-text-muted font-medium ml-1 text-xs">{periodLabel}</span>
              </div>
            );
          })()}
        </div>

        {/* Glow effect fallback for visual flair */}
        <div
          className={cn(
            "absolute -bottom-16 -right-16 w-40 h-40 rounded-full blur-3xl",
            "opacity-[0.12] transition-[opacity,transform] duration-500 group-hover:opacity-30 group-hover:scale-110 pointer-events-none",
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
  higherIsBetter: PropTypes.bool,
};

export default memo(StatCard);
