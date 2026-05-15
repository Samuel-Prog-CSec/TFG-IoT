/**
 * @fileoverview Wrapper sobre IndexedDB para persistir scans RFID pendientes
 * de reenviar al servidor durante desconexiones largas o tras un F5
 * accidental del profesor.
 *
 * Diseño minimalista (sin librerías externas tipo `idb`) para evitar añadir
 * dependencias frontend. La API es promesa-based y todos los errores
 * son atrapados — IndexedDB no debe romper la app si está deshabilitado
 * (modo incógnito, navegador antiguo, cuota agotada).
 *
 * @module lib/pendingScansStore
 */

const DB_NAME = 'rfid_game_db';
const DB_VERSION = 1;
const STORE_NAME = 'pendingScans';

/**
 * TTL por defecto para purgar entries antiguos. Más allá de este tiempo
 * un scan probablemente es ya irrelevante (sesión terminada, modo cambiado).
 */
const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * Devuelve la API IndexedDB del entorno o null si no está disponible.
 */
const getIDB = () => {
  if (typeof globalThis === 'undefined') return null;
  return globalThis.indexedDB || null;
};

/**
 * Promisifica una IDBRequest.
 */
const promisifyRequest = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * Abre (o crea) la base de datos. Idempotente: cada llamada abre una nueva
 * conexión que se cierra al completar la transacción del caller.
 *
 * @returns {Promise<IDBDatabase|null>}
 */
const openDB = () => {
  const idb = getIDB();
  if (!idb) return Promise.resolve(null);

  return new Promise((resolve) => {
    let request;
    try {
      request = idb.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
};

/**
 * Helper para ejecutar una operación de IDB en una transacción.
 *
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => Promise<*>|*} callback
 * @returns {Promise<*>}
 */
const withStore = async (mode, callback) => {
  const db = await openDB();
  if (!db) {
    return mode === 'readonly' ? [] : null;
  }
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await callback(store);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } catch {
    return mode === 'readonly' ? [] : null;
  } finally {
    db.close();
  }
};

/**
 * Añade un scan pendiente al store. Devuelve la id autogenerada o null.
 *
 * @param {Object} payload Payload normalizado del evento RFID.
 * @returns {Promise<number|null>}
 */
export const add = async (payload) => {
  if (!payload) return null;
  return withStore('readwrite', async (store) => {
    const request = store.add({
      payload,
      queuedAt: Date.now(),
      sensorId: payload.sensorId || null
    });
    return promisifyRequest(request);
  });
};

/**
 * Devuelve todos los scans persistidos.
 *
 * @returns {Promise<Array<{id:number, payload:Object, queuedAt:number}>>}
 */
export const getAll = async () => {
  const result = await withStore('readonly', (store) => promisifyRequest(store.getAll()));
  return Array.isArray(result) ? result : [];
};

/**
 * Borra una entrada por id.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export const remove = async (id) => {
  if (id === undefined || id === null) return;
  await withStore('readwrite', (store) => promisifyRequest(store.delete(id)));
};

/**
 * Elimina entradas más antiguas que `ttlMs` (default 10 min).
 *
 * @param {number} [ttlMs]
 * @returns {Promise<number>} Número de entradas purgadas.
 */
export const purgeOlderThan = async (ttlMs = DEFAULT_TTL_MS) => {
  const cutoff = Date.now() - ttlMs;
  const entries = await getAll();
  const old = entries.filter((entry) => entry.queuedAt < cutoff);
  await Promise.all(old.map((entry) => remove(entry.id)));
  return old.length;
};

/**
 * Vacía por completo el store. Útil al cerrar sesión o desinstalar.
 *
 * @returns {Promise<void>}
 */
export const clear = async () => {
  await withStore('readwrite', (store) => promisifyRequest(store.clear()));
};

export const __test__ = { DB_NAME, STORE_NAME, DEFAULT_TTL_MS };
