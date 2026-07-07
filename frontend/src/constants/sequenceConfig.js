/**
 * @fileoverview Constantes compartidas de la mecánica Secuencia (frontend).
 * Espejo de `backend/src/constants/enums.js#SEQUENCE_DIFFICULTY_RULES`.
 */

export const SEQUENCE_DEFAULTS = Object.freeze({
  minSequenceLength: 3,
  maxSequenceLength: 5,
  displaySeconds: 3,
  numberOfRounds: 5
});

export const SEQUENCE_LIMITS = Object.freeze({
  minSequenceLength: 3,
  maxSequenceLength: 7,
  minDisplaySeconds: 2,
  maxDisplaySeconds: 8,
  minTimeLimit: 5,
  maxTimeLimit: 180,
  minNumberOfRounds: 1,
  maxNumberOfRounds: 20
});

/**
 * Reglas por dificultad de Secuencia. Replica las del backend para que el
 * wizard pueda mostrar tooltips coherentes sin esperar a la API.
 */
export const SEQUENCE_DIFFICULTY_RULES = Object.freeze({
  easy: Object.freeze({
    label: 'Fácil',
    maxAttemptsPerCard: 3,
    hintsEnabled: true,
    hintLevels: ['partial', 'full'],
    description:
      'Hasta 3 intentos por carta. Tras el 1er fallo se da una pista parcial; tras el 2º, la palabra completa.'
  }),
  medium: Object.freeze({
    label: 'Medio',
    maxAttemptsPerCard: 2,
    hintsEnabled: false,
    description: 'Hasta 2 intentos por carta. Sin pistas; al 2º fallo la carta queda bloqueada.'
  }),
  hard: Object.freeze({
    label: 'Difícil',
    maxAttemptsPerCard: 1,
    hintsEnabled: false,
    description: 'Un único intento por carta. Si falla, queda bloqueada.'
  })
});

/** Estados internos de cada carta dentro de la ronda. */
export const SEQUENCE_CARD_STATES = Object.freeze({
  HIDDEN: 'hidden',
  CORRECT: 'correct',
  BLOCKED: 'blocked',
  TIMED_OUT: 'timedOut'
});

/** Fases intra-ronda (espejan SEQUENCE_PHASE del backend). */
export const SEQUENCE_PHASES = Object.freeze({
  MEMORIZING: 'memorizing',
  REPRODUCING: 'reproducing',
  COMPLETED: 'completed'
});
