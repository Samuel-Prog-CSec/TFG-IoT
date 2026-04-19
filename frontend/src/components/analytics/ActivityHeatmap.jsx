import { memo, useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';

/**
 * Dias de la semana en espanol (abreviados con tildes)
 */
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/**
 * Horas del dia a mostrar (reducido para legibilidad)
 */
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

/**
 * Calcula la intensidad de color basada en el valor relativo al maximo
 * @param {number} value - Numero de partidas en esa celda
 * @param {number} max - Maximo valor del heatmap completo
 * @returns {string} Clase de Tailwind para el color de fondo
 */
const getIntensityClass = (value, max) => {
  if (!value || value === 0) return 'bg-background-surface/20 ring-1 ring-inset ring-border-subtle/30';
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
        <h3 className="text-base font-bold text-text-primary font-display mb-4">Actividad Semanal</h3>
        <div className="py-6 text-center">
          <p className="text-sm text-text-muted">No hay datos de actividad disponibles.</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-text-primary font-display">Actividad Semanal</h3>
        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          <span>Menos</span>
          <div className="flex gap-0.5">
            <div className="size-3 rounded-sm bg-background-surface/20 ring-1 ring-inset ring-border-subtle/30" />
            <div className="size-3 rounded-sm bg-brand-base/12" />
            <div className="size-3 rounded-sm bg-brand-base/25" />
            <div className="size-3 rounded-sm bg-brand-base/40" />
            <div className="size-3 rounded-sm bg-brand-base/60" />
          </div>
          <span>Mas</span>
        </div>
      </div>

      <div className="overflow-x-auto -mx-2">
        <div className="min-w-[400px] px-2">
          {/* Hours header */}
          <div className="flex gap-0.5 ml-10 mb-1">
            {HOURS.map(h => (
              <div key={h} className={cn(
                "flex-1 text-center text-[10px] tabular-nums transition-opacity duration-150",
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
                  "w-9 text-right text-[11px] font-medium pr-1 transition-opacity duration-150",
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
                    return (
                      <div
                        key={hour}
                        className={cn(
                          "flex-1 aspect-square rounded-sm transition-all duration-150",
                          getIntensityClass(value, maxValue),
                          isHovered && "scale-125 z-10 ring-2 ring-brand-base/50",
                          isDimmed && "opacity-40",
                          isHovered && "relative"
                        )}
                        role="gridcell"
                        tabIndex={-1}
                        onMouseEnter={() => setHoveredCell({ dayIndex, hour })}
                        onMouseLeave={() => setHoveredCell(null)}
                        aria-label={`${day} a las ${hour}: ${value} partidas`}
                      >
                        {isHovered && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-background-elevated/90 backdrop-blur-sm border border-border-default rounded-lg shadow-lg p-2 text-xs text-text-primary whitespace-nowrap z-20 pointer-events-none">
                            <span className="font-semibold">{day} {hour}:00</span>
                            <span className="text-text-muted ml-1.5">{value} partidas</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

ActivityHeatmap.propTypes = {
  data: PropTypes.object,
};

export default memo(ActivityHeatmap);
