/**
 * @fileoverview Panel de gameplay para la mecánica Secuencia.
 *
 * Componente *presentational*: el estado intra-ronda (sequence, phase,
 * cursor, cardStatuses, highlightIndex, displaySeconds, roundNumber,
 * hint, isCollecting) vive en `GameSession.jsx` y se pasa por props.
 *
 * Aquí sólo:
 *  - Renderiza el SequenceBoard con los datos.
 *  - Muestra el panel táctil (FallbackTouchPanelSequence) en la fase
 *    reproducing cuando no hay sensor.
 *  - Muestra el toast de pista cuando llega.
 *  - Dispara los SFX de reparto/recogida en los momentos clave usando
 *    `useEffect` con dependencias en `phase` y `isCollecting`.
 */
import { memo, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import SequenceBoard from './sequence/SequenceBoard';
import FallbackTouchPanelSequence from './sequence/FallbackTouchPanelSequence';
import { SEQUENCE_PHASES } from '../../constants/sequenceConfig';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const HIGHLIGHT_INTERVAL_MS = 600;

const EMPTY_CARD_MAPPINGS = [];

function SequenceGameplayPanel({
  totalRounds,
  cardMappings = EMPTY_CARD_MAPPINGS,
  rfidConnected,
  soundEnabled = true,
  sequenceState,
  onCardTap
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const sounds = useSoundEffects(soundEnabled);
  const highlightTimerRef = useRef(null);
  const lastHighlightedRef = useRef(-1);
  const lastPhaseRef = useRef(null);
  const sweepFiredRef = useRef(false);

  const {
    sequence = [],
    length = 0,
    phase = SEQUENCE_PHASES.MEMORIZING,
    cursor = 0,
    cardStatuses = {},
    displaySeconds = 3,
    roundNumber = 1,
    hint = null,
    isCollecting = false,
    overlayDurationMs
  } = sequenceState || {};

  // Highlight numerado 1, 2, 3... durante memorizing.
  useEffect(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    lastHighlightedRef.current = -1;

    if (phase !== SEQUENCE_PHASES.MEMORIZING || sequence.length === 0 || shouldReduceMotion) {
      return undefined;
    }

    let idx = 0;
    sounds.playCardDeal();
    lastHighlightedRef.current = 0;
    const tick = () => {
      idx += 1;
      if (idx >= sequence.length) {
        lastHighlightedRef.current = -1;
        highlightTimerRef.current = null;
        return;
      }
      lastHighlightedRef.current = idx;
      sounds.playCardDeal();
      highlightTimerRef.current = setTimeout(tick, HIGHLIGHT_INTERVAL_MS);
    };
    highlightTimerRef.current = setTimeout(tick, HIGHLIGHT_INTERVAL_MS);

    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, [phase, sequence.length, shouldReduceMotion, sounds, roundNumber]);

  // SFX al iniciar la animación de recogida.
  useEffect(() => {
    if (isCollecting && !sweepFiredRef.current) {
      sounds.playCardSweep();
      sweepFiredRef.current = true;
    }
    if (!isCollecting && lastPhaseRef.current === SEQUENCE_PHASES.MEMORIZING) {
      sweepFiredRef.current = false;
    }
    lastPhaseRef.current = phase;
  }, [isCollecting, phase, sounds]);

  // Cleanup de timers al desmontar.
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const handleCardTap = useCallback(card => {
    if (typeof onCardTap === 'function') onCardTap(card);
  }, [onCardTap]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-4 px-2 md:px-4">
      <SequenceBoard
        sequence={sequence}
        length={length}
        phase={phase}
        cursor={cursor}
        cardStatuses={cardStatuses}
        highlightIndex={lastHighlightedRef.current >= 0 ? lastHighlightedRef.current : null}
        displaySeconds={displaySeconds}
        roundNumber={roundNumber}
        totalRounds={totalRounds}
        reduceMotion={shouldReduceMotion}
        isCollecting={isCollecting}
        overlayDurationMs={overlayDurationMs}
        onCardTap={!rfidConnected && phase === SEQUENCE_PHASES.REPRODUCING ? handleCardTap : null}
      />

      {!rfidConnected && phase === SEQUENCE_PHASES.REPRODUCING && (
        <FallbackTouchPanelSequence
          cards={cardMappings}
          onSelectCard={handleCardTap}
          cursor={cursor}
          sequenceLength={length}
        />
      )}

      <AnimatePresence>
        {hint && (
          <motion.div
            key={`hint-${roundNumber}-${hint.text}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            role="alert"
            aria-live="polite"
            className="absolute top-2 right-2 max-w-xs rounded-xl border border-accent-amber/40 bg-accent-amber/15 backdrop-blur px-4 py-2 text-text-primary shadow-lg flex items-center gap-2"
          >
            <Sparkles size={16} className="text-accent-amber shrink-0" aria-hidden="true" />
            <div>
              <p className="text-micro uppercase tracking-wider text-accent-amber/80">
                Pista {hint.type === 'partial' ? 'parcial' : 'completa'}
              </p>
              <p className="text-sm font-display font-semibold tabular-nums">{hint.text}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

SequenceGameplayPanel.propTypes = {
  totalRounds: PropTypes.number,
  cardMappings: PropTypes.array,
  rfidConnected: PropTypes.bool,
  soundEnabled: PropTypes.bool,
  sequenceState: PropTypes.object.isRequired,
  onCardTap: PropTypes.func
};

export default memo(SequenceGameplayPanel);
