/**
 * @fileoverview Constantes geométricas para la generación de PDF imprimible de mazos.
 * Compartidas entre el validador (guards de tamaño) y el servicio (layout y dibujo).
 * El frontend mantiene un espejo de estos valores en `frontend/src/lib/printLayout.js`.
 * @module constants/print
 */

// Dimensiones de página A4 en milímetros (vertical).
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// Márgenes de página y separación entre tarjetas (para poder recortar).
const DEFAULT_MARGIN_MM = 10;
const DEFAULT_GAP_MM = 4;

// Tamaño de tarjeta por defecto: las tarjetas físicas del proyecto (5,5 × 8,5 cm).
const DEFAULT_CARD_WIDTH_MM = 55;
const DEFAULT_CARD_HEIGHT_MM = 85;

// Guards de tamaño de tarjeta.
// Mínimo: por debajo, la imagen sería demasiado pequeña para ser útil.
// Máximo: debe caber al menos una tarjeta dentro del área imprimible de un A4 vertical
// (ancho útil = 210 − 2·10 = 190; alto útil = 297 − 2·10 = 277).
const MIN_CARD_MM = 20;
const MAX_CARD_WIDTH_MM = A4_WIDTH_MM - 2 * DEFAULT_MARGIN_MM; // 190
const MAX_CARD_HEIGHT_MM = A4_HEIGHT_MM - 2 * DEFAULT_MARGIN_MM; // 277

// Conversión milímetros → puntos PDF (1 pt = 1/72 pulgada; 1 pulgada = 25,4 mm).
const MM_TO_PT = 72 / 25.4;

module.exports = {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  DEFAULT_MARGIN_MM,
  DEFAULT_GAP_MM,
  DEFAULT_CARD_WIDTH_MM,
  DEFAULT_CARD_HEIGHT_MM,
  MIN_CARD_MM,
  MAX_CARD_WIDTH_MM,
  MAX_CARD_HEIGHT_MM,
  MM_TO_PT
};
