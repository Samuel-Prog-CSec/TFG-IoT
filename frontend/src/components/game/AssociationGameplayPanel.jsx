/**
 * @fileoverview Panel de gameplay para la mecánica de asociación.
 * Envuelve ChallengeDisplay con resolución de tema contextual
 * basada en el contenido del desafío actual.
 */

import { memo } from 'react';
import PropTypes from 'prop-types';
import ChallengeDisplay from './ChallengeDisplay';

/**
 * Resuelve un tema visual basado en el valor del desafío.
 * Utilizado para contextualizar colores/iconos del ChallengeDisplay.
 */
function resolveAssociationTheme(challengeValue) {
  const challengeKey = (challengeValue || '').toLowerCase();

  if (challengeKey.includes('animal')) {
    return 'animals';
  }

  if (challengeKey.includes('color')) {
    return 'colors';
  }

  if (challengeKey.includes('número') || challengeKey.includes('numero')) {
    return 'numbers';
  }

  return 'default';
}

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
      className="w-full"
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
