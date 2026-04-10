/**
 * @fileoverview Panel de gameplay para la mecánica de memoria.
 * Muestra la barra de estadísticas (intentos/parejas) con feedback
 * reactivo y el tablero de memoria.
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import MemoryBoard from './MemoryBoard';

const MemoryGameplayPanel = memo(function MemoryGameplayPanel({
  board, attempts, matchedCount, totalCards,
  feedbackState, feedbackPoints, feedbackMessage, onCardTap
}) {
  const totalPairs = Math.max(1, Math.ceil(Number(totalCards || 0) / 2));
  const matchedPairs = Math.max(0, Math.floor(Number(matchedCount || 0) / 2));
  const isSuccess = feedbackState === 'success';
  const isError = feedbackState === 'error';

  return (
    <div className="w-full space-y-4 relative">
      {/* Barra de estadísticas con feedback reactivo */}
      <div className="mx-auto max-w-4xl rounded-xl border border-border-default bg-background-base/40 px-4 py-3 text-sm text-text-secondary flex flex-wrap items-center justify-between gap-3">
        <motion.span
          // TOKEN-EXCEPTION: Framer Motion color interpolation requires direct color values
          animate={isError ? { color: ['#e2e8f0', '#fb7185', '#e2e8f0'] } : {}}
          transition={{ duration: 0.6 }}
        >
          Intentos: <strong>{attempts}</strong>
        </motion.span>
        <motion.span
          // TOKEN-EXCEPTION: Framer Motion color interpolation requires direct color values
          animate={isSuccess ? { color: ['#e2e8f0', '#34d399', '#e2e8f0'] } : {}}
          transition={{ duration: 0.6 }}
        >
          Parejas encontradas: <strong>{matchedPairs}/{totalPairs}</strong>
        </motion.span>
      </div>
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
  attempts: PropTypes.number,
  matchedCount: PropTypes.number,
  totalCards: PropTypes.number,
  feedbackState: PropTypes.oneOf(['idle', 'success', 'error']),
  feedbackPoints: PropTypes.number,
  feedbackMessage: PropTypes.string,
  onCardTap: PropTypes.func
};

export default MemoryGameplayPanel;
