import { useState, useReducer, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Pause, Play, Volume2, VolumeX, AlertTriangle, Hand } from 'lucide-react';
import { cn, calculateStars } from '../lib/utils';
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
import MemoryGameplayPanel from '../components/game/MemoryGameplayPanel';
import GameBackdrop from '../components/game/GameBackdrop';
import FallbackTouchPanel from '../components/game/FallbackTouchPanel';
import CurrentPlayMetrics from '../components/game/CurrentPlayMetrics';
import { useGameFeedback } from '../hooks/useGameFeedback';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSoundEffects } from '../hooks/useSoundEffects';
import { useGameTimer } from '../hooks/useGameTimer';
import { useGameSocket } from '../hooks/useGameSocket';

const FLOAT_DELAY_STYLE = { animationDelay: '1s' };
const FLOAT_DELAY_NONE = { animationDelay: '0s' };

function normalizeFinalSummary(rawMetrics, score, correctAnswers, isMemoryMode, gameStartTime) {
  const metrics = rawMetrics && typeof rawMetrics === 'object' ? rawMetrics : {};
  const totalAttempts = Number(metrics.totalAttempts || 0);
  const averageResponseTimeMs = Number(metrics.averageResponseTime || 0);
  const rawTotalTime = Number(metrics.totalTimePlayed || metrics.playDuration || 0);

  // Si no hay tiempo del servidor, calcular a partir del inicio local (en ms)
  const elapsedMs = gameStartTime ? Date.now() - gameStartTime : 0;
  const totalTimePlayed = rawTotalTime > 0 ? rawTotalTime : elapsedMs;

  return {
    score,
    correctAnswers,
    errors: Math.max(0, totalAttempts - correctAnswers),
    attempts: totalAttempts,
    averageResponseTimeMs: Number.isFinite(averageResponseTimeMs) ? averageResponseTimeMs : 0,
    totalTimePlayed: Number.isFinite(totalTimePlayed) ? totalTimePlayed : 0,
    mode: isMemoryMode ? 'memory' : 'association'
  };
}

// Estado inicial del juego (campos coordinados que deben transicionar atómicamente)
const INITIAL_GAME_STATE = {
  gameState: 'waiting',      // 'waiting' | 'playing' | 'paused' | 'finished'
  currentRound: 1,
  score: 0,
  correctAnswers: 0,
  isAwaitingResponse: false,
};

/**
 * Reducer para estado coordinado del juego.
 * Garantiza transiciones atómicas entre estados y evita desincronización
 * cuando eventos de socket y timeouts llegan simultáneamente.
 */
function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_GAME_STATE':
      return { ...state, gameState: action.value };
    case 'SET_SCORE':
      return { ...state, score: action.value };
    case 'SET_ROUND':
      return { ...state, currentRound: action.value };
    case 'AWAIT_RESPONSE':
      return { ...state, isAwaitingResponse: action.value };
    case 'ANSWER_CORRECT':
      return {
        ...state,
        score: action.score,
        correctAnswers: state.correctAnswers + 1,
        isAwaitingResponse: false,
      };
    case 'ANSWER_INCORRECT':
      return {
        ...state,
        score: action.score,
        isAwaitingResponse: false,
      };
    case 'NEW_ROUND':
      return {
        ...state,
        gameState: 'playing',
        currentRound: action.round,
        score: action.score,
        isAwaitingResponse: true,
      };
    case 'PAUSE':
      return { ...state, gameState: 'paused', isAwaitingResponse: false };
    case 'RESUME':
      return { ...state, gameState: 'playing', isAwaitingResponse: true };
    case 'FINISH':
      return { ...state, gameState: 'finished', isAwaitingResponse: false, score: action.score };
    case 'PLAY_STATE_SYNC': {
      // Sincronización parcial desde el servidor: solo actualiza campos presentes
      const next = { ...state };
      if (action.gameState !== undefined) next.gameState = action.gameState;
      if (action.currentRound !== undefined) next.currentRound = action.currentRound;
      if (action.score !== undefined) next.score = action.score;
      if (action.isAwaitingResponse !== undefined) next.isAwaitingResponse = action.isAwaitingResponse;
      return next;
    }
    case 'RESET':
      return { ...INITIAL_GAME_STATE };
    default:
      return state;
  }
}

/**
 * Pantalla principal de juego para niños de 4-8 años.
 * Diseño colorido, amigable y sin texto complejo.
 */
/* eslint-disable-next-line sonarjs/cyclomatic-complexity, sonarjs/cognitive-complexity --
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

  // --- Estado coordinado del juego (reducer) ---
  const [game, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const { gameState, currentRound, score, correctAnswers, isAwaitingResponse } = game;

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
  // isMemoryMode se resuelve como derivado tras obtener session del socket hook
  const [sessionIsMemory, setSessionIsMemory] = useState(false);
  // Flag para el hook de timer: en Memoria, solo empieza a decrementar cuando
  // el backend ha confirmado board_ready (playEndsAt establecido). Antes de
  // eso mostramos la barra llena y estatica, evitando el visual "bucle vacio".
  const [memoryTimerArmed, setMemoryTimerArmed] = useState(false);

  // --- Hooks de feedback y sonido ---
  const gameFeedback = useGameFeedback({ isMemoryMode: sessionIsMemory, shouldReduceMotion });
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
      display: displayData?.display || '🎴',
      imageUrl: displayData?.imageUrl || null,
      thumbnailUrl: displayData?.thumbnailUrl || null,
      audioUrl: displayData?.audioUrl || null
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
      normalizeFinalSummary(payload?.metrics, finalScore, correctAnswers, socketSessionRef.current?.mechanic?.name === 'memory', gameStartTimeRef.current)
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
      onSrAnnouncement: handleSrAnnouncement
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

  // Sincronizar socketSessionRef y sessionIsMemory cuando la sesión cargue
  useEffect(() => {
    socketSessionRef.current = session;
    setSessionIsMemory(session?.mechanic?.name === 'memory');
  }, [session]);

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
    <div className="game-bg h-dvh flex flex-col relative overflow-hidden">
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
      />

      {/* Top HUD */}
      <header className="relative z-10 p-2 sm:p-3 shrink-0">
        <div className="glass rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-3">
          {/* Indicador de progreso — dots visuales para niños (en vez de "3 de 6").
              - Asociacion: 1 dot por ronda; el actual pulsa y los completados estan llenos
              - Memoria: 1 dot por pareja; se iluminan a medida que se emparejan */}
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1.5"
              role="progressbar"
              aria-label={sessionIsMemory ? 'Progreso de parejas' : 'Progreso de rondas'}
              aria-valuenow={sessionIsMemory ? Math.floor((memoryStats.matchedCount || 0) / 2) : currentRound}
              aria-valuemin={0}
              aria-valuemax={sessionIsMemory ? Math.floor((memoryStats.totalCards || 0) / 2) : totalRounds}
            >
              {(() => {
                const total = sessionIsMemory
                  ? Math.floor((memoryStats.totalCards || 0) / 2)
                  : totalRounds;
                const current = sessionIsMemory
                  ? Math.floor((memoryStats.matchedCount || 0) / 2)
                  : currentRound;
                return Array.from({ length: Math.max(1, total) }).map((_, i) => {
                  const isCompleted = i + 1 < current;
                  const isCurrent = i + 1 === current;
                  return (
                    <motion.span
                      key={`round-dot-${i}`}
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
                activa (feedback ambiental para niño y profesor). */}
            <div className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide inline-flex items-center gap-1.5',
              realtimeStatus === 'connected' && 'bg-success-base/20 text-success-base',
              realtimeStatus === 'reconnecting' && 'bg-warning-base/20 text-warning-base',
              realtimeStatus === 'disconnected' && 'bg-error-base/20 text-error-base',
              realtimeStatus === 'connecting' && 'bg-background-surface/70 text-text-secondary'
            )}>
              <output className="sr-only" aria-live="polite" aria-atomic="true">
                {REALTIME_STATUS_COPY[realtimeStatus]?.announcement || 'Conectando el juego.'}
              </output>
              {realtimeStatus === 'connected' && gameState === 'playing' ? (
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
                  Jugando
                </>
              ) : (
                <>
                  {realtimeStatus === 'connected' && '✅ '}
                  {realtimeStatus === 'reconnecting' && '⏳ '}
                  {realtimeStatus === 'disconnected' && '❌ '}
                  {realtimeStatus === 'connecting' && '⏳ '}
                  {REALTIME_STATUS_COPY[realtimeStatus]?.label || 'Conectando…'}
                </>
              )}
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
          <div className="max-w-4xl mx-auto rounded-lg border border-warning-base/30 bg-warning-base/10 px-3 py-2 text-xs text-warning-base">
            {realtimeError.message}
          </div>
        </div>
      )}

      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="relative z-10 px-3 sm:px-4 mb-1 shrink-0">
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
              <motion.div
                animate={shouldReduceMotion ? { scale: 1 } : { scale: [1, 1.1, 1] }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity }}
                className="text-8xl mb-6"
              >
                🎮
              </motion.div>
              <h1 className="text-4xl sm:text-5xl font-bold font-display gradient-text-brand mb-4">
                ¡Hora de Jugar!
              </h1>
              <p className="text-text-muted mb-8 text-lg">
                {session?.deck?.name
                  ? `Busca la tarjeta amiga en ${session.deck.name}`
                  : 'Encuentra la tarjeta amiga'}
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
                // Memoria necesita mas ancho para el grid de 4 cols; asociacion se queda compacta.
                // Ambas mecanicas usan h-full para que su contenido pueda ocupar el alto disponible
                // y se evite scroll durante la partida.
                'w-full flex flex-col items-center h-full',
                sessionIsMemory ? 'max-w-5xl' : 'max-w-2xl justify-center',
                shakeError && 'animate-shake'
              )}
            >
              {sessionIsMemory ? (
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
              ) : (
                <AssociationGameplayPanel
                  ref={gameFeedback.challengeRef}
                  challenge={challenge}
                  paused={gameState === 'paused'}
                  feedbackState={feedbackState}
                  feedbackPoints={feedbackPoints}
                  feedbackMessage={feedbackMessage}
                  isTimeout={feedbackIsTimeout}
                />
              )}

              <motion.p
                initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
                className="mt-2 text-center text-text-secondary text-sm sm:text-base font-semibold"
              >
                {sessionIsMemory ? (
                  <>¡Encuentra las parejas antes de que se acabe el tiempo!</>
                ) : (
                  <>
                    🔎 ¿Dónde está <span className="text-text-primary font-bold">{challenge?.value || 'la tarjeta correcta'}</span>?
                  </>
                )}
              </motion.p>

              {!rfidConnected && !sessionIsMemory && (
                <FallbackTouchPanel
                  cards={shuffledFallbackCards}
                  onSelectCard={handleFallbackCardScan}
                  onPauseRequest={togglePause}
                  canPause={gameState === 'playing'}
                />
              )}

              {!rfidConnected && sessionIsMemory && (
                <div className="mt-2 rounded-lg border border-accent-indigo/25 bg-accent-indigo/5 px-3 py-1.5">
                  <div className="flex items-center gap-2 text-text-secondary">
                    <Hand size={14} className="shrink-0 text-accent-indigo" aria-hidden="true" />
                    <p className="text-xs font-medium">Toca las cartas del tablero para jugar</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overlay de pausa */}
        <AnimatePresence>
          {gameState === 'paused' && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background-base/80 backdrop-blur-md flex items-center justify-center z-20"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pause-title"
              aria-describedby="pause-description"
              onKeyDown={handlePauseDialogKeyDown}
            >
              <motion.div
                initial={shouldReduceMotion ? false : { scale: 0.9 }}
                animate={{ scale: 1 }}
                className="text-center"
              >
                <div className="text-6xl mb-4">⏸️</div>
                <h2 id="pause-title" className="text-3xl font-bold text-text-primary mb-2">Juego pausado</h2>
                <p id="pause-description" className="text-text-secondary mb-4">Pulsa continuar para volver al juego.</p>
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
      </main>

      {/* Mascota */}
      <div className="fixed bottom-4 left-3 sm:left-6 z-20 scale-90 origin-bottom-left">
        <CharacterMascot
          mood={mascotMood}
          message={mascotMessage || undefined}
          position="left"
        />
      </div>

      {/* Footer: solo metricas — el progreso de rondas vive en el header como
          dots (ver header). Eliminamos el indicador redundante del footer y la
          barra secundaria para dejar que el gameplay ocupe el espacio vertical. */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <footer className="relative z-10 px-3 py-1.5 sm:px-4 shrink-0">
          <CurrentPlayMetrics
            mode={sessionIsMemory ? 'memory' : 'association'}
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

      {/* Pantalla de fin de partida */}
      {gameState === 'finished' && (
        <GameOverScreen
          score={score}
          correctAnswers={correctAnswers}
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
