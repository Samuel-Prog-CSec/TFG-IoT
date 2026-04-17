/**
 * @fileoverview Tablero de memoria para la mecánica "memory".
 * Muestra las cartas en una cuadrícula, gestiona animaciones de flip,
 * feedback visual de acierto/error y accesibilidad.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import FloatingPointsBadge from './FloatingPointsBadge';
import CardAssetPreview from '../ui/CardAssetPreview';

/**
 * Determina el numero de columnas segun la cantidad total de cartas.
 * Limitamos a 4 columnas maximo para que las cartas mantengan tamaño
 * suficiente en pantalla tablet (motricidad infantil).
 */
function resolveMemoryColumns(totalCards) {
  if (totalCards <= 6) {
    return 3;
  }
  return 4;
}

/** Estilos de cuadrícula predefinidos por número de columnas */
const GRID_STYLES = {
  3: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
  4: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }
};

/** Clases CSS para cada estado de una celda del tablero */
function getMemorySlotClasses(isMatched, isOpen) {
  if (isMatched) {
    // Emparejada: no se atenua, se celebra — borde success intenso + glow sutil
    return 'border-success-base bg-success-base/15 shadow-[0_0_18px_rgba(34,197,94,0.25)]';
  }

  if (isOpen) {
    return 'border-accent-indigo/70 bg-accent-indigo/25';
  }

  return 'border-border-subtle bg-background-elevated/40';
}

export default function MemoryBoard({ board, feedbackState, feedbackPoints, feedbackMessage, onCardTap }) {
  const { shouldReduceMotion } = useReducedMotion();
  const safeBoard = Array.isArray(board) ? [...board].sort((a, b) => a.slotIndex - b.slotIndex) : [];
  const total = safeBoard.length;
  const columns = resolveMemoryColumns(total);
  const gridStyle = GRID_STYLES[columns] || GRID_STYLES[3];
  const [prevBoard, setPrevBoard] = useState([]);

  // Detectar qué celdas acaban de cambiar (recién emparejadas o reveladas para feedback)
  const feedbackSlots = new Set();
  if (feedbackState !== 'idle') {
    for (const slot of safeBoard) {
      const prev = prevBoard.find(p => p.slotIndex === slot.slotIndex);
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

  return (
    <div className="w-full h-full max-w-5xl mx-auto rounded-2xl border border-border-default bg-background-base/30 p-3 sm:p-4 relative flex flex-col">
      {/* Indicador visual de progreso de parejas: corazones que se iluminan al
          encontrar cada pareja. Sustituye al texto "Tablero de Memoria" (que era
          redundante) y da un goalpost visible sin ocupar espacio extra. */}
      {pairsTotal > 0 && (
        <div
          className="mb-3 flex items-center justify-center gap-2 shrink-0"
          role="status"
          aria-label={`Parejas encontradas: ${pairsFound} de ${pairsTotal}`}
        >
          {Array.from({ length: Math.round(pairsTotal) }).map((_, idx) => {
            const isFound = idx < pairsFound;
            return (
              <motion.span
                key={`pair-marker-${idx}`}
                className={cn(
                  'inline-block text-lg sm:text-xl transition-[transform,opacity,filter]',
                  isFound ? 'opacity-100' : 'opacity-30 grayscale'
                )}
                animate={
                  isFound && !shouldReduceMotion
                    ? { scale: [1, 1.25, 1], rotate: [0, 6, -6, 0] }
                    : { scale: 1, rotate: 0 }
                }
                transition={{ duration: 0.5, ease: 'easeOut' }}
                aria-hidden="true"
              >
                {isFound ? '💚' : '🤍'}
              </motion.span>
            );
          })}
        </div>
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
                // aspect-square mantiene cartas cuadradas, max-h-full evita overflow
                // vertical cuando el grid tiene filas comprimidas (auto-rows-fr),
                // mx-auto las centra dentro de su celda.
                'aspect-square max-h-full mx-auto rounded-xl border transition-[box-shadow,border-color] memory-card-flip',
                slotClasses,
                isMatchFeedback && 'shadow-[0_0_20px] shadow-success-glow',
                isMismatchFeedback && 'border-error-base/60',
                onCardTap && !slot.isMatched && !slot.isRevealed && 'cursor-pointer'
              )}
              animate={(() => {
                if (shouldReduceMotion) return {};
                if (isMatchFeedback) return { scale: [1, 1.12, 1], transition: { duration: 0.4 } };
                if (isMismatchFeedback) return { x: [-3, 3, -2, 2, 0], transition: { duration: 0.4 } };
                // Cartas emparejadas: respiracion sutil (scale loop) en lugar
                // de atenuar. Celebra el logro en vez de "apagarla".
                if (slot.isMatched) {
                  return {
                    scale: [1, 1.02, 1],
                    transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
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
                    visualmente al voltearse y comunica "carta de baraja". */}
                <div className="memory-card-face w-full h-full rounded-lg overflow-hidden relative flex items-center justify-center select-none bg-gradient-to-br from-brand-dark via-accent-indigo to-brand-base">
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
                  {/* Marca central sutil */}
                  <span
                    className="relative text-2xl font-display font-bold text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
                    aria-hidden="true"
                  >
                    ✦
                  </span>
                </div>
                {/* Cara frontal (contenido) */}
                <div className="memory-card-back w-full h-full rounded-lg p-2 flex items-center justify-center bg-background-elevated/40">
                  <CardAssetPreview
                    asset={slot.displayData || { display: slot.assignedValue || '🎴' }}
                    className="w-full h-full rounded-lg"
                    loading="eager"
                    fallbackLabel={slot.displayData?.display || slot.assignedValue || '🎴'}
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
