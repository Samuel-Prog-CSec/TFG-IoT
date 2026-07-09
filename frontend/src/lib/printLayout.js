/**
 * @fileoverview Geometría de la maquetación de impresión de mazos (lado cliente).
 * Espejo ESM de `backend/src/constants/print.js` + `deckPrintService`: permite
 * calcular la rejilla, el conteo de páginas y el ajuste sin deformar para la
 * previsualización en vivo sin ida al servidor. Debe mantenerse alineado con el
 * backend (el PDF real se compone allí).
 * @module lib/printLayout
 */

// Dimensiones A4 (vertical) y márgenes, en milímetros.
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;
export const DEFAULT_MARGIN_MM = 10;
export const DEFAULT_GAP_MM = 4;

// Tamaño por defecto: las tarjetas físicas del proyecto (5,5 × 8,5 cm).
export const DEFAULT_CARD_WIDTH_MM = 55;
export const DEFAULT_CARD_HEIGHT_MM = 85;

// Guards de tamaño (mm). Coinciden con el validador Zod del backend.
export const MIN_CARD_MM = 20;
export const MAX_CARD_WIDTH_MM = A4_WIDTH_MM - 2 * DEFAULT_MARGIN_MM; // 190
export const MAX_CARD_HEIGHT_MM = A4_HEIGHT_MM - 2 * DEFAULT_MARGIN_MM; // 277

// Equivalentes en cm para la UI (el profesor piensa en cm).
export const MIN_CARD_CM = MIN_CARD_MM / 10; // 2.0
export const MAX_CARD_WIDTH_CM = MAX_CARD_WIDTH_MM / 10; // 19.0
export const MAX_CARD_HEIGHT_CM = MAX_CARD_HEIGHT_MM / 10; // 27.7

export const cmToMm = cm => Math.round(cm * 10 * 100) / 100;
export const mmToCm = mm => Math.round((mm / 10) * 100) / 100;

/**
 * Calcula la rejilla de cartas por página A4 para un tamaño de tarjeta.
 * Con `orientation: 'auto'` elige la orientación que maximiza cartas por página
 * (empate → vertical), para aprovechar el papel. Función pura.
 *
 * @param {Object} opts
 * @param {number} opts.cardWidthMm
 * @param {number} opts.cardHeightMm
 * @param {'auto'|'portrait'|'landscape'} [opts.orientation='auto']
 * @param {number} [opts.gapMm=DEFAULT_GAP_MM]
 * @param {number} [opts.marginMm=DEFAULT_MARGIN_MM]
 * @returns {{orientation:string, pageWidthMm:number, pageHeightMm:number, marginMm:number,
 *   gapMm:number, cardWidthMm:number, cardHeightMm:number, cols:number, rows:number, perPage:number}}
 */
export function computeGridLayout({
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
export function fitInside(imgWidth, imgHeight, boxWidth, boxHeight) {
  if (!imgWidth || !imgHeight || imgWidth <= 0 || imgHeight <= 0) {
    return { width: boxWidth, height: boxHeight };
  }
  const scale = Math.min(boxWidth / imgWidth, boxHeight / imgHeight);
  return { width: imgWidth * scale, height: imgHeight * scale };
}

/**
 * Rectángulos (origen arriba-izquierda, mm) de cada celda, rejilla centrada.
 * Función pura. Usado por la previsualización para posicionar en porcentajes.
 *
 * @param {Object} layout - Resultado de `computeGridLayout`
 * @returns {Array<{xMm:number, yMm:number, wMm:number, hMm:number}>}
 */
export function computeCellRects(layout) {
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
 * Número de páginas necesarias para `cardCount` cartas con `perPage` por hoja.
 * @param {number} cardCount
 * @param {number} perPage
 * @returns {number}
 */
export function pageCount(cardCount, perPage) {
  return perPage > 0 ? Math.ceil(cardCount / perPage) : 0;
}

/**
 * Valida un tamaño de tarjeta en cm (guards de la UI, espejo del backend).
 * Devuelve un mensaje por campo (o null si es válido).
 *
 * @param {{widthCm:number|string, heightCm:number|string}} size
 * @returns {{widthError:string|null, heightError:string|null}}
 */
export function validateCardSizeCm({ widthCm, heightCm }) {
  const check = (value, maxCm, label) => {
    const num = typeof value === 'number' ? value : Number.parseFloat(value);
    if (value === '' || value === null || value === undefined || Number.isNaN(num)) {
      return `Introduce ${label}`;
    }
    if (num < MIN_CARD_CM) {
      return `El mínimo es ${MIN_CARD_CM} cm`;
    }
    if (num > maxCm) {
      return `El máximo es ${maxCm} cm`;
    }
    return null;
  };

  return {
    widthError: check(widthCm, MAX_CARD_WIDTH_CM, 'el ancho'),
    heightError: check(heightCm, MAX_CARD_HEIGHT_CM, 'el alto')
  };
}
