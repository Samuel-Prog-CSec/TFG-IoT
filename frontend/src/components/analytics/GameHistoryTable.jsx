import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, formatDate } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from '../ui/GlassCard';

/**
 * Badge de tier RAG para cada partida
 */
const TIER_BADGE = {
  excellent: { label: 'Excelente', className: 'bg-success-base/15 text-success-base' },
  good: { label: 'Bueno', className: 'bg-success-base/10 text-success-base/80' },
  average: { label: 'Medio', className: 'bg-warning-base/15 text-warning-base' },
  risk: { label: 'Bajo', className: 'bg-error-base/15 text-error-base' },
};

/**
 * Obtiene el tier de una partida segun su score
 */
const getGameTier = (score) => {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'average';
  return 'risk';
};

/**
 * Formatea milisegundos a formato legible (ej: "2m 30s")
 */
const formatDuration = (ms) => {
  if (!ms || ms <= 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
};

/**
 * Tabla de historial de partidas de un estudiante.
 * Muestra las ultimas partidas con score, accuracy, duracion, y badge RAG.
 * Soporta paginacion simple con "Ver mas".
 *
 * @param {Object} props
 * @param {Array} props.games - Partidas del endpoint /student/:id/summary (lastGames)
 * @param {number} [props.initialCount=10] - Numero de partidas visibles inicialmente
 */
function GameHistoryTable({ games, initialCount = 10 }) {
  const { shouldReduceMotion } = useReducedMotion();
  const [showAll, setShowAll] = useState(false);

  if (!Array.isArray(games) || games.length === 0) {
    return (
      <GlassCard variant="default" padding="none" className="p-5">
        <h3 className="text-base font-bold text-text-primary font-display mb-4">Historial de Partidas</h3>
        <div className="py-6 text-center">
          <Clock size={24} className="text-text-muted mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-text-muted">Este alumno aun no tiene partidas registradas.</p>
        </div>
      </GlassCard>
    );
  }

  const visibleGames = showAll ? games : games.slice(0, initialCount);
  const hasMore = games.length > initialCount;

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-text-primary font-display">Historial de Partidas</h3>
        <span className="text-xs text-text-muted bg-background-surface/50 px-2 py-1 rounded-lg">
          {games.length} partidas
        </span>
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm" aria-label="Historial de partidas del estudiante">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider pb-3 pr-3">Fecha</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider pb-3 pr-3">Contexto</th>
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider pb-3 pr-3">Mecanica</th>
              <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider pb-3 pr-3">Score</th>
              <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider pb-3 pr-3">Aciertos</th>
              <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider pb-3 hidden sm:table-cell">Duracion</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence>
              {visibleGames.map((game, index) => {
                const tier = getGameTier(game.score ?? 0);
                const badge = TIER_BADGE[tier];
                const accuracy = game.correctAttempts != null && game.totalAttempts > 0
                  ? Math.round((game.correctAttempts / game.totalAttempts) * 100)
                  : null;

                return (
                  <motion.tr
                    key={game.gameplayId || game._id || index}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: shouldReduceMotion ? 0 : Math.min(index * 0.03, 0.3) }}
                    className="border-b border-border-subtle/50 hover:bg-background-surface/30 transition-colors"
                  >
                    <td className="py-2.5 pr-3 text-text-secondary whitespace-nowrap">
                      {game.completedAt ? formatDate(new Date(game.completedAt), 'short') : '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-text-primary font-medium truncate max-w-[120px]">
                      {game.contextName || '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-text-secondary truncate max-w-[100px]">
                      {game.mechanicName || '—'}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className={cn("text-xs font-semibold px-1.5 py-0.5 rounded-md inline-block", badge.className)} aria-label={`Puntuacion ${Math.round(game.score ?? 0)}, nivel ${badge.label}`}>
                        {Math.round(game.score ?? 0)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-text-secondary tabular-nums">
                      {accuracy != null ? `${accuracy}%` : '—'}
                    </td>
                    <td className="py-2.5 text-right text-text-muted tabular-nums hidden sm:table-cell">
                      {formatDuration(game.completionTime)}
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-4 py-2.5 text-sm font-medium text-text-muted hover:text-text-primary flex items-center justify-center gap-1.5 transition-colors"
        >
          {showAll ? (
            <>Mostrar menos <ChevronUp size={14} /></>
          ) : (
            <>Ver todas ({games.length}) <ChevronDown size={14} /></>
          )}
        </button>
      )}
    </GlassCard>
  );
}

GameHistoryTable.propTypes = {
  games: PropTypes.arrayOf(PropTypes.shape({
    gameplayId: PropTypes.string,
    _id: PropTypes.string,
    score: PropTypes.number,
    correctAttempts: PropTypes.number,
    totalAttempts: PropTypes.number,
    completedAt: PropTypes.string,
    completionTime: PropTypes.number,
    contextName: PropTypes.string,
    mechanicName: PropTypes.string,
  })),
  initialCount: PropTypes.number,
};

export default memo(GameHistoryTable);
