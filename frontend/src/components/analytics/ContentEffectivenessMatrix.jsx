import { memo, useMemo } from 'react';
import { m as motion } from 'framer-motion';
import { BarChart3, Gamepad2, TrendingUp, CircleCheck, CircleAlert, CircleX, Circle } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from '../ui/GlassCard';
import { scoreToRAGWithNull as getRAGColor } from '../../constants/analyticsThresholds';
import { formatMechanicName } from '../../lib/mechanicNames';
import ThemedChartContainer from './ThemedChartContainer';

/**
 * Estilos de fondo, texto e icono segun color RAG. El icono cubre WCAG
 * 1.4.1 (Use of Color) — daltonismo rojo-verde distingue estado por
 * forma (check / alert / X) además de color.
 */
// Tokens `-on-alpha` (index.css) garantizan AA sobre cards dark/light
// elevated. Sustituyen los workarounds Sprint 0 (text-red-300, text-yellow-300,
// light:text-{tone}-dark).
const RAG_STYLES = {
  green: {
    bar: 'bg-success-base/70',
    text: 'text-success-on-alpha',
    border: 'border-success-base/40',
    icon: CircleCheck,
  },
  amber: {
    bar: 'bg-warning-base/70',
    text: 'text-warning-on-alpha',
    border: 'border-warning-base/40',
    icon: CircleAlert,
  },
  red: {
    bar: 'bg-error-base/70',
    text: 'text-error-on-alpha',
    border: 'border-error-base/40',
    icon: CircleX,
  },
  gray: {
    bar: 'bg-background-surface/40',
    text: 'text-text-secondary',
    border: 'border-border-subtle',
    icon: Circle,
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
      .map(item => {
        const rawName = item.name || item.contextName || item.mechanicName || 'Sin nombre';
        // Normalizar nombres de mecanica aqui para cubrir tambien datos historicos
        // que no pasaron por la pipeline actualizada (defense in depth).
        const displayName = groupBy === 'mechanic' ? formatMechanicName(rawName) : rawName;
        return {
          id: item.id || item._id || rawName,
          name: displayName,
          score: item.avgScore ?? item.averageScore ?? item.score ?? null,
          totalPlays: item.totalPlays ?? item.gamesPlayed ?? item.totalGames ?? 0,
          improvement: item.improvementRate ?? item.improvement ?? null,
          learningEfficiency: item.learningEfficiency || null
        };
      })
      .filter(item => item.score != null && !Number.isNaN(item.score))
      // Filtrar items sin partidas — evita mostrar mecánicas inactivas
      // como Secuencia ("Próximamente") con barra a 0% (PROP-58).
      .filter(item => item.totalPlays > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [data, groupBy]);

  const dimensionLabel = groupBy === 'mechanic' ? 'Mecánica' : 'Contexto';

  if (items.length === 0) {
    return (
      <GlassCard variant="default">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <BarChart3 size={20} className="text-brand-base" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold text-text-primary font-display">Efectividad por {dimensionLabel}</h3>
        </div>
        <div className="h-40 flex items-center justify-center">
          <p className="text-sm text-text-muted text-center">
            Aún no hay suficientes partidas completadas para calcular la efectividad.
          </p>
        </div>
      </GlassCard>
    );
  }

  // Resumen accesible: mejor y peor + total. Permite a lector de
  // pantalla anunciar el panorama global sin recorrer cada item.
  const top = items[0];
  const bottom = items[items.length - 1];
  const isFeminine = groupBy === 'mechanic';
  const uniqueLabel = isFeminine ? 'única' : 'único';
  const analyzedLabel = isFeminine ? 'analizadas' : 'analizados';
  const accessibleSummary =
    items.length === 1
      ? `${dimensionLabel} ${uniqueLabel}: ${top.name} con ${Math.round(top.score)}% en ${top.totalPlays} partidas.`
      : `${items.length} ${dimensionLabel.toLowerCase()}s ${analyzedLabel}. Mejor: ${top.name} (${Math.round(top.score)}%). Peor: ${bottom.name} (${Math.round(bottom.score)}%).`;
  const accessibleDataTable = items.map((item) => ({
    label: item.name,
    value: `${Math.round(item.score)}% en ${item.totalPlays} partidas`,
  }));

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <ThemedChartContainer
        title={`Efectividad por ${dimensionLabel}`}
        summary={accessibleSummary}
        dataTable={accessibleDataTable}
        dataTableCaption={`Efectividad agrupada por ${dimensionLabel.toLowerCase()}`}
        focusable={false}
        headerExtra={
          // `text-text-secondary` (no -muted): la leyenda se monta sobre
          // backgrounds atmosféricos con washes rosados/amber. Lighthouse
          // reportó contraste 4.07:1 con muted en light (auditoría
          // 24/05/2026). `text-secondary` sube a ~8:1 sin perder jerarquía.
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            {/* Leyenda con color + icono — no depende solo de color (WCAG 1.4.1). */}
            <span className="flex items-center gap-1">
              <CircleCheck size={12} className="text-success-base" aria-hidden="true" />
              <span>{'>'}70%</span>
            </span>
            <span className="flex items-center gap-1">
              <CircleAlert size={12} className="text-warning-base" aria-hidden="true" />
              <span>50-69%</span>
            </span>
            <span className="flex items-center gap-1">
              <CircleX size={12} className="text-error-base" aria-hidden="true" />
              <span>{'<'}50%</span>
            </span>
          </div>
        }
      >
      <div className="flex items-center gap-2 mb-3 text-xs text-text-muted">
        <BarChart3 size={14} className="text-brand-base" aria-hidden="true" />
        <span>Puntuación media de las partidas agrupadas por {dimensionLabel.toLowerCase()}.</span>
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
                <span className="font-medium text-text-primary truncate flex items-center gap-2">
                  <styles.icon size={14} className={cn('flex-shrink-0', styles.text)} aria-hidden="true" />
                  {item.name}
                </span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* BUG-A11Y-CONTRAST-EFFECTIVENESS-A (QA Sprint 0 post-v0.5.0):
                      text-text-muted (#949fb2) sobre card bg (#293759) daba
                      4.4:1, just below AA. Subimos a text-text-secondary. */}
                  <span className="flex items-center gap-1 text-xs text-text-secondary">
                    <Gamepad2 size={12} aria-hidden="true" /> {item.totalPlays}
                  </span>
                  {item.improvement != null && (
                    // Tokens `-on-alpha` (index.css) garantizan AA sin
                    // necesidad de variantes light: condicionales.
                    <span
                      className={cn(
                        'flex items-center gap-1 text-xs font-medium',
                        item.improvement >= 0
                          ? 'text-success-on-alpha'
                          : 'text-error-on-alpha'
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
                aria-label={`Puntuación media de ${item.name}: ${Math.round(item.score)}%`}
              >
                <div className={cn('h-full transition-[width] duration-500', styles.bar)} style={{ width: `${widthPct}%` }} />
              </div>
            </motion.li>
          );
        })}
      </ul>
      </ThemedChartContainer>
    </GlassCard>
  );
}

ContentEffectivenessMatrix.propTypes = {
  data: PropTypes.array,
  groupBy: PropTypes.oneOf(['context', 'mechanic'])
};

export default memo(ContentEffectivenessMatrix);
