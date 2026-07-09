/**
 * @fileoverview Previsualización en vivo de la hoja A4 de impresión.
 * Reproduce fielmente la maquetación del PDF (misma geometría que el backend):
 * rejilla centrada, imágenes ajustadas sin deformar y guía de corte. Es la ayuda
 * clave para el profesor: ve el resultado antes de descargar.
 * @module components/print/PrintPreviewSheet
 */

import { m as motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { computeCellRects } from '../../lib/printLayout';
import { getBestAssetImageUrl } from '../../lib/cardMapping';

const pct = (value, total) => `${(value / total) * 100}%`;

/**
 * @param {Object} props
 * @param {Object|null} props.layout - Resultado de computeGridLayout (o null si el tamaño es inválido)
 * @param {Array} props.selectedCards - Cartas seleccionadas (con displayData)
 * @param {number} props.pages - Número total de páginas
 */
export default function PrintPreviewSheet({ layout, selectedCards, pages }) {
  const invalid = !layout || layout.perPage < 1;
  const isEmpty = selectedCards.length === 0;

  if (invalid || isEmpty) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-default bg-background-elevated/30 p-6 text-center">
        <p className="text-sm text-text-muted">
          {invalid
            ? 'Introduce un tamaño válido para ver la vista previa.'
            : 'Selecciona al menos una carta para ver la vista previa.'}
        </p>
      </div>
    );
  }

  const rects = computeCellRects(layout);
  const firstPageCards = selectedCards.slice(0, layout.perPage);
  const orientationLabel = layout.orientation === 'portrait' ? 'vertical' : 'horizontal';

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Hoja A4 (papel blanco en ambos temas: es lo que se imprime) */}
      <div
        className="relative w-full max-w-[min(340px,70vw)] overflow-hidden rounded-md border border-border-strong bg-white shadow-[var(--shadow-lg)]"
        style={{ aspectRatio: `${layout.pageWidthMm} / ${layout.pageHeightMm}` }}
        role="img"
        aria-label={`Vista previa: ${firstPageCards.length} tarjetas en una hoja A4 ${orientationLabel}`}
      >
        {firstPageCards.map((card, i) => {
          const rect = rects[i];
          const imageUrl = getBestAssetImageUrl(card.displayData);
          return (
            <motion.div
              key={card.uid}
              layout
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              className="absolute flex items-center justify-center border border-dashed border-black/25"
              style={{
                left: pct(rect.xMm, layout.pageWidthMm),
                top: pct(rect.yMm, layout.pageHeightMm),
                width: pct(rect.wMm, layout.pageWidthMm),
                height: pct(rect.hMm, layout.pageHeightMm)
              }}
            >
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt=""
                  loading="lazy"
                  className="max-h-full max-w-full object-contain p-[3%]"
                />
              )}
            </motion.div>
          );
        })}
      </div>

      <p className={cn('text-center text-xs text-text-muted')}>
        {selectedCards.length} {selectedCards.length === 1 ? 'carta' : 'cartas'}
        {' · '}
        {pages} {pages === 1 ? 'página' : 'páginas'} A4 {orientationLabel}
        {pages > 1 && ' (se muestra la primera)'}
      </p>
    </div>
  );
}
