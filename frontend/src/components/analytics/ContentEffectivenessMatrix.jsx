import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Gamepad2, TrendingUp } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from '../ui/GlassCard';
import { scoreToRAGWithNull as getRAGColor } from '../../constants/analyticsThresholds';

/**
 * Estilos de fondo y texto segun color RAG.
 */
const RAG_STYLES = {
  green: {
    bar: 'bg-success-base/70',
    text: 'text-success-base',
    border: 'border-success-base/40'
  },
  amber: {
    bar: 'bg-warning-base/70',
    text: 'text-warning-base',
    border: 'border-warning-base/40'
  },
  red: {
    bar: 'bg-error-base/70',
    text: 'text-error-base',
    border: 'border-error-base/40'
  },
  gray: {
    bar: 'bg-background-surface/40',
    text: 'text-text-muted',
    border: 'border-border-subtle'
  }
};

/**
 * Visualiza la efectividad media por contenido (contextos o mecanicas).
 *
 * El endpoint `/api/analytics/classroom/content-effectiveness` devuelve datos
 * agrupados por UNA dimension (context o mechanic), no datos cruzados. En vez
 * de forzar una matriz cruzada con valores duplicados, mostramos una lista
 * ordenada por puntuacion media con barras de progreso y semaforo RAG.
 *
 * @param {Object} props
 * @param {Array} props.data - Items con { name, avgScore, totalPlays, improvementRate, learningEfficiency }
 * @param {string} [props.groupBy] - 'context' | 'mechanic' (afecta el titulo)
 */
function ContentEffectivenessMatrix({ data, groupBy = 'context' }) {
  const { shouldReduceMotion } = useReducedMotion();

  const items = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    return data
      .map(item => ({
        id: item.id || item._id || item.name,
        name: item.name || item.contextName || item.mechanicName || 'Sin nombre',
        score: item.avgScore ?? item.averageScore ?? item.score ?? null,
        totalPlays: item.totalPlays ?? item.gamesPlayed ?? item.totalGames ?? 0,
        improvement: item.improvementRate ?? item.improvement ?? null,
        learningEfficiency: item.learningEfficiency || null
      }))
      .filter(item => item.score != null && !Number.isNaN(item.score))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [data]);

  const dimensionLabel = groupBy === 'mechanic' ? 'Mecánica' : 'Contexto';

  if (items.length === 0) {
    return (
      <GlassCard variant="default">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <BarChart3 size={20} className="text-brand-base" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-text-primary font-display">Efectividad por {dimensionLabel}</h3>
        </div>
        <div className="h-40 flex items-center justify-center">
          <p className="text-sm text-text-muted text-center">
            Aun no hay suficientes partidas completadas para calcular la efectividad.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <BarChart3 size={20} className="text-brand-base" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary font-display">
              Efectividad por {dimensionLabel}
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Puntuacion media de las partidas agrupadas por {dimensionLabel.toLowerCase()}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-success-base/40" aria-hidden="true" />
            {'>'}70% (Alto)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-warning-base/40" aria-hidden="true" />
            50-69% (Medio)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-error-base/40" aria-hidden="true" />
            {'<'}50% (Bajo)
          </span>
        </div>
      </div>

      <ul className="space-y-2.5">
        {items.map((item, idx) => {
          const ragColor = getRAGColor(item.score) || 'gray';
          const styles = RAG_STYLES[ragColor];
          const widthPct = Math.max(2, Math.min(100, Math.round(item.score)));

          return (
            <motion.li
              key={item.id}
              initial={shouldReduceMotion ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.stateChange, ease: EASING.outQuart, delay: idx * 0.03 }}
              className={cn(
                'rounded-lg border bg-background-elevated/40 p-3',
                styles.border
              )}
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-text-primary truncate">{item.name}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="flex items-center gap-1 text-xs text-text-muted">
                    <Gamepad2 size={12} aria-hidden="true" /> {item.totalPlays}
                  </span>
                  {item.improvement != null && (
                    <span
                      className={cn(
                        'flex items-center gap-1 text-xs font-medium',
                        item.improvement >= 0 ? 'text-success-base' : 'text-error-base'
                      )}
                    >
                      <TrendingUp size={12} className={item.improvement < 0 ? 'rotate-180' : ''} aria-hidden="true" />
                      {item.improvement >= 0 ? '+' : ''}
                      {Math.round(item.improvement)}%
                    </span>
                  )}
                  <span className={cn('text-sm font-bold tabular-nums w-12 text-right', styles.text)}>
                    {Math.round(item.score)}%
                  </span>
                </div>
              </div>
              <div
                className="mt-2 h-2 rounded-full bg-background-surface/40 overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(item.score)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Puntuacion media de ${item.name}: ${Math.round(item.score)}%`}
              >
                <div className={cn('h-full transition-[width] duration-500', styles.bar)} style={{ width: `${widthPct}%` }} />
              </div>
            </motion.li>
          );
        })}
      </ul>
    </GlassCard>
  );
}

ContentEffectivenessMatrix.propTypes = {
  data: PropTypes.array,
  groupBy: PropTypes.oneOf(['context', 'mechanic'])
};

export default memo(ContentEffectivenessMatrix);
