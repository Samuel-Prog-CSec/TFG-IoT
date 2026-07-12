import { describe, it, expect } from 'vitest';
import {
  computeGridLayout,
  fitInside,
  computeCellRects,
  pageCount,
  validateCardSizeCm,
  cmToMm,
  MIN_CARD_CM,
  MAX_CARD_WIDTH_CM,
  MAX_CARD_HEIGHT_CM
} from '../printLayout';

describe('printLayout — computeGridLayout', () => {
  it('tarjeta estándar (55×85) en auto → vertical 3×3 = 9', () => {
    const layout = computeGridLayout({ cardWidthMm: 55, cardHeightMm: 85 });
    expect(layout.orientation).toBe('portrait');
    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(3);
    expect(layout.perPage).toBe(9);
  });

  it('auto elige horizontal cuando aprovecha más papel (85×55)', () => {
    const layout = computeGridLayout({ cardWidthMm: 85, cardHeightMm: 55 });
    expect(layout.orientation).toBe('landscape');
    expect(layout.perPage).toBe(9);
  });

  it('respeta la orientación forzada', () => {
    expect(
      computeGridLayout({ cardWidthMm: 85, cardHeightMm: 55, orientation: 'portrait' }).orientation
    ).toBe('portrait');
  });
});

describe('printLayout — fitInside', () => {
  it('preserva el aspecto (apaisada)', () => {
    const fit = fitInside(200, 100, 55, 85);
    expect(fit.width).toBeCloseTo(55, 5);
    expect(fit.height).toBeCloseTo(27.5, 5);
  });

  it('nunca supera la caja', () => {
    const fit = fitInside(10, 1000, 55, 85);
    expect(fit.width).toBeLessThanOrEqual(55 + 1e-6);
    expect(fit.height).toBeLessThanOrEqual(85 + 1e-6);
  });
});

describe('printLayout — computeCellRects', () => {
  it('devuelve perPage rects centrados en la página', () => {
    const layout = computeGridLayout({ cardWidthMm: 55, cardHeightMm: 85 });
    const rects = computeCellRects(layout);
    expect(rects).toHaveLength(layout.perPage);
    const last = rects[rects.length - 1];
    const leftGap = rects[0].xMm;
    const rightGap = layout.pageWidthMm - (last.xMm + last.wMm);
    expect(leftGap).toBeCloseTo(rightGap, 5);
  });
});

describe('printLayout — pageCount', () => {
  it('redondea hacia arriba', () => {
    expect(pageCount(10, 9)).toBe(2);
    expect(pageCount(9, 9)).toBe(1);
    expect(pageCount(0, 9)).toBe(0);
  });
});

describe('printLayout — cmToMm', () => {
  it('convierte cm a mm', () => {
    expect(cmToMm(5.5)).toBe(55);
    expect(cmToMm(8.5)).toBe(85);
  });
});

describe('printLayout — validateCardSizeCm', () => {
  it('acepta un tamaño válido', () => {
    expect(validateCardSizeCm({ widthCm: '5.5', heightCm: '8.5' })).toEqual({
      widthError: null,
      heightError: null
    });
  });

  it('rechaza por debajo del mínimo', () => {
    const { widthError } = validateCardSizeCm({ widthCm: '1', heightCm: '8.5' });
    expect(widthError).toContain(String(MIN_CARD_CM));
  });

  it('rechaza por encima del máximo', () => {
    const { widthError } = validateCardSizeCm({ widthCm: '30', heightCm: '8.5' });
    expect(widthError).toContain(String(MAX_CARD_WIDTH_CM));
    const { heightError } = validateCardSizeCm({ widthCm: '5.5', heightCm: '40' });
    expect(heightError).toContain(String(MAX_CARD_HEIGHT_CM));
  });

  it('rechaza valores vacíos o no numéricos', () => {
    expect(validateCardSizeCm({ widthCm: '', heightCm: 'abc' })).toEqual({
      widthError: expect.stringMatching(/Introduce/),
      heightError: expect.stringMatching(/Introduce/)
    });
  });
});
