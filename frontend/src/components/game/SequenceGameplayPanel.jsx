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
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
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
  // FE-1: el índice resaltado vive en ESTADO (no en un ref). Mutar un ref no
  // re-renderiza, y durante `memorizing` no hay ninguna otra fuente de re-render
  // (el timer visual está parado, `sequenceState` no cambia y el panel es memo), así
  // que el badge numerado "1,2,3…" NUNCA se pintaba pese a sonar el SFX de reparto
  // cada 600ms (desajuste audio-visual). El coste es 1 re-render/600ms solo durante
  // la memorización, y el objeto `sounds` es estable (memoizado, FE-6).
  const [highlightIndex, setHighlightIndex] = useState(-1);
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
    setHighlightIndex(-1);

    if (phase !== SEQUENCE_PHASES.MEMORIZING || sequence.length === 0 || shouldReduceMotion) {
      return undefined;
    }

    let idx = 0;
    sounds.playCardDeal();
    setHighlightIndex(0);
    const tick = () => {
      idx += 1;
      if (idx >= sequence.length) {
        setHighlightIndex(-1);
        highlightTimerRef.current = null;
        return;
      }
      setHighlightIndex(idx);
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
    <div className="relative w-full h-full min-h-0 flex flex-col items-center justify-center gap-[clamp(0.35rem,1.2vh,0.85rem)] px-2 md:px-4">
      {/* Board: región flex-1 (reparto equilibrado del alto con el panel táctil
          cuando aparece). Con min-h-0 puede encoger sin recortar las cartas. */}
      <div className="w-full flex-1 min-h-0 flex flex-col items-center justify-center">
        {/* Tablero SOLO visualización (huecos ocultos en orden). El input táctil
            va EXCLUSIVAMENTE por FallbackTouchPanelSequence, que está barajado:
            si el tablero fuese tappable, sus cartas se renderizan EN ORDEN de la
            secuencia y el alumno podría reproducirla de izquierda a derecha sin
            memorizar, filtrando la respuesta. Por eso no recibe onCardTap. */}
        <SequenceBoard
          sequence={sequence}
          length={length}
          phase={phase}
          cursor={cursor}
          cardStatuses={cardStatuses}
          highlightIndex={highlightIndex >= 0 ? highlightIndex : null}
          displaySeconds={displaySeconds}
          roundNumber={roundNumber}
          totalRounds={totalRounds}
          hint={hint}
          reduceMotion={shouldReduceMotion}
          isCollecting={isCollecting}
          overlayDurationMs={overlayDurationMs}
          onCardTap={null}
        />
      </div>

      {!rfidConnected && phase === SEQUENCE_PHASES.REPRODUCING && (
        <FallbackTouchPanelSequence
          cards={cardMappings}
          onSelectCard={handleCardTap}
          cursor={cursor}
          sequenceLength={length}
        />
      )}

      {/* La pista ya NO es un toast en la esquina: viaja al SequenceBoard y se
          pinta FIJA sobre la carta de la posición actual (ver SequenceCard). */}
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
