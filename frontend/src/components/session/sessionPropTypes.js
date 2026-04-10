/**
 * @fileoverview PropTypes compartidos para los componentes del wizard de sesion.
 *
 * @module components/session/sessionPropTypes
 */

import PropTypes from 'prop-types';

export const cardMappingShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  uid: PropTypes.string,
  assignedValue: PropTypes.string,
  displayData: PropTypes.object
});

export const deckShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  name: PropTypes.string,
  cardsCount: PropTypes.number,
  cards: PropTypes.array,
  cardMappings: PropTypes.arrayOf(cardMappingShape),
  context: PropTypes.shape({ name: PropTypes.string }),
  contextId: PropTypes.shape({ name: PropTypes.string })
});

export const mechanicShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  name: PropTypes.string,
  displayName: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.string
});

export const configShape = PropTypes.shape({
  numberOfRounds: PropTypes.number,
  timeLimit: PropTypes.number,
  pointsPerCorrect: PropTypes.number,
  penaltyPerError: PropTypes.number
});

export const challengePlanItemShape = PropTypes.shape({
  roundNumber: PropTypes.number,
  uid: PropTypes.string,
  assignedValue: PropTypes.string,
  displayData: PropTypes.object,
  promptText: PropTypes.string
});
