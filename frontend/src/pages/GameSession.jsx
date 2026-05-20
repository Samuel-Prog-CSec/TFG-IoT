import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Pause, Play, Volume2, VolumeX, AlertTriangle, Hand, Search, Gamepad2 } from 'lucide-react';
import { cn, calculateStars, EASING } from '../lib/utils';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAuth } from '../context/AuthContext';
import RFIDConnector from '../components/ui/RFIDConnector';
import { extractErrorMessage } from '../services/api';
import { ROUTES } from '../constants/routes';
import { toast } from 'sonner';
import ErrorBoundary from '../components/common/ErrorBoundary';
import Tooltip from '../components/ui/Tooltip';
import TimerBar from '../components/game/TimerBar';
import { ScoreDisplayCompactMemo as ScoreDisplayCompact } from '../components/game/ScoreDisplay';
import GameOverScreen from '../components/game/GameOverScreen';
import CharacterMascot from '../components/game/CharacterMascot';
import AssociationGameplayPanel from '../components/game/AssociationGameplayPanel';
import { resolveAssociationTheme } from '../components/game/associationTheme';
import { getMechanicTheme } from '../lib/mechanicTheme';
import MemoryGameplayPanel from '../components/game/MemoryGameplayPanel';
import SequenceGameplayPanel from '../components/game/SequenceGameplayPanel';
import GameBackdrop from '../components/game/GameBackdrop';
import FallbackTouchPanel from '../components/game/FallbackTouchPanel';
import RateLimitBanner from '../components/game/RateLimitBanner';
import { prefetchDeckImages } from '../lib/cardMapping';
import CurrentPlayMetrics from '../components/game/CurrentPlayMetrics';
import { useGameFeedback } from '../hooks/useGameFeedback';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { useGameTimer } from '../hooks/useGameTimer';
import { useGameSocket } from '../hooks/useGameSocket';
import { useGameSessionState } from '../hooks/useGameSessionState';
import { normalizeFinalSummary } from '../lib/finalSummary';
import { saveSnapshot, loadSnapshot, clearSnapshot, purgeExpiredSnapshots } from '../lib/sessionSnapshot';

const FLOAT_DELAY_STYLE = { animationDelay: '1s' };
const FLOAT_DELAY_NONE = { animationDelay: '0s' };

// `gameReducer` + `INITIAL_GAME_STATE` extraídos a `hooks/useGameSessionState.js`
// y `normalizeFinalSummary` a `lib/finalSummary.js` (Sprint 0 pre-v1.0.0 C2)
// para reducir la complejidad cognitiva de este archivo y testear las unidades
// puras por separado. Los imports están al inicio del fichero.

/**
 * Pantalla principal de juego para niños de 4-8 años.
 * Diseño colorido, amigable y sin texto complejo.
 */
/* eslint-disable-next-line sonarjs/cyclomatic-complexity --
   pantalla de juego con multiples fases (waiting/playing/paused/ended), modos (association/memory),
   handlers de socket y renderizado condicional por estado. La logica esta partida en hooks
   (useGameSocket, useGameTimer, useGameFeedback) pero la coordinacion visual reside aqui. */
export default function GameSession() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const ROUND_TIME = 15;
  const { shouldReduceMotion } = useReducedMotion();
  useDocumentTitle('Partida');

  // --- Refs ---
  const pendingTimeoutRef = useRef([]);
  const previousFocusRef = useRef(null);
  const pauseButtonRef = useRef(null);
  const continueButtonRef = useRef(null);
  const gameStartTimeRef = useRef(null);
  const boardReadyEmittedRef = useRef(false);
  const totalRoundsRef = useRef(5);
  const roundTimeRef = useRef(ROUND_TIME);
  const socketSessionRef = useRef(null); // Ref al objeto session del socket hook

  // --- Estado coordinado del juego (extraído a hooks/useGameSessionState) ---
  const { game, dispatch } = useGameSessionState();
  const { gameState, currentRound, score, correctAnswers, isAwaitingResponse } = game;

  // Señaliza al GameLayout que hay una partida activa para que la salida
  // pida confirmación. Se limpia al desmontar la página. El custom event
  // `gameactive:change` evita que GameLayout tenga que hacer polling.
  useEffect(() => {
    globalThis.__gameActive = true;
    globalThis.dispatchEvent(new CustomEvent('gameactive:change'));
    return () => {
      globalThis.__gameActive = false;
      globalThis.dispatchEvent(new CustomEvent('gameactive:change'));
    };
  }, []);

  // Flash "Seguimos" al reanudar partida: captura el cambio paused -> playing
  // para mostrar un micro-feedback visual que confirma la accion del usuario.
  const prevGameStateRef = useRef(gameState);
  const [showResumeFlash, setShowResumeFlash] = useState(false);
  useEffect(() => {
    if (prevGameStateRef.current === 'paused' && gameState === 'playing') {
      setShowResumeFlash(true);
      const timer = globalThis.setTimeout(() => setShowResumeFlash(false), 420);
      prevGameStateRef.current = gameState;
      return () => globalThis.clearTimeout(timer);
    }
    prevGameStateRef.current = gameState;
    return undefined;
  }, [gameState]);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const { playCorrect, playIncorrect, playTick, playRoundStart, playGameOver, playSuccess } = useSoundEffects(soundEnabled);
  const [totalRounds, setTotalRounds] = useState(5);
  const [roundTime, setRoundTime] = useState(ROUND_TIME);
  const [playSummary, setPlaySummary] = useState(null);
  const [memoryStats, setMemoryStats] = useState({ attempts: 0, matchedCount: 0, totalCards: 0 });
  const [memoryFeedbackActive, setMemoryFeedbackActive] = useState(false);
  const [srAnnouncement, setSrAnnouncement] = useState('');
  const [showPreCelebration, setShowPreCelebration] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [shakeError, setShakeError] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [memoryBoard, setMemoryBoard] = useState([]);
  // Hint "Toca las cartas del tablero" solo util antes del primer tap; se oculta
  // al primer tap para no ruido visual durante el resto de la partida (QA 22/04/2026).
  const [hasTappedBoardOnce, setHasTappedBoardOnce] = useState(false);
  // mechanicMode se resuelve como derivado tras obtener session del socket hook.
  // Mantenemos `sessionIsMemory` y `sessionIsSequence` como aliases derivados
  // para legibilidad de los branches existentes; cuando entre una cuarta
  // mecánica conviene ya tener un único `mechanicMode` como source of truth.
  const [mechanicMode, setMechanicMode] = useState('association');
  const sessionIsMemory = mechanicMode === 'memory';
  const sessionIsSequence = mechanicMode === 'sequence';

  // Estado intra-ronda de la mecánica Secuencia (T-921). Vive aquí (no en
  // SequenceGameplayPanel) para que los listeners de useGameSocket se
  // registren ANTES de que el componente Secuencia se monte por
  // mechanicMode resolver — sin esto, el primer sequence_phase_memorizing
  // emitido por el backend al `start_play` se perdería (BUG-QA-6, QA 03/05/2026).
  const [sequenceState, setSequenceState] = useState({
    sequence: [],
    length: 0,
    phase: 'memorizing',
    cursor: 0,
    cardStatuses: {},
    highlightIndex: null,
    displaySeconds: 3,
    roundNumber: 1,
    hint: null,
    isCollecting: false
  });
  const sequenceCollectTimerRef = useRef(null);
  const sequenceHintTimerRef = useRef(null);
  // QA 2026-05-06 (ADR-113): timer del grace period entre overlay
  // "Reproduce la secuencia" y `AWAIT_RESPONSE=true` real. Ver
  // `handleSequencePhaseReproducing`.
  const sequenceGraceTimerRef = useRef(null);
  // Flag para el hook de timer: en Memoria, solo empieza a decrementar cuando
  // el backend ha confirmado board_ready (playEndsAt establecido). Antes de
  // eso mostramos la barra llena y estatica, evitando el visual "bucle vacio".
  const [memoryTimerArmed, setMemoryTimerArmed] = useState(false);

  // --- Hooks de feedback y sonido ---
  const gameFeedback = useGameFeedback({
    isMemoryMode: sessionIsMemory,
    shouldReduceMotion,
    // ADR-D: la mascota usa el diccionario por mecánica.
    mechanicType: mechanicMode
  });
  const {
    clearFeedback,
    processValidationResult,
    resetForNewPlay,
    feedbackState,
    feedbackPoints,
    feedbackMessage,
    isTimeout: feedbackIsTimeout,
    mascotMood,
    mascotMessage,
  } = gameFeedback;

  // --- Timer hook (instanciado antes de callbacks para que setTimeLeft esté disponible) ---
  const {
    timeLeft, setTimeLeft,
    announceTimerThreshold, clearAnnouncedThresholds
  } = useGameTimer({
    gameState,
    isAwaitingResponse,
    isMemoryMode: sessionIsMemory,
    memoryFeedbackActive,
    memoryTimerArmed,
    roundTime,
    playTick
  });

  // Sincronizar refs
  useEffect(() => {
    totalRoundsRef.current = totalRounds;
    roundTimeRef.current = roundTime;
  }, [totalRounds, roundTime]);

  // --- Utilidades internas ---

  const clearPendingTimeouts = useCallback(() => {
    pendingTimeoutRef.current.forEach(timeoutId => globalThis.clearTimeout(timeoutId));
    pendingTimeoutRef.current = [];
  }, []);

  const scheduleFeedbackClear = useCallback((delayMs = 1400) => {
    const timeoutId = globalThis.setTimeout(() => {
      clearFeedback();
    }, delayMs);
    pendingTimeoutRef.current.push(timeoutId);
  }, [clearFeedback]);

  const normalizeChallenge = useCallback(rawChallenge => {
    const displayData = rawChallenge?.displayData || rawChallenge || {};

    if (!displayData || typeof displayData !== 'object') {
      return null;
    }

    return {
      id: rawChallenge?.uid || displayData?.key || displayData?.value,
      uid: rawChallenge?.uid,
      key: displayData?.key || '',
      value: displayData?.value || rawChallenge?.assignedValue || '---',
      display: displayData?.display || '?',
      imageUrl: displayData?.imageUrl || null,
      thumbnailUrl: displayData?.thumbnailUrl || null,
      audioUrl: displayData?.audioUrl || null,
      // Consigna personalizada opcional definida por el profesor en el
      // wizard de creación de sesión (PROP-102). El backend la emite en
      // el challenge del evento `new_round` / `game_state_update`.
      promptText: rawChallenge?.promptText || displayData?.promptText || null
    };
  }, []);

  // --- Callbacks para eventos del socket ---

  const handleValidationResult = useCallback(
    payload => {
      const feedbackDelayMs = Number(payload?.feedbackDelayMs || 1400);

      const gameContext = {
        currentRound, totalRounds, timeLeft,
        timeLimit: roundTime,
        matchedCount: memoryStats.matchedCount,
        totalCards: memoryStats.totalCards,
        attempts: memoryStats.attempts,
      };

      const { isCorrect } = processValidationResult(payload, gameContext);

      // Feedback sonoro inmediato
      if (isCorrect) { playCorrect(); } else { playIncorrect(); }

      const newScore = Number.isFinite(payload?.newScore) ? payload.newScore : 0;
      if (isCorrect) {
        dispatch({ type: 'ANSWER_CORRECT', score: newScore });
      } else {
        dispatch({ type: 'ANSWER_INCORRECT', score: newScore });
        setShakeError(true);
        globalThis.setTimeout(() => setShakeError(false), 600);
      }
      if (socketSessionRef.current?.mechanic?.name === 'memory') {
        setMemoryFeedbackActive(true);
      }
      clearAnnouncedThresholds();

      setSrAnnouncement(`Ronda ${currentRound}: respuesta ${isCorrect ? 'correcta' : 'incorrecta'}. Puntuación: ${newScore}.`);

      scheduleFeedbackClear(
        Number.isFinite(feedbackDelayMs) && feedbackDelayMs > 0 ? feedbackDelayMs : 1400
      );
    },
    [scheduleFeedbackClear, processValidationResult, currentRound, totalRounds, timeLeft, roundTime, memoryStats, playCorrect, playIncorrect, clearAnnouncedThresholds]
  );

  const handleNewRound = useCallback(
    payload => {
      clearAnnouncedThresholds();
      clearPendingTimeouts();
      clearFeedback();
      if (!gameStartTimeRef.current) {
        gameStartTimeRef.current = Date.now();
      }

      const roundNumber = Number(payload?.roundNumber || 1);
      const roundScore = Number.isFinite(payload?.score) ? payload.score : 0;
      dispatch({ type: 'NEW_ROUND', round: roundNumber, score: roundScore });

      const payloadTotalRounds = Number(payload?.totalRounds);
      const nextTotalRounds = Number.isFinite(payloadTotalRounds) && payloadTotalRounds > 0
        ? payloadTotalRounds
        : totalRoundsRef.current || 5;

      const payloadTimeLimit = Number(payload?.timeLimit);
      const nextTimeLimit = Number.isFinite(payloadTimeLimit) && payloadTimeLimit > 0
        ? payloadTimeLimit
        : roundTimeRef.current || ROUND_TIME;

      setTotalRounds(nextTotalRounds);
      setRoundTime(nextTimeLimit);
      setTimeLeft(nextTimeLimit);
      setChallenge(normalizeChallenge(payload?.challenge));
      playRoundStart();
      setSrAnnouncement(`Ronda ${Number(payload?.roundNumber || 1)} de ${nextTotalRounds} iniciada.`);
    },
    [clearPendingTimeouts, normalizeChallenge, clearFeedback, playRoundStart, setTimeLeft, clearAnnouncedThresholds]
  );

  const handlePlayPaused = useCallback(payload => {
    const remaining = Number(payload?.remainingTimeMs);
    dispatch({ type: 'PAUSE' });
    clearFeedback();
    setSrAnnouncement('Partida en pausa.');

    if (Number.isFinite(remaining) && remaining >= 0) {
      setTimeLeft(Math.max(0, Math.ceil(remaining / 1000)));
    }
  }, [clearFeedback, setTimeLeft]);

  const handlePlayResumed = useCallback(
    payload => {
      const remaining = Number(payload?.remainingTimeMs);
      dispatch({ type: 'RESUME' });
      clearFeedback();
      if (payload?.challenge) {
        setChallenge(normalizeChallenge(payload.challenge));
      }
      if (Number.isFinite(remaining) && remaining >= 0) {
        setTimeLeft(Math.max(1, Math.ceil(remaining / 1000)));
      }
      clearAnnouncedThresholds();
      setSrAnnouncement('Partida reanudada.');
    },
    [normalizeChallenge, clearFeedback, setTimeLeft, clearAnnouncedThresholds]
  );

  const handlePlayState = useCallback(payload => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    // Construir actualización atómica del estado coordinado
    const syncAction = { type: 'PLAY_STATE_SYNC' };
    if (payload?.status === 'paused' || payload?.isPaused) {
      syncAction.gameState = 'paused';
    } else if (payload?.status === 'in-progress') {
      syncAction.gameState = 'playing';
    }
    if (Number.isFinite(payload?.currentRound)) {
      syncAction.currentRound = payload.currentRound;
    }
    if (Number.isFinite(payload?.score)) {
      syncAction.score = payload.score;
    }
    if (typeof payload?.awaitingResponse === 'boolean') {
      syncAction.isAwaitingResponse = payload.awaitingResponse;
    }
    dispatch(syncAction);

    // Sesión reanudada: si no llega un `new_round` (la mecánica Secuencia
    // arranca con `sequence_phase_memorizing`, sin `new_round`) y la sesión
    // ya estaba en curso, gameStartTimeRef quedaría null y el resumen
    // final mostraría "Tiempo total: —". Lo inicializamos aquí como
    // fallback conservador (puede infraestimar el tiempo real si la
    // sesión llevaba ya un rato, pero el backend `completionTime` toma
    // precedencia en `normalizeFinalSummary`).
    if (payload?.status === 'in-progress' && !gameStartTimeRef.current) {
      gameStartTimeRef.current = Date.now();
    }

    if (Number.isFinite(payload?.maxRounds)) {
      setTotalRounds(payload.maxRounds);
    }

    if (Number.isFinite(payload?.remainingTimeMs) && payload.remainingTimeMs >= 0) {
      setTimeLeft(Math.max(0, Math.ceil(payload.remainingTimeMs / 1000)));
    }

    if (payload?.currentChallenge) {
      setChallenge(normalizeChallenge(payload.currentChallenge));
    }

    if (payload?.memoryState && typeof payload.memoryState === 'object') {
      setMemoryBoard(Array.isArray(payload.memoryState.board) ? payload.memoryState.board : []);
      setMemoryStats({
        attempts: Number(payload.memoryState.attempts || 0),
        matchedCount: Number(payload.memoryState.matchedCount || 0),
        totalCards: Number(payload.memoryState.totalCards || 0)
      });
    }
  }, [normalizeChallenge, setTimeLeft]);

  const handleMemoryTurnState = useCallback(payload => {
    const phase = payload?.phase;

    setMemoryBoard(Array.isArray(payload?.board) ? payload.board : []);
    setMemoryStats({
      attempts: Number(payload?.attempts || 0),
      matchedCount: Number(payload?.matchedCount || 0),
      totalCards: Number(payload?.totalCards || 0)
    });

    const remainingMs = Number(payload?.remainingTimeMs);
    if (Number.isFinite(remainingMs) && remainingMs > 0) {
      setTimeLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
      // El backend ha armado el timer (playEndsAt != null). Senalamos al hook
      // de timer que ya puede decrementar: hasta ahora la UI mostraba la barra
      // completa sin moverse para evitar el bucle de "vacia" prematuro.
      setMemoryTimerArmed(true);
    }

    // Actualización atómica de campos coordinados
    const syncAction = { type: 'PLAY_STATE_SYNC' };
    if (Number.isFinite(payload?.score)) {
      syncAction.score = payload.score;
    }
    if (typeof payload?.awaitingResponse === 'boolean') {
      syncAction.isAwaitingResponse = payload.awaitingResponse;
    }
    if (Number.isFinite(payload?.attempts)) {
      syncAction.currentRound = Math.max(1, payload.attempts + 1);
    }
    dispatch(syncAction);

    if (phase === 'match' || phase === 'mismatch') {
      setMemoryFeedbackActive(true);
    }

    if (
      phase === 'round_start' ||
      phase === 'first_pick' ||
      phase === 'concealed' ||
      phase === 'resumed' ||
      phase === 'ignored'
    ) {
      setMemoryFeedbackActive(false);
    }
  }, [setTimeLeft]);

  const handleGameOver = useCallback(payload => {
    playGameOver();
    clearPendingTimeouts();
    setMemoryFeedbackActive(false);
    clearFeedback();

    const finalScore = Number.isFinite(payload?.finalScore) ? payload.finalScore : 0;
    setSrAnnouncement('Partida finalizada.');
    setPlaySummary(
      normalizeFinalSummary(
        payload?.metrics,
        finalScore,
        correctAnswers,
        // El backend emite `payload.mode` directamente (memory|association|sequence)
        // desde T-921; usamos esa fuente y caemos a inferencia local sólo si falta.
        payload?.mode || socketSessionRef.current?.mechanic?.name || 'association',
        gameStartTimeRef.current,
        // ADR-114: maxScore viaja en el payload de game_over para que el
        // GameOverScreen pueda mostrar `score / maxScore (Z%)`.
        payload?.maxScore
      )
    );

    if (shouldReduceMotion) {
      dispatch({ type: 'FINISH', score: finalScore });
    } else {
      dispatch({ type: 'AWAIT_RESPONSE', value: false });
      dispatch({ type: 'SET_SCORE', value: finalScore });
      setShowPreCelebration(true);
      const celebrationTimeout = globalThis.setTimeout(() => {
        setShowPreCelebration(false);
        dispatch({ type: 'FINISH', score: finalScore });
      }, 1200);
      pendingTimeoutRef.current.push(celebrationTimeout);
    }
  }, [clearPendingTimeouts, clearFeedback, correctAnswers, shouldReduceMotion, playGameOver]);

  const handlePlayInterrupted = useCallback(payload => {
    clearPendingTimeouts();
    clearFeedback();
    setMemoryFeedbackActive(false);

    const finalScore = Number.isFinite(payload?.finalScore) ? payload.finalScore : score;
    dispatch({ type: 'FINISH', score: finalScore });

    const interruptionMessage =
      payload?.message ||
      'La partida se interrumpió por un reinicio o problema del servidor. Consulta al docente.';

    setSrAnnouncement('La partida fue interrumpida.');
    toast.warning(interruptionMessage);
  }, [clearPendingTimeouts, clearFeedback, score]);

  const handleSrAnnouncement = useCallback((msg) => {
    setSrAnnouncement(msg);
  }, []);

  // --- Socket hook ---

  // Handlers para los eventos socket de Secuencia (T-921). Se registran en
  // useGameSocket (no en SequenceGameplayPanel) para que estén activos antes
  // del primer evento del backend.
  const handleSequencePhaseMemorizing = useCallback(payload => {
    if (sequenceCollectTimerRef.current) clearTimeout(sequenceCollectTimerRef.current);
    if (sequenceHintTimerRef.current) clearTimeout(sequenceHintTimerRef.current);
    // Cancelar grace timer pendiente (en caso de transición rápida tras
    // pause/resume o reanudación de partida).
    if (sequenceGraceTimerRef.current) {
      clearTimeout(sequenceGraceTimerRef.current);
      sequenceGraceTimerRef.current = null;
    }

    const roundNumber = Number(payload?.roundNumber) || 1;
    const totalRoundsPayload = Number(payload?.totalRounds);

    setSequenceState({
      sequence: payload?.sequence || [],
      length: payload?.length || (payload?.sequence?.length ?? 0),
      phase: 'memorizing',
      cursor: 0,
      cardStatuses: {},
      highlightIndex: null,
      displaySeconds: payload?.displaySeconds || 3,
      roundNumber,
      hint: null,
      isCollecting: false
    });

    // Sincronizar header de la partida (ronda actual / total) — el backend
    // de Secuencia no emite `new_round`, así que lo hacemos a mano aquí.
    dispatch({ type: 'SET_ROUND', value: roundNumber });
    if (Number.isFinite(totalRoundsPayload) && totalRoundsPayload > 0) {
      setTotalRounds(totalRoundsPayload);
    }
    if (typeof payload?.score === 'number') {
      dispatch({ type: 'SET_SCORE', value: payload.score });
    }

    // Durante la memorización el timer del cliente NO debe correr (el
    // backend ni siquiera ha armado `roundTimer` aún) — pintar la barra
    // llena y desactivar isAwaitingResponse para detener `useGameTimer`.
    dispatch({ type: 'AWAIT_RESPONSE', value: false });
    clearAnnouncedThresholds();
    setTimeLeft(roundTimeRef.current || ROUND_TIME);
  }, [setTimeLeft, clearAnnouncedThresholds]);

  const handleSequencePhaseReproducing = useCallback(payload => {
    // Sincronizar `overlayDurationMs` con el `gracePeriodMs` del backend para
    // que PhaseTransitionOverlay y el setTimeout interno de SequenceBoard usen
    // exactamente la misma duración. Si el evento no trae el campo (test o
    // backend antiguo), SequenceBoard/Overlay caen al fallback (2400ms).
    const gracePeriodMsForOverlay = Number(payload?.gracePeriodMs);
    setSequenceState(prev => ({
      ...prev,
      phase: 'reproducing',
      cursor: 0,
      length: typeof payload?.length === 'number' ? payload.length : prev.length,
      overlayDurationMs: Number.isFinite(gracePeriodMsForOverlay) && gracePeriodMsForOverlay > 0
        ? gracePeriodMsForOverlay
        : prev.overlayDurationMs
    }));

    // Reiniciar la barra a la duración real de esta ronda. El backend acaba
    // de armar un `roundTimer` nuevo en sequenceFlow.enterReproducingPhase;
    // sin esto la barra continuaba la cuenta de la ronda anterior (BUG QA
    // 03/05/2026: "el tiempo se aplica al total de rondas y no se reinicia").
    const timeLimitMs = Number(payload?.timeLimitMs);
    if (Number.isFinite(timeLimitMs) && timeLimitMs > 0) {
      const seconds = Math.max(1, Math.ceil(timeLimitMs / 1000));
      setRoundTime(seconds);
      setTimeLeft(seconds);
    } else {
      setTimeLeft(roundTimeRef.current || ROUND_TIME);
    }
    clearAnnouncedThresholds();

    // QA 2026-05-06: el backend nos envía `gracePeriodMs` (2400ms por
    // defecto) que coincide con la duración del `PhaseTransitionOverlay`.
    // Postponemos `AWAIT_RESPONSE=true` hasta tras el overlay para que la
    // `TimerBar` no decremente durante el countdown — antes el alumno
    // "perdía" 2-3s de su tiempo configurado mientras leía "¡Ya!". El
    // `roundTimer` del backend ya está calibrado al período total
    // (grace + timeLimit + 150ms), así que ambos lados quedan sincronizados.
    const gracePeriodMs = Number(payload?.gracePeriodMs) || 0;
    if (sequenceGraceTimerRef.current) {
      clearTimeout(sequenceGraceTimerRef.current);
      sequenceGraceTimerRef.current = null;
    }
    if (gracePeriodMs > 0) {
      sequenceGraceTimerRef.current = setTimeout(() => {
        dispatch({ type: 'AWAIT_RESPONSE', value: true });
        sequenceGraceTimerRef.current = null;
      }, gracePeriodMs);
    } else {
      dispatch({ type: 'AWAIT_RESPONSE', value: true });
    }
  }, [setTimeLeft, clearAnnouncedThresholds]);

  const handleSequenceCardResult = useCallback(payload => {
    const TYPE_TO_STATUS = {
      correct: 'correct',
      blocked: 'blocked',
      timedOut: 'timedOut',
      timeout: 'timedOut'
    };
    const status = TYPE_TO_STATUS[payload?.type];
    setSequenceState(prev => {
      const nextStatuses = { ...prev.cardStatuses };
      if (status && payload?.expectedUid) nextStatuses[payload.expectedUid] = status;
      return {
        ...prev,
        cardStatuses: nextStatuses,
        cursor: typeof payload?.cursor === 'number' ? payload.cursor : prev.cursor,
        hint: payload?.hint?.text ? payload.hint : prev.hint
      };
    });
    if (payload?.type === 'correct') {
      dispatch({ type: 'ANSWER_CORRECT', score: payload.score ?? 0 });
      // En Secuencia, una carta correcta no termina la ronda salvo que sea la última;
      // mantenemos awaitingResponse=true para que sigan pasando los siguientes scans.
      dispatch({ type: 'AWAIT_RESPONSE', value: true });
      playCorrect();
      // ADR-D / ADR-112: la mascota debe reaccionar igual que en
      // Asociación/Memoria. Sin esta llamada se quedaba en mood `idle` con
      // "¿Jugamos?" durante toda la partida porque `useGameFeedback` solo
      // procesaba `validation_result`. `challengeRef` es null en Secuencia
      // (no se renderiza `ChallengeDisplay`), por lo que `processValidationResult`
      // no dispara confetti en este path; mantenemos el `playSuccess` para la
      // ronda completa (`handleSequenceRoundResult`).
      // `mechanicType` ya viaja por el closure del hook (línea ~301):
      // dejarlo en el payload era redundante (Plan agent R5, 2026-05-09).
      processValidationResult({
        isCorrect: true,
        timeout: false,
        pointsAwarded: payload?.points ?? 0,
        newScore: payload?.score ?? 0
      }, { currentRound, totalRounds });
    } else if (
      payload?.type === 'blocked' ||
      payload?.type === 'incorrect' ||
      payload?.type === 'incorrect_with_hint'
    ) {
      dispatch({ type: 'ANSWER_INCORRECT', score: payload.score ?? 0 });
      dispatch({ type: 'AWAIT_RESPONSE', value: true });
      playIncorrect();
      processValidationResult({
        isCorrect: false,
        timeout: false,
        pointsAwarded: payload?.points ?? 0,
        newScore: payload?.score ?? 0
      }, { currentRound, totalRounds });
    }
    if (payload?.hint?.text) {
      if (sequenceHintTimerRef.current) clearTimeout(sequenceHintTimerRef.current);
      sequenceHintTimerRef.current = setTimeout(() => {
        setSequenceState(prev => ({ ...prev, hint: null }));
      }, 3500);
    }
  }, [playCorrect, playIncorrect, processValidationResult, currentRound, totalRounds]);

  const handleSequenceRoundResult = useCallback(payload => {
    const TYPE_TO_STATUS = {
      correct: 'correct',
      blocked: 'blocked',
      timedOut: 'timedOut'
    };
    setSequenceState(prev => {
      const finalStatuses = { ...prev.cardStatuses };
      (payload?.results || []).forEach(item => {
        finalStatuses[item.uid] = TYPE_TO_STATUS[item.status] || 'correct';
      });
      return { ...prev, phase: 'completed', cardStatuses: finalStatuses };
    });
    // La ronda ha terminado: paramos el timer del cliente para que la
    // barra no siga decrementando durante el respiro entre rondas (el
    // backend ya canceló su `roundTimer` en finalizeSequenceRound).
    dispatch({ type: 'AWAIT_RESPONSE', value: false });
    if (payload?.completed) {
      playSuccess();
    } else if (payload?.timedOut) {
      // ADR-112: timeout de ronda completa → mascota a 'sad' con frase
      // de timeout específica de Secuencia. Sin esto la mascota mantenía
      // el mood happy/encouraging del último card_result.
      processValidationResult({
        isCorrect: false,
        timeout: true,
        pointsAwarded: 0,
        newScore: payload?.score ?? 0
      }, { currentRound, totalRounds });
    }
    if (sequenceCollectTimerRef.current) clearTimeout(sequenceCollectTimerRef.current);
    // Si la ronda terminó dentro del grace period (alumno muy rápido), el
    // grace timer aún estaba pendiente — al pasar a "completed" deja de
    // tener sentido. Lo cancelamos aquí; el siguiente memorizing volverá
    // a activarlo si procede.
    if (sequenceGraceTimerRef.current) {
      clearTimeout(sequenceGraceTimerRef.current);
      sequenceGraceTimerRef.current = null;
    }
    // QA 2026-05-06: dejamos las cartas reveladas (verde/rojo/ámbar) 2400ms
    // antes de arrancar la recogida, para que el alumno asimile cómo le fue
    // (antes 800ms se sentía abrupto y la partida "saturaba"). El backend
    // espera FEEDBACK_PAUSE_MS=3500 entre `sequence_round_result` y el
    // siguiente `sequence_phase_memorizing`: 2400ms reveal + ~640ms collect
    // anim + ~460ms respiro antes del reparto.
    sequenceCollectTimerRef.current = setTimeout(() => {
      setSequenceState(prev => ({ ...prev, isCollecting: true }));
    }, 2400);
  }, [playSuccess, processValidationResult, currentRound, totalRounds]);

  const socket = useGameSocket({
    sessionId,
    retryKey,
    user,
    searchParamsPlayerId: searchParams.get('playerId'),
    callbacks: {
      onNewRound: handleNewRound,
      onValidationResult: handleValidationResult,
      onGameOver: handleGameOver,
      onPlayPaused: handlePlayPaused,
      onPlayResumed: handlePlayResumed,
      onPlayState: handlePlayState,
      onMemoryTurnState: handleMemoryTurnState,
      onPlayInterrupted: handlePlayInterrupted,
      onSrAnnouncement: handleSrAnnouncement,
      onSequencePhaseMemorizing: handleSequencePhaseMemorizing,
      onSequencePhaseReproducing: handleSequencePhaseReproducing,
      onSequenceCardResult: handleSequenceCardResult,
      onSequenceRoundResult: handleSequenceRoundResult
    }
  });

  const {
    realtimeStatus, realtimeError, bootstrappingPlay,
    session, playId, selectedPlayerId,
    loadingSession, sessionError,
    rfidConnected, bestScore,
    setRealtimeError,
    syncGameState,
    REALTIME_STATUS_COPY,
    emitPausePlay, emitResumePlay,
    emitFallbackScan, emitMemoryCardTap,
    retryInit, startPlay, leaveAndCreateNewPlay,
    emitBoardReady
  } = socket;

  // Memoiza la lista de cardMappings de la sesión para que SequenceGameplayPanel
  // no re-renderice en cada cambio del padre — sin esto, el `|| []` inline
  // creaba una referencia nueva por cada render del GameSession (Bloque G,
  // sesión 04/05/2026).
  const sequenceCardMappings = useMemo(
    () => session?.cardMappings || [],
    [session?.cardMappings]
  );

  // Sincronizar socketSessionRef y mechanicMode cuando la sesión cargue
  useEffect(() => {
    socketSessionRef.current = session;
    const name = (session?.mechanic?.name || 'association').toString().toLowerCase();
    setMechanicMode(name === 'memory' || name === 'sequence' ? name : 'association');
  }, [session]);

  // --- Snapshot de partida en sessionStorage (resiliencia a F5) ---
  // Limpiamos snapshots vencidos al montar para no acumular basura.
  useEffect(() => {
    purgeExpiredSnapshots();
  }, []);

  // Hidratar UI desde snapshot local si existe, mientras el servidor
  // reconcilia el estado canónico vía PLAY_STATE_SYNC.
  const snapshotHydratedRef = useRef(false);
  useEffect(() => {
    if (!playId || snapshotHydratedRef.current) return;
    const snapshot = loadSnapshot(playId);
    if (snapshot) {
      dispatch({ type: 'PLAY_STATE_SYNC', ...snapshot });
      if (snapshot.score !== undefined) {
        // No reconstruimos challenge/board (el server los aportará); sólo
        // los contadores que evitan el flash de "ronda 1 / score 0".
      }
    }
    snapshotHydratedRef.current = true;
  }, [playId]);

  // Persistir snapshot tras cada transición relevante. Se ejecuta en cada
  // cambio del estado coordinado del juego — sessionStorage write es
  // síncrono pero rápido (<1ms para payload pequeño).
  useEffect(() => {
    if (!playId || gameState === 'finished') return;
    saveSnapshot(playId, {
      gameState,
      currentRound,
      score,
      correctAnswers,
      isAwaitingResponse
    });
  }, [playId, gameState, currentRound, score, correctAnswers, isAwaitingResponse]);

  // Limpiar snapshot al cerrar la partida o desmontar el componente.
  useEffect(() => {
    if (gameState === 'finished' && playId) {
      clearSnapshot(playId);
    }
  }, [gameState, playId]);

  useEffect(() => () => {
    if (playId) {
      // Al desmontar (navegación fuera de la pantalla), limpiamos para
      // no resucitar la partida si el usuario vuelve a una distinta.
      clearSnapshot(playId);
    }
  }, [playId]);

  // Configurar totalRounds y roundTime cuando la sesión carga
  useEffect(() => {
    if (!session) return;

    const configuredRounds = Number(session?.config?.numberOfRounds);
    if (Number.isFinite(configuredRounds) && configuredRounds > 0) {
      setTotalRounds(configuredRounds);
    }

    const configuredTime = Number(session?.config?.timeLimit);
    if (Number.isFinite(configuredTime) && configuredTime > 0) {
      setRoundTime(configuredTime);
    }
  }, [session]);

  // Prefetch de todas las imagenes del mazo al recibir la sesion para
  // calentar el cache del navegador y evitar flash de bloque-de-color entre
  // rondas (problema detectado en QA 18/04/2026 con FallbackTouchPanel).
  const prefetchNotifiedRef = useRef(false);
  useEffect(() => {
    const mappings = session?.cardMappings;
    if (!Array.isArray(mappings) || mappings.length === 0) return;
    prefetchDeckImages(mappings, () => {
      if (prefetchNotifiedRef.current) return;
      prefetchNotifiedRef.current = true;
      console.warn('[GameSession] Alguna imagen del mazo fallo al precargar. Se mostrara el nombre como fallback.');
    });
  }, [session?.cardMappings]);

  // Sincronizar gameState con el socket hook
  useEffect(() => {
    syncGameState(gameState);
  }, [gameState, syncGameState]);

  // Anunciar umbrales de tiempo
  useEffect(() => {
    const announcement = announceTimerThreshold();
    if (announcement) {
      setSrAnnouncement(announcement);
    }
  }, [announceTimerThreshold]);

  // --- Datos derivados ---

  const shuffledFallbackCards = useMemo(() => {
    const cards = Array.isArray(session?.cardMappings) ? [...session.cardMappings] : [];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.abs((i * ((currentRound || 1) + 7) * 13) % (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }, [session?.cardMappings, currentRound]);

  // --- Efectos secundarios ---

  // Limpiar memoryFeedbackActive cuando feedback vuelve a idle
  useEffect(() => {
    if (feedbackState === 'idle') {
      setMemoryFeedbackActive(false);
    }
  }, [feedbackState]);

  // Confirmar que el tablero de memoria está visible para iniciar el timer
  useEffect(() => {
    if (
      sessionIsMemory &&
      gameState === 'playing' &&
      memoryBoard.length > 0 &&
      playId &&
      !boardReadyEmittedRef.current
    ) {
      boardReadyEmittedRef.current = true;
      emitBoardReady();
    }
  }, [sessionIsMemory, gameState, memoryBoard, playId, emitBoardReady]);

  // Sonido de victoria cuando la partida termina con buen resultado (>=2 estrellas)
  useEffect(() => {
    if (gameState !== 'finished') return undefined;
    const percentage = totalRounds > 0 ? (correctAnswers / totalRounds) * 100 : 0;
    if (calculateStars(percentage) >= 2) {
      const timer = globalThis.setTimeout(() => playSuccess(), 600);
      return () => globalThis.clearTimeout(timer);
    }
    return undefined;
  }, [gameState, correctAnswers, totalRounds, playSuccess]);

  // Gestión de foco en pausa
  useEffect(() => {
    if (gameState === 'paused') {
      previousFocusRef.current = document.activeElement;
      const timeoutId = globalThis.setTimeout(() => {
        continueButtonRef.current?.focus();
      }, 0);
      return () => globalThis.clearTimeout(timeoutId);
    }

    if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }

    return undefined;
  }, [gameState]);

  // Limpieza de timeouts pendientes al desmontar
  useEffect(() => {
    return () => {
      clearPendingTimeouts();
    };
  }, [clearPendingTimeouts]);

  // --- Acciones del juego ---

  const startGame = () => {
    if (!playId) {
      toast.error('La partida aún no está lista. Espera un momento.');
      return;
    }

    if (startPlay() === false) {
      toast.error('No se puede iniciar: se perdió la conexión.');
      return;
    }

    dispatch({ type: 'SET_GAME_STATE', value: 'playing' });
    clearFeedback();
    setRealtimeError(null);
    // Resetear la senal del timer de Memoria: se rearma cuando llegue el
    // primer memory_turn_state con remainingTimeMs valido tras board_ready.
    setMemoryTimerArmed(false);
    setSrAnnouncement('Partida iniciada.');
  };

  const togglePause = () => {
    if (!playId) return;

    if (gameState === 'playing') {
      const sent = emitPausePlay();
      if (sent !== false) {
        setSrAnnouncement('Solicitando pausa de la partida.');
      }
    } else if (gameState === 'paused') {
      const sent = emitResumePlay();
      if (sent !== false) {
        setSrAnnouncement('Solicitando reanudación de la partida.');
      }
    }
  };

  const handlePauseDialogKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      togglePause();
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      continueButtonRef.current?.focus();
    }
  };

  const handleFallbackCardScan = useCallback(
    card => {
      if (gameState !== 'playing') return;

      const sensorId = session?.sensorId || 'touch_fallback_sensor';
      const sent = emitFallbackScan(card, sensorId);

      if (sent === false) {
        toast.error('No se pudo enviar la respuesta. Comprueba la conexión.');
        return;
      }

      setSrAnnouncement(`Carta ${card?.assignedValue || card?.uid} seleccionada.`);
    },
    [gameState, session?.sensorId, emitFallbackScan]
  );

  const handleMemoryCardTap = useCallback(
    slot => {
      if (gameState !== 'playing' || !slot?.uid) return;
      setHasTappedBoardOnce(true);
      const sensorId = session?.sensorId || 'touch_fallback_sensor';
      emitMemoryCardTap(slot, sensorId);
    },
    [gameState, session?.sensorId, emitMemoryCardTap]
  );

  const playAgain = async () => {
    if (!selectedPlayerId) {
      toast.error('No se pudo determinar el alumno para una nueva partida.');
      return;
    }

    try {
      await leaveAndCreateNewPlay(selectedPlayerId);

      dispatch({ type: 'RESET' });
      setShowPreCelebration(false);
      setChallenge(null);
      setMemoryBoard([]);
      setHasTappedBoardOnce(false);
      resetForNewPlay();
      setPlaySummary(null);
      setMemoryStats({ attempts: 0, matchedCount: 0, totalCards: 0 });
      setRealtimeError(null);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  };

  const goHome = () => {
    navigate(ROUTES.DASHBOARD);
  };

  // --- Render ---

  if (loadingSession) {
    return (
      <div className="game-bg min-h-screen flex flex-col items-center justify-center gap-6 p-8">
        <div className="size-20 rounded-2xl bg-brand-base/20 animate-pulse" />
        <div className="space-y-3 w-full max-w-xs">
          <div className="h-4 rounded-full bg-border-default animate-pulse" />
          <div className="h-4 rounded-full bg-border-default animate-pulse w-3/4 mx-auto" />
        </div>
        <p className="text-text-muted text-sm">Preparando la sesión de juego…</p>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-background-deep text-text-primary p-8 flex flex-col items-center justify-center gap-6 text-center">
        <div className="size-16 rounded-full bg-error-base/20 flex items-center justify-center">
          <AlertTriangle size={32} className="text-error-base" />
        </div>
        <h1 className="text-2xl font-bold">No se pudo cargar la sesión</h1>
        <p className="text-text-muted max-w-md">{sessionError}</p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              if (retryInit()) {
                setRetryKey(prev => prev + 1);
              }
            }}
            className="px-5 py-3 rounded-xl bg-brand-base hover:bg-brand-light transition-colors"
          >
            Reintentar
          </button>
          <button
            onClick={goHome}
            className="px-5 py-3 rounded-xl bg-background-surface hover:bg-background-elevated transition-colors"
          >
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="game-bg min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-6xl">😵</div>
          <h1 className="text-2xl font-bold text-text-primary">Algo salió mal en el juego</h1>
          <p className="text-text-muted max-w-md">Ocurrió un error inesperado durante la partida.</p>
          <button
            onClick={goHome}
            className="px-5 py-3 rounded-xl bg-accent-indigo hover:bg-accent-indigo/80 transition-colors text-text-primary"
          >
            Volver al Dashboard
          </button>
        </div>
      }
    >
    <div className="game-bg h-full flex flex-col relative overflow-hidden p-[var(--space-fluid-section)]">
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </output>
      {/* Backdrop tematizado por contexto: gradient mesh + patron de puntos +
          iconos decorativos. Sustituye los orbes neutros anteriores para que
          cada contexto (geografia/animales/colores/numeros) tenga atmosfera
          propia y se distinga visualmente del resto de la app admin. */}
      <GameBackdrop
        theme={resolveAssociationTheme(
          challenge?.value || session?.context?.name || session?.deck?.name
        )}
        mechanicType={mechanicMode}
      />

      {/* Top HUD — z-index ligeramente por encima de los wrappers hermanos
          (TimerBar / banners realtime, todos a z-10) para que los tooltips de
          los botones del HUD (Silenciar, Pausar) no queden tapados por la
          barra de tiempo cuando se renderizan en el lado bottom. Se mantiene
          por debajo del overlay de pausa (z-20) para que la pausa siga
          ocultando el HUD durante el dialog modal. */}
      <header className="relative z-[15] p-2 sm:p-3 shrink-0">
        <div className="glass rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-3">
          {/* Indicador de progreso — dots visuales para niños (en vez de "3 de 6").
              - Asociacion: 1 dot por ronda; el actual pulsa y los completados estan llenos
              - Memoria: 1 dot por pareja; se iluminan a medida que se emparejan
              gap-4 (16px) en vez de gap-3 — QA 04/05: el pill de mecánica
              quedaba pegado a los dots/texto y se solapaba visualmente. */}
          <div className="flex items-center gap-4">
            {/* Badge canónico de mecánica (ADR-C). Identifica la mecánica
                a un vistazo con icono Lucide signature + nombre legible
                pintado con el accent color del theme. Visible desde sm+ para
                no saturar pantallas estrechas. */}
            {(() => {
              const theme = getMechanicTheme(mechanicMode);
              const ThemeIcon = theme.icon;
              return (
                <div
                  className={cn(
                    'hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-xl border',
                    theme.accentBgSoftClass,
                    theme.accentBorderClass
                  )}
                  title={theme.headline}
                  aria-label={`Mecánica: ${theme.label}`}
                >
                  <ThemeIcon size={16} className={theme.accentClass} aria-hidden="true" />
                  <span
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wider',
                      theme.accentClass
                    )}
                  >
                    {theme.label}
                  </span>
                </div>
              );
            })()}
            {(() => {
              const totalProgress = sessionIsMemory
                ? Math.floor((memoryStats.totalCards || 0) / 2)
                : totalRounds;
              const currentProgress = sessionIsMemory
                ? Math.floor((memoryStats.matchedCount || 0) / 2)
                : currentRound;
              const progressLabel = sessionIsMemory
                ? `Pareja ${currentProgress} de ${totalProgress}`
                : `Ronda ${currentProgress} de ${totalProgress}`;
              return (
                <output className="sr-only" aria-live="polite">
                  {progressLabel}
                </output>
              );
            })()}
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {(() => {
                const total = sessionIsMemory
                  ? Math.floor((memoryStats.totalCards || 0) / 2)
                  : totalRounds;
                const current = sessionIsMemory
                  ? Math.floor((memoryStats.matchedCount || 0) / 2)
                  : currentRound;
                const dots = Array.from({ length: Math.max(1, total) }, (_, i) => ({
                  id: `round-dot-${i}`,
                  position: i + 1
                }));
                return dots.map(dot => {
                  const isCompleted = dot.position < current;
                  const isCurrent = dot.position === current;
                  return (
                    <motion.span
                      key={dot.id}
                      className={cn(
                        'block h-2.5 rounded-full transition-[background-color,width]',
                        isCurrent && 'w-6 bg-gradient-to-r from-brand-base to-accent-indigo shadow-[0_0_8px_var(--color-brand-glow)]',
                        isCompleted && 'w-2.5 bg-success-base/80',
                        !isCurrent && !isCompleted && 'w-2.5 bg-background-surface/60'
                      )}
                      animate={
                        isCurrent && !shouldReduceMotion
                          ? { opacity: [1, 0.6, 1], scale: [1, 1.12, 1] }
                          : { opacity: 1, scale: 1 }
                      }
                      transition={{ duration: 1.4, repeat: isCurrent ? Infinity : 0, ease: 'easeInOut' }}
                      aria-hidden="true"
                    />
                  );
                });
              })()}
            </div>
            {sessionIsMemory ? (
              <div className="hidden sm:block">
                <div className="text-[10px] text-text-disabled uppercase tracking-wider">Parejas</div>
                <div className="text-sm text-text-primary font-bold font-display">
                  {Math.floor((memoryStats.matchedCount || 0) / 2)}
                  <span className="text-text-muted font-normal"> / {Math.floor((memoryStats.totalCards || 0) / 2)}</span>
                </div>
              </div>
            ) : (
              <div className="hidden sm:block">
                <div className="text-[10px] text-text-disabled uppercase tracking-wider">Ronda</div>
                <div className="text-sm text-text-primary font-bold font-display">
                  {currentRound}
                  <span className="text-text-muted font-normal"> / {totalRounds}</span>
                </div>
              </div>
            )}
          </div>

          {/* Centro - Puntuación */}
          <ScoreDisplayCompact score={score} />

          {/* Derecha - Controles */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Tooltip content={soundEnabled ? 'Silenciar' : 'Activar sonido'}>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={cn(
                  "p-2.5 min-w-10 min-h-10 rounded-lg transition-[background-color,color,transform] active:scale-95",
                  soundEnabled ? "bg-border-default text-text-primary" : "bg-border-subtle text-text-disabled"
                )}
                aria-pressed={soundEnabled}
                aria-label={soundEnabled ? 'Silenciar' : 'Activar sonido'}
              >
                {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </button>
            </Tooltip>

            {gameState === 'playing' || gameState === 'paused' ? (
              <Tooltip content={gameState === 'paused' ? 'Reanudar' : 'Pausar'}>
                <button
                  onClick={togglePause}
                  ref={pauseButtonRef}
                  className="p-2.5 min-w-10 min-h-10 rounded-lg bg-border-default text-text-primary hover:bg-border-strong active:scale-95 active:bg-border-strong transition-[background-color,color,transform]"
                  aria-pressed={gameState === 'paused'}
                  aria-label={gameState === 'paused' ? 'Reanudar' : 'Pausar'}
                >
                  {gameState === 'paused' ? <Play size={20} /> : <Pause size={20} />}
                </button>
              </Tooltip>
            ) : null}

            <div className={cn(
              "p-2 rounded-lg",
              rfidConnected ? "bg-success-base/20 text-success-base" : "bg-error-base/20 text-error-base"
            )}>
              <output className="sr-only" aria-live="polite">
                {rfidConnected ? 'Sensor RFID conectado' : 'Sensor RFID desconectado'}
              </output>
              {rfidConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>

            {/* Chip de estado: durante la partida cambia de "Juego listo" a
                "Jugando" con pulso verde para reforzar que la partida esta
                activa (feedback ambiental para niño y profesor). Durante la
                pausa mostramos "Pausado" para coherencia con el overlay y
                evitar el confuso "Juego listo" que el usuario interpreta
                como "ya puedes jugar". */}
            <div className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide inline-flex items-center gap-1.5',
              realtimeStatus === 'connected' && gameState === 'paused' && 'bg-warning-base/20 text-warning-base',
              realtimeStatus === 'connected' && gameState !== 'paused' && 'bg-success-base/20 text-success-base',
              realtimeStatus === 'reconnecting' && 'bg-warning-base/20 text-warning-base',
              realtimeStatus === 'disconnected' && 'bg-error-base/20 text-error-base',
              realtimeStatus === 'connecting' && 'bg-background-surface/70 text-text-secondary'
            )}>
              <output className="sr-only" aria-live="polite" aria-atomic="true">
                {gameState === 'paused'
                  ? 'Partida pausada.'
                  : (REALTIME_STATUS_COPY[realtimeStatus]?.announcement || 'Conectando el juego.')}
              </output>
              {(() => {
                if (realtimeStatus === 'connected' && gameState === 'playing') {
                  return (
                    <>
                      <motion.span
                        aria-hidden="true"
                        className="inline-block size-2 rounded-full bg-success-base"
                        animate={
                          shouldReduceMotion
                            ? undefined
                            : { opacity: [1, 0.35, 1], scale: [1, 1.3, 1] }
                        }
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      <span>Jugando</span>
                    </>
                  );
                }
                if (realtimeStatus === 'connected' && gameState === 'paused') {
                  return (
                    <>
                      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-warning-base" />
                      <span>Pausado</span>
                    </>
                  );
                }
                return (
                  <>
                    {realtimeStatus === 'connected' && '✅ '}
                    {realtimeStatus === 'reconnecting' && '⏳ '}
                    {realtimeStatus === 'disconnected' && '❌ '}
                    {realtimeStatus === 'connecting' && '⏳ '}
                    {REALTIME_STATUS_COPY[realtimeStatus]?.label || 'Conectando…'}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </header>

      {gameState === 'waiting' && (
        <div className="relative z-10 px-3 sm:px-4 shrink-0">
          <RFIDConnector className="max-w-md" showSensorId={false} />
        </div>
      )}

      {realtimeError && (
        <div className="relative z-10 px-3 sm:px-4 mt-1 shrink-0">
          {realtimeError.retryAfterMs ? (
            // PROP-92: rate-limit / dedupe → banner con countdown que se vacía solo.
            <RateLimitBanner
              retryAfterMs={realtimeError.retryAfterMs}
              message={realtimeError.message}
              onDismiss={() => setRealtimeError(null)}
            />
          ) : (
            <div className="max-w-4xl mx-auto rounded-lg border border-warning-base/30 bg-warning-base/10 px-3 py-2 text-xs text-warning-base">
              {realtimeError.message}
            </div>
          )}
        </div>
      )}

      {(gameState === 'playing' || gameState === 'paused') && (
        // mb-3 (antes mb-1) — el `box-shadow: 0 0 20px ...glow` del TimerBar
        // proyecta luminosidad ~20px hacia abajo. Con `mb-1` (4px) el glow
        // se solapaba visualmente con el header del SequenceBoard
        // ("Tu turno: escanea las cartas en orden") en 1366×768
        // (HF-3 QA 2026-05-09).
        <div className="relative z-10 px-3 sm:px-4 mb-3 shrink-0">
          <TimerBar timeLeft={timeLeft} timeLimit={roundTime} />
        </div>
      )}

      {/* Área principal del juego — sin scroll: el contenido entero debe caber en la ventana.
          Si el contenido se comprime por pantalla pequeña, el ChallengeDisplay
          y el FallbackTouchPanel usan min-h-0 y tamaños relativos para adaptarse. */}
      <main className="flex-1 min-h-0 relative z-10 flex items-center justify-center px-2 py-1 sm:px-4 sm:py-2 overflow-hidden">
        <AnimatePresence mode="wait">
          {gameState === 'waiting' && (
            <motion.div
              key="waiting"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              className="text-center"
            >
              {/* Icono Gamepad2 Lucide tinted con accent del tema mecánico
                  (QA 04/05) — sustituye al emoji 🎮 que dependía del SO/font.
                  Tinta dinámica: si la sesión es Memoria/Asociación/Secuencia,
                  el icono adopta el accent canónico de la mecánica para
                  reforzar identidad visual. */}
              <motion.div
                animate={shouldReduceMotion ? { scale: 1 } : { scale: [1, 1.1, 1] }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity }}
                className={cn(
                  'mb-6 mx-auto inline-flex items-center justify-center',
                  getMechanicTheme(mechanicMode).accentClass
                )}
                aria-hidden="true"
              >
                <Gamepad2 size={96} strokeWidth={1.5} />
              </motion.div>
              <h1 className="text-[var(--text-fluid-3xl)] font-bold font-display gradient-text-brand mb-4">
                ¡Hora de Jugar!
              </h1>
              <p className="text-text-muted mb-8 text-lg">
                {(() => {
                  if (sessionIsSequence) {
                    return session?.deck?.name
                      ? `Memoriza el orden de las cartas en ${session.deck.name}`
                      : 'Memoriza el orden de las cartas';
                  }
                  if (sessionIsMemory) {
                    return session?.deck?.name
                      ? `Empareja las cartas iguales en ${session.deck.name}`
                      : 'Empareja las cartas iguales';
                  }
                  return session?.deck?.name
                    ? `Busca la tarjeta amiga en ${session.deck.name}`
                    : 'Encuentra la tarjeta amiga';
                })()}
              </p>
              <motion.button
                whileHover={shouldReduceMotion ? {} : { scale: 1.05 }}
                whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
                onClick={startGame}
                disabled={bootstrappingPlay || !playId}
                className="btn-game text-2xl px-12 py-5"
              >
                <Play size={28} />
                {bootstrappingPlay ? 'PREPARANDO PARTIDA...' : 'EMPEZAR'}
              </motion.button>
            </motion.div>
          )}

          {(gameState === 'playing' || gameState === 'paused') && (
            <motion.div
              key="playing"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                // Memoria necesita mas ancho para el grid de 4 cols; asociacion
                // tambien aprovecha anchura para que consigna y grid de respuestas
                // sean mas legibles (antes con max-w-2xl quedaba mucho aire
                // lateral, detectado en QA 2026-04-23).
                // Ambas mecanicas usan h-full para que su contenido pueda ocupar
                // el alto disponible y se evite scroll durante la partida.
                'w-full flex flex-col items-center h-full',
                sessionIsMemory ? 'max-w-5xl' : 'max-w-4xl justify-center gap-4',
                shakeError && 'animate-shake'
              )}
            >
              {(() => {
                if (sessionIsMemory) {
                  return (
                    <MemoryGameplayPanel
                      board={memoryBoard}
                      attempts={memoryStats.attempts}
                      matchedCount={memoryStats.matchedCount}
                      totalCards={memoryStats.totalCards}
                      feedbackState={feedbackState}
                      feedbackPoints={feedbackPoints}
                      feedbackMessage={feedbackMessage}
                      onCardTap={handleMemoryCardTap}
                    />
                  );
                }
                if (sessionIsSequence) {
                  return (
                    <SequenceGameplayPanel
                      totalRounds={totalRounds}
                      cardMappings={sequenceCardMappings}
                      rfidConnected={rfidConnected}
                      soundEnabled={soundEnabled}
                      sequenceState={sequenceState}
                      onCardTap={emitFallbackScan}
                    />
                  );
                }
                return (
                  <AssociationGameplayPanel
                    ref={gameFeedback.challengeRef}
                    challenge={challenge}
                    paused={gameState === 'paused'}
                    feedbackState={feedbackState}
                    feedbackPoints={feedbackPoints}
                    feedbackMessage={feedbackMessage}
                    isTimeout={feedbackIsTimeout}
                  />
                );
              })()}

              {!sessionIsSequence && (
              <motion.p
                initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
                className="mt-2 text-center text-text-secondary text-sm sm:text-base font-semibold"
              >
                {(() => {
                  if (sessionIsMemory) {
                    return <>¡Encuentra las parejas antes de que se acabe el tiempo!</>;
                  }
                  // Consigna personalizada del profesor si la definió en el wizard.
                  if (challenge?.promptText) {
                    return (
                      <>
                        <Search className="inline mr-1 -mt-0.5" size={16} aria-hidden="true" />
                        {challenge.promptText}
                      </>
                    );
                  }
                  // Frase neutra sin artículo: el español requiere concordancia
                  // de género (el/la) que depende de la palabra; usar "la" hardcoded
                  // produce "la Cerdo", "la Caballo", "la Pato" (QA v0.5.0).
                  return (
                    <>
                      <Search className="inline mr-1 -mt-0.5" size={16} aria-hidden="true" />
                      Encuentra: <span className="text-text-primary font-bold">{challenge?.value || 'tarjeta correcta'}</span>
                    </>
                  );
                })()}
              </motion.p>
              )}

              {!rfidConnected && !sessionIsMemory && !sessionIsSequence && (
                <FallbackTouchPanel
                  cards={shuffledFallbackCards}
                  round={currentRound}
                  onSelectCard={handleFallbackCardScan}
                  onPauseRequest={togglePause}
                  canPause={gameState === 'playing'}
                  feedbackState={feedbackState}
                />
              )}

              {!rfidConnected && sessionIsMemory && !hasTappedBoardOnce && (
                <motion.div
                  className="mt-2 rounded-lg border border-accent-indigo/25 bg-accent-indigo/5 px-3 py-1.5"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-2 text-text-secondary">
                    <Hand size={14} className="shrink-0 text-accent-indigo" aria-hidden="true" />
                    <p className="text-xs font-medium">Toca las cartas del tablero para jugar</p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overlay de pausa — diseno mas expresivo con icono Lucide, vignette y
            spring entry + micro-flash "Seguimos" al reanudar que confirma la accion. */}
        <AnimatePresence>
          {gameState === 'paused' && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="absolute inset-0 bg-background-deep/85 backdrop-blur-md flex items-center justify-center z-20"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pause-title"
              aria-describedby="pause-description"
              onKeyDown={handlePauseDialogKeyDown}
            >
              <motion.div
                initial={shouldReduceMotion ? false : { scale: 0.92, y: 8, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 340, damping: 24 }}
                className="text-center px-6"
              >
                <div className={cn(
                  'mx-auto mb-5 flex size-20 items-center justify-center rounded-2xl',
                  'bg-brand-base/15 border border-brand-base/30',
                  'shadow-[0_0_32px_var(--color-brand-glow)]'
                )}>
                  <Pause size={44} className="text-brand-light" aria-hidden="true" />
                </div>
                <h2
                  id="pause-title"
                  className="text-3xl font-bold font-display gradient-text-brand mb-2 tracking-tight"
                >
                  Juego pausado
                </h2>
                <p id="pause-description" className="text-text-secondary mb-6">
                  Pulsa continuar para volver al juego.
                </p>
                <motion.button
                  whileHover={shouldReduceMotion ? {} : { scale: 1.05 }}
                  whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
                  onClick={togglePause}
                  ref={continueButtonRef}
                  className="btn-game"
                >
                  <Play size={24} />
                  Continuar
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Micro-flash al reanudar: feedback breve de que la accion se aplico. */}
        <AnimatePresence>
          {showResumeFlash && !shouldReduceMotion && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.15, opacity: 0 }}
                transition={{ duration: 0.35, ease: EASING.outExpo }}
                className={cn(
                  'flex size-20 items-center justify-center rounded-full',
                  'bg-success-base/20 border-2 border-success-base/60',
                  'shadow-[0_0_28px_var(--color-success-glow)]'
                )}
              >
                <Play size={36} className="text-success-base" aria-hidden="true" fill="currentColor" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mascota — elevada sobre el footer con `bottom-24` para quedar siempre
          visible independientemente de la altura del footer de métricas
          (detectado en QA 2026-04-23: con `bottom-4` la mascota colisionaba
          con el footer en viewports pequeños y se percibía como "desaparecida").
          Scale completo ahora que tiene espacio reservado. */}
      <div className="fixed bottom-24 left-4 sm:left-6 z-20 origin-bottom-left pointer-events-none">
        <CharacterMascot
          mood={mascotMood}
          message={mascotMessage || undefined}
          position="left"
          mechanicType={mechanicMode}
        />
      </div>

      {/* Footer: solo metricas — el progreso de rondas vive en el header como
          dots (ver header). Eliminamos el indicador redundante del footer y la
          barra secundaria para dejar que el gameplay ocupe el espacio vertical. */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <footer className="relative z-10 px-3 py-1.5 sm:px-4 shrink-0">
          <CurrentPlayMetrics
            mode={mechanicMode}
            score={score}
            correctAnswers={correctAnswers}
            totalRounds={totalRounds}
          />
        </footer>
      )}

      {/* Celebración previa a GameOver */}
      <AnimatePresence>
        {showPreCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-background-base/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.2, 1], opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className="text-8xl mb-4"
              >
                🎉
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-3xl font-bold text-text-primary font-display"
              >
                ¡Partida completada!
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pantalla de fin de partida. Usamos el `correctAnswers` del summary
          (origen backend cuando esta disponible) en lugar del estado local
          del reducer, para eludir el race entre `response_*` y `game_over`
          que dejaba ese contador 1 unidad por debajo del valor real. */}
      {gameState === 'finished' && (
        <GameOverScreen
          score={score}
          correctAnswers={playSummary?.correctAnswers ?? correctAnswers}
          totalRounds={totalRounds}
          bestScore={bestScore}
          summary={playSummary}
          onPlayAgain={playAgain}
          onGoHome={goHome}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}
