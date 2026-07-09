/**
 * @fileoverview Tests unitarios del servicio de generación de PDF de mazos.
 * Cubre la geometría pura (layout/fit/rects) y el pipeline completo de generación
 * del PDF con la descarga de imagen mockeada (sin red) y un PNG real de fixture.
 */

const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const deckPrintService = require('../src/services/deckPrintService');
const {
  DEFAULT_CARD_WIDTH_MM,
  DEFAULT_CARD_HEIGHT_MM,
  MAX_CARD_WIDTH_MM,
  MAX_CARD_HEIGHT_MM
} = require('../src/constants/print');

describe('deckPrintService — geometría pura', () => {
  describe('computeGridLayout', () => {
    it('tarjeta estándar (55×85) en auto → vertical, 3×3 = 9 por página', () => {
      const layout = deckPrintService.computeGridLayout({
        cardWidthMm: DEFAULT_CARD_WIDTH_MM,
        cardHeightMm: DEFAULT_CARD_HEIGHT_MM
      });
      expect(layout.orientation).toBe('portrait');
      expect(layout.cols).toBe(3);
      expect(layout.rows).toBe(3);
      expect(layout.perPage).toBe(9);
    });

    it('auto elige horizontal cuando aprovecha más papel (tarjeta 85×55)', () => {
      const layout = deckPrintService.computeGridLayout({ cardWidthMm: 85, cardHeightMm: 55 });
      expect(layout.orientation).toBe('landscape');
      expect(layout.perPage).toBe(9);
      // La vertical daría 8 (2×4); auto debe superar o igualar ese valor.
      expect(layout.perPage).toBeGreaterThanOrEqual(
        deckPrintService.computeGridLayout({
          cardWidthMm: 85,
          cardHeightMm: 55,
          orientation: 'portrait'
        }).perPage
      );
    });

    it('respeta la orientación forzada', () => {
      const portrait = deckPrintService.computeGridLayout({
        cardWidthMm: 85,
        cardHeightMm: 55,
        orientation: 'portrait'
      });
      const landscape = deckPrintService.computeGridLayout({
        cardWidthMm: 85,
        cardHeightMm: 55,
        orientation: 'landscape'
      });
      expect(portrait.orientation).toBe('portrait');
      expect(landscape.orientation).toBe('landscape');
    });

    it('tarjeta máxima (190×277) cabe exactamente 1 por página vertical', () => {
      const layout = deckPrintService.computeGridLayout({
        cardWidthMm: MAX_CARD_WIDTH_MM,
        cardHeightMm: MAX_CARD_HEIGHT_MM
      });
      expect(layout.perPage).toBe(1);
    });

    it('tarjeta pequeña cabe muchas por página', () => {
      const layout = deckPrintService.computeGridLayout({ cardWidthMm: 20, cardHeightMm: 20 });
      expect(layout.perPage).toBeGreaterThan(50);
    });
  });

  describe('fitInside', () => {
    it('escala preservando el aspecto (imagen apaisada)', () => {
      const fit = deckPrintService.fitInside(200, 100, 55, 85);
      expect(fit.width).toBeCloseTo(55, 5);
      expect(fit.height).toBeCloseTo(27.5, 5);
      // Aspecto conservado.
      expect(fit.width / fit.height).toBeCloseTo(200 / 100, 5);
    });

    it('escala preservando el aspecto (imagen vertical)', () => {
      const fit = deckPrintService.fitInside(100, 200, 55, 85);
      expect(fit.height).toBeCloseTo(85, 5);
      expect(fit.width).toBeCloseTo(42.5, 5);
      expect(fit.width / fit.height).toBeCloseTo(100 / 200, 5);
    });

    it('nunca supera la caja', () => {
      const fit = deckPrintService.fitInside(1000, 10, 55, 85);
      expect(fit.width).toBeLessThanOrEqual(55 + 1e-6);
      expect(fit.height).toBeLessThanOrEqual(85 + 1e-6);
    });

    it('con dimensiones inválidas devuelve la caja completa (defensivo)', () => {
      expect(deckPrintService.fitInside(0, 0, 55, 85)).toEqual({ width: 55, height: 85 });
    });
  });

  describe('computeCellRects', () => {
    it('devuelve perPage rectángulos centrados y dentro de la página', () => {
      const layout = deckPrintService.computeGridLayout({ cardWidthMm: 55, cardHeightMm: 85 });
      const rects = deckPrintService.computeCellRects(layout);
      expect(rects).toHaveLength(layout.perPage);
      for (const r of rects) {
        expect(r.xMm).toBeGreaterThanOrEqual(0);
        expect(r.yMm).toBeGreaterThanOrEqual(0);
        expect(r.xMm + r.wMm).toBeLessThanOrEqual(layout.pageWidthMm + 1e-6);
        expect(r.yMm + r.hMm).toBeLessThanOrEqual(layout.pageHeightMm + 1e-6);
      }
      // Simetría de la rejilla centrada: margen izquierdo == margen derecho.
      const last = rects[rects.length - 1];
      const leftGap = rects[0].xMm;
      const rightGap = layout.pageWidthMm - (last.xMm + last.wMm);
      expect(leftGap).toBeCloseTo(rightGap, 5);
    });
  });
});

describe('deckPrintService — generateDeckPdf', () => {
  let redPng;

  beforeAll(async () => {
    // PNG real de fixture (apaisado) para ejercer el pipeline sharp→JPEG→pdf-lib.
    redPng = await sharp({
      create: { width: 120, height: 80, channels: 3, background: { r: 200, g: 30, b: 30 } }
    })
      .png()
      .toBuffer();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const makeCards = n =>
    Array.from({ length: n }, (_, i) => ({
      uid: `AA0000${(i + 1).toString().padStart(2, '0')}`,
      assignedValue: `Valor ${i + 1}`,
      imageUrl: `https://example.test/img-${i + 1}.webp`,
      dominantColor: '#c81e1e'
    }));

  it('genera un PDF válido (%PDF) con el número de páginas correcto', async () => {
    jest.spyOn(deckPrintService, 'fetchImageBuffer').mockResolvedValue(redPng);

    const pdf = await deckPrintService.generateDeckPdf(makeCards(3), { deckName: 'Europa' });

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');

    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1); // 3 cartas, 9 por página → 1 página
  });

  it('pagina cuando hay más cartas que caben en una página', async () => {
    jest.spyOn(deckPrintService, 'fetchImageBuffer').mockResolvedValue(redPng);

    const pdf = await deckPrintService.generateDeckPdf(makeCards(20)); // 9/página → 3 páginas
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(3);
  });

  it('con showLabel y cropMarks desactivado sigue generando un PDF válido', async () => {
    jest.spyOn(deckPrintService, 'fetchImageBuffer').mockResolvedValue(redPng);

    const cards = makeCards(2);
    cards[0].assignedValue = 'Un valor muy largo que debe truncarse con puntos suspensivos';
    const pdf = await deckPrintService.generateDeckPdf(cards, {
      showLabel: true,
      cropMarks: false
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('es resiliente: si falla la descarga de una imagen usa placeholder y no aborta', async () => {
    jest
      .spyOn(deckPrintService, 'fetchImageBuffer')
      .mockResolvedValueOnce(redPng)
      .mockRejectedValueOnce(new Error('network down'));

    const cards = makeCards(2);
    cards[1].dominantColor = undefined; // fuerza el fallback de color del placeholder
    const pdf = await deckPrintService.generateDeckPdf(cards);
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
  });

  it('lanza si no hay cartas', async () => {
    await expect(deckPrintService.generateDeckPdf([])).rejects.toThrow(/No hay cartas/);
  });
});
