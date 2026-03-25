/**
 * @fileoverview Wrapper para handlers async de Express.
 * Captura errores de funciones async y los delega al errorHandler centralizado.
 *
 * En Express 5.x los route handlers async propagan errores automáticamente,
 * pero asyncHandler aporta valor como:
 * - Safety net explícito para middlewares custom donde Express 5 no garantiza la captura
 * - Marcador visual de intención en el código
 * - Captura de errores síncronos lanzados dentro de funciones async
 *
 * @module utils/asyncHandler
 * @see https://expressjs.com/en/guide/error-handling.html
 */

/**
 * Envuelve un handler/middleware async para capturar errores automáticamente.
 *
 * @param {Function} fn - Handler async de Express (req, res, next) => Promise<void>
 * @returns {Function} Handler envuelto con captura de errores
 *
 * @example
 * // En rutas:
 * router.get('/items', asyncHandler(getItems));
 *
 * // En controllers (sin try/catch):
 * const getItems = async (req, res) => {
 *   const items = await repository.findAll();
 *   res.json({ success: true, data: items });
 * };
 */
const asyncHandler = fn => (req, res, next) => {
  try {
    Promise.resolve(fn(req, res, next)).catch(next);
  } catch (error) {
    next(error);
  }
};

module.exports = asyncHandler;
