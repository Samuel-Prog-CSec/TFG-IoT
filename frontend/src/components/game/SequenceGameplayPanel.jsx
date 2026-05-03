/**
 * @fileoverview Panel de gameplay para la mecánica Secuencia.
 *
 * Centraliza el estado intra-ronda (sequence, phase, cursor, cardStatuses,
 * highlightIndex, hint) y la suscripción a los eventos socket
 * `sequence_phase_*`, `sequence_card_result` y `sequence_round_result`.
 *
 * Se monta cuando `mechanicMode === 'sequence'` desde GameSession.jsx y se
 * encarga también de orquestar las animaciones signature *crupier* (entrada
 * en memorizing y salida tras `sequence_round_result`) y los SFX.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { socketService, GAME_EVENTS } from '../../services/socket';
import SequenceBoard from './sequence/SequenceBoard';
import FallbackTouchPanelSequence from './sequence/FallbackTouchPanelSequence';
import { SEQUENCE_PHASES, SEQUENCE_CARD_STATES } from '../../constants/sequenceConfig';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const HINT_TOAST_MS = 3500;
const COLLECT_DURATION_MS = 700;
const HIGHLIGHT_INTERVAL_MS = 600;

const TYPE_TO_STATUS = {
  correct: SEQUENCE_CARD_STATES.CORRECT,
  blocked: SEQUENCE_CARD_STATES.BLOCKED,
  timeout: SEQUENCE_CARD_STATES.TIMED_OUT,
  timedOut: SEQUENCE_CARD_STATES.TIMED_OUT
};

function SequenceGameplayPanel({
  totalRounds,
  cardMappings = [],
  rfidConnected,
  soundEnabled = true,
  onScoreUpdate,
  onCorrectAnswer,
  onSequenceCompletedFeedback
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const sounds = useSoundEffects(soundEnabled);

  const [sequence, setSequence] = useState([]);
  const [length, setLength] = useState(0);
  const [phase, setPhase] = useState(SEQUENCE_PHASES.MEMORIZING);
  const [cursor, setCursor] = useState(0);
  const [cardStatuses, setCardStatuses] = useState({});
  const [highlightIndex, setHighlightIndex] = useState(null);
  const [displaySeconds, setDisplaySeconds] = useState(3);
  const [roundNumber, setRoundNumber] = useState(1);
  const [hint, setHint] = useState(null);
  const [isCollecting, setIsCollecting] = useState(false);

  const highlightTimerRef = useRef(null);
  const hintTimerRef = useRef(null);

  const clearHighlightTimer = useCallback(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  }, []);

  const clearHintTimer = useCallback(() => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  }, []);

  // Resaltado secuencial 1, 2, 3... durante memorizing.
  const startHighlightSequence = useCallback(
    seqLength => {
      if (shouldReduceMotion || seqLength === 0) {
        setHighlightIndex(null);
        return;
      }
      let idx = 0;
      setHighlightIndex(0);
      sounds.playCardDeal();

      const tick = () => {
        idx += 1;
        if (idx >= seqLength) {
          setHighlightIndex(null);
          highlightTimerRef.current = null;
          return;
        }
        setHighlightIndex(idx);
        sounds.playCardDeal();
        highlightTimerRef.current = setTimeout(tick, HIGHLIGHT_INTERVAL_MS);
      };
      highlightTimerRef.current = setTimeout(tick, HIGHLIGHT_INTERVAL_MS);
    },
    [shouldReduceMotion, sounds]
  );

  // Listener: sequence_phase_memorizing
  useEffect(() => {
    const handler = payload => {
      clearHighlightTimer();
      clearHintTimer();
      setSequence(payload.sequence || []);
      setLength(payload.length || (payload.sequence?.length ?? 0));
      setPhase(SEQUENCE_PHASES.MEMORIZING);
      setCursor(0);
      setCardStatuses({});
      setHint(null);
      setIsCollecting(false);
      setDisplaySeconds(payload.displaySeconds || 3);
      setRoundNumber(payload.roundNumber || 1);
      startHighlightSequence(payload.length || (payload.sequence?.length ?? 0));
    };
    socketService.onGame(GAME_EVENTS.SEQUENCE_PHASE_MEMORIZING, handler);
    return () => socketService.offGame(GAME_EVENTS.SEQUENCE_PHASE_MEMORIZING, handler);
  }, [clearHighlightTimer, clearHintTimer, startHighlightSequence]);

  // Listener: sequence_phase_reproducing
  useEffect(() => {
    const handler = payload => {
      clearHighlightTimer();
      setHighlightIndex(null);
      setPhase(SEQUENCE_PHASES.REPRODUCING);
      setCursor(0);
      if (typeof payload.length === 'number') setLength(payload.length);
    };
    socketService.onGame(GAME_EVENTS.SEQUENCE_PHASE_REPRODUCING, handler);
    return () => socketService.offGame(GAME_EVENTS.SEQUENCE_PHASE_REPRODUCING, handler);
  }, [clearHighlightTimer]);

  // Listener: sequence_card_result
  useEffect(() => {
    const handler = payload => {
      const isCorrect = payload.type === 'correct';
      const isBlocked = payload.type === 'blocked';
      const { expectedUid } = payload;

      // Mapeo del tipo a status visual.
      const status = TYPE_TO_STATUS[payload.type];
      if (status && expectedUid) {
        setCardStatuses(prev => ({ ...prev, [expectedUid]: status }));
      }

      if (typeof payload.cursor === 'number') {
        setCursor(payload.cursor);
      }

      if (isCorrect) {
        sounds.playCorrect();
        onCorrectAnswer?.();
      } else if (isBlocked) {
        sounds.playIncorrect();
      } else if (payload.type === 'incorrect_with_hint' || payload.type === 'incorrect') {
        sounds.playIncorrect();
      }

      if (typeof payload.score === 'number') {
        onScoreUpdate?.(payload.score, isCorrect);
      }

      // Mostrar hint si llega.
      if (payload.hint?.text) {
        clearHintTimer();
        setHint(payload.hint);
        hintTimerRef.current = setTimeout(() => {
          setHint(null);
          hintTimerRef.current = null;
        }, HINT_TOAST_MS);
      }
    };
    socketService.onGame(GAME_EVENTS.SEQUENCE_CARD_RESULT, handler);
    return () => socketService.offGame(GAME_EVENTS.SEQUENCE_CARD_RESULT, handler);
  }, [sounds, onCorrectAnswer, onScoreUpdate, clearHintTimer]);

  // Listener: sequence_round_result (anima recogida)
  useEffect(() => {
    const handler = payload => {
      // Aplicar status final por carta (cubre las que faltaran si hubo timeout).
      const finalStatuses = {};
      (payload.results || []).forEach(item => {
        finalStatuses[item.uid] = TYPE_TO_STATUS[item.status] || SEQUENCE_CARD_STATES.HIDDEN;
      });
      setCardStatuses(prev => ({ ...prev, ...finalStatuses }));
      setPhase(SEQUENCE_PHASES.COMPLETED);

      if (payload.completed) {
        sounds.playSequenceComplete();
        onSequenceCompletedFeedback?.(payload);
      } else {
        sounds.playRoundStart(); // beep neutro de transición
      }

      // Animación de recogida tras 600ms para que el alumno vea los iconos.
      setTimeout(() => {
        sounds.playCardSweep();
        setIsCollecting(true);
      }, 500);
    };
    socketService.onGame(GAME_EVENTS.SEQUENCE_ROUND_RESULT, handler);
    return () => socketService.offGame(GAME_EVENTS.SEQUENCE_ROUND_RESULT, handler);
  }, [sounds, onSequenceCompletedFeedback]);

  // Cleanup
  useEffect(() => {
    return () => {
      clearHighlightTimer();
      clearHintTimer();
    };
  }, [clearHighlightTimer, clearHintTimer]);

  const handleCardTap = useCallback(card => {
    socketService.sendGameCommand?.(GAME_EVENTS.RFID_SCAN_FROM_CLIENT, {
      uid: card.uid,
      source: 'touch_fallback'
    });
  }, []);

  const fallbackCards = useMemo(() => {
    if (!Array.isArray(cardMappings)) return [];
    return cardMappings;
  }, [cardMappings]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-4 px-2 md:px-4">
      <SequenceBoard
        sequence={sequence}
        length={length}
        phase={phase}
        cursor={cursor}
        cardStatuses={cardStatuses}
        highlightIndex={highlightIndex}
        displaySeconds={displaySeconds}
        roundNumber={roundNumber}
        totalRounds={totalRounds}
        reduceMotion={shouldReduceMotion}
        isCollecting={isCollecting}
        onCardTap={!rfidConnected ? handleCardTap : null}
      />

      {!rfidConnected && phase === SEQUENCE_PHASES.REPRODUCING && (
        <FallbackTouchPanelSequence cards={fallbackCards} onSelectCard={handleCardTap} />
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
              <p className="text-[11px] uppercase tracking-wider text-accent-amber/80">
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
  onScoreUpdate: PropTypes.func,
  onCorrectAnswer: PropTypes.func,
  onSequenceCompletedFeedback: PropTypes.func
};

export default memo(SequenceGameplayPanel);
