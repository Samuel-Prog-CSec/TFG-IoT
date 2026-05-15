/**
 * @fileoverview Constantes compartidas de la mecánica Asociación (frontend).
 * Espejo de `backend/seeders/03-mechanics.js` (mecánica `association`).
 *
 * El slider de "Tiempo por ronda" en `StepRules.jsx` antes tenía un
 * `max=180` hardcodeado genérico — pero el backend valida contra
 * `mechanic.rules.limits.maxTimeLimit` que en Asociación es 60s. Resultado:
 * el docente podía mover el slider hasta 180 y al guardar recibía 400
 * "timeLimit debe ser <= 60 para la mecánica association". Estos límites
 * centralizan la verdad pedagógica de la mecánica.
 */

export const ASSOCIATION_LIMITS = Object.freeze({
  minTimeLimit: 5,
  maxTimeLimit: 60,
  minNumberOfRounds: 1,
  maxNumberOfRounds: 20,
  minCards: 2,
  maxCards: 20,
  minPointsPerCorrect: 5,
  maxPointsPerCorrect: 15,
  minPenaltyPerError: -5,
  maxPenaltyPerError: 0
});
