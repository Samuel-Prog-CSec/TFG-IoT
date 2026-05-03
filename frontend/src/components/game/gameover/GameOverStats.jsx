/**
 * @fileoverview Compositor que delega el render de stats al sub-componente
 * adecuado según `summary.mode`.
 *
 * `GameOverScreen.jsx` mantiene la celebración común (estrellas, score,
 * confetti, botones); este compositor se encarga sólo del bloque de stats
 * para que cada mecánica defina libremente sus métricas e iconos.
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import GameOverStatsAssociation from './GameOverStatsAssociation';
import GameOverStatsMemory from './GameOverStatsMemory';
import GameOverStatsSequence from './GameOverStatsSequence';

function GameOverStats({ summary, totalRounds, correctAnswers }) {
  if (summary?.mode === 'memory') {
    return <GameOverStatsMemory summary={summary} />;
  }
  if (summary?.mode === 'sequence') {
    return <GameOverStatsSequence summary={summary} />;
  }
  return (
    <GameOverStatsAssociation
      summary={summary}
      totalRounds={totalRounds}
      correctAnswers={correctAnswers}
    />
  );
}

GameOverStats.propTypes = {
  summary: PropTypes.object,
  totalRounds: PropTypes.number,
  correctAnswers: PropTypes.number
};

export default memo(GameOverStats);
