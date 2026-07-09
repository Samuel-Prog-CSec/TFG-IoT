/**
 * @fileoverview Servicio de generación de PDF imprimible de un mazo.
 * Maqueta las imágenes de las cartas en una rejilla A4 al tamaño físico indicado,
 * escalando cada imagen sin deformarla (fit-inside) y aprovechando el papel
 * (auto-orientación). Reutiliza `sharp` para convertir el WebP almacenado a JPEG
 * (pdf-lib no embebe WebP) y compone el documento con `pdf-lib`.
 *
 * La lógica geométrica (`computeGridLayout`, `fitInside`, `computeCellRects`) es pura
 * y testeable; la E/S de red (`fetchImageBuffer`) se aísla como método para poder
 * mockearla en los tests.
 *
 * @module services/deckPrintService
 * @requires sharp
 * @requires pdf-lib
 */

const sharp = require('sharp');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const logger = require('../utils/logger').child({ component: 'deckPrintService' });
const { ValidationError } = require('../utils/errors');
const {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  DEFAULT_MARGIN_MM,
  DEFAULT_GAP_MM,
  DEFAULT_CARD_WIDTH_MM,
  DEFAULT_CARD_HEIGHT_MM,
  MM_TO_PT
} = require('../constants/print');

// Calidad del JPEG embebido en el PDF (balance nitidez/tamaño para impresión).
const JPEG_QUALITY = 90;

// Descargas de imagen simultáneas. Acota el pico de RAM/CPU en el VPS (1 proceso)
// sin serializar por completo la red (un mazo tiene como máximo 20 cartas).
const IMAGE_CONCURRENCY = 4;

// Defensa anti-bomba de descompresión al decodificar con sharp (coherente con
// imageProcessingService): acota los píxeles de entrada y fija el umbral de fallo.
const SHARP_INPUT_OPTIONS = {
  limitInputPixels: 4096 * 4096,
  failOn: 'error'
};

// Grises de las guías de impresión.
const CUT_LINE_COLOR = rgb(0.75, 0.75, 0.75);
const PLACEHOLDER_FALLBACK = { r: 0.9, g: 0.9, b: 0.9 };

/**
 * Convierte un color hex `#RRGGBB` a componentes RGB normalizados [0..1] para pdf-lib.
 * @param {string} hex
 * @returns {{r:number,g:number,b:number}|null}
 */
function hexToRgb01(hex) {
  if (typeof hex !== 'string') {
    return null;
  }
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return null;
  }
  const int = Number.parseInt(match[1], 16);
  return {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255
  };
}

/**
 * Ejecuta `fn` sobre `items` con un límite de concurrencia, preservando el orden.
 * @template T,R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Servicio (singleton) de generación de PDF de impresión de mazos.
 */
class DeckPrintService {
  /**
   * Calcula la rejilla de cartas para una página A4 según el tamaño de tarjeta.
   * Función pura. Con `orientation: 'auto'` elige la orientación que maximiza el
   * número de cartas por página (empate → vertical) para aprovechar el papel.
   *
   * @param {Object} opts
   * @param {number} opts.cardWidthMm - Ancho máximo de la tarjeta (mm)
   * @param {number} opts.cardHeightMm - Alto máximo de la tarjeta (mm)
   * @param {'auto'|'portrait'|'landscape'} [opts.orientation='auto']
   * @param {number} [opts.gapMm=DEFAULT_GAP_MM] - Separación entre tarjetas (mm)
   * @param {number} [opts.marginMm=DEFAULT_MARGIN_MM] - Margen de página (mm)
   * @returns {{orientation:string, pageWidthMm:number, pageHeightMm:number, marginMm:number,
   *   gapMm:number, cardWidthMm:number, cardHeightMm:number, cols:number, rows:number, perPage:number}}
   */
  computeGridLayout({
    cardWidthMm,
    cardHeightMm,
    orientation = 'auto',
    gapMm = DEFAULT_GAP_MM,
    marginMm = DEFAULT_MARGIN_MM
  }) {
    const layoutFor = (pageWidthMm, pageHeightMm, orient) => {
      const usableW = pageWidthMm - 2 * marginMm;
      const usableH = pageHeightMm - 2 * marginMm;
      const cols = Math.max(0, Math.floor((usableW + gapMm) / (cardWidthMm + gapMm)));
      const rows = Math.max(0, Math.floor((usableH + gapMm) / (cardHeightMm + gapMm)));
      return {
        orientation: orient,
        pageWidthMm,
        pageHeightMm,
        marginMm,
        gapMm,
        cardWidthMm,
        cardHeightMm,
        cols,
        rows,
        perPage: cols * rows
      };
    };

    const portrait = layoutFor(A4_WIDTH_MM, A4_HEIGHT_MM, 'portrait');
    const landscape = layoutFor(A4_HEIGHT_MM, A4_WIDTH_MM, 'landscape');

    if (orientation === 'portrait') {
      return portrait;
    }
    if (orientation === 'landscape') {
      return landscape;
    }
    return landscape.perPage > portrait.perPage ? landscape : portrait;
  }

  /**
   * Escala unas dimensiones para caber dentro de una caja preservando el aspecto
   * (letterbox, nunca estira). Función pura.
   *
   * @param {number} imgWidth
   * @param {number} imgHeight
   * @param {number} boxWidth
   * @param {number} boxHeight
   * @returns {{width:number, height:number}}
   */
  fitInside(imgWidth, imgHeight, boxWidth, boxHeight) {
    if (!imgWidth || !imgHeight || imgWidth <= 0 || imgHeight <= 0) {
      return { width: boxWidth, height: boxHeight };
    }
    const scale = Math.min(boxWidth / imgWidth, boxHeight / imgHeight);
    return { width: imgWidth * scale, height: imgHeight * scale };
  }

  /**
   * Calcula el rectángulo (origen arriba-izquierda, en mm) de cada celda de la
   * rejilla, centrada en la página. Función pura.
   *
   * @param {Object} layout - Resultado de `computeGridLayout`
   * @returns {Array<{xMm:number, yMm:number, wMm:number, hMm:number}>}
   */
  computeCellRects(layout) {
    const { cols, rows, perPage, cardWidthMm, cardHeightMm, gapMm, pageWidthMm, pageHeightMm } =
      layout;
    if (perPage < 1) {
      return [];
    }
    const gridWmm = cols * cardWidthMm + (cols - 1) * gapMm;
    const gridHmm = rows * cardHeightMm + (rows - 1) * gapMm;
    const offsetXmm = (pageWidthMm - gridWmm) / 2;
    const offsetYmm = (pageHeightMm - gridHmm) / 2;

    const rects = [];
    for (let i = 0; i < perPage; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      rects.push({
        xMm: offsetXmm + col * (cardWidthMm + gapMm),
        yMm: offsetYmm + row * (cardHeightMm + gapMm),
        wMm: cardWidthMm,
        hMm: cardHeightMm
      });
    }
    return rects;
  }

  /**
   * Descarga los bytes de una imagen desde su URL pública (Supabase Storage).
   * Aislado como método para poder mockearlo en los tests.
   *
   * @param {string} url
   * @returns {Promise<Buffer>}
   */
  async fetchImageBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Descarga de imagen fallida (HTTP ${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Convierte el buffer de imagen (WebP almacenado) a JPEG embebible por pdf-lib,
   * aplanando la transparencia sobre blanco (se imprime en papel) y respetando la
   * orientación EXIF. Devuelve también las dimensiones reales de salida (para el
   * escalado sin deformar).
   *
   * @param {Buffer} buffer
   * @returns {Promise<{jpeg: Buffer, width: number, height: number}>}
   */
  async prepareImage(buffer) {
    const { data, info } = await sharp(buffer, SHARP_INPUT_OPTIONS)
      .rotate()
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  }

  /**
   * Dibuja una carta (imagen ajustada + guía de corte + etiqueta opcional) en su celda.
   * @private
   */
  drawCard(page, card, rect, layout, { showLabel, cropMarks, font }) {
    const { pageHeightMm } = layout;
    const cellXpt = rect.xMm * MM_TO_PT;
    const cellBottomYpt = (pageHeightMm - (rect.yMm + rect.hMm)) * MM_TO_PT;
    const cellWpt = rect.wMm * MM_TO_PT;
    const cellHpt = rect.hMm * MM_TO_PT;

    const labelStripMm = showLabel ? Math.min(6, rect.hMm * 0.18) : 0;
    const imageBoxWmm = rect.wMm;
    const imageBoxHmm = rect.hMm - labelStripMm;

    if (card.embedded) {
      const fit = this.fitInside(card.image.width, card.image.height, imageBoxWmm, imageBoxHmm);
      const offsetXmm = (imageBoxWmm - fit.width) / 2;
      const offsetYmm = (imageBoxHmm - fit.height) / 2;
      page.drawImage(card.embedded, {
        x: (rect.xMm + offsetXmm) * MM_TO_PT,
        y: (pageHeightMm - (rect.yMm + offsetYmm + fit.height)) * MM_TO_PT,
        width: fit.width * MM_TO_PT,
        height: fit.height * MM_TO_PT
      });
    } else {
      // Imagen no disponible: placeholder con el color dominante + texto.
      const bg = hexToRgb01(card.dominantColor) || PLACEHOLDER_FALLBACK;
      page.drawRectangle({
        x: cellXpt,
        y: (pageHeightMm - (rect.yMm + imageBoxHmm)) * MM_TO_PT,
        width: imageBoxWmm * MM_TO_PT,
        height: imageBoxHmm * MM_TO_PT,
        color: rgb(bg.r, bg.g, bg.b)
      });
      const text = 'Sin imagen';
      const size = 8;
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: cellXpt + (cellWpt - textWidth) / 2,
        y: (pageHeightMm - (rect.yMm + imageBoxHmm / 2)) * MM_TO_PT - size / 2,
        size,
        font,
        color: rgb(0.25, 0.25, 0.25)
      });
    }

    if (showLabel && card.assignedValue) {
      const size = Math.max(6, Math.min(10, labelStripMm * 2.2));
      const maxTextWidth = cellWpt - 4;
      const original = String(card.assignedValue);
      let text = original;
      while (text.length > 1 && font.widthOfTextAtSize(`${text}…`, size) > maxTextWidth) {
        text = text.slice(0, -1);
      }
      if (text !== original) {
        text += '…';
      }
      const textWidth = font.widthOfTextAtSize(text, size);
      const stripCenterYmm = rect.yMm + imageBoxHmm + labelStripMm / 2;
      page.drawText(text, {
        x: cellXpt + (cellWpt - textWidth) / 2,
        y: (pageHeightMm - stripCenterYmm) * MM_TO_PT - size * 0.35,
        size,
        font,
        color: rgb(0.15, 0.15, 0.15)
      });
    }

    if (cropMarks) {
      // Borde tenue de la celda = línea de corte.
      page.drawRectangle({
        x: cellXpt,
        y: cellBottomYpt,
        width: cellWpt,
        height: cellHpt,
        borderColor: CUT_LINE_COLOR,
        borderWidth: 0.5
      });
    }
  }

  /**
   * Genera el PDF imprimible del mazo.
   *
   * @param {Array<{imageUrl:string, assignedValue?:string, dominantColor?:string, uid?:string}>} cards
   *   Cartas con imagen (ya filtradas y seleccionadas por el controlador).
   * @param {Object} [options]
   * @param {number} [options.cardWidthMm=55]
   * @param {number} [options.cardHeightMm=85]
   * @param {'auto'|'portrait'|'landscape'} [options.orientation='auto']
   * @param {boolean} [options.showLabel=false]
   * @param {boolean} [options.cropMarks=true]
   * @param {string} [options.deckName='Mazo']
   * @returns {Promise<Buffer>} PDF en un Buffer.
   * @throws {ValidationError} Si no hay cartas o el tamaño no cabe en A4.
   */
  async generateDeckPdf(cards, options = {}) {
    const {
      cardWidthMm = DEFAULT_CARD_WIDTH_MM,
      cardHeightMm = DEFAULT_CARD_HEIGHT_MM,
      orientation = 'auto',
      showLabel = false,
      cropMarks = true,
      deckName = 'Mazo'
    } = options;

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new ValidationError('No hay cartas con imagen para imprimir');
    }

    const layout = this.computeGridLayout({ cardWidthMm, cardHeightMm, orientation });
    if (layout.perPage < 1) {
      throw new ValidationError('El tamaño de tarjeta indicado no cabe en una página A4');
    }

    // Descargar y preparar imágenes (resiliente: un fallo puntual usa placeholder).
    const prepared = await mapWithConcurrency(cards, IMAGE_CONCURRENCY, async card => {
      try {
        const buffer = await this.fetchImageBuffer(card.imageUrl);
        const image = await this.prepareImage(buffer);
        return { ...card, image };
      } catch (err) {
        logger.warn('No se pudo preparar una imagen para el PDF; se usa placeholder', {
          uid: card.uid,
          error: err.message
        });
        return { ...card, image: null };
      }
    });

    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle(`${deckName} — cartas`);
    pdfDoc.setCreator('EduPlay');
    pdfDoc.setProducer('EduPlay');

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Pre-embeber las imágenes (evita await dentro del bucle de dibujo).
    await Promise.all(
      prepared.map(async card => {
        if (card.image) {
          card.embedded = await pdfDoc.embedJpg(card.image.jpeg);
        }
      })
    );

    const rects = this.computeCellRects(layout);
    const pageWpt = layout.pageWidthMm * MM_TO_PT;
    const pageHpt = layout.pageHeightMm * MM_TO_PT;

    let page = null;
    for (let i = 0; i < prepared.length; i += 1) {
      const slot = i % layout.perPage;
      if (slot === 0) {
        page = pdfDoc.addPage([pageWpt, pageHpt]);
      }
      this.drawCard(page, prepared[i], rects[slot], layout, { showLabel, cropMarks, font });
    }

    const bytes = await pdfDoc.save();
    logger.info('PDF de mazo generado', {
      cards: cards.length,
      perPage: layout.perPage,
      orientation: layout.orientation,
      pages: Math.ceil(cards.length / layout.perPage)
    });
    return Buffer.from(bytes);
  }
}

module.exports = new DeckPrintService();
