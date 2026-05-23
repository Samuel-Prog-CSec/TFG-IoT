/**
 * @fileoverview D.2 (pre-v1.0.0) — Deduplicación de requests in-flight.
 *
 * Cuando dos componentes piden el mismo endpoint en paralelo (típico:
 * `AuthContext.checkExistingSession` + `AppLayout.useEffect` ambos
 * llamando a `getProfile`), Axios no deduplica automáticamente —
 * ambos disparan al backend y duplican el coste Atlas + Upstash.
 *
 * Este helper mantiene un `Map<key, Promise>` de promesas en vuelo. Si
 * dos callers piden la misma `key` antes de que la primera resuelva,
 * la segunda reutiliza la promesa existente. Tras settle (resolve o
 * reject), la entrada se elimina del Map para que la siguiente llamada
 * sí dispare un fetch nuevo.
 *
 * Restricciones:
 *   - Solo para GET. POST/PUT/DELETE NO se deduplican (efectos
 *     secundarios). El helper no es genérico para mutations.
 *   - Aplicar selectivamente a 2-3 endpoints calientes (getProfile,
 *     getContexts, getMechanics) — NO blanket policy.
 *   - Si el caller pasa `{ signal }` y aborta, la promesa interna NO
 *     se cancela (otros callers podrían depender de ella). El caller
 *     recibe AbortError si abortó, los demás reciben el resultado real.
 *
 * @module services/inFlight
 */

const inFlightMap = new Map();

/**
 * Deduplica una llamada async.
 *
 * Pattern de uso:
 * ```js
 * import { dedupRequest } from '../services/inFlight';
 *
 * const getProfile = (config) =>
 *   dedupRequest('getProfile', () => authAPI.getProfile(config));
 * ```
 *
 * @template T
 * @param {string} key - Identificador único del request. Suele ser
 *   `endpoint + JSON.stringify(params)`.
 * @param {() => Promise<T>} fetchFn - Función que dispara el fetch real.
 *   Solo se invoca si no hay promesa en vuelo para esta key.
 * @returns {Promise<T>}
 */
export const dedupRequest = (key, fetchFn) => {
  if (inFlightMap.has(key)) {
    return inFlightMap.get(key);
  }
  const promise = fetchFn().finally(() => {
    // Eliminar entrada al settle (sea resolve o reject) para que la
    // siguiente invocación sí dispare un fetch nuevo. Sin esto, una
    // request fallida quedaría "envenenando" todas las futuras.
    inFlightMap.delete(key);
  });
  inFlightMap.set(key, promise);
  return promise;
};

/**
 * Helper de testing — limpia el Map. NO usar en código de producción.
 */
export const __clearInFlightForTests = () => {
  inFlightMap.clear();
};

/**
 * Snapshot de claves activas — útil para debugging y telemetría.
 *
 * @returns {string[]}
 */
export const getInFlightKeys = () => [...inFlightMap.keys()];
