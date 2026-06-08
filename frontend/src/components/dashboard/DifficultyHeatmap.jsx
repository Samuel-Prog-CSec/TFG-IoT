import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { cn, tooltipEdgeAlignX } from '../../lib/utils';
import ChartSection from './ChartSection';
import EmptyState from '../ui/EmptyState';
import { formatMechanicName } from '../../lib/mechanicNames';

/**
 * Mapa de calor de dificultad (errorRate por contexto × mecanica).
 *
 * Reemplaza al anterior scatter plot por un grid tabular al estilo de
 * ActivityHeatmap (ver `components/analytics/ActivityHeatmap.jsx`) — celdas
 * rellenas con intensidad de color en escala RAG inversa (mas errores = mas
 * rojo), tooltip in-situ y resaltado de fila+columna en hover.
 *
 * Input: array `data = [{ context, mechanic, errorRate, totalAttempts }]`
 * proveniente de `GET /api/analytics/classroom/difficulties`.
 */

// Patrón rayado diagonal sutil + ring para diferenciar visualmente
// "sin datos" de celdas activas con error muy bajo (PROP-38).
const NO_DATA_CLS = 'bg-stripe-diagonal bg-background-surface/15 ring-1 ring-inset ring-border-subtle/30';

/**
 * Escala inversa respecto a ActivityHeatmap: aqui mas valor (errorRate) = mas "rojo".
 * Usa tokens semanticos del sistema para coherencia con el resto de analytics.
 */
// Escala redistribuida: la mayoría de valores reales cae entre 20-45%
// (dataset actual: 25-33%) y antes quedaban todos en el mismo tono
// `bg-warning-base/40`, anulando el propósito del heatmap. Ahora hay 5
// niveles con thresholds más densos en el rango medio y una intensidad
// creciente clara (QA 22/04/2026).
function getDifficultyClass(errorRate, hasData) {
  if (!hasData) return NO_DATA_CLS;
  // BUG-A11Y-HEATMAP-TEXT-A (QA Sprint 0 post-v0.5.0): bg-warning-base/65
  // (amber) con text-text-primary (blanco en dark) fallaba 3.74:1. Para las
  // celdas warning fijamos texto oscuro independiente del tema (la celda
  // siempre se ve sobre fondo amber suficientemente luminoso).
  if (errorRate >= 60) return 'bg-error-base/80';
  if (errorRate >= 40) return 'bg-error-base/55';
  // Opacidad subida (65→90) para que el texto negro pase AA 4.5:1 contra
  // el amber resultante (antes 4.48:1, fallaba por 0.02).
  if (errorRate >= 25) return 'bg-warning-base/90 !text-black';
  if (errorRate >= 10) return 'bg-warning-base/70 !text-black';
  return 'bg-success-base/55';
}

export default function DifficultyHeatmap({ data }) {
  const [hoveredCell, setHoveredCell] = useState(null);

  const { mechanics, contexts, grid, hasAnyData } = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) {
      return { mechanics: [], contexts: [], grid: null, hasAnyData: false };
    }

    // Orden de ejes: preservar el primer aparecimiento para estabilidad visual.
    const mechanicsSet = [];
    const contextsSet = [];
    const mechIndex = new Map();
    const ctxIndex = new Map();

    for (const d of data) {
      if (!mechIndex.has(d.mechanic)) {
        mechIndex.set(d.mechanic, mechanicsSet.length);
        mechanicsSet.push(d.mechanic);
      }
      if (!ctxIndex.has(d.context)) {
        ctxIndex.set(d.context, contextsSet.length);
        contextsSet.push(d.context);
      }
    }

    // grid[contextIdx][mechanicIdx] = { errorRate, totalAttempts }
    const gridData = contextsSet.map(() => mechanicsSet.map(() => null));
    let anyData = false;
    for (const d of data) {
      const c = ctxIndex.get(d.context);
      const m = mechIndex.get(d.mechanic);
      gridData[c][m] = {
        errorRate: Math.max(0, Math.min(100, Math.round(d.errorRate || 0))),
        totalAttempts: d.totalAttempts || 0
      };
      if ((d.totalAttempts || 0) > 0) anyData = true;
    }

    return { mechanics: mechanicsSet, contexts: contextsSet, grid: gridData, hasAnyData: anyData };
  }, [data]);

  if (!grid || !hasAnyData) {
    return (
      <ChartSection title="Mapa de Calor de Dificultad" animateSelf={false}>
        <EmptyState
          title="Sin datos de errores"
          description="No hay partidas con datos de errores suficientes para generar el mapa de calor."
          className="shadow-none border-none bg-transparent"
        />
      </ChartSection>
    );
  }

  return (
    <ChartSection title="Mapa de Calor de Dificultad" animateSelf={false}>
      <div className="flex items-center justify-end gap-3 text-nano text-text-muted mb-3 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-success-base/55" aria-hidden="true" />Poca
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-warning-base/70" aria-hidden="true" />Media
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-warning-base/90" aria-hidden="true" />Alta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-error-base/55" aria-hidden="true" />Muy alta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-error-base/80" aria-hidden="true" />Crítica
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-stripe-diagonal bg-background-surface/15 ring-1 ring-inset ring-border-subtle/30" aria-hidden="true" />Sin datos
        </span>
      </div>

      <div className="overflow-x-auto -mx-2">
        <div className="min-w-[420px] px-2">
          {/* Header de mecanicas (eje X) */}
          <div
            className="grid gap-1 mb-1"
            style={{ gridTemplateColumns: `minmax(120px, 1fr) repeat(${mechanics.length}, minmax(80px, 1fr))` }}
          >
            <span />
            {mechanics.map((m, mIdx) => (
              <div
                key={m}
                className={cn(
                  'text-center text-micro font-medium tabular-nums transition-opacity duration-150',
                  hoveredCell && hoveredCell.mIdx !== mIdx ? 'text-text-muted/40' : 'text-text-muted'
                )}
              >
                {formatMechanicName(m)}
              </div>
            ))}
          </div>

          {/* Filas de contextos (eje Y) */}
          <div
            className="space-y-1"
            role="grid"
            aria-label="Mapa de calor de dificultad por contexto y mecánica"
          >
            {contexts.map((ctx, cIdx) => (
              // BUG-A11Y-HEATMAP-A (QA Sprint 0 post-v0.5.0): axe-core marca
              // como crítico que un `role=grid` contenga directamente
              // `role=gridcell` sin un `role=row` intermedio. Añadido al wrapper
              // de cada fila.
              <div
                key={ctx}
                role="row"
                className="grid gap-1 items-stretch"
                style={{ gridTemplateColumns: `minmax(120px, 1fr) repeat(${mechanics.length}, minmax(80px, 1fr))` }}
              >
                <span
                  className={cn(
                    'text-micro font-medium text-right pr-2 self-center truncate transition-opacity duration-150',
                    hoveredCell && hoveredCell.cIdx !== cIdx ? 'text-text-muted/40' : 'text-text-secondary'
                  )}
                  title={ctx}
                >
                  {ctx}
                </span>
                {mechanics.map((m, mIdx) => {
                  const cell = grid[cIdx][mIdx];
                  const hasData = !!cell && cell.totalAttempts > 0;
                  const errorRate = cell?.errorRate ?? 0;
                  const isHovered = hoveredCell?.cIdx === cIdx && hoveredCell?.mIdx === mIdx;
                  const isInRowOrCol = hoveredCell && (hoveredCell.cIdx === cIdx || hoveredCell.mIdx === mIdx);
                  const isDimmed = hoveredCell && !isHovered && !isInRowOrCol;
                  // La fila superior coloca el tooltip DEBAJO de la celda: el
                  // wrapper de scroll (`overflow-x-auto` → overflow-y auto) recorta
                  // lo que sobresale por arriba, así que un tooltip `bottom-full`
                  // en cIdx 0 quedaba cortado. Volteándolo hacia abajo se mantiene
                  // dentro del contenedor visible.
                  const tooltipBelow = cIdx === 0;
                  // Anclaje horizontal: la columna del extremo derecho centraría
                  // el tooltip fuera del contenedor (mismo clip por `overflow-x`),
                  // así que se ancla a la derecha (crece hacia la izquierda); la
                  // del extremo izquierdo se ancla a la izquierda. El resto, centrado.
                  const tipX = tooltipEdgeAlignX(mIdx, mechanics.length - 1);
                  const valueLabel = hasData
                    ? `${errorRate}% de error, ${cell.totalAttempts} intentos`
                    : 'sin datos';

                  return (
                    <div
                      key={`${ctx}-${m}`}
                      role="gridcell"
                      tabIndex={-1}
                      aria-label={`${ctx} + ${formatMechanicName(m)}: ${valueLabel}`}
                      title={hasData ? undefined : `Sin partidas registradas para ${ctx} + ${formatMechanicName(m)}`}
                      onMouseEnter={() => setHoveredCell({ cIdx, mIdx })}
                      onMouseLeave={() => setHoveredCell(null)}
                      className={cn(
                        'relative h-14 rounded-md flex items-center justify-center text-micro font-semibold tabular-nums transition-all duration-150',
                        getDifficultyClass(errorRate, hasData),
                        hasData ? 'text-text-primary' : 'text-text-muted/60',
                        isHovered && 'scale-[1.06] z-10 ring-2 ring-brand-base/50',
                        isDimmed && 'opacity-40'
                      )}
                    >
                      {/* Sin datos: solo stripe diagonal sin texto. El em-dash
                          previo se confundía con valor cero (QA 2026-05-07). */}
                      {hasData ? `${errorRate}%` : ''}
                      {isHovered && hasData && (
                        <div className={cn('absolute bg-background-elevated/95 backdrop-blur-md border border-border-default rounded-lg shadow-xl px-3 py-2 text-xs whitespace-nowrap z-20 pointer-events-none', tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2', tipX)}>
                          <p className="font-semibold text-text-primary mb-0.5">{ctx} + {formatMechanicName(m)}</p>
                          <p className="text-error-base">Tasa de error: {errorRate}%</p>
                          <p className="text-text-muted text-nano mt-0.5">Intentos totales: {cell.totalAttempts}</p>
                        </div>
                      )}
                      {isHovered && !hasData && (
                        <div className={cn('absolute bg-background-elevated/95 backdrop-blur-md border border-border-default rounded-lg shadow-xl px-3 py-2 text-xs whitespace-nowrap z-20 pointer-events-none', tooltipBelow ? 'top-full mt-2' : 'bottom-full mb-2', tipX)}>
                          <p className="font-semibold text-text-primary mb-0.5">{ctx} + {formatMechanicName(m)}</p>
                          <p className="text-text-muted">Sin partidas registradas para esta combinación.</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-text-muted mt-4 text-center font-medium">
        Identifica qué combinaciones de <strong>Contexto + Mecánica</strong> generan más errores.
      </p>
    </ChartSection>
  );
}

DifficultyHeatmap.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({
    context: PropTypes.string.isRequired,
    mechanic: PropTypes.string.isRequired,
    errorRate: PropTypes.number,
    totalAttempts: PropTypes.number
  }))
};
