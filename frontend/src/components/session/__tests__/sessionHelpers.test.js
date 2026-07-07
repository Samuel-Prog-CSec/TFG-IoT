/**
 * @fileoverview Tests de helpers del wizard de sesiones.
 */

import { describe, it, expect } from 'vitest';
import { getRangeFillPercent } from '../sessionHelpers';

describe('getRangeFillPercent', () => {
  // El slider de penalización trabaja en magnitud (0..5): el relleno debe
  // seguir EXACTAMENTE al thumb, que el navegador posiciona en
  // (value - min) / (max - min). Antes el relleno usaba |value|/5 con un
  // input negativo (min=-5) y quedaba invertido respecto al thumb (bug).
  it('mapea la magnitud 0..5 al porcentaje del thumb', () => {
    expect(getRangeFillPercent(0, 0, 5)).toBe(0);
    expect(getRangeFillPercent(2, 0, 5)).toBe(40);
    expect(getRangeFillPercent(3, 0, 5)).toBe(60);
    expect(getRangeFillPercent(5, 0, 5)).toBe(100);
  });

  it('acota el resultado a [0, 100]', () => {
    expect(getRangeFillPercent(-3, 0, 5)).toBe(0);
    expect(getRangeFillPercent(99, 0, 5)).toBe(100);
  });

  it('devuelve 0 si el rango es degenerado (max === min)', () => {
    expect(getRangeFillPercent(5, 5, 5)).toBe(0);
  });

  it('funciona con rangos genéricos no centrados en 0', () => {
    expect(getRangeFillPercent(15, 10, 20)).toBe(50);
  });
});
