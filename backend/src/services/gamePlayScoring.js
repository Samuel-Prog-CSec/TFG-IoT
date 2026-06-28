/**
 * @fileoverview Cálculo puro del techo de puntuación (`maxScore`) de una partida.
 *
 * Extraído de `gamePlayService.createPlay` (ADR-114) para hacerlo testeable y
 * eliminar la detección frágil "por huella de datos". Usa el campo explícito
 * `session.mechanicType`; si falta (sesiones legacy aún sin migrar) infiere el
 * tipo por la huella de planes, manteniendo el orden correcto
 * Secuencia -> Asociación -> Memoria. Asociación TAMBIÉN persiste `boardLayout`,
 * así que NO puede distinguirse de Memoria por el tablero: su huella propia es
 * `associationChallengePlan` y debe comprobarse antes (origen del bug ALTO que
 * mostraba "30/30 = 100%" en partidas de Asociación jugadas en vivo).
 */

/** Tipos base de mecánica (denormalizados desde GameMechanic.name). */
const MECHANIC_TYPES = Object.freeze({
  ASSOCIATION: 'association',
  SEQUENCE: 'sequence',
  MEMORY: 'memory'
});

const MEMORY_GROUP_SIZE = 2;

/**
 * Infiere el tipo de mecánica por la presencia de planes (fallback legacy).
 *
 * @param {Object} session
 * @returns {string|null} uno de MECHANIC_TYPES o null si no hay huella.
 */
function inferMechanicTypeFromShape(session) {
  const sequencePlan = Array.isArray(session.sequencePlan) ? session.sequencePlan : [];
  const associationPlan = Array.isArray(session.associationChallengePlan)
    ? session.associationChallengePlan
    : [];
  const boardLayout = Array.isArray(session.boardLayout) ? session.boardLayout : [];
  const totalSequenceCards = sequencePlan.reduce((acc, r) => acc + (Number(r.length) || 0), 0);

  if (totalSequenceCards > 0) {
    return MECHANIC_TYPES.SEQUENCE;
  }
  if (associationPlan.length > 0) {
    return MECHANIC_TYPES.ASSOCIATION;
  }
  if (boardLayout.length > 0) {
    return MECHANIC_TYPES.MEMORY;
  }
  return null;
}

/**
 * Normaliza un nombre de mecánica (GameMechanic.name) a uno de los tipos base
 * conocidos, o null si no lo es (mecánicas custom o de prueba). Evita asignar a
 * `GameSession.mechanicType` un valor fuera del enum; para esos casos el campo
 * queda sin establecer y el scoring cae al fallback por huella.
 *
 * @param {string} name
 * @returns {string|null}
 */
function toMechanicType(name) {
  const normalized = String(name || '')
    .toLowerCase()
    .trim();
  return Object.values(MECHANIC_TYPES).includes(normalized) ? normalized : null;
}

/**
 * Calcula el techo de puntuación teórico de una sesión.
 *
 * Es el límite absoluto del score (el pre-validate del modelo GamePlay clampa
 * cualquier $inc que lo supere). Fórmula por tipo:
 *  - Secuencia: Σ longitud de cada ronda × pointsPerCorrect.
 *  - Asociación: numberOfRounds × pointsPerCorrect.
 *  - Memoria: (boardLayout.length / 2) × pointsPerCorrect (parejas).
 *
 * @param {Object} session - Objeto/documento de sesión con `mechanicType`,
 *   `config` y los planes específicos. Si `mechanicType` no es válido se infiere
 *   por huella; si tampoco hay huella, fallback genérico rondas × puntos.
 * @returns {number} maxScore (mínimo 1).
 */
function computeMaxScore(session) {
  const rounds = Number(session.config?.numberOfRounds) || 1;
  const points = Number(session.config?.pointsPerCorrect) || 10;
  const known = Object.values(MECHANIC_TYPES);
  const mechanicType = known.includes(session.mechanicType)
    ? session.mechanicType
    : inferMechanicTypeFromShape(session);

  switch (mechanicType) {
    case MECHANIC_TYPES.SEQUENCE: {
      const plan = Array.isArray(session.sequencePlan) ? session.sequencePlan : [];
      const total = plan.reduce((acc, r) => acc + (Number(r.length) || 0), 0);
      return Math.max(1, total * points);
    }
    case MECHANIC_TYPES.ASSOCIATION:
      return Math.max(1, rounds * points);
    case MECHANIC_TYPES.MEMORY: {
      const board = Array.isArray(session.boardLayout) ? session.boardLayout : [];
      // El nº de grupos depende de `matchingGroupSize` (la estrategia usa
      // `Math.max(2, …)`). Hardcodear ÷2 sobreestimaba `maxScore` con tríos
      // (groupSize=3): una partida perfecta de tríos nunca llegaba al 100%
      // (techo real ⌊N/3⌋·pts, no ⌊N/2⌋·pts). Latente hoy (seeder usa 2), pero
      // la estrategia y el board ya soportan ≥3. Si `mechanicId` no está poblado,
      // cae a 2.
      const groupSize = Math.max(
        MEMORY_GROUP_SIZE,
        Number(session.mechanicId?.rules?.behavior?.matchingGroupSize) || MEMORY_GROUP_SIZE
      );
      const groups = Math.max(1, Math.floor(board.length / groupSize));
      return Math.max(1, groups * points);
    }
    default:
      return Math.max(1, rounds * points);
  }
}

module.exports = { computeMaxScore, inferMechanicTypeFromShape, toMechanicType, MECHANIC_TYPES };
