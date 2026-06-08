import { memo } from 'react';
import { m as motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, motionConfig } from '../../lib/utils';
import { isNeutralDelta } from '../../lib/formatDelta';
import AnimatedNumber from '../ui/AnimatedNumber';

// Mapa de clases COMPLETAS por tono. Tailwind purga las clases construidas por
// interpolación (`from-${tone}-base`), así que cada combinación se escribe
// literal aquí para que el JIT la detecte. `-light` solo existe para brand; el
// resto usa base→dark en la barra.
const TONE = {
  error: {
    shell: 'from-error-base/10 ring-error-base/20',
    eyebrow: 'bg-error-base/10 text-error-on-alpha',
    icon: 'from-error-base to-error-dark',
    glow: 'bg-error-base',
    bar: 'from-error-base to-error-dark',
  },
  success: {
    shell: 'from-success-base/10 ring-success-base/20',
    eyebrow: 'bg-success-base/10 text-success-on-alpha',
    icon: 'from-success-base to-success-dark',
    glow: 'bg-success-base',
    bar: 'from-success-base to-success-dark',
  },
  brand: {
    shell: 'from-brand-base/10 ring-brand-base/20',
    eyebrow: 'bg-brand-base/10 text-brand-on-alpha',
    icon: 'from-brand-base to-brand-dark',
    glow: 'bg-brand-base',
    bar: 'from-brand-base to-brand-light',
  },
  info: {
    shell: 'from-info-base/10 ring-info-base/20',
    eyebrow: 'bg-info-base/10 text-info-on-alpha',
    icon: 'from-info-base to-info-dark',
    glow: 'bg-info-base',
    bar: 'from-info-base to-info-dark',
  },
  warning: {
    shell: 'from-warning-base/10 ring-warning-base/20',
    eyebrow: 'bg-warning-base/10 text-warning-on-alpha',
    icon: 'from-warning-base to-warning-dark',
    glow: 'bg-warning-base',
    bar: 'from-warning-base to-warning-dark',
  },
};

/**
 * Tarjeta protagonista del bento del dashboard (elevación a producto de pago,
 * 2026-06-04). A diferencia de `StatCard` (rejilla uniforme), es el foco visual:
 * número en tipografía display grande, barra de proporción (cuántos del total),
 * CTA "button-in-button" y materialidad con profundidad (doble-bisel: carcasa
 * tintada con el tono semántico + núcleo elevado). Mantiene la firma RFID
 * (sweep) y respeta reduced-motion vía las utilities globales.
 *
 * @param {Object} props
 * @param {string} props.eyebrow - Etiqueta superior (uppercase tracked)
 * @param {string} props.title - Título de la métrica (para aria-label)
 * @param {number} props.value - Valor protagonista
 * @param {number} [props.total] - Total de referencia para la barra de proporción
 * @param {string} props.context - Frase contextual bajo el número
 * @param {string} [props.trend] - Delta de tendencia (ej "+2" / "-5%" / "")
 * @param {string} [props.periodLabel] - Etiqueta del periodo comparativo
 * @param {React.ReactNode} props.icon - Icono de la métrica
 * @param {'error'|'success'|'brand'|'info'|'warning'} [props.tone] - Tono semántico
 * @param {string} [props.ctaLabel] - Texto del CTA
 * @param {Function} [props.onClick] - Navegación al pulsar
 * @param {boolean} [props.higherIsBetter=true] - Semántica del delta
 */
function HeroStatCard({
  eyebrow,
  title,
  value,
  total,
  context,
  trend = '',
  periodLabel = 'vs semana pasada',
  icon,
  tone = 'brand',
  ctaLabel,
  onClick,
  higherIsBetter = true,
}) {
  const t = TONE[tone] || TONE.brand;
  const hasTrendValue = typeof trend === 'string' && trend.length > 0;
  const isNeutralTrend = hasTrendValue && isNeutralDelta(trend);
  const trendGoesUp = hasTrendValue && !isNeutralTrend && !trend.startsWith('-');
  const isPositive = hasTrendValue && !isNeutralTrend && (higherIsBetter ? trendGoesUp : !trendGoesUp);
  const TrendIcon = trendGoesUp ? ArrowUpRight : ArrowDownRight;

  // Proporción para la barra (value de total), acotada a [0,1].
  const ratio = total && total > 0 ? Math.min(1, Math.max(0, value / total)) : null;
  const totalSuffix = total ? ` de ${total}` : '';

  return (
    <motion.article
      whileHover={{ y: -4, scale: 1.008 }}
      whileTap={{ scale: 0.99 }}
      transition={motionConfig.spring}
      onClick={onClick}
      aria-label={`${title}: ${value}${totalSuffix}`}
      {...(onClick && {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(e);
          }
        },
      })}
      className={cn(
        'group relative block h-full rounded-[1.75rem]',
        onClick &&
          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base'
      )}
    >
      {/* Carcasa exterior del doble-bisel: tinte del tono + hairline */}
      <div className={cn('h-full rounded-[1.75rem] p-1.5 bg-gradient-to-br to-transparent ring-1 ring-inset', t.shell)}>
        {/* Núcleo interior: superficie elevada */}
        <div
          className={cn(
            'relative h-full overflow-hidden rounded-[1.4rem] p-6 sm:p-7',
            'bg-background-elevated border border-border-default',
            'transition-[box-shadow,border-color] duration-300',
            'group-hover:border-border-strong group-hover:shadow-[var(--shadow-lg)]',
            'rfid-hover'
          )}
        >
          {/* Glow tintado del tono, esquina inferior derecha */}
          <div
            className={cn(
              'pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full blur-3xl',
              'opacity-20 transition-[opacity,transform] duration-500 group-hover:opacity-30 group-hover:scale-110',
              t.glow
            )}
            aria-hidden="true"
          />

          {/* Cabecera: etiqueta de la métrica + estado + icono */}
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              {/* h2: misma jerarquía que las KPI cards (la página tiene el h1). */}
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">{title}</h2>
              {eyebrow && (
                <span className={cn('inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]', t.eyebrow)}>
                  {eyebrow}
                </span>
              )}
            </div>
            <div className={cn('flex size-12 items-center justify-center rounded-xl shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 bg-gradient-to-br', t.icon)}>
              {icon}
            </div>
          </div>

          {/* Número protagonista */}
          <div className="relative z-10 mt-5">
            <div className="font-display font-extrabold tabular-nums leading-none text-text-primary text-6xl sm:text-7xl">
              <AnimatedNumber value={value} />
            </div>
            <p className="mt-2 max-w-[20rem] text-sm text-text-secondary">{context}</p>
          </div>

          {/* Barra de proporción (value de total) */}
          {ratio !== null && (
            <div className="relative z-10 mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-text-muted">
                <span>{value} de {total}</span>
                <span>{Math.round(ratio * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-background-surface ring-1 ring-inset ring-border-subtle">
                {/* Barra de proporción animada con scaleX (no width) para que la
                    animación corra en GPU (compositor) sin reflow del layout. El
                    track exterior (rounded-full + overflow-hidden) recorta el cap,
                    manteniendo el extremo redondeado. */}
                <motion.div
                  className={cn('h-full w-full origin-left rounded-full bg-gradient-to-r', t.bar)}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: ratio }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                />
              </div>
            </div>
          )}

          {/* Pie: tendencia + CTA button-in-button */}
          <div className="relative z-10 mt-6 flex items-center justify-between gap-3">
            {(() => {
              if (!hasTrendValue) {
                return <span className="text-xs font-medium text-text-muted">{periodLabel}</span>;
              }
              if (isNeutralTrend) {
                return (
                  <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold text-text-muted ring-1 ring-inset ring-border-subtle">
                    <span aria-label="Sin baseline disponible">—</span>
                    <span className="ml-1 text-xs font-medium text-text-muted">{periodLabel}</span>
                  </span>
                );
              }
              return (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold ring-1 ring-inset',
                    isPositive
                      ? 'text-success-base bg-success-base/10 ring-success-base/20'
                      : 'text-error-base bg-error-base/10 ring-error-base/20'
                  )}
                >
                  <TrendIcon size={14} strokeWidth={3} />
                  <span>{trend}</span>
                  <span className="ml-1 text-xs font-medium text-text-muted">{periodLabel}</span>
                </span>
              );
            })()}

            {ctaLabel && (
              <span className="inline-flex items-center gap-2 rounded-full bg-background-surface/70 py-1.5 pl-4 pr-1.5 text-sm font-semibold text-text-primary ring-1 ring-inset ring-border-default transition-colors duration-200 group-hover:bg-background-surface">
                {ctaLabel}
                <span className="flex size-7 items-center justify-center rounded-full bg-text-primary text-background-base transition-transform duration-200 group-hover:translate-x-0.5">
                  <ArrowRight size={15} strokeWidth={2.5} aria-hidden="true" />
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

HeroStatCard.propTypes = {
  eyebrow: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  total: PropTypes.number,
  context: PropTypes.string.isRequired,
  trend: PropTypes.string,
  periodLabel: PropTypes.string,
  icon: PropTypes.node.isRequired,
  tone: PropTypes.oneOf(['error', 'success', 'brand', 'info', 'warning']),
  ctaLabel: PropTypes.string,
  onClick: PropTypes.func,
  higherIsBetter: PropTypes.bool,
};

export default memo(HeroStatCard);
