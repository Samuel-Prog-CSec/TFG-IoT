/**
 * @fileoverview Estado mutable del ciclo de vida del servidor.
 *
 * Sincroniza dos señales entre el proceso de arranque/shutdown y los probes
 * HTTP de liveness/readiness:
 *
 * - `isReady`: el servidor está sirviendo tráfico. Empieza en `true` tras un
 *   arranque exitoso y pasa a `false` al primer instante del SIGTERM, antes
 *   de cerrar nada. Esto hace que Koyeb deje de enrutar conexiones nuevas
 *   inmediatamente y los clientes existentes drenen sus requests.
 *
 * - `isShuttingDown`: flag idempotente para evitar entrar dos veces al
 *   gracefulShutdown si llegan SIGTERM y SIGINT seguidos. También permite
 *   a middlewares/handlers responder con 503 desde el momento exacto en que
 *   empieza el cierre.
 *
 * No es un EventEmitter ni un store complejo: dos flags y sus getters/setters.
 * Si en el futuro necesitamos coordinar más estado (rolling restart, draining
 * por endpoint), se amplía aquí.
 *
 * @module utils/serverState
 */

let isReady = true;
let isShuttingDown = false;

/**
 * Marca el servidor como listo o no listo para tráfico.
 * Útil tras detectar pérdida prolongada de dependencias (Mongo/Redis) o al
 * iniciar el shutdown.
 * @param {boolean} value
 */
const setReady = value => {
  isReady = Boolean(value);
};

/**
 * Indica si el servidor está sirviendo tráfico.
 * @returns {boolean}
 */
const getIsReady = () => isReady;

/**
 * Marca el servidor como en proceso de shutdown.
 * Idempotente: llamar dos veces no provoca efectos colaterales.
 * @param {boolean} value
 */
const setShuttingDown = value => {
  isShuttingDown = Boolean(value);
};

/**
 * Indica si el shutdown ya ha sido iniciado.
 * @returns {boolean}
 */
const getIsShuttingDown = () => isShuttingDown;

/**
 * Resetea los flags al estado inicial. Sólo usar en tests para evitar leaks
 * de estado entre suites.
 */
const __resetForTests = () => {
  isReady = true;
  isShuttingDown = false;
};

module.exports = {
  setReady,
  getIsReady,
  setShuttingDown,
  getIsShuttingDown,
  __resetForTests
};
