/**
 * @fileoverview Helpers para crear child loggers con contexto de partida.
 *
 * T-904 Fase B: los campos `playId`, `sessionId`, `userId` y `mechanic` se
 * promueven a **labels Loki** vía la opción `propsToLabels` del transport
 * (ver `logger.js`), permitiendo queries LogQL del tipo:
 *
 *   {app="eduplay-rfid", env="staging"} | json | playId="<id>"
 *
 * En paralelo, esos mismos campos se exponen como **atributos de span Sentry**
 * en los wrappers `Sentry.startSpan` distribuidos por GameEngine/socket/etc.
 *
 * Reglas:
 * - Pasar siempre valores escalares (`String(...)` aplicado por el helper).
 * - Campos `undefined`/`null` se omiten — Pino los serializaría como `null` si no.
 * - Este helper NO crea logger nuevo; reutiliza el child del logger padre.
 *
 * @module utils/loggerContext
 */

/**
 * @typedef {Object} PlayContext
 * @property {string} [playId]
 * @property {string} [sessionId]
 * @property {string} [userId]
 * @property {string} [mechanic] Código de mecánica (`association`, `memory`, `sequence`).
 */

/**
 * Devuelve un child logger enriquecido con los campos de contexto de partida.
 *
 * @param {import('pino').Logger} parentLogger Logger Pino padre.
 * @param {PlayContext} [context={}] Campos a añadir como bindings.
 * @returns {import('pino').Logger}
 */
function withPlayContext(parentLogger, context = {}) {
  if (!parentLogger || typeof parentLogger.child !== 'function') {
    throw new TypeError('withPlayContext: parentLogger debe exponer child().');
  }

  const bindings = {};
  if (context.playId !== undefined && context.playId !== null) {
    bindings.playId = String(context.playId);
  }
  if (context.sessionId !== undefined && context.sessionId !== null) {
    bindings.sessionId = String(context.sessionId);
  }
  if (context.userId !== undefined && context.userId !== null) {
    bindings.userId = String(context.userId);
  }
  if (context.mechanic) {
    bindings.mechanic = String(context.mechanic);
  }

  return parentLogger.child(bindings);
}

module.exports = {
  withPlayContext
};
