/**
 * @fileoverview Tablero de memoria para la mecánica "memory".
 * Muestra las cartas en una cuadrícula, gestiona animaciones de flip,
 * feedback visual de acierto/error y accesibilidad.
 */

import { useState, useEffect, useMemo } from 'react';
import { m as motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { Heart, Sparkle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import FloatingPointsBadge from './FloatingPointsBadge';
import CardAssetPreview from '../ui/CardAssetPreview';
import { useSquareGridColumns } from '../../hooks/useSquareGridColumns';

/** Clases CSS para cada estado de una celda del tablero */
function getMemorySlotClasses(isMatched, isOpen) {
  if (isMatched) {
    // Emparejada: no se atenua, se celebra — borde success intenso + glow sutil
    return 'border-success-base bg-success-base/15 shadow-[0_0_18px_var(--color-success-glow)]';
  }

  if (isOpen) {
    return 'border-accent-indigo/70 bg-accent-indigo/25';
  }

  return 'border-border-subtle bg-background-elevated/40';
}

export default function MemoryBoard({ board, feedbackState, feedbackPoints, feedbackMessage, onCardTap }) {
  const { shouldReduceMotion } = useReducedMotion();
  const safeBoard = Array.isArray(board) ? board.toSorted((a, b) => a.slotIndex - b.slotIndex) : [];
  const total = safeBoard.length;
  // Columnas adaptativas por aspect-ratio de la región (ADR-207 addendum): el
  // hook mide el grid y elige el nº de columnas que MAXIMIZA el lado de carta.
  // Un mazo de 12 a 720p (región ancha-baja) usa más columnas/menos filas; a 4K
  // (región más cuadrada con el cap de altura) vuelve a ~4 (4×3) con cartas
  // grandes. Cap 6 columnas para no aplastar la motricidad infantil.
  const [gridRef, columns] = useSquareGridColumns(total, { maxCols: 6 });
  const gridStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
  const [prevBoard, setPrevBoard] = useState([]);

  // Detectar qué celdas acaban de cambiar (recién emparejadas o reveladas para feedback)
  const feedbackSlots = new Set();
  if (feedbackState !== 'idle') {
    const prevBySlotIndex = new Map(prevBoard.map(p => [p.slotIndex, p]));
    for (const slot of safeBoard) {
      const prev = prevBySlotIndex.get(slot.slotIndex);
      if (!prev) continue;
      // Recién emparejada
      if (slot.isMatched && !prev.isMatched) {
        feedbackSlots.add(slot.slotIndex);
      }
      // Recién revelada (para shake de error)
      if (feedbackState === 'error' && slot.isRevealed && !slot.isMatched) {
        feedbackSlots.add(slot.slotIndex);
      }
    }
  }

  // Actualizar snapshot del board anterior tras cada cambio de board
  useEffect(() => {
    setPrevBoard(safeBoard.map(s => ({ slotIndex: s.slotIndex, isMatched: s.isMatched, isRevealed: s.isRevealed })));
  }, [board]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSuccess = feedbackState === 'success';

  const pairsFound = safeBoard.filter(s => s.isMatched).length / 2;
  const pairsTotal = total > 0 ? total / 2 : 0;
  const pairMarkers = useMemo(
    () =>
      Array.from({ length: Math.round(pairsTotal) }, (_, idx) => ({
        id: `pair-marker-${idx}`,
        position: idx
      })),
    [pairsTotal]
  );

  return (
    <div className="w-full h-full max-w-[clamp(64rem,120vh,90rem)] mx-auto rounded-2xl border border-border-default bg-background-base/30 p-3 sm:p-4 relative flex flex-col">
      {/* Indicador visual de progreso de parejas: corazones que se iluminan al
          encontrar cada pareja. Sustituye al texto "Tablero de Memoria" (que era
          redundante) y da un goalpost visible sin ocupar espacio extra. */}
      {pairsTotal > 0 && (
        <output
          className="mb-3 flex items-center justify-center gap-2 shrink-0"
          aria-label={`Parejas encontradas: ${pairsFound} de ${pairsTotal}`}
        >
          {pairMarkers.map(marker => {
            const isFound = marker.position < pairsFound;
            return (
              <motion.span
                key={marker.id}
                // Sustituye emoji 🤍/💚 por Lucide Heart con tinte (QA 04/05):
                // los emojis dependen del SO/font del navegador y se ven feos
                // en Windows (heart blanco vs verde lima saturado), aparte de
                // contrar el patrón "no emoji como icono" del proyecto.
                className={cn(
                  'inline-flex items-center justify-center transition-[transform,opacity]',
                  isFound ? 'text-success-base' : 'text-text-disabled/50'
                )}
                animate={
                  isFound && !shouldReduceMotion
                    ? { scale: [1, 1.25, 1], rotate: [0, 6, -6, 0] }
                    : { scale: 1, rotate: 0 }
                }
                transition={{ duration: 0.5, ease: 'easeOut' }}
                aria-hidden="true"
              >
                <Heart
                  size={20}
                  strokeWidth={2}
                  className={cn(
                    'transition-[fill,color]',
                    isFound && 'fill-success-base'
                  )}
                />
              </motion.span>
            );
          })}
        </output>
      )}

      {/* Badge flotante para acierto */}
      {isSuccess && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-30">
          <FloatingPointsBadge
            type="success"
            points={feedbackPoints}
            message={feedbackMessage}
          />
        </div>
      )}

      {/*
        Grid ocupa el resto del alto disponible (flex-1 min-h-0). Las cards usan
        aspect-square + flex-center para centrarse dentro de su celda y el ancho
        maximo del grid (mx-auto + max-w por cols) evita que se estiren feas en
        pantallas muy anchas. El wrapper items-stretch permite que las celdas
        se escalen al alto disponible sin desbordar.
      */}
      <div
        ref={gridRef}
        className="grid gap-2 sm:gap-3 flex-1 min-h-0 auto-rows-fr content-center justify-center mx-auto w-full"
        style={gridStyle}
        role="grid"
        aria-label="Tablero de memoria"
      >
        {safeBoard.map(slot => {
          const isOpen = Boolean(slot.isRevealed || slot.isMatched);
          const slotClasses = getMemorySlotClasses(slot.isMatched, isOpen);
          const matchedSuffix = slot.isMatched ? ' — emparejada' : '';
          const slotLabel = isOpen
            ? `Carta ${slot.assignedValue || ''}${matchedSuffix}`.trim()
            : 'Carta oculta';
          const isInFeedback = feedbackSlots.has(slot.slotIndex);
          const isMatchFeedback = isInFeedback && feedbackState === 'success';
          const isMismatchFeedback = isInFeedback && feedbackState === 'error';

          return (
            <motion.div
              key={`memory-slot-${slot.slotIndex}`}
              className={cn(
                // aspect-square mantiene cartas cuadradas; max-h-full Y max-w-full
                // acotan la carta a la celda (alto Y ancho) — sin max-w-full, a
                // viewports altos (1440/4K) la carta se dimensiona por la fila y
                // desborda la columna, solapándose con las vecinas. mx-auto centra.
                'aspect-square max-h-full max-w-full mx-auto rounded-xl border transition-[box-shadow,border-color] memory-card-flip',
                slotClasses,
                isMatchFeedback && 'shadow-[0_0_20px] shadow-success-glow',
                isMismatchFeedback && 'border-error-base/60',
                onCardTap && !slot.isMatched && !slot.isRevealed && 'cursor-pointer'
              )}
              animate={(() => {
                if (shouldReduceMotion) return {};
                if (isMatchFeedback) return { scale: [1, 1.12, 1], transition: { duration: 0.4 } };
                if (isMismatchFeedback) return { x: [-3, 3, -2, 2, 0], transition: { duration: 0.4 } };
                // Cartas emparejadas: signature "peeking" — respiración
                // sutil (scale 1→1.02) + wobble de 0.6° con jitter por
                // slotIndex (ADR-D, sesión 04/05/2026). Cada carta tiene
                // duración ligeramente distinta (2.6–4.4s) para que el
                // tablero no respire al unísono. El peeking se acota a 3
                // ciclos y para (antes `repeat: Infinity` mantenía hasta 12
                // cartas animándose indefinidamente, gasto de GPU constante);
                // tras celebrar la pareja, la carta reposa en su estado final.
                if (slot.isMatched) {
                  const idx = Number(slot.slotIndex || 0);
                  const period = 2.6 + (idx % 5) * 0.45;
                  const phase = (idx % 4) * 0.4;
                  return {
                    scale: [1, 1.02, 1],
                    rotate: [0, 0.6, -0.6, 0],
                    transition: {
                      duration: period,
                      delay: phase,
                      repeat: 3,
                      ease: 'easeInOut'
                    }
                  };
                }
                return {};
              })()}
              role="gridcell"
              aria-label={slotLabel}
              onClick={() => onCardTap && !slot.isMatched && onCardTap(slot)}
              tabIndex={onCardTap && !slot.isMatched ? 0 : undefined}
              onKeyDown={e => {
                if (onCardTap && !slot.isMatched && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onCardTap(slot);
                }
              }}
            >
              <div className={cn(
                'relative w-full h-full memory-card-inner',
                isOpen && 'memory-card-flipped'
              )}>
                {/* Cara trasera decorativa: patron de dots + degradado brand.
                    Sustituye al "?" plano anterior — es mas satisfactorio
                    visualmente al voltearse y comunica "carta de baraja".
                    aria-hidden cuando la carta esta boca arriba para que el
                    lector no lea "patron decorativo" sobre el contenido util. */}
                <div
                  className="memory-card-face w-full h-full rounded-lg overflow-hidden relative flex items-center justify-center select-none bg-gradient-to-br from-brand-dark via-accent-indigo to-brand-base"
                  aria-hidden={isOpen ? 'true' : undefined}
                >
                  {/* Capa de patron de dots */}
                  <div
                    className="absolute inset-0 opacity-[0.22]"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)',
                      backgroundSize: '10px 10px'
                    }}
                    aria-hidden="true"
                  />
                  {/* Marco interno decorativo */}
                  <div className="absolute inset-1.5 rounded-md border border-white/20" aria-hidden="true" />
                  {/* Marca central sutil — Lucide Sparkle (antes Unicode ✦
                      que dependía de la fuente del SO). El fill+stroke white
                      con drop-shadow le da peso de "logo de baraja". */}
                  <Sparkle
                    size={28}
                    strokeWidth={1.5}
                    className="relative text-white/85 drop-shadow-[var(--shadow-card-sparkle)] fill-white/30"
                    aria-hidden="true"
                  />
                </div>
                {/* Cara frontal (contenido).
                    aria-hidden cuando la carta NO esta abierta para evitar que el
                    lector de pantalla lea el contenido de cartas boca abajo y
                    "haga trampas" en la mecanica de memoria (a11y fix P24).
                    alt="" en la img refuerza el ocultado. */}
                <div
                  className="memory-card-back w-full h-full rounded-lg p-2 flex items-center justify-center bg-background-elevated/40"
                  aria-hidden={isOpen ? undefined : 'true'}
                >
                  <CardAssetPreview
                    asset={slot.displayData || { display: slot.assignedValue || '?' }}
                    alt={isOpen ? (slot.assignedValue || '') : ''}
                    className="w-full h-full rounded-lg"
                    loading="eager"
                    fallbackLabel={slot.displayData?.display || slot.assignedValue || '?'}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

MemoryBoard.propTypes = {
  board: PropTypes.arrayOf(
    PropTypes.shape({
      slotIndex: PropTypes.number,
      isMatched: PropTypes.bool,
      isRevealed: PropTypes.bool,
      assignedValue: PropTypes.string,
      displayData: PropTypes.object
    })
  ),
  feedbackState: PropTypes.oneOf(['idle', 'success', 'error']),
  feedbackPoints: PropTypes.number,
  feedbackMessage: PropTypes.string,
  onCardTap: PropTypes.func
};
