/**
 * @fileoverview Resolución central del identificador de una entidad de dominio.
 *
 * El backend expone los DTO con `id` Y `_id`; mezclarlos provocaba bugs
 * recurrentes (etiquetas "Desconocido" por `.find(x => x._id === filtro)` que no
 * casaba al exponer el DTO `id`, o comparaciones `undefined === undefined`
 * dando true). `getId` unifica el orden (id primero, _id de respaldo) y
 * `sameId`/`findById` comparan con guardas de verdad.
 *
 * No cubre campos semánticos propios (`studentId`, `contextId`, `uid`,
 * `sensorId`): esos identifican por un criterio distinto al de la ambigüedad
 * Mongoose `_id` vs DTO `id` y se resuelven explícitamente en su sitio.
 *
 * @module lib/entityId
 */

/**
 * Identificador normalizado de una entidad (string) o null.
 * @param {object|null|undefined} entity
 * @returns {string|null}
 */
export function getId(entity) {
  if (!entity) return null;
  const raw = entity.id ?? entity._id;
  if (raw === null || raw === undefined) return null;
  return typeof raw === 'string' ? raw : String(raw);
}

/**
 * Compara dos entidades (o una entidad y un id string) por id normalizado.
 * Nunca devuelve true cuando ambos carecen de id.
 * @param {object|null|undefined} a
 * @param {object|string|null|undefined} b - entidad o id string
 * @returns {boolean}
 */
export function sameId(a, b) {
  const idA = getId(a);
  const idB = typeof b === 'string' ? b : getId(b);
  return idA !== null && idB !== null && idA === idB;
}

/**
 * Busca en `list` la entidad cuyo id normalizado coincide con `idOrEntity`.
 * @param {Array<object>} list
 * @param {object|string} idOrEntity - entidad o id string a buscar
 * @returns {object|undefined}
 */
export function findById(list, idOrEntity) {
  if (!Array.isArray(list)) return undefined;
  const target = typeof idOrEntity === 'string' ? idOrEntity : getId(idOrEntity);
  if (target === null) return undefined;
  return list.find((e) => getId(e) === target);
}
