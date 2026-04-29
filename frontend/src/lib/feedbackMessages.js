/**
 * @fileoverview Pools de mensajes de feedback y selector contextual.
 * Los mensajes están en español para el público objetivo (niños en regiones hispanohablantes).
 *
 * @module lib/feedbackMessages
 */

// --- SUCCESS ---
const SUCCESS_DEFAULT = [
  '¡Genial!', '¡Bravo!', '¡Excelente!', '¡Fantástico!',
  '¡Eso es!', '¡Perfecto!', '¡Increíble!', '¡Muy bien!',
  '¡Bien hecho!', '¡Lo lograste!'
];

const SUCCESS_STREAK_3 = [
  '¡Racha de 3!', '¡Tres seguidas!', '¡Imparable!',
  '¡Sigue así!', '¡Vas volando!'
];

const SUCCESS_STREAK_5 = [
  '¡Racha de 5!', '¡Eres una estrella!', '¡Nadie te para!',
  '¡Eres genial!', '¡Lo haces súper!'
];

const SUCCESS_STREAK_10 = [
  '¡ERES INCREÍBLE!', '¡Imbatible!', '¡No paras!'
];

const SUCCESS_LAST_ROUND = [
  '¡Última y buena!', '¡Final perfecto!', '¡Gran cierre!'
];

const SUCCESS_TIME_PRESSURE = [
  '¡Justo a tiempo!', '¡Por los pelos!', '¡En el último segundo!'
];

// --- ERROR ---
const ERROR_DEFAULT = [
  '¡Casi!', '¡Sigue intentando!', '¡Tú puedes!', '¡Otra vez!',
  '¡No pasa nada!', '¡Vamos de nuevo!', '¡Ánimo!',
  '¡La próxima!', '¡A por ello!'
];

const ERROR_STREAK_BROKEN = [
  '¡Ups! No pasa nada', '¡Tranqui, sigue así!',
  '¡No pasa nada, sigue!', '¡Ánimo, ibas genial!'
];

const ERROR_MULTIPLE_FAILS = [
  '¡Piensa bien!', '¡Mira con calma!', '¡Fíjate bien!',
  '¡Tómate tu tiempo!', '¡Paso a paso!'
];

const ERROR_TIMEOUT = [
  '¡Se acabó el tiempo!', '¡Más rápido la próxima!',
  '¡El tiempo vuela!'
];

// --- MEMORY-SPECIFIC ---
const MEMORY_MATCH = [
  '¡Pareja encontrada!', '¡Buena memoria!', '¡Son iguales!',
  '¡Las encontraste!', '¡Ojo de lince!'
];

const MEMORY_ALMOST_DONE = [
  '¡Ya casi!', '¡Queda poco!', '¡Última recta!'
];

const MEMORY_MISMATCH = [
  '¡Intenta recordar!', '¡Casi iguales!', '¡Fíjate bien!'
];

const MEMORY_MANY_ATTEMPTS = [
  '¡Concéntrate!', '¡Recuerda las posiciones!', '¡Tú puedes!'
];

/**
 * Pick a random message from a pool, avoiding recent repetitions.
 * @param {string[]} pool
 * @param {Set<string>} recentMessages - Last N messages shown
 * @returns {string}
 */
function pickFromPool(pool, recentMessages) {
  const available = pool.filter(msg => !recentMessages.has(msg));
  const finalPool = available.length > 0 ? available : pool;
  // eslint-disable-next-line sonarjs/pseudo-random -- seleccion aleatoria de mensaje de feedback, no requiere seguridad criptografica
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

/**
 * Select the most appropriate feedback message based on game context.
 *
 * @param {Object} context
 * @param {boolean} context.isCorrect
 * @param {boolean} [context.isTimeout]
 * @param {number} context.streak - Current streak (already updated for this result)
 * @param {number} [context.previousStreak] - Streak before this result
 * @param {number} [context.totalErrors]
 * @param {number} [context.currentRound]
 * @param {number} [context.totalRounds]
 * @param {number} [context.timeLeft] - Seconds remaining
 * @param {number} [context.timeLimit] - Total seconds per round
 * @param {boolean} [context.isMemoryMode]
 * @param {number} [context.matchedCount]
 * @param {number} [context.totalCards]
 * @param {number} [context.attempts]
 * @param {Set<string>} [context.recentMessages] - Last 3 messages shown
 * @returns {string}
 */
// Selecciona pool de mensajes para respuestas correctas (acierto) segun contexto de juego.
function selectSuccessPool(context) {
  const {
    streak = 0, currentRound = 1, totalRounds = 1,
    timeLeft = Infinity, timeLimit = 30,
    isMemoryMode = false, matchedCount = 0, totalCards = 0
  } = context;

  if (isMemoryMode) {
    const totalPairs = Math.max(1, Math.ceil(totalCards / 2));
    const matchedPairs = Math.floor(matchedCount / 2);
    return matchedPairs / totalPairs > 0.75 ? MEMORY_ALMOST_DONE : MEMORY_MATCH;
  }
  if (streak >= 10) return SUCCESS_STREAK_10;
  if (streak >= 5) return SUCCESS_STREAK_5;
  if (streak >= 3) return SUCCESS_STREAK_3;
  if (currentRound >= totalRounds) return SUCCESS_LAST_ROUND;
  if (Number.isFinite(timeLimit) && timeLimit > 0 && timeLeft <= timeLimit * 0.2) {
    return SUCCESS_TIME_PRESSURE;
  }
  return SUCCESS_DEFAULT;
}

// Selecciona pool de mensajes para respuestas incorrectas o timeout.
function selectErrorPool(context) {
  const {
    isTimeout = false, previousStreak = 0, totalErrors = 0,
    isMemoryMode = false, attempts = 0, totalCards = 0
  } = context;

  if (isTimeout) return ERROR_TIMEOUT;
  if (isMemoryMode) {
    return attempts > totalCards * 1.5 ? MEMORY_MANY_ATTEMPTS : MEMORY_MISMATCH;
  }
  if (previousStreak >= 3) return ERROR_STREAK_BROKEN;
  if (totalErrors >= 3) return ERROR_MULTIPLE_FAILS;
  return ERROR_DEFAULT;
}

export function selectFeedbackMessage(context) {
  const { isCorrect, recentMessages = new Set() } = context;
  const pool = isCorrect ? selectSuccessPool(context) : selectErrorPool(context);
  return pickFromPool(pool, recentMessages);
}
