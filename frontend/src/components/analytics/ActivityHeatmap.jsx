import { memo, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import ThemedChartContainer from './ThemedChartContainer';

/**
 * Dias de la semana en espanol (abreviados con tildes)
 */
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Horas del dia a mostrar (reducido para legibilidad)
 */
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

/**
 * Calcula la intensidad de color basada en el valor relativo al maximo.
 * Las celdas value=0 reciben el patrón "empty" (utility CSS equivalente a
 * `chartTokens.emptyPatternId` definido en ChartsTheme.jsx) — comunica
 * "sin datos" de forma colorblind-safe en lugar de un color tenue
 * indistinguible (T-952 Fase 0.D/E). El resto de niveles usa
 * `--color-brand-base` con alpha creciente; como la variable se
 * redefine en light, los tonos siguen siendo legibles en ambos temas.
 *
 * @param {number} value - Numero de partidas en esa celda
 * @param {number} max - Maximo valor del heatmap completo
 * @returns {string} Clase de Tailwind para el color de fondo
 */
const getIntensityClass = (value, max) => {
  if (!value || value === 0) {
    return 'bg-stripe-diagonal bg-background-surface/30 ring-1 ring-inset ring-border-subtle/30';
  }
  const ratio = value / max;
  if (ratio >= 0.75) return 'bg-brand-base/60';
  if (ratio >= 0.5) return 'bg-brand-base/40';
  if (ratio >= 0.25) return 'bg-brand-base/25';
  return 'bg-brand-base/12';
};

/**
 * Heatmap de actividad semanal (dia x hora).
 * Muestra cuando juegan los alumnos — util para planificar sesiones.
 *
 * @param {Object} props
 * @param {Object} props.data - Datos del endpoint /classroom/heatmap
 *   Formato esperado: { heatmap: [[...hours], ...days] } o { data: [{day, hour, count}] }
 */
function ActivityHeatmap({ data }) {
  const [hoveredCell, setHoveredCell] = useState(null);

  const { grid, maxValue } = useMemo(() => {
    if (!data) return { grid: null, maxValue: 0 };

    let gridData = [];
    let max = 0;

    // Soportar ambos formatos de respuesta del backend
    if (Array.isArray(data.heatmap) && Array.isArray(data.heatmap[0])) {
      // Formato matriz: heatmap[day][hour] = count
      gridData = data.heatmap;
      for (const row of gridData) {
        for (const val of row) {
          if (val > max) max = val;
        }
      }
    } else if (Array.isArray(data.heatmap) || Array.isArray(data.data || data)) {
      // Formato flat: [{day, hour, count}] o [{dayOfWeek, hour, count}]
      const flat = Array.isArray(data.heatmap) ? data.heatmap : (data.data || data);
      gridData = Array.from({ length: 7 }, () => Array(24).fill(0));
      for (const item of flat) {
        const d = item.day ?? item.dayOfWeek;
        const h = item.hour;
        const c = item.count ?? item.games ?? 0;
        if (d != null && h != null) {
          gridData[d][h] = c;
          if (c > max) max = c;
        }
      }
    }

    return { grid: gridData, maxValue: max };
  }, [data]);

  if (!grid || maxValue === 0) {
    return (
      <GlassCard variant="default" padding="none" className="p-5">
        <h2 className="text-base font-semibold text-text-primary font-display mb-4">Actividad Semanal</h2>
        <div className="py-6 text-center">
          <p className="text-sm text-text-muted">No hay datos de actividad disponibles.</p>
        </div>
      </GlassCard>
    );
  }

  // Resumen accesible: pico de actividad (día+hora con max) + total
  // partidas. Permite que un lector de pantalla anuncie de un vistazo
  // "cuándo se concentra el juego" en lugar de tener que recorrer 77
  // celdas (7 días × 11 horas).
  const peakInfo = (() => {
    let peakDay = -1;
    let peakHour = -1;
    let total = 0;
    for (let d = 0; d < grid.length; d++) {
      for (let h = 0; h < (grid[d] || []).length; h++) {
        const v = grid[d][h] || 0;
        total += v;
        if (v === maxValue) {
          peakDay = d;
          peakHour = h;
        }
      }
    }
    return { peakDay, peakHour, total };
  })();
  const accessibleSummary =
    peakInfo.peakDay >= 0 && peakInfo.peakHour >= 0
      ? `Mapa de actividad semanal. Total de ${peakInfo.total} partidas. Pico de actividad: ${DAYS[peakInfo.peakDay]} a las ${peakInfo.peakHour}:00 horas con ${maxValue} partidas.`
      : 'Mapa de actividad semanal sin datos suficientes.';

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <ThemedChartContainer
        title="Actividad Semanal"
        summary={accessibleSummary}
        focusable={false}
        headerExtra={
          <div className="flex items-center gap-2 text-nano text-text-muted">
            <span>Menos</span>
            <div className="flex gap-0.5">
              {/* La primera swatch usa el mismo patrón "empty" que las
                  celdas value=0, para que el usuario asocie visualmente
                  "sin datos" con la textura diagonal. */}
              <div className="size-3 rounded-sm bg-stripe-diagonal bg-background-surface/30 ring-1 ring-inset ring-border-subtle/30" />
              <div className="size-3 rounded-sm bg-brand-base/12" />
              <div className="size-3 rounded-sm bg-brand-base/25" />
              <div className="size-3 rounded-sm bg-brand-base/40" />
              <div className="size-3 rounded-sm bg-brand-base/60" />
            </div>
            <span>Más</span>
          </div>
        }
      >

      <div className="overflow-x-auto custom-scrollbar -mx-2 mt-1">
        <div className="min-w-[320px] px-2">
          {/* Hours header */}
          <div className="flex gap-0.5 ml-10 mb-1">
            {HOURS.map(h => (
              <div key={h} className={cn(
                "flex-1 text-center text-nano tabular-nums transition-opacity duration-150",
                hoveredCell && hoveredCell.hour !== h ? "text-text-muted/40" : "text-text-muted"
              )}>
                {h}h
              </div>
            ))}
          </div>

          {/* Grid rows */}
          <div className="space-y-0.5" aria-label="Mapa de calor de actividad semanal, horario de 8 a 18 horas, lunes a domingo">
            {DAYS.map((day, dayIndex) => (
              <div key={day} className="flex items-center gap-0.5">
                <span className={cn(
                  "w-9 text-right text-micro font-medium pr-1 transition-opacity duration-150",
                  hoveredCell && hoveredCell.dayIndex !== dayIndex ? "text-text-muted/40" : "text-text-muted"
                )}>
                  {day}
                </span>
                <div className="flex gap-0.5 flex-1">
                  {HOURS.map(hour => {
                    const value = grid[dayIndex]?.[hour] || 0;
                    const isHovered = hoveredCell?.dayIndex === dayIndex && hoveredCell?.hour === hour;
                    const isInRowOrCol = hoveredCell && (hoveredCell.dayIndex === dayIndex || hoveredCell.hour === hour);
                    const isDimmed = hoveredCell && !isHovered && !isInRowOrCol;
                    const activate = () => setHoveredCell({ dayIndex, hour });
                    const deactivate = () => setHoveredCell(null);
                    return (
                      <button
                        key={hour}
                        type="button"
                        className={cn(
                          "flex-1 aspect-square rounded-sm transition-all duration-150",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base",
                          getIntensityClass(value, maxValue),
                          isHovered && "scale-125 z-10 ring-2 ring-brand-base/50 relative",
                          isDimmed && "opacity-40"
                        )}
                        onMouseEnter={activate}
                        onMouseLeave={deactivate}
                        onFocus={activate}
                        onBlur={deactivate}
                        aria-label={`${day} a las ${hour}:00 horas, ${value} partidas`}
                      >
                        {isHovered && (
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-background-elevated/90 backdrop-blur-sm border border-border-default rounded-lg shadow-lg p-2 text-xs text-text-primary whitespace-nowrap z-20 pointer-events-none">
                            <span className="font-semibold">{day} {hour}:00</span>
                            <span className="text-text-muted ml-1.5">{value} partidas</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </ThemedChartContainer>
    </GlassCard>
  );
}

ActivityHeatmap.propTypes = {
  data: PropTypes.object,
};

export default memo(ActivityHeatmap);
