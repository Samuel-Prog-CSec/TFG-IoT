/**
 * @fileoverview Tests de `pickSquareColumns` — selección de columnas que
 * maximiza el lado de carta cuadrada según la forma de la región.
 */

import { describe, it, expect } from 'vitest';
import { pickSquareColumns } from '../squareGrid';

describe('pickSquareColumns', () => {
  it('en región ancha y baja prefiere más columnas (menos filas)', () => {
    // 6 cartas en 800×200: 6 cols (1 fila, lado 133) gana a 3 cols (2 filas, lado 94).
    expect(pickSquareColumns({ count: 6, width: 800, height: 200 })).toBe(6);
  });

  it('en región alta y cuadrada prefiere menos columnas (más filas)', () => {
    // 6 cartas en 800×800: 3 cols (2 filas) maximiza frente a 6 cols (1 fila, estrecha).
    expect(pickSquareColumns({ count: 6, width: 800, height: 800 })).toBe(3);
  });

  it('board de 12 ancho-bajo usa más columnas que cuadrado', () => {
    const wideShort = pickSquareColumns({ count: 12, width: 1000, height: 300, maxCols: 6 });
    const squareish = pickSquareColumns({ count: 12, width: 1000, height: 750, maxCols: 6 });
    expect(wideShort).toBeGreaterThan(squareish);
    // El cuadrado tiende a 4 columnas (4×3) para 12 cartas.
    expect(squareish).toBe(4);
  });

  it('respeta maxCols y minCols', () => {
    expect(pickSquareColumns({ count: 12, width: 4000, height: 100, maxCols: 5 })).toBeLessThanOrEqual(5);
    expect(pickSquareColumns({ count: 12, width: 100, height: 4000, minCols: 3 })).toBeGreaterThanOrEqual(3);
  });

  it('nunca devuelve más columnas que cartas', () => {
    expect(pickSquareColumns({ count: 3, width: 2000, height: 100, maxCols: 8 })).toBeLessThanOrEqual(3);
  });

  it('sin medida válida cae a heurística cuadrada (≈√n) y es estable', () => {
    expect(pickSquareColumns({ count: 9, width: 0, height: 0 })).toBe(3);
    expect(pickSquareColumns({ count: 12, width: NaN, height: 500, maxCols: 6 })).toBe(4);
  });

  it('clampa count inválido a 1', () => {
    expect(pickSquareColumns({ count: 0, width: 500, height: 500 })).toBe(1);
    expect(pickSquareColumns({ count: -3, width: 500, height: 500 })).toBe(1);
  });
});
