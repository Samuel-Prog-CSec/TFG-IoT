import { memo, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Gamepad2, TrendingUp, BarChart3 } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from '../ui/GlassCard';
import { scoreToRAGWithNull as getRAGColor } from '../../constants/analyticsThresholds';

/**
 * Estilos de fondo y texto segun color RAG.
 */
const RAG_CELL_STYLES = {
  green: {
    bg: 'bg-success-base/20 hover:bg-success-base/30',
    text: 'text-success-base',
    border: 'border-success-base/30',
  },
  amber: {
    bg: 'bg-warning-base/20 hover:bg-warning-base/30',
    text: 'text-warning-base',
    border: 'border-warning-base/30',
  },
  red: {
    bg: 'bg-error-base/20 hover:bg-error-base/30',
    text: 'text-error-base',
    border: 'border-error-base/30',
  },
  gray: {
    bg: 'bg-background-surface/30',
    text: 'text-text-muted',
    border: 'border-border-subtle',
  },
};

/**
 * Celda individual de la matriz con puntuacion y color RAG.
 */
function MatrixCell({ score, gamesPlayed, improvement, isExpanded, onClick, shouldReduceMotion }) {
  const ragColor = getRAGColor(score);
  const styles = RAG_CELL_STYLES[ragColor];
  const hasData = score != null && !isNaN(score);

  return (
    <td className="p-1">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full rounded-lg px-3 py-2.5 text-center transition-all duration-200',
          'border focus-ring cursor-pointer',
          styles.bg,
          styles.border,
          isExpanded && 'ring-2 ring-brand-base/30'
        )}
        aria-label={hasData ? `Puntuacion ${Math.round(score)}%, ${gamesPlayed || 0} partidas` : 'Sin datos'}
      >
        {hasData ? (
          <span className={cn('text-sm font-bold tabular-nums', styles.text)}>
            {Math.round(score)}%
          </span>
        ) : (
          <span className="text-xs text-text-disabled">-</span>
        )}
      </button>

      <AnimatePresence>
        {isExpanded && hasData && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: DURATION.stateChange, ease: EASING.outQuart }}
            className="mt-1 overflow-hidden"
          >
            <div className={cn(
              'rounded-lg border p-2 text-xs space-y-1',
              'bg-background-elevated/60 border-border-subtle'
            )}>
              <div className="flex items-center gap-1 text-text-muted">
                <Gamepad2 size={10} aria-hidden="true" />
                <span>{gamesPlayed || 0} partidas</span>
              </div>
              {improvement != null && (
                <div className={cn(
                  'flex items-center gap-1 font-medium',
                  improvement >= 0 ? 'text-success-base' : 'text-error-base'
                )}>
                  <TrendingUp size={10} className={improvement < 0 ? 'rotate-180' : ''} aria-hidden="true" />
                  <span>{improvement >= 0 ? '+' : ''}{Math.round(improvement)}%</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </td>
  );
}

/**
 * Matriz de efectividad de contenido que cruza mecanicas (filas) con contextos (columnas).
 * Muestra puntuacion media con colores RAG en cada celda.
 *
 * @param {Object} props
 * @param {Array} props.data - Datos del API getContentEffectiveness
 * @param {Function} [props.onCellClick] - Callback al hacer clic en una celda
 */
function ContentEffectivenessMatrix({ data, onCellClick }) {
  const { shouldReduceMotion } = useReducedMotion();
  const [expandedCell, setExpandedCell] = useState(null);

  // Construir la matriz cruzando mecanicas y contextos
  const { mechanics, contexts, matrix } = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { mechanics: [], contexts: [], matrix: {} };
    }

    const mechanicSet = new Map();
    const contextSet = new Map();
    const cellMap = {};

    for (const item of data) {
      const mechName = item.mechanicName || item.mechanic || item.name;
      const ctxName = item.contextName || item.context;
      const mechId = item.mechanicId || mechName;
      const ctxId = item.contextId || ctxName;

      if (mechName && ctxName) {
        // Datos cruzados (tienen ambos)
        if (!mechanicSet.has(mechId)) {
          mechanicSet.set(mechId, mechName);
        }
        if (!contextSet.has(ctxId)) {
          contextSet.set(ctxId, ctxName);
        }
        const key = `${mechId}__${ctxId}`;
        cellMap[key] = {
          score: item.averageScore ?? item.score ?? null,
          gamesPlayed: item.gamesPlayed ?? item.totalGames ?? 0,
          improvement: item.improvement ?? item.trend ?? null,
        };
      } else if (mechName && !ctxName) {
        // Solo mecanica
        if (!mechanicSet.has(mechId)) {
          mechanicSet.set(mechId, mechName);
        }
      } else if (ctxName && !mechName) {
        // Solo contexto
        if (!contextSet.has(ctxId)) {
          contextSet.set(ctxId, ctxName);
        }
      }
    }

    // Si no hay datos cruzados, construir filas flat con los datos disponibles
    if (Object.keys(cellMap).length === 0) {
      for (const item of data) {
        const name = item.name || item.mechanicName || item.contextName || 'Desconocido';
        const id = item._id || item.id || name;
        const groupBy = item.groupBy || (item.mechanicName ? 'mechanic' : 'context');

        if (groupBy === 'mechanic') {
          if (!mechanicSet.has(id)) mechanicSet.set(id, name);
        } else {
          if (!contextSet.has(id)) contextSet.set(id, name);
        }

        // Crear celda con los datos flat: usar "all" como placeholder para el eje sin datos
        const score = item.avgScore ?? item.averageScore ?? item.score ?? null;
        const gamesPlayed = item.totalPlays ?? item.gamesPlayed ?? item.totalGames ?? 0;
        const improvement = item.improvementRate ?? item.improvement ?? null;

        if (groupBy === 'mechanic') {
          // Poner en cada contexto existente o crear un placeholder
          if (contextSet.size === 0) contextSet.set('_all', 'Global');
          for (const [ctxId] of contextSet) {
            cellMap[`${id}__${ctxId}`] = { score, gamesPlayed, improvement };
          }
        } else {
          if (mechanicSet.size === 0) mechanicSet.set('_all', 'Global');
          for (const [mechId] of mechanicSet) {
            cellMap[`${mechId}__${id}`] = { score, gamesPlayed, improvement };
          }
        }
      }
    }

    return {
      mechanics: Array.from(mechanicSet.entries()).map(([id, name]) => ({ id, name })),
      contexts: Array.from(contextSet.entries()).map(([id, name]) => ({ id, name })),
      matrix: cellMap,
    };
  }, [data]);

  const handleCellClick = useCallback((mechId, ctxId) => {
    const key = `${mechId}__${ctxId}`;
    setExpandedCell(prev => prev === key ? null : key);
    onCellClick?.({ mechanicId: mechId, contextId: ctxId });
  }, [onCellClick]);

  const canBuildMatrix = mechanics.length > 0 && contexts.length > 0;

  if (!canBuildMatrix) {
    return (
      <GlassCard variant="default">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <BarChart3 size={20} className="text-brand-base" aria-hidden="true" />
          </div>
          <h3 className="text-base font-bold text-text-primary font-display">
            Matriz de Efectividad
          </h3>
        </div>
        <div className="h-40 flex items-center justify-center">
          <p className="text-sm text-text-muted text-center">
            No hay suficientes datos cruzados de contextos y mecanicas para generar la matriz.
            <br />
            Se necesitan partidas con distintas combinaciones.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <BarChart3 size={20} className="text-brand-base" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary font-display">
              Matriz de Efectividad
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Mecanica x Contexto - Clic en celda para detalles
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-success-base/30" aria-hidden="true" />
            {'>'}70% (Alto)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-warning-base/30" aria-hidden="true" />
            50-69% (Medio)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-error-base/30" aria-hidden="true" />
            {'<'}50% (Bajo)
          </span>
        </div>
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto custom-scrollbar -mx-1">
        <table className="w-full border-collapse min-w-[400px]">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-text-muted p-2 sticky left-0 bg-background-elevated/80 backdrop-blur-sm z-10 min-w-[120px]">
                Mecanica / Contexto
              </th>
              {contexts.map(ctx => (
                <th
                  key={ctx.id}
                  className="text-center text-xs font-medium text-text-muted p-2 min-w-[100px]"
                >
                  {ctx.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mechanics.map(mech => (
              <tr key={mech.id} className="border-t border-border-subtle/50">
                <td className="text-sm font-medium text-text-secondary p-2 sticky left-0 bg-background-elevated/80 backdrop-blur-sm z-10">
                  {mech.name}
                </td>
                {contexts.map(ctx => {
                  const key = `${mech.id}__${ctx.id}`;
                  const cellData = matrix[key] || {};
                  return (
                    <MatrixCell
                      key={key}
                      score={cellData.score}
                      gamesPlayed={cellData.gamesPlayed}
                      improvement={cellData.improvement}
                      isExpanded={expandedCell === key}
                      onClick={() => handleCellClick(mech.id, ctx.id)}
                      shouldReduceMotion={shouldReduceMotion}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

ContentEffectivenessMatrix.propTypes = {
  data: PropTypes.array,
  onCellClick: PropTypes.func,
};

export default memo(ContentEffectivenessMatrix);
