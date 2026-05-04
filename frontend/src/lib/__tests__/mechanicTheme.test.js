/**
 * @fileoverview Tests del tema canónico por mecánica (ADR-C).
 */

import { describe, it, expect } from 'vitest';
import {
  getMechanicTheme,
  MECHANIC_KEYS,
  MECHANIC_THEMES
} from '../mechanicTheme';

describe('getMechanicTheme', () => {
  it('devuelve el tema de Memoria para "memory"', () => {
    const theme = getMechanicTheme('memory');
    expect(theme.key).toBe('memory');
    expect(theme.label).toBe('Memoria');
    expect(theme.icon).toBeTypeOf('object');
    expect(theme.headline).toBeTypeOf('string');
  });

  it('devuelve el tema de Asociación para "association"', () => {
    const theme = getMechanicTheme('association');
    expect(theme.key).toBe('association');
    expect(theme.label).toBe('Asociación');
  });

  it('devuelve el tema de Secuencia para "sequence"', () => {
    const theme = getMechanicTheme('sequence');
    expect(theme.key).toBe('sequence');
    expect(theme.label).toBe('Secuencia');
  });

  it('es case-insensitive con la clave', () => {
    expect(getMechanicTheme('MEMORY').key).toBe('memory');
    expect(getMechanicTheme('Sequence').key).toBe('sequence');
  });

  it('devuelve el tema fallback (Memoria) si la mecánica no existe', () => {
    expect(getMechanicTheme('unknown_mechanic').key).toBe('memory');
    expect(getMechanicTheme(undefined).key).toBe('memory');
    expect(getMechanicTheme(null).key).toBe('memory');
    expect(getMechanicTheme('').key).toBe('memory');
  });

  it('cada tema expone los campos requeridos por el badge y el backdrop', () => {
    const required = [
      'key',
      'label',
      'accentVar',
      'accentClass',
      'accentBgSoftClass',
      'accentBorderClass',
      'glowClass',
      'icon',
      'headline'
    ];
    for (const key of MECHANIC_KEYS) {
      const theme = getMechanicTheme(key);
      for (const field of required) {
        expect(theme[field], `missing ${field} en ${key}`).toBeDefined();
      }
    }
  });

  it('los temas son congelados (no mutables) para evitar accidentes', () => {
    const memory = getMechanicTheme('memory');
    expect(Object.isFrozen(memory)).toBe(true);
    expect(Object.isFrozen(MECHANIC_THEMES)).toBe(true);
  });

  it('MECHANIC_KEYS expone exactamente las 3 mecánicas en orden estable', () => {
    expect([...MECHANIC_KEYS]).toEqual(['memory', 'association', 'sequence']);
  });

  it('cada mecánica tiene un accentVar diferente para evitar colisión visual', () => {
    const accents = MECHANIC_KEYS.map(k => getMechanicTheme(k).accentVar);
    expect(new Set(accents).size).toBe(MECHANIC_KEYS.length);
  });
});
