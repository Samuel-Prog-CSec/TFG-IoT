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

const MemoryGameplayPanel = memo(function MemoryGameplayPanel({
  board, feedbackState, feedbackPoints, feedbackMessage, onCardTap
}) {
  return (
    <div className="w-full h-full flex flex-col relative">
      <MemoryBoard
        board={board}
        feedbackState={feedbackState}
        feedbackPoints={feedbackPoints}
        feedbackMessage={feedbackMessage}
        onCardTap={onCardTap}
      />
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
