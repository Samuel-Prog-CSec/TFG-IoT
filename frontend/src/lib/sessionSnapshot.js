/**
 * @fileoverview Persistencia ligera del estado de partida en sessionStorage.
 *
 * Permite que un F5 accidental durante una partida se recupere de forma
 * inmediata: el componente GameSession lee el snapshot al montar (UI
 * preliminar pintada en <50 ms) mientras el servidor reconcilia el
 * estado canónico vía `play_state_sync` por Socket.IO.
 *
 * Ámbito sessionStorage (no localStorage): aislado por pestaña, se limpia
 * al cerrar la pestaña, no comparte estado entre pestañas distintas
 * (lo que evita conflictos entre dos sesiones simultáneas del profesor).
 *
 * @module lib/sessionSnapshot
 */

/**
 * Tiempo máximo de validez del snapshot. Pasados 10 min sin actualización,
 * preferimos pedir el estado canónico al servidor que arriesgar mostrar
 * datos obsoletos al alumno.
 */
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

/**
 * Prefijo para todas las claves de snapshot en sessionStorage.
 */
const KEY_PREFIX = 'rfid_game_snapshot_';

/**
 * Versión del esquema del snapshot. Si cambiamos la forma del estado
 * almacenado, incrementar para invalidar snapshots antiguos.
 */
const SNAPSHOT_SCHEMA_VERSION = 1;

const buildKey = (playId) => `${KEY_PREFIX}${playId}`;

/**
 * Devuelve el storage si está disponible (en SSR / tests sin window
 * podría no estarlo). Retorna `null` para no romper.
 *
 * @returns {Storage|null}
 */
const getStorage = () => {
  try {
    if (typeof globalThis === 'undefined') return null;
    return globalThis.sessionStorage || null;
  } catch {
    return null;
  }
};

/**
 * Persiste un snapshot del estado de partida.
 *
 * @param {string} playId
 * @param {Object} state Snapshot serializable del estado a guardar.
 * @returns {boolean} true si se persistió correctamente.
 */
export const saveSnapshot = (playId, state) => {
  if (!playId || !state) {
    return false;
  }
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  try {
    storage.setItem(
      buildKey(playId),
      JSON.stringify({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        state,
        savedAt: Date.now()
      })
    );
    return true;
  } catch {
    // Quota exceeded, sessionStorage deshabilitado en privado, etc.
    return false;
  }
};

/**
 * Carga un snapshot si existe y no ha expirado.
 *
 * @param {string} playId
 * @returns {Object|null} El estado guardado o null si no hay/expiró.
 */
export const loadSnapshot = (playId) => {
  if (!playId) return null;
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(buildKey(playId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
      typeof parsed.savedAt !== 'number'
    ) {
      storage.removeItem(buildKey(playId));
      return null;
    }
    if (Date.now() - parsed.savedAt > SNAPSHOT_TTL_MS) {
      storage.removeItem(buildKey(playId));
      return null;
    }
    return parsed.state || null;
  } catch {
    return null;
  }
};

/**
 * Elimina el snapshot de una partida concreta.
 *
 * @param {string} playId
 */
export const clearSnapshot = (playId) => {
  if (!playId) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(buildKey(playId));
  } catch {
    // No-op.
  }
};

/**
 * Limpia todos los snapshots vencidos. Útil al inicializar la app para
 * evitar acumular basura entre sesiones largas.
 *
 * @returns {number} Número de snapshots purgados.
 */
export const purgeExpiredSnapshots = () => {
  const storage = getStorage();
  if (!storage) return 0;
  let purged = 0;
  const keysToRemove = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      try {
        const raw = storage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        if (
          !parsed ||
          parsed.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
          typeof parsed.savedAt !== 'number' ||
          Date.now() - parsed.savedAt > SNAPSHOT_TTL_MS
        ) {
          keysToRemove.push(key);
        }
      } catch {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => {
      storage.removeItem(key);
      purged += 1;
    });
  } catch {
    return purged;
  }
  return purged;
};

export const __test__ = {
  SNAPSHOT_TTL_MS,
  KEY_PREFIX,
  SNAPSHOT_SCHEMA_VERSION
};
