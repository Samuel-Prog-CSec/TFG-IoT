/**
 * @fileoverview Panel de gameplay para la mecánica de memoria.
 * Envuelve el tablero — el progreso de parejas vive ya en los dots del header
 * y en los corazones superiores del propio tablero (MemoryBoard), por lo que
 * se elimina la barra de estadísticas textual que duplicaba esa información
 * y robaba altura vertical necesaria para que el tablero quepa en viewport.
 */

import { memo } from 'react';
import PropTypes from 'prop-types';
import MemoryBoard from './MemoryBoard';

/**
 * Skeleton del tablero mientras el backend confirma `board_ready` tras
 * `startPlay`. Antes la UI mostraba un frame vacio durante ~500-1000ms entre
 * la entrada a /game y la llegada del primer `memory_turn_state`. Ahora se
 * pinta una cuadricula placeholder con shimmer para que la pantalla no
 * aparezca en blanco (QA 22/04/2026).
 */
function MemoryBoardSkeleton() {
  const slots = Array.from({ length: 12 }, (_, i) => `mem-skeleton-slot-${i}`);
  return (
    <output
      className="block w-full h-full flex flex-col items-center justify-center"
      aria-label="Preparando tablero de memoria"
    >
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 w-full max-w-2xl auto-rows-fr">
        {slots.map((slotKey) => (
          <div
            key={slotKey}
            className="aspect-square rounded-xl bg-gradient-to-br from-brand-base/10 to-accent-indigo/10 border border-border-subtle relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-text-primary/5 to-transparent animate-[shimmer_2s_infinite]" />
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-text-muted">Preparando cartas…</p>
    </output>
  );
}

const MemoryGameplayPanel = memo(function MemoryGameplayPanel({
  board, feedbackState, feedbackPoints, feedbackMessage, onCardTap
}) {
  const boardReady = Array.isArray(board) && board.length > 0;
  return (
    <div className="w-full h-full flex flex-col relative">
      {boardReady ? (
        <MemoryBoard
          board={board}
          feedbackState={feedbackState}
          feedbackPoints={feedbackPoints}
          feedbackMessage={feedbackMessage}
          onCardTap={onCardTap}
        />
      ) : (
        <MemoryBoardSkeleton />
      )}
    </div>
  );
});

MemoryGameplayPanel.displayName = 'MemoryGameplayPanel';

MemoryGameplayPanel.propTypes = {
  board: PropTypes.array,
  feedbackState: PropTypes.oneOf(['idle', 'success', 'error']),
  feedbackPoints: PropTypes.number,
  feedbackMessage: PropTypes.string,
  onCardTap: PropTypes.func
};

export default MemoryGameplayPanel;
