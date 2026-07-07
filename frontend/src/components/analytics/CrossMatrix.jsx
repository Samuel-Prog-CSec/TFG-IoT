/**
 * @fileoverview Matriz cruzada Mecánica × Contexto (T-942 Fase C).
 *
 * Tabla 2D con filas = mecanicas activas, columnas = contextos activos
 * y celdas RAG (verde / ambar / rojo / gris para sin datos). Cada celda
 * con datos abre un panel drill-down lateral con detalle de la
 * combinacion (metricas + interpretacion BI + acciones rapidas).
 *
 * Decisiones clave:
 *  - Primera columna sticky (`sticky left-0`) para no perder la etiqueta
 *    de mecanica al scrollear horizontalmente con muchos contextos.
 *  - Scroll horizontal monitorizado por `useHorizontalScroll` con fade
 *    derecho + chevron cuando hay overflow real.
 *  - Iconos Lucide ademas de color para cumplir WCAG 1.4.1 (no solo
 *    color); tokens `-on-alpha` para garantizar AA en light y dark sin
 *    duplicar reglas.
 *  - Filtros locales (mecanica, contexto, includeEmpty) controlados con
 *    estado interno y notificados por callback opcional al padre.
 *
 * @module components/analytics/CrossMatrix
 */

import { memo, useCallback, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import {
  CircleCheck,
  CircleAlert,
  CircleX,
  Circle,
  ChevronRight,
  Grid3x3,
} from 'lucide-react';
import {
  cn,
  listContainerVariants,
  listItemVariants,
} from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll';
import { scoreToRAGWithNull } from '../../constants/analyticsThresholds';
import { formatMechanicName } from '../../lib/mechanicNames';
import GlassCard from '../ui/GlassCard';
import SkeletonShimmer from '../ui/SkeletonShimmer';
import ErrorState from '../ui/ErrorState';
import SelectPremium from '../ui/SelectPremium';
import ThemedChartContainer from './ThemedChartContainer';
import CrossMatrixDrillDown from './CrossMatrixDrillDown';

/**
 * Estilos de celda por estado RAG. Tokens `-on-alpha` (index.css)
 * garantizan AA sobre fondos alpha del mismo tono, en light y dark.
 */
const CELL_STYLES = {
  green: {
    bg: 'bg-success-base/10 hover:bg-success-base/20',
    border: 'border-success-base/30',
    text: 'text-success-on-alpha',
    icon: CircleCheck,
  },
  amber: {
    bg: 'bg-warning-base/10 hover:bg-warning-base/20',
    border: 'border-warning-base/30',
    text: 'text-warning-on-alpha',
    icon: CircleAlert,
  },
  red: {
    bg: 'bg-error-base/10 hover:bg-error-base/20',
    border: 'border-error-base/30',
    text: 'text-error-on-alpha',
    icon: CircleX,
  },
  gray: {
    bg: 'bg-background-surface/30',
    border: 'border-border-subtle',
    text: 'text-text-muted',
    icon: Circle,
  },
};

const FILTER_ALL = '__all__';

/**
 * Ilustracion SVG inline para el empty state — orbes y reticula que
 * sugieren "matriz" sin caer en cliches genericos. Coherente con
 * `EmptyAlertsIllustration` (mismo idioma visual).
 */
function MatrixIllustration() {
  return (
    <svg
      width="120"
      height="100"
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="text-brand-base/30"
    >
      <defs>
        <linearGradient id="matrix-orb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.6" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      {/* Reticula 3×3 */}
      {[20, 50, 80].map((x) =>
        [20, 50, 80].map((y) => (
          <rect
            key={`grid-${x}-${y}`}
            x={x}
            y={y}
            width="20"
            height="14"
            rx="3"
            stroke="currentColor"
            strokeWidth="1"
            strokeOpacity="0.35"
            fill="none"
          />
        ))
      )}
      {/* Orbes destacados */}
      <circle cx="30" cy="27" r="4" fill="url(#matrix-orb)" />
      <circle cx="60" cy="57" r="4" fill="url(#matrix-orb)" />
      <circle cx="90" cy="87" r="4" fill="url(#matrix-orb)" />
    </svg>
  );
}

/**
 * Skeleton 4 filas × 5 columnas mientras carga el endpoint.
 */
function CrossMatrixSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="flex gap-2">
        <SkeletonShimmer className="h-8 w-32 rounded-md flex-shrink-0" />
        {Array.from({ length: 5 }, (_, i) => `head-${i}`).map((key) => (
          <SkeletonShimmer key={key} className="h-8 flex-1 min-w-[80px] rounded-md" />
        ))}
      </div>
      {Array.from({ length: 4 }, (_, i) => `row-${i}`).map((rowKey) => (
        <div key={rowKey} className="flex gap-2">
          <SkeletonShimmer className="h-12 w-32 rounded-md flex-shrink-0" />
          {Array.from({ length: 5 }, (_, i) => `cell-${rowKey}-${i}`).map((cellKey) => (
            <SkeletonShimmer key={cellKey} className="h-12 flex-1 min-w-[80px] rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Build helpers: extrae mechanics/contexts unicos del array de items y
 * los ordena alfabeticamente por nombre.
 */
function uniqueSorted(items, idKey, nameKey, transformName) {
  const map = new Map();
  for (const it of items) {
    const id = String(it[idKey] || '');
    if (!id || map.has(id)) continue;
    const rawName = it[nameKey] || '';
    map.set(id, { id, name: transformName ? transformName(rawName) : rawName });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Matriz cruzada Mecanica × Contexto.
 *
 * @param {Object} props
 * @param {{items: Array, groupBy: string}} props.data — Respuesta del endpoint.
 * @param {boolean} props.loading
 * @param {Object|null} props.error
 * @param {() => void} props.onRetry
 * @param {string} [props.filterMechanicId] — Si presente, fuerza fila unica.
 * @param {string} [props.filterContextId] — Si presente, fuerza columna unica.
 * @param {(filters: {mechanicId: string|null, contextId: string|null}) => void} [props.onFilterChange]
 * @param {(cell: Object) => void} [props.onCellClick] — Alternativa al
 *   drill-down interno. Si se proporciona, suprime el panel local y
 *   delega el handling al padre.
 */
function CrossMatrix({
  data,
  loading = false,
  error = null,
  onRetry,
  filterMechanicId,
  filterContextId,
  onFilterChange,
  onCellClick,
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const {
    ref: scrollRef,
    hasOverflow,
    canScrollRight,
    scrollByOne,
  } = useHorizontalScroll();

  // Estado local de filtros. El padre puede sincronizarse mediante
  // onFilterChange si quiere persistirlos.
  const [localMechanicId, setLocalMechanicId] = useState(
    filterMechanicId || FILTER_ALL
  );
  const [localContextId, setLocalContextId] = useState(
    filterContextId || FILTER_ALL
  );
  const [includeEmpty, setIncludeEmpty] = useState(false);
  // Estado del drill-down (solo cuando el padre no pasa onCellClick).
  const [selectedCell, setSelectedCell] = useState(null);

  // Items efectivos: respaldados por backend ya filtrados de empty cells
  // por defecto; el toggle local solo apaga/enciende celdas "Sin datos"
  // dentro de las combinaciones cruzadas.
  const items = useMemo(
    () => (Array.isArray(data?.items) ? data.items : []),
    [data]
  );

  // Extraer mecanicas y contextos unicos del dataset.
  const allMechanics = useMemo(
    () =>
      uniqueSorted(items, 'mechanicId', 'mechanicName', formatMechanicName),
    [items]
  );
  const allContexts = useMemo(
    () => uniqueSorted(items, 'contextId', 'contextName'),
    [items]
  );

  // Filtros activos (resolviendo "all" → null).
  const activeMechanicId =
    localMechanicId === FILTER_ALL ? null : localMechanicId;
  const activeContextId =
    localContextId === FILTER_ALL ? null : localContextId;

  // Notificar al padre cuando cambian los filtros (debounce no necesario,
  // el cambio es discreto).
  const notifyFilters = useCallback(
    (mId, cId) => {
      onFilterChange?.({
        mechanicId: mId === FILTER_ALL ? null : mId,
        contextId: cId === FILTER_ALL ? null : cId,
      });
    },
    [onFilterChange]
  );

  const handleMechanicChange = useCallback(
    (val) => {
      setLocalMechanicId(val);
      notifyFilters(val, localContextId);
    },
    [localContextId, notifyFilters]
  );

  const handleContextChange = useCallback(
    (val) => {
      setLocalContextId(val);
      notifyFilters(localMechanicId, val);
    },
    [localMechanicId, notifyFilters]
  );

  // Listas visibles tras filtrar.
  const visibleMechanics = useMemo(() => {
    if (!activeMechanicId) return allMechanics;
    return allMechanics.filter((m) => m.id === activeMechanicId);
  }, [allMechanics, activeMechanicId]);

  const visibleContexts = useMemo(() => {
    if (!activeContextId) return allContexts;
    return allContexts.filter((c) => c.id === activeContextId);
  }, [allContexts, activeContextId]);

  // Indice rapido por composite key para acceso O(1) por celda.
  const itemByKey = useMemo(() => {
    const map = new Map();
    for (const it of items) {
      const key = `${it.mechanicId}::${it.contextId}`;
      map.set(key, it);
    }
    return map;
  }, [items]);

  // Resumen accesible + data table sr-only (top 10 celdas por score).
  const { accessibleSummary, dataTableRows } = useMemo(() => {
    if (items.length === 0) {
      return { accessibleSummary: '', dataTableRows: [] };
    }
    const sorted = [...items].sort(
      (a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0)
    );
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const bestLabel = `${formatMechanicName(best.mechanicName)} × ${best.contextName} (${Math.round(best.avgScore)}%)`;
    const worstLabel = `${formatMechanicName(worst.mechanicName)} × ${worst.contextName} (${Math.round(worst.avgScore)}%)`;
    const summary =
      items.length === 1
        ? `Matriz cruzada con 1 combinación analizada: ${bestLabel}.`
        : `Matriz cruzada con ${allMechanics.length} mecánicas y ${allContexts.length} contextos. Mejor combinación: ${bestLabel}. Peor: ${worstLabel}.`;
    const rows = sorted.slice(0, 10).map((it) => ({
      label: `${formatMechanicName(it.mechanicName)} × ${it.contextName}`,
      value: `${Math.round(it.avgScore)}% en ${it.totalPlays} partidas`,
    }));
    return { accessibleSummary: summary, dataTableRows: rows };
  }, [items, allMechanics, allContexts]);

  // Handler unificado para clic en celda — usa callback del padre si
  // existe, sino abre drill-down local.
  const handleCellClick = useCallback(
    (cell) => {
      if (!cell || cell.totalPlays === 0) return;
      if (onCellClick) {
        onCellClick(cell);
        return;
      }
      setSelectedCell(cell);
    },
    [onCellClick]
  );

  // ─────────── Render guards ───────────

  if (loading) {
    return (
      <GlassCard variant="default" padding="none" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <Grid3x3
              size={20}
              className="text-brand-base"
              aria-hidden="true"
            />
          </div>
          <h3 className="text-base font-semibold text-text-primary font-display">
            Matriz Mecánica × Contexto
          </h3>
        </div>
        <CrossMatrixSkeleton />
      </GlassCard>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="No se pudo cargar la matriz cruzada"
        message="Ha fallado la lectura del análisis cruzado. Reintenta en unos segundos."
        onRetry={onRetry}
      />
    );
  }

  if (items.length === 0) {
    return (
      <GlassCard variant="default" padding="none" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <Grid3x3
              size={20}
              className="text-brand-base"
              aria-hidden="true"
            />
          </div>
          <h3 className="text-base font-semibold text-text-primary font-display">
            Matriz Mecánica × Contexto
          </h3>
        </div>
        <div className="flex flex-col items-center justify-center text-center py-8 gap-4">
          <MatrixIllustration />
          <div className="max-w-sm space-y-1.5">
            <p className="text-sm font-medium text-text-primary">
              Aún no hay suficientes partidas para construir la matriz cruzada.
            </p>
            <p className="text-xs text-text-muted">
              Necesitas datos de al menos 3 alumnos en 2 mecánicas distintas.
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  // Opciones para los SelectPremium.
  const mechanicOptions = [
    { value: FILTER_ALL, label: 'Todas las mecánicas' },
    ...allMechanics.map((m) => ({ value: m.id, label: m.name })),
  ];
  const contextOptions = [
    { value: FILTER_ALL, label: 'Todos los contextos' },
    ...allContexts.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <ThemedChartContainer
        title="Matriz Mecánica × Contexto"
        summary={accessibleSummary}
        dataTable={dataTableRows}
        dataTableCaption="Efectividad media por par mecánica-contexto"
        focusable={false}
        headerExtra={
          // `text-text-secondary`: leyenda sobre backgrounds tonales (rosa/amber
          // del wash atmosférico). Con muted, Lighthouse reportó 4.07:1 (<AA).
          // Secondary sube ~8:1 manteniendo jerarquía (auditoría 24/05/2026).
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            <span className="flex items-center gap-1">
              <CircleCheck
                size={12}
                className="text-success-base"
                aria-hidden="true"
              />
              <span>{'>'}70%</span>
            </span>
            <span className="flex items-center gap-1">
              <CircleAlert
                size={12}
                className="text-warning-base"
                aria-hidden="true"
              />
              <span>50-69%</span>
            </span>
            <span className="flex items-center gap-1">
              <CircleX
                size={12}
                className="text-error-base"
                aria-hidden="true"
              />
              <span>{'<'}50%</span>
            </span>
          </div>
        }
      >
        <div className="flex items-start gap-2 mb-3 text-xs text-text-muted">
          <Grid3x3
            size={14}
            className="text-brand-base mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
          <span>
            Cada celda combina una mecánica con un contexto. Toca una celda
            con datos para ver el detalle.
          </span>
        </div>

        {/* Toolbar de filtros */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <SelectPremium
            value={localMechanicId}
            onChange={handleMechanicChange}
            options={mechanicOptions}
            placeholder="Filtrar por mecánica…"
            className="sm:w-56"
          />
          <SelectPremium
            value={localContextId}
            onChange={handleContextChange}
            options={contextOptions}
            placeholder="Filtrar por contexto…"
            className="sm:w-56"
          />
          <label className="inline-flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none ml-auto">
            <input
              type="checkbox"
              checked={includeEmpty}
              onChange={(e) => setIncludeEmpty(e.target.checked)}
              className={cn(
                'rounded border border-border-default bg-background-elevated',
                'text-brand-base focus-ring'
              )}
            />
            Mostrar celdas sin partidas
          </label>
        </div>

        {/* Tabla con scroll horizontal. La primera columna queda sticky
            (`sticky left-0 bg-background-elevated z-10`) para no perder
            la etiqueta de mecanica al desplazarse a la derecha cuando
            hay muchos contextos. */}
        <div className="relative">
          <div
            ref={scrollRef}
            className="overflow-x-auto custom-scrollbar"
          >
            <motion.table
              variants={
                shouldReduceMotion ? {} : listContainerVariants(0.04)
              }
              initial={shouldReduceMotion ? false : 'hidden'}
              animate="visible"
              className="w-full border-separate border-spacing-1 min-w-[640px]"
            >
              <thead>
                <tr>
                  {/* Hueco superior izquierdo */}
                  <th
                    scope="col"
                    className={cn(
                      'sticky left-0 z-10 bg-background-elevated',
                      'min-w-[160px] text-left text-xs font-bold uppercase',
                      'tracking-wider text-text-muted px-3 py-2'
                    )}
                  >
                    Mecánica / Contexto
                  </th>
                  {visibleContexts.map((ctx) => (
                    <th
                      key={ctx.id}
                      scope="col"
                      className={cn(
                        'min-w-[120px] text-center text-xs font-bold',
                        'text-text-secondary px-3 py-2 truncate max-w-[180px]'
                      )}
                      title={ctx.name}
                    >
                      {ctx.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleMechanics.map((mech) => (
                  <motion.tr
                    key={mech.id}
                    variants={shouldReduceMotion ? {} : listItemVariants}
                  >
                    {/* Sticky first column con etiqueta de mecanica. */}
                    <th
                      scope="row"
                      className={cn(
                        'sticky left-0 z-10 bg-background-elevated',
                        'text-left text-sm font-semibold text-text-primary',
                        'px-3 py-2 border-r border-border-subtle truncate max-w-[200px]'
                      )}
                      title={mech.name}
                    >
                      {mech.name}
                    </th>
                    {visibleContexts.map((ctx) => {
                      const key = `${mech.id}::${ctx.id}`;
                      const cell = itemByKey.get(key);
                      const hasData = !!cell && cell.totalPlays > 0;
                      // Si includeEmpty está off y la celda no tiene
                      // datos, pintamos gris "Sin datos" igualmente
                      // (no se omite del DOM para no romper la grid).
                      const rag = hasData
                        ? scoreToRAGWithNull(cell.avgScore)
                        : 'gray';
                      const styles = CELL_STYLES[rag];
                      const CellIcon = styles.icon;
                      // includeEmpty afecta solo visibility — ocultamos
                      // contenido de celdas vacias cuando esta apagado.
                      const showEmpty = includeEmpty;
                      return (
                        <td
                          key={key}
                          className="p-0 align-middle text-center"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              hasData ? handleCellClick(cell) : null
                            }
                            disabled={!hasData}
                            aria-label={
                              hasData
                                ? `${mech.name}, ${ctx.name}: ${Math.round(cell.avgScore)}% en ${cell.totalPlays} partidas`
                                : `${mech.name}, ${ctx.name}: sin datos`
                            }
                            title={
                              hasData && cell.interpretation?.whatHappened
                                ? cell.interpretation.whatHappened
                                : undefined
                            }
                            className={cn(
                              'w-full min-h-[44px] rounded-lg border',
                              'transition-[background-color,box-shadow,transform]',
                              'duration-200 px-2 py-2',
                              'flex items-center justify-center gap-1.5',
                              'focus-ring',
                              styles.bg,
                              styles.border,
                              hasData
                                ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
                                : 'cursor-default opacity-70'
                            )}
                          >
                            {hasData ? (
                              <>
                                <CellIcon
                                  size={14}
                                  className={cn(
                                    'flex-shrink-0',
                                    styles.text
                                  )}
                                  aria-hidden="true"
                                />
                                <span
                                  className={cn(
                                    'text-sm font-bold tabular-nums',
                                    styles.text
                                  )}
                                >
                                  {Math.round(cell.avgScore)}%
                                </span>
                              </>
                            ) : (
                              showEmpty && (
                                <span className="text-micro text-text-muted italic">
                                  Sin datos
                                </span>
                              )
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </motion.tr>
                ))}
              </tbody>
            </motion.table>
          </div>

          {/* Fade derecho cuando hay overflow real. */}
          {canScrollRight && (
            <div
              className="pointer-events-none absolute right-0 top-10 bottom-1 w-12 bg-gradient-to-l from-background-elevated via-background-elevated/80 to-transparent"
              aria-hidden="true"
            />
          )}

          {/* Chevron para scroll programatico. */}
          {hasOverflow && canScrollRight && (
            <button
              type="button"
              onClick={() =>
                scrollByOne(shouldReduceMotion ? 'auto' : 'smooth')
              }
              aria-label="Ver más columnas"
              className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full',
                'bg-background-surface/90 hover:bg-background-surface',
                'ring-1 ring-border-default backdrop-blur-sm',
                'flex items-center justify-center text-text-secondary',
                'hover:text-text-primary transition-colors shadow-lg z-20 focus-ring'
              )}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </ThemedChartContainer>

      {/* Drill-down lateral (solo cuando el padre NO interceptа onCellClick). */}
      {!onCellClick && (
        <CrossMatrixDrillDown
          isOpen={!!selectedCell}
          cell={selectedCell}
          onClose={() => setSelectedCell(null)}
        />
      )}
    </GlassCard>
  );
}

CrossMatrix.propTypes = {
  data: PropTypes.shape({
    items: PropTypes.array,
    groupBy: PropTypes.string,
  }),
  loading: PropTypes.bool,
  error: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),
  onRetry: PropTypes.func,
  filterMechanicId: PropTypes.string,
  filterContextId: PropTypes.string,
  onFilterChange: PropTypes.func,
  onCellClick: PropTypes.func,
};

// (E3) memo: la matriz 2D (mecánicas × contextos) es cara de reconciliar y se
// re-renderizaba con cada render del padre (InsightsReports) aunque sus datos no
// cambien. Memoizada, solo re-renderiza cuando cambian sus props.
export default memo(CrossMatrix);
