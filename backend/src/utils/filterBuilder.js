/**
 * @fileoverview Factory genérica para construir filtros de MongoDB desde query params.
 * Elimina la duplicación de lógica de filtrado que se repite en cada controller
 * (buildUsersFilter, buildPlaysFilter, etc.) centralizando los patrones comunes.
 *
 * Tipos de mapping soportados:
 * - `exact`:    Igualdad directa        -> filter[field] = value
 * - `regex`:    Búsqueda parcial         -> filter[field] = { $regex, $options: 'i' }
 * - `search`:   Búsqueda en múltiples campos -> filter.$or = [...]
 * - `range`:    Rango numérico/fecha     -> filter[field] = { $gte, $lte }
 * - `in`:       Lista de valores         -> filter[field] = { $in: [...] }
 * - `computed`: Lógica personalizada      -> config.compute(value, filter, allParams)
 *
 * @module utils/filterBuilder
 */

const { escapeRegex } = require('./escapeRegex');

/**
 * Procesadores para cada tipo de mapping.
 * Cada procesador recibe (value, config, filter, allParams) y muta filter in-place.
 * @private
 */
const typeProcessors = {
  exact: (value, config, filter) => {
    filter[config.field] = value;
  },

  regex: (value, config, filter) => {
    if (typeof value !== 'string' || !value.trim()) {
      return;
    }
    filter[config.field] = {
      $regex: escapeRegex(value.trim()),
      $options: config.options || 'i'
    };
  },

  search: (value, config, filter) => {
    if (typeof value !== 'string' || !value.trim()) {
      return;
    }
    const safeValue = escapeRegex(value.trim());
    filter.$or = config.fields.map(field => ({
      [field]: { $regex: safeValue, $options: 'i' }
    }));
  },

  range: (value, config, filter, allParams) => {
    const rangeFilter = {};
    const minValue = allParams[config.minParam];
    const maxValue = allParams[config.maxParam];

    if (minValue !== undefined && minValue !== null && minValue !== '') {
      rangeFilter.$gte = config.transform ? config.transform(minValue) : minValue;
    }
    if (maxValue !== undefined && maxValue !== null && maxValue !== '') {
      rangeFilter.$lte = config.transform ? config.transform(maxValue) : maxValue;
    }

    if (Object.keys(rangeFilter).length > 0) {
      filter[config.field] = rangeFilter;
    }
  },

  in: (value, config, filter) => {
    if (typeof value === 'string') {
      const items = value
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
      if (items.length > 0) {
        filter[config.field] = { $in: items };
      }
    } else if (Array.isArray(value) && value.length > 0) {
      filter[config.field] = { $in: value };
    }
  },

  computed: (value, config, filter, allParams) => {
    config.compute(value, filter, allParams);
  }
};

/**
 * Construye un filtro de MongoDB a partir de query params y un mapa de field mappings.
 *
 * @param {Object} queryParams - Parámetros de consulta (req.query o extracción manual)
 * @param {Object} fieldMappings - Mapa de paramName -> configuración de filtro
 * @param {Object} [options={}] - Opciones adicionales
 * @param {Object} [options.baseFilter={}] - Filtro base que siempre se incluye
 * @returns {Object} Filtro de MongoDB listo para usar en queries
 *
 * @example
 * const mappings = {
 *   role:      { field: 'role', type: 'exact' },
 *   classroom: { field: 'profile.classroom', type: 'exact' },
 *   status:    { field: 'status', type: 'exact' },
 *   search:    { type: 'search', fields: ['name', 'email'] },
 *   requester: {
 *     type: 'computed',
 *     compute: (requester, filter) => {
 *       if (requester.role === 'teacher') {
 *         filter.role = 'student';
 *         filter.createdBy = requester._id;
 *       }
 *     }
 *   }
 * };
 *
 * const filter = buildFilter(req.query, mappings);
 * // -> { role: 'student', createdBy: '...', status: 'active' }
 */
const buildFilter = (queryParams, fieldMappings, options = {}) => {
  const filter = { ...(options.baseFilter || {}) };

  for (const [paramName, config] of Object.entries(fieldMappings)) {
    const value = queryParams[paramName];

    // Saltar params undefined/null (excepto 'range' que lee de minParam/maxParam y 'computed' que puede no usar value)
    if (value === undefined || value === null || value === '') {
      if (config.type === 'range') {
        typeProcessors.range(value, config, filter, queryParams);
      }
      continue;
    }

    const processor = typeProcessors[config.type];
    if (!processor) {
      continue;
    }

    processor(value, config, filter, queryParams);
  }

  return filter;
};

module.exports = {
  buildFilter
};
