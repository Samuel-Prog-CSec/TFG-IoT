/**
 * @fileoverview Utilidades para detectar payloads peligrosos (prototype pollution / NoSQL injection).
 * @module utils/payloadSecurity
 */

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const isPlainObject = value =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

const normalizePath = (basePath, key) => (basePath ? `${basePath}.${key}` : key);

const findDangerousPayloadPath = (value, basePath = '') => {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nestedPath = findDangerousPayloadPath(value[index], `${basePath}[${index}]`);
      if (nestedPath) {
        return nestedPath;
      }
    }
    return null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  for (const [rawKey, nestedValue] of Object.entries(value)) {
    const key = String(rawKey || '').trim();
    const keyPath = normalizePath(basePath, key);
    const normalizedKey = key.toLowerCase();

    if (DANGEROUS_KEYS.has(normalizedKey)) {
      return keyPath;
    }

    if (key.startsWith('$')) {
      return keyPath;
    }

    const nestedPath = findDangerousPayloadPath(nestedValue, keyPath);
    if (nestedPath) {
      return nestedPath;
    }
  }

  return null;
};

module.exports = {
  findDangerousPayloadPath
};
