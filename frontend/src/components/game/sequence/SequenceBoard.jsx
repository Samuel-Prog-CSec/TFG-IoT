/**
 * @fileoverview Tablero de la mecánica Secuencia.
 *
 * Orquesta las dos fases intra-ronda (memorizing → reproducing) y aplica las
 * dos animaciones signature *crupier* (entrada y salida). Las animaciones
 * son puramente CSS via `transform`/`opacity` para mantenerse en GPU.
 *
 * Props que entran del `SequenceGameplayPanel` y del socket:
 *  - `sequence`: array completo de la ronda en curso (visible en memorizing).
 *  - `length`: longitud de la secuencia (se usa cuando `sequence` viene oculta).
 *  - `phase`: 'memorizing' | 'reproducing' | 'completed'.
 *  - `cursor`: índice de la posición que se está validando ahora.
 *  - `cardStatuses`: mapa `uid → 'correct'|'blocked'|'timedOut'` actualizado
 *    a medida que llegan eventos `sequence_card_result`.
 *  - `displaySeconds`: para mostrar el indicador "Memoriza X segundos".
 *  - `roundNumber` / `totalRounds`: cabecera.
 *  - `lastHint`: el último hint recibido desde el backend (toast).
 *  - `onCardTap`: callback usado por FallbackTouchPanelSequence.
 *  - `reduceMotion`: respeta `prefers-reduced-motion`.
 *
 * El componente NO mantiene estado local complejo: es controlado desde el
 * GameSession a través de los eventos socket; aquí sólo aplicamos timings
 * locales (countdown del display, transición entre fases) que necesitan
 * sincronía con la animación.
 */
import { memo, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence, useReducedMotion as useFramerReducedMotion } from 'framer-motion';
import SequenceCard from './SequenceCard';
import SequenceProgressDots from './SequenceProgressDots';
import PhaseTransitionOverlay from './PhaseTransitionOverlay';
import { SEQUENCE_PHASES, SEQUENCE_CARD_STATES } from '../../../constants/sequenceConfig';
import { cn } from '../../../lib/utils';

const DEAL_STAGGER_MS = 90;
const COLLECT_STAGGER_MS = 70;

const dealVariants = {
  hidden: { x: -180, y: -120, rotate: -25, scale: 0.6, opacity: 0 },
  show: index => ({
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    opacity: 1,
    transition: {
      delay: (index * DEAL_STAGGER_MS) / 1000,
      type: 'spring',
      stiffness: 220,
      damping: 20
    }
  })
};

const collectVariants = {
  show: { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
  exit: index => ({
    x: 220 + index * 18,
    y: -200,
    rotate: 18,
    scale: 0.8,
    opacity: 0,
    transition: {
      delay: (index * COLLECT_STAGGER_MS) / 1000,
      duration: 0.32,
      ease: [0.32, 0.72, 0, 1]
    }
  })
};

const REDUCED_MOTION_DELAY_PER_CARD = 0.05;

const reducedDealVariants = {
  hidden: { opacity: 0 },
  show: index => ({
    opacity: 1,
    transition: { delay: index * REDUCED_MOTION_DELAY_PER_CARD, duration: 0.2 }
  })
};

function getGridCols(length) {
  if (length <= 3) return 'grid-cols-3';
  if (length <= 4) return 'grid-cols-4';
  if (length <= 6) return 'grid-cols-3 md:grid-cols-6';
  return 'grid-cols-4 md:grid-cols-7';
}

function SequenceBoard({
  sequence = [],
  length = 0,
  phase = SEQUENCE_PHASES.MEMORIZING,
  cursor = 0,
  cardStatuses = {},
  highlightIndex = null,
  displaySeconds = 3,
  roundNumber = 1,
  totalRounds = 1,
  reduceMotion: reduceMotionProp,
  onCardTap,
  isCollecting = false
}) {
  const framerPrefersReduced = useFramerReducedMotion();
  const reduceMotion = reduceMotionProp ?? framerPrefersReduced;

  const sequenceLength = length || sequence.length;

  // Construir array para render: en memorizing usamos `sequence` (visible);
  // en reproducing usamos los uids con su `cardStatuses`.
  const items = sequence.map((item, index) => ({
    ...item,
    index,
    status: cardStatuses[item.uid] || SEQUENCE_CARD_STATES.HIDDEN,
    highlight: highlightIndex === index ? index + 1 : null
  }));

  const isMemorizing = phase === SEQUENCE_PHASES.MEMORIZING;
  const isReproducing = phase === SEQUENCE_PHASES.REPRODUCING;

  // Construir statuses para los dots.
  const dotStatuses = items.map(item => {
    if (item.status === SEQUENCE_CARD_STATES.CORRECT) return 'correct';
    if (item.status === SEQUENCE_CARD_STATES.BLOCKED) return 'blocked';
    if (item.status === SEQUENCE_CARD_STATES.TIMED_OUT) return 'timedOut';
    return null;
  });

  // Para evitar re-disparar la animación de reparto cuando cambia el cursor,
  // conservamos una "ronda visible" estable.
  const lastRoundRef = useRef(roundNumber);
  useEffect(() => {
    lastRoundRef.current = roundNumber;
  }, [roundNumber]);

  // Overlay de transición memorizing → reproducing: aparece 2.4s y se
  // cierra solo (BUG QA 03/05/2026: con la condición "isReproducing &&
  // cursor === 0 && cardStatuses vacío" el overlay se quedaba fijo en
  // pantalla bloqueando al alumno).
  const [showOverlay, setShowOverlay] = useState(false);
  useEffect(() => {
    if (!isReproducing) {
      setShowOverlay(false);
      return undefined;
    }
    setShowOverlay(true);
    const timer = setTimeout(() => setShowOverlay(false), 2400);
    return () => clearTimeout(timer);
    // Re-disparamos el overlay al cambiar de ronda (cada vez que pasamos
    // a reproducing una nueva), por eso `roundNumber` está en deps.
  }, [isReproducing, roundNumber]);

  const variants = reduceMotion ? reducedDealVariants : dealVariants;

  return (
    <div className="relative w-full max-w-5xl mx-auto flex flex-col items-center gap-4">
      <header className="flex flex-col items-center gap-1">
        <p className="text-xs uppercase tracking-widest text-text-muted">
          Ronda {roundNumber} de {totalRounds}
        </p>
        <p
          className={cn(
            'text-base font-medium',
            isMemorizing && 'text-text-primary',
            isReproducing && 'text-accent-amber',
            phase === SEQUENCE_PHASES.COMPLETED && 'text-success-base'
          )}
        >
          {(() => {
            if (isMemorizing) return `Memoriza el orden — ${displaySeconds}s`;
            if (isReproducing) return 'Tu turno: escanea las cartas en orden';
            return '¡Secuencia completada!';
          })()}
        </p>
      </header>

      <div className="relative w-full">
        <PhaseTransitionOverlay visible={showOverlay} reduceMotion={reduceMotion} />

        <ol
          className={cn(
            'grid gap-3 sm:gap-4',
            getGridCols(items.length),
            'list-none p-0 m-0'
          )}
          aria-label={
            isMemorizing
              ? 'Secuencia mostrada: memorízala en orden.'
              : 'Reproduce la secuencia escaneando cada carta en orden.'
          }
        >
          <AnimatePresence>
            {!isCollecting &&
              items.map(item => {
                const isFaceUp = isMemorizing; // siempre visibles en memorizing
                return (
                  <motion.li
                    key={`seq-${roundNumber}-${item.uid}-${item.index}`}
                    custom={item.index}
                    variants={variants}
                    initial="hidden"
                    animate="show"
                  >
                    <CardCellButton
                      item={item}
                      onCardTap={onCardTap}
                      isInteractive={isReproducing && Boolean(onCardTap)}
                      isFaceUp={isFaceUp}
                      reduceMotion={reduceMotion}
                    />
                  </motion.li>
                );
              })}

            {isCollecting &&
              items.map(item => (
                <motion.li
                  key={`collect-${roundNumber}-${item.uid}-${item.index}`}
                  custom={item.index}
                  variants={collectVariants}
                  initial="show"
                  animate="exit"
                >
                  <CardCellButton
                    item={item}
                    onCardTap={null}
                    isInteractive={false}
                    isFaceUp
                    reduceMotion={reduceMotion}
                  />
                </motion.li>
              ))}
          </AnimatePresence>
        </ol>
      </div>

      <SequenceProgressDots
        length={sequenceLength}
        statuses={dotStatuses}
        cursor={cursor}
        reduceMotion={reduceMotion}
      />
    </div>
  );
}

function CardCellButton({ item, onCardTap, isInteractive, isFaceUp, reduceMotion }) {
  if (!isInteractive) {
    return (
      <SequenceCard
        uid={item.uid}
        assignedValue={item.assignedValue}
        displayData={item.displayData}
        status={item.status}
        highlightOrder={item.highlight}
        isFaceUp={isFaceUp}
        reduceMotion={reduceMotion}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => onCardTap?.(item)}
      className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber focus-visible:ring-offset-2 focus-visible:ring-offset-background-base rounded-xl"
      aria-label={`Seleccionar carta: ${item.assignedValue || item.uid}`}
    >
      <SequenceCard
        uid={item.uid}
        assignedValue={item.assignedValue}
        displayData={item.displayData}
        status={item.status}
        highlightOrder={item.highlight}
        isFaceUp={isFaceUp}
        reduceMotion={reduceMotion}
      />
    </button>
  );
}

SequenceBoard.propTypes = {
  sequence: PropTypes.array,
  length: PropTypes.number,
  phase: PropTypes.oneOf(Object.values(SEQUENCE_PHASES)),
  cursor: PropTypes.number,
  cardStatuses: PropTypes.object,
  highlightIndex: PropTypes.number,
  displaySeconds: PropTypes.number,
  roundNumber: PropTypes.number,
  totalRounds: PropTypes.number,
  reduceMotion: PropTypes.bool,
  onCardTap: PropTypes.func,
  isCollecting: PropTypes.bool
};

CardCellButton.propTypes = {
  item: PropTypes.object.isRequired,
  onCardTap: PropTypes.func,
  isInteractive: PropTypes.bool,
  isFaceUp: PropTypes.bool,
  reduceMotion: PropTypes.bool
};

export default memo(SequenceBoard);
