/**
 * @fileoverview Utilidad para escapar strings usadas en regex.
 * Previene ReDoS y regex injection en filtros de búsqueda.
 * @module utils/escapeRegex
 */

/**
 * Escapa caracteres especiales de RegExp.
 * @param {string} value - Texto de entrada
 * @returns {string} Texto escapado para uso seguro en RegExp
 */
const escapeRegex = value => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

module.exports = {
  escapeRegex
};
