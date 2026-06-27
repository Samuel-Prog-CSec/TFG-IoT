/**
 * @fileoverview Panel de gameplay para la mecánica de asociación.
 * Envuelve ChallengeDisplay con resolución de tema contextual
 * basada en el contenido del desafío actual.
 */

import { memo } from 'react';
import PropTypes from 'prop-types';
import ChallengeDisplay from './ChallengeDisplay';
import { resolveAssociationTheme } from './associationTheme';

const AssociationGameplayPanel = memo(function AssociationGameplayPanel({
  ref, challenge, paused, feedbackState, feedbackPoints, feedbackMessage, isTimeout
}) {
  const challengeKey = (challenge?.key || challenge?.value || '').toLowerCase();
  const contextTheme = resolveAssociationTheme(challengeKey);

  return (
    <ChallengeDisplay
      ref={ref}
      asset={challenge}
      revealed={!paused}
      contextTheme={contextTheme}
      feedbackState={feedbackState}
      feedbackPoints={feedbackPoints}
      feedbackMessage={feedbackMessage}
      isTimeout={isTimeout}
      // Reto capado a un ancho focalizado: en pantallas anchas (2K/4K) la
      // columna se ensancha para la rejilla de respuestas, pero la tarjeta del
      // reto se mantiene proporcionada (prompt focalizado sobre rejilla ancha)
      // en vez de estirarse con la imagen pequeña perdida en el centro.
      className="w-full max-w-3xl"
    />
  );
});

AssociationGameplayPanel.displayName = 'AssociationGameplayPanel';

AssociationGameplayPanel.propTypes = {
  challenge: PropTypes.object,
  paused: PropTypes.bool,
  feedbackState: PropTypes.oneOf(['idle', 'success', 'error']),
  feedbackPoints: PropTypes.number,
  feedbackMessage: PropTypes.string,
  isTimeout: PropTypes.bool
};

export default AssociationGameplayPanel;
