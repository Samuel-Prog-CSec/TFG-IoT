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

/** Determina el número de columnas según la cantidad total de cartas */
function resolveMemoryColumns(totalCards) {
  if (totalCards <= 6) {
    return 3;
  }

  if (totalCards <= 12) {
    return 4;
  }

  return 5;
}

/** Estilos de cuadrícula predefinidos por número de columnas */
const GRID_STYLES = {
  3: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
  4: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
  5: { gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }
};

/** Clases CSS para cada estado de una celda del tablero */
function getMemorySlotClasses(isMatched, isOpen) {
  if (isMatched) {
    return 'border-success-base/70 bg-success-base/20';
  }

  if (isOpen) {
    return 'border-accent-indigo/60 bg-accent-indigo/20';
  }

  return 'border-background-surface bg-background-elevated/60';
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

  return (
    <div className="w-full max-w-4xl rounded-2xl border border-border-default bg-background-base/30 p-4 sm:p-6 relative">
      <div className="mb-4 text-center text-sm text-text-muted">Tablero de Memoria</div>

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

      <div
        className="grid gap-3"
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
                'aspect-square rounded-xl border transition-[box-shadow,border-color] memory-card-flip',
                slotClasses,
                isMatchFeedback && 'shadow-[0_0_20px] shadow-success-glow',
                isMismatchFeedback && 'border-error-base/60',
                onCardTap && !slot.isMatched && !slot.isRevealed && 'cursor-pointer'
              )}
              animate={(() => {
                if (shouldReduceMotion) return {};
                if (isMatchFeedback) return { scale: [1, 1.12, 1], transition: { duration: 0.4 } };
                if (isMismatchFeedback) return { x: [-3, 3, -2, 2, 0], transition: { duration: 0.4 } };
                if (slot.isMatched) return { opacity: 0.55, scale: 0.95, transition: { duration: 0.4 } };
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
                {/* Cara trasera (oculta) */}
                <div className="memory-card-face w-full h-full rounded-lg bg-background-surface/60 flex items-center justify-center text-text-secondary text-2xl font-bold select-none">
                  ?
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
