import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Pause, Play, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn } from '../lib/utils';
import { useReducedMotion } from '../hooks';
import { useAuth } from '../context/AuthContext';
import RFIDConnector from '../components/ui/RFIDConnector';
import webSerialService from '../services/webSerialService';
import { socketService, SOCKET_EVENTS } from '../services/socket';
import {
  sessionsAPI,
  usersAPI,
  playsAPI,
  extractData,
  extractErrorMessage,
  isAbortError
} from '../services/api';
import { ROUTES } from '../constants/routes';
import { toast } from 'sonner';
import { 
  ChallengeDisplay, 
  TimerBar, 
  ScoreDisplayCompact, 
  FeedbackOverlay,
  GameOverScreen,
  CharacterMascot 
} from '../components/game';
import { CardAssetPreview } from '../components/ui';

const SOCKET_ERROR_MESSAGES = {
  RFID_MODE_INVALID: 'El lector RFID no está en modo de juego.',
  RFID_SENSOR_UNAUTHORIZED: 'Este sensor no está autorizado para esta sesión.',
  RFID_SENSOR_MISMATCH: 'El sensor activo cambió durante la partida.',
  PLAY_NOT_ACTIVE: 'La partida ya no está activa en el motor de juego.',
  ROUND_BLOCKED: 'No puedes avanzar ronda mientras se espera una respuesta.',
  RFID_SOCKET_NOT_ACTIVE: 'Otra pestaña tomó el control del sensor RFID.',
  RFID_MODE_TAKEN_OVER: 'Se tomó control del modo RFID desde otro socket.',
  FORBIDDEN: 'No tienes permisos para ejecutar esta acción.',
  AUTH_REQUIRED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  ENGINE_ERROR: 'Error del motor de juego. Inténtalo de nuevo.'
};

const REALTIME_STATUS_COPY = {
  connected: { label: 'Juego listo', announcement: 'El juego está conectado.' },
  reconnecting: { label: 'Reconectando', announcement: 'Reconectando el juego.' },
  disconnected: { label: 'Sin conexión', announcement: 'Se perdió la conexión del juego.' },
  connecting: { label: 'Conectando', announcement: 'Conectando el juego.' }
};

const TIMER_ANNOUNCEMENT_THRESHOLDS = new Set([10, 5, 3, 2, 1, 0]);

function resolveSocketError(payload) {
  const code = payload?.code;
  const fallbackMessage = payload?.message || 'No se pudo procesar la acción en tiempo real.';

  return {
    code: code || 'UNKNOWN',
    message: SOCKET_ERROR_MESSAGES[code] || fallbackMessage
  };
}

function normalizeFinalSummary(rawMetrics, score, correctAnswers, isMemoryMode) {
  const metrics = rawMetrics && typeof rawMetrics === 'object' ? rawMetrics : {};
  const totalAttempts = Number(metrics.totalAttempts || 0);
  const averageResponseTimeMs = Number(metrics.averageResponseTime || 0);
  const totalTimePlayed = Number(metrics.totalTimePlayed || 0);

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

/**
 * Pantalla principal de juego para niños de 4-8 años
 * Diseño colorido, amigable y sin texto complejo
 */
export default function GameSession() { // NOSONAR
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const ROUND_TIME = 15;
  const { shouldReduceMotion } = useReducedMotion();
  const pendingTimeoutRef = useRef([]);
  const playIdRef = useRef(null);
  const roundTimeRef = useRef(ROUND_TIME);
  const totalRoundsRef = useRef(5);
  const announcedThresholdsRef = useRef(new Set());
  const previousRealtimeStatusRef = useRef('connecting');
  const previousFocusRef = useRef(null);
  const pauseButtonRef = useRef(null);
  const continueButtonRef = useRef(null);

  // Game state
  const [gameState, setGameState] = useState('waiting'); // waiting, playing, paused, finished
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [score, setScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [mascotMood, setMascotMood] = useState('idle');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [rfidConnected, setRfidConnected] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState(null);
  const [session, setSession] = useState(null);
  const [playId, setPlayId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false);
  const [totalRounds, setTotalRounds] = useState(5);
  const [roundTime, setRoundTime] = useState(ROUND_TIME);
  const [bootstrappingPlay, setBootstrappingPlay] = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [realtimeError, setRealtimeError] = useState(null);
  const [playSummary, setPlaySummary] = useState(null);
  const [memoryStats, setMemoryStats] = useState({ attempts: 0, matchedCount: 0, totalCards: 0 });
  const [memoryFeedbackActive, setMemoryFeedbackActive] = useState(false);
  const [srAnnouncement, setSrAnnouncement] = useState('');
  const gameStateRef = useRef('waiting');

  const [challenge, setChallenge] = useState(null);
  const [memoryBoard, setMemoryBoard] = useState([]);
  const fallbackCards = Array.isArray(session?.cardMappings) ? session.cardMappings : [];
  const roundIndicators = [];
  for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
    roundIndicators.push(roundNumber);
  }

  useEffect(() => {
    playIdRef.current = playId;
  }, [playId]);

  useEffect(() => {
    roundTimeRef.current = roundTime;
  }, [roundTime]);

  useEffect(() => {
    totalRoundsRef.current = totalRounds;
  }, [totalRounds]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const normalizeChallenge = useCallback(rawChallenge => {
    const displayData = rawChallenge?.displayData || rawChallenge || {};

    if (!displayData || typeof displayData !== 'object') {
      return null;
    }

    return {
      id: rawChallenge?.cardId || rawChallenge?.uid || displayData?.key || displayData?.value,
      uid: rawChallenge?.uid,
      key: displayData?.key || '',
      value: displayData?.value || rawChallenge?.assignedValue || '---',
      display: displayData?.display || '🎴',
      imageUrl: displayData?.imageUrl || null,
      thumbnailUrl: displayData?.thumbnailUrl || null,
      audioUrl: displayData?.audioUrl || null
    };
  }, []);

  const isMemoryMode = session?.mechanic?.name === 'memory';

  const clearPendingTimeouts = useCallback(() => {
    pendingTimeoutRef.current.forEach(timeoutId => globalThis.clearTimeout(timeoutId));
    pendingTimeoutRef.current = [];
  }, []);

  const scheduleFeedbackClear = useCallback((delayMs = 1400) => {
    const timeoutId = globalThis.setTimeout(() => {
      setFeedback(null);
    }, delayMs);
    pendingTimeoutRef.current.push(timeoutId);
  }, []);

  const handleValidationResult = useCallback(
    payload => {
      const feedbackDelayMs = Number(payload?.feedbackDelayMs || 1400);
      const pointsAwarded = Number(payload?.pointsAwarded || 0);
      const isCorrect = Boolean(payload?.isCorrect && !payload?.timeout);

      setFeedback({ type: isCorrect ? 'success' : 'error', points: pointsAwarded });
      setScore(Number.isFinite(payload?.newScore) ? payload.newScore : 0);
      setMascotMood(isCorrect ? 'celebrating' : 'encouraging');
      setIsAwaitingResponse(false);
      if (isMemoryMode) {
        setMemoryFeedbackActive(true);
      }
      announcedThresholdsRef.current.clear();

      if (isCorrect) {
        setCorrectAnswers(prev => prev + 1);
      }

      scheduleFeedbackClear(
        Number.isFinite(feedbackDelayMs) && feedbackDelayMs > 0 ? feedbackDelayMs : 1400
      );
    },
    [isMemoryMode, scheduleFeedbackClear]
  );

  const handleNewRound = useCallback(
    payload => {
      announcedThresholdsRef.current.clear();
      clearPendingTimeouts();
      setFeedback(null);
      setGameState('playing');
      setCurrentRound(Number(payload?.roundNumber || 1));

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
      setScore(Number.isFinite(payload?.score) ? payload.score : 0);
      setChallenge(normalizeChallenge(payload?.challenge));
      setMascotMood('idle');
      setIsAwaitingResponse(true);
      setSrAnnouncement(`Ronda ${Number(payload?.roundNumber || 1)} iniciada.`);
    },
    [clearPendingTimeouts, normalizeChallenge]
  );

  const handlePlayPaused = useCallback(payload => {
    const remaining = Number(payload?.remainingTimeMs);
    setGameState('paused');
    setMascotMood('thinking');
    setIsAwaitingResponse(false);
    setSrAnnouncement('Partida en pausa.');

    if (Number.isFinite(remaining) && remaining >= 0) {
      setTimeLeft(Math.max(0, Math.ceil(remaining / 1000)));
    }
  }, []);

  const handlePlayResumed = useCallback(
    payload => {
      const remaining = Number(payload?.remainingTimeMs);
      setGameState('playing');
      setMascotMood('idle');
      if (payload?.challenge) {
        setChallenge(normalizeChallenge(payload.challenge));
      }
      if (Number.isFinite(remaining) && remaining >= 0) {
        setTimeLeft(Math.max(1, Math.ceil(remaining / 1000)));
      }
      setIsAwaitingResponse(true);
      announcedThresholdsRef.current.clear();
      setSrAnnouncement('Partida reanudada.');
    },
    [normalizeChallenge]
  );

  const handlePlayState = useCallback(payload => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    if (payload?.status === 'paused' || payload?.isPaused) {
      setGameState('paused');
    } else if (payload?.status === 'in-progress') {
      setGameState('playing');
    }

    if (Number.isFinite(payload?.currentRound)) {
      setCurrentRound(payload.currentRound);
    }
    if (Number.isFinite(payload?.score)) {
      setScore(payload.score);
    }
    if (Number.isFinite(payload?.maxRounds)) {
      setTotalRounds(payload.maxRounds);
    }

    if (Number.isFinite(payload?.remainingTimeMs) && payload.remainingTimeMs >= 0) {
      setTimeLeft(Math.max(0, Math.ceil(payload.remainingTimeMs / 1000)));
    }

    if (typeof payload?.awaitingResponse === 'boolean') {
      setIsAwaitingResponse(payload.awaitingResponse);
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
  }, [normalizeChallenge]);

  const handleMemoryTurnState = useCallback(payload => {
    const phase = payload?.phase;

    setMemoryBoard(Array.isArray(payload?.board) ? payload.board : []);
    setMemoryStats({
      attempts: Number(payload?.attempts || 0),
      matchedCount: Number(payload?.matchedCount || 0),
      totalCards: Number(payload?.totalCards || 0)
    });

    const remainingMs = Number(payload?.remainingTimeMs);
    if (Number.isFinite(remainingMs) && remainingMs >= 0) {
      setTimeLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
    }

    if (Number.isFinite(payload?.score)) {
      setScore(payload.score);
    }

    if (typeof payload?.awaitingResponse === 'boolean') {
      setIsAwaitingResponse(payload.awaitingResponse);
    }

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

    if (Number.isFinite(payload?.attempts)) {
      setCurrentRound(Math.max(1, payload.attempts + 1));
    }
  }, []);

  const handleGameOver = useCallback(payload => {
    clearPendingTimeouts();
    setIsAwaitingResponse(false);
    setGameState('finished');
    setMemoryFeedbackActive(false);
    setMascotMood('celebrating');
    setRealtimeError(null);

    const finalScore = Number.isFinite(payload?.finalScore) ? payload.finalScore : 0;
    setScore(finalScore);
    setSrAnnouncement('Partida finalizada.');
    setPlaySummary(
      normalizeFinalSummary(payload?.metrics, finalScore, correctAnswers, isMemoryMode)
    );
  }, [clearPendingTimeouts, correctAnswers, isMemoryMode]);

  const handlePlayInterrupted = useCallback(payload => {
    clearPendingTimeouts();
    setFeedback(null);
    setMemoryFeedbackActive(false);
    setIsAwaitingResponse(false);
    setGameState('finished');

    const finalScore = Number.isFinite(payload?.finalScore) ? payload.finalScore : score;
    setScore(finalScore);

    const interruptionMessage =
      payload?.message ||
      'La partida se interrumpió por un reinicio o problema del servidor. Consulta al docente.';

    setRealtimeError({
      code: 'PLAY_INTERRUPTED',
      message: interruptionMessage
    });
    setSrAnnouncement('La partida fue interrumpida.');
    toast.warning(interruptionMessage);
  }, [clearPendingTimeouts, score]);

  const resolvePlayerId = useCallback(async () => {
    const explicitPlayerId = searchParams.get('playerId');
    if (explicitPlayerId) {
      return explicitPlayerId;
    }

    const teacherId = user?.id || user?._id;
    if (!teacherId) {
      throw new Error('No se pudo determinar el profesor para crear la partida.');
    }

    const studentsRes = await usersAPI.getStudentsByTeacher(teacherId, {
      limit: 1,
      sortBy: 'createdAt',
      order: 'asc'
    });
    const students = extractData(studentsRes) || [];

    const firstStudentId = students?.[0]?.id || students?.[0]?._id;
    if (!firstStudentId) {
      throw new Error('No hay alumnos disponibles para iniciar la partida.');
    }

    return firstStudentId;
  }, [searchParams, user]);

  const bootstrapPlay = useCallback(async () => {
    const inProgressRes = await playsAPI.getPlays({ sessionId, status: 'in-progress', limit: 1 });
    const inProgressPlays = extractData(inProgressRes) || [];
    const foundInProgress = inProgressPlays?.[0];
    if (foundInProgress?.id || foundInProgress?._id) {
      return {
        playId: foundInProgress.id || foundInProgress._id,
        playerId: foundInProgress.playerId || foundInProgress.player?.id || foundInProgress.player?._id
      };
    }

    const pausedRes = await playsAPI.getPlays({ sessionId, status: 'paused', limit: 1 });
    const pausedPlays = extractData(pausedRes) || [];
    const foundPaused = pausedPlays?.[0];
    if (foundPaused?.id || foundPaused?._id) {
      return {
        playId: foundPaused.id || foundPaused._id,
        playerId: foundPaused.playerId || foundPaused.player?.id || foundPaused.player?._id
      };
    }

    const playerId = await resolvePlayerId();
    const createPlayRes = await playsAPI.createPlay({ sessionId, playerId });
    const createdPlay = extractData(createPlayRes);

    return {
      playId: createdPlay?.id || createdPlay?._id,
      playerId
    };
  }, [resolvePlayerId, sessionId]);

  useEffect(() => {
    const controller = new AbortController();

    const onSocketError = payload => {
      const normalized = resolveSocketError(payload);
      setRealtimeError(normalized);
      setSrAnnouncement(normalized.message);
      toast.warning(normalized.message);
    };

    const onSocketDisconnect = reason => {
      if (gameStateRef.current === 'finished') {
        return;
      }

      setRealtimeStatus('reconnecting');
      setRealtimeError({
        code: 'SOCKET_DISCONNECTED',
        message: 'Conexión en tiempo real perdida. Intentando reconectar…'
      });
      setSrAnnouncement('Conexión en tiempo real perdida. Intentando reconectar.');

      if (reason === 'io server disconnect') {
        toast.warning('La conexión fue reiniciada por el servidor. Reconectando…');
      }
    };

    const onSocketConnect = () => {
      setRealtimeStatus('connected');
      setRealtimeError(null);
      setSrAnnouncement('Conexión en tiempo real restablecida.');

      if (typeof webSerialService.flushPendingScans === 'function') {
        webSerialService.flushPendingScans();
      }

      if (playIdRef.current) {
        socketService.sendCommand(SOCKET_EVENTS.JOIN_PLAY, { playId: playIdRef.current });
      }
    };

    const initRealtimePlay = async () => {
      try {
        if (!sessionId) {
          throw new Error('No se ha indicado una sesión válida.');
        }

        setLoadingSession(true);
        setBootstrappingPlay(true);
        setSessionError(null);

        const response = await sessionsAPI.getSessionById(sessionId, {
          signal: controller.signal
        });

        let sessionData = extractData(response);
        if (sessionData?.status === 'created' || sessionData?.status === 'completed') {
          const startSessionRes = await sessionsAPI.startSession(sessionId);
          sessionData = extractData(startSessionRes) || sessionData;
        }

        setSession(sessionData);

        const configuredRounds = Number(sessionData?.config?.numberOfRounds);
        setTotalRounds(Number.isFinite(configuredRounds) && configuredRounds > 0 ? configuredRounds : 5);

        const configuredTime = Number(sessionData?.config?.timeLimit);
        setRoundTime(Number.isFinite(configuredTime) && configuredTime > 0 ? configuredTime : ROUND_TIME);

        const resolvedPlay = await bootstrapPlay();
        if (!resolvedPlay?.playId) {
          throw new Error('No se pudo inicializar una partida de juego.');
        }

        setPlayId(resolvedPlay.playId);
        setSelectedPlayerId(resolvedPlay.playerId || null);

        if (!socketService.isSocketConnected()) {
          await socketService.connect();
        }

        setRealtimeStatus(socketService.isSocketConnected() ? 'connected' : 'connecting');
        setRealtimeError(null);

        socketService.on(SOCKET_EVENTS.NEW_ROUND, handleNewRound);
        socketService.on(SOCKET_EVENTS.MEMORY_TURN_STATE, handleMemoryTurnState);
        socketService.on(SOCKET_EVENTS.VALIDATION_RESULT, handleValidationResult);
        socketService.on(SOCKET_EVENTS.GAME_OVER, handleGameOver);
        socketService.on(SOCKET_EVENTS.PLAY_PAUSED, handlePlayPaused);
        socketService.on(SOCKET_EVENTS.PLAY_RESUMED, handlePlayResumed);
        socketService.on(SOCKET_EVENTS.PLAY_STATE, handlePlayState);
        socketService.on(SOCKET_EVENTS.PLAY_INTERRUPTED, handlePlayInterrupted);
        socketService.on(SOCKET_EVENTS.ERROR, onSocketError);
        socketService.on(SOCKET_EVENTS.DISCONNECT, onSocketDisconnect);
        socketService.on(SOCKET_EVENTS.CONNECT, onSocketConnect);

        socketService.sendCommand(SOCKET_EVENTS.JOIN_PLAY, { playId: resolvedPlay.playId });
        socketService.sendCommand(SOCKET_EVENTS.START_PLAY, { playId: resolvedPlay.playId });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        setSessionError(extractErrorMessage(error));
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSession(false);
          setBootstrappingPlay(false);
        }
      }
    };

    initRealtimePlay();

    return () => {
      controller.abort();
      if (playIdRef.current) {
        socketService.sendCommand(SOCKET_EVENTS.LEAVE_PLAY, { playId: playIdRef.current });
      }
      socketService.off(SOCKET_EVENTS.NEW_ROUND, handleNewRound);
      socketService.off(SOCKET_EVENTS.MEMORY_TURN_STATE, handleMemoryTurnState);
      socketService.off(SOCKET_EVENTS.VALIDATION_RESULT, handleValidationResult);
      socketService.off(SOCKET_EVENTS.GAME_OVER, handleGameOver);
      socketService.off(SOCKET_EVENTS.PLAY_PAUSED, handlePlayPaused);
      socketService.off(SOCKET_EVENTS.PLAY_RESUMED, handlePlayResumed);
      socketService.off(SOCKET_EVENTS.PLAY_STATE, handlePlayState);
      socketService.off(SOCKET_EVENTS.PLAY_INTERRUPTED, handlePlayInterrupted);
      socketService.off(SOCKET_EVENTS.ERROR, onSocketError);
      socketService.off(SOCKET_EVENTS.DISCONNECT, onSocketDisconnect);
      socketService.off(SOCKET_EVENTS.CONNECT, onSocketConnect);
      clearPendingTimeouts();
    };
  }, [
    bootstrapPlay,
    clearPendingTimeouts,
    handleGameOver,
    handleNewRound,
    handleMemoryTurnState,
    handlePlayPaused,
    handlePlayResumed,
    handlePlayState,
    handlePlayInterrupted,
    handleValidationResult,
    sessionId
  ]);

  useEffect(() => {
    if (!feedback) {
      setMemoryFeedbackActive(false);
    }
  }, [feedback]);

  // Timer effect
  useEffect(() => {
    const shouldRunVisualTimer =
      gameState === 'playing' && (isMemoryMode ? !memoryFeedbackActive : isAwaitingResponse);

    if (!shouldRunVisualTimer) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, isAwaitingResponse, isMemoryMode, memoryFeedbackActive]);

  useEffect(() => {
    const shouldRunVisualTimer =
      gameState === 'playing' && (isMemoryMode ? !memoryFeedbackActive : isAwaitingResponse);

    if (!shouldRunVisualTimer) {
      return;
    }

    if (!TIMER_ANNOUNCEMENT_THRESHOLDS.has(timeLeft)) {
      return;
    }

    if (announcedThresholdsRef.current.has(timeLeft)) {
      return;
    }

    announcedThresholdsRef.current.add(timeLeft);

    if (timeLeft === 0) {
      setSrAnnouncement('Tiempo agotado.');
      return;
    }

    setSrAnnouncement(`Quedan ${timeLeft} segundos.`);
  }, [gameState, isAwaitingResponse, isMemoryMode, memoryFeedbackActive, timeLeft]);

  useEffect(() => {
    if (realtimeStatus === previousRealtimeStatusRef.current) {
      return;
    }

    previousRealtimeStatusRef.current = realtimeStatus;
    const announcement = REALTIME_STATUS_COPY[realtimeStatus]?.announcement;
    if (announcement) {
      setSrAnnouncement(announcement);
    }
  }, [realtimeStatus]);

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

  useEffect(() => {
    return () => {
      clearPendingTimeouts();
    };
  }, [clearPendingTimeouts]);

  useEffect(() => {
    const handleDeviceStateChange = (payload) => {
      setRfidConnected(payload?.state === 'ready');
    };

    webSerialService.on('device_state_change', handleDeviceStateChange);

    return () => {
      webSerialService.off('device_state_change', handleDeviceStateChange);
    };
  }, []);

  // Start game
  const startGame = () => {
    if (!playId) {
      toast.error('La partida todavía no está lista.');
      return;
    }

    if (!socketService.sendCommand(SOCKET_EVENTS.START_PLAY, { playId })) {
      toast.error('No hay conexión en tiempo real para iniciar la partida.');
      return;
    }

    setGameState('playing');
    setMascotMood('happy');
    setRealtimeError(null);
    setSrAnnouncement('Partida iniciada.');
  };

  // Toggle pause
  const togglePause = async () => {
    if (!playId) {
      return;
    }

    if (gameState === 'playing') {
      const sent = socketService.sendCommand(SOCKET_EVENTS.PAUSE_PLAY, { playId });
      if (sent === false) {
        setRealtimeStatus('disconnected');
        setRealtimeError({
          code: 'SOCKET_REQUIRED',
          message: 'Se requiere conexión en tiempo real para pausar/reanudar.'
        });
        toast.error('Sin conexión en tiempo real para pausar la partida.');
      } else {
        setSrAnnouncement('Solicitando pausa de la partida.');
      }
    } else if (gameState === 'paused') {
      const sent = socketService.sendCommand(SOCKET_EVENTS.RESUME_PLAY, { playId });
      if (sent === false) {
        setRealtimeStatus('disconnected');
        setRealtimeError({
          code: 'SOCKET_REQUIRED',
          message: 'Se requiere conexión en tiempo real para pausar/reanudar.'
        });
        toast.error('Sin conexión en tiempo real para reanudar la partida.');
      } else {
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

  const emitFallbackCardScan = useCallback(
    card => {
      if (!playId || !card?.uid || gameState !== 'playing') {
        return;
      }

      const sensorId = session?.sensorId || 'touch_fallback_sensor';
      const sent = socketService.sendCommand(SOCKET_EVENTS.RFID_SCAN_FROM_CLIENT, {
        uid: card.uid,
        type: 'UNKNOWN',
        sensorId,
        timestamp: Date.now(),
        source: 'web_serial'
      });

      if (sent === false) {
        toast.error('Sin conexión en tiempo real para enviar la respuesta táctil.');
        return;
      }

      setSrAnnouncement(`Carta ${card?.assignedValue || card?.uid} seleccionada.`);
    },
    [gameState, playId, session?.sensorId]
  );

  // Play again
  const playAgain = async () => {
    if (!selectedPlayerId) {
      toast.error('No se pudo determinar el alumno para una nueva partida.');
      return;
    }

    try {
      const createPlayRes = await playsAPI.createPlay({ sessionId, playerId: selectedPlayerId });
      const newPlay = extractData(createPlayRes);
      const nextPlayId = newPlay?.id || newPlay?._id;

      if (!nextPlayId) {
        throw new Error('No se pudo crear una nueva partida.');
      }

      if (playId) {
        socketService.sendCommand(SOCKET_EVENTS.LEAVE_PLAY, { playId });
      }

      setPlayId(nextPlayId);
      setGameState('waiting');
      setCurrentRound(1);
      setScore(0);
      setCorrectAnswers(0);
      setChallenge(null);
      setMemoryBoard([]);
      setFeedback(null);
      setIsAwaitingResponse(false);
      setPlaySummary(null);
      setMemoryStats({ attempts: 0, matchedCount: 0, totalCards: 0 });
      setRealtimeError(null);

      socketService.sendCommand(SOCKET_EVENTS.JOIN_PLAY, { playId: nextPlayId });
      socketService.sendCommand(SOCKET_EVENTS.START_PLAY, { playId: nextPlayId });
    } catch (error) {
      toast.error(extractErrorMessage(error));
    }
  };

  // Go home
  const goHome = () => {
    navigate(ROUTES.DASHBOARD);
  };

  if (loadingSession) {
    return <div className="min-h-screen bg-slate-950 text-white p-8">Cargando sesión...</div>;
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 flex flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-bold">No se pudo cargar la sesión</h1>
        <p className="text-slate-400 max-w-md">{sessionError}</p>
        <button
          onClick={goHome}
          className="px-5 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 transition-colors"
        >
          Volver al Dashboard
        </button>
      </div>
    );
  }

  const playAttempts = isMemoryMode ? memoryStats.attempts : Math.max(0, currentRound - 1);
  const playErrors = Math.max(0, playAttempts - correctAnswers);

  return (
    <div className="game-bg min-h-screen flex flex-col relative overflow-hidden">
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </output>
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={cn('absolute top-20 left-10 w-64 h-64 bg-purple-500/10 rounded-full blur-[100px]', !shouldReduceMotion && 'animate-float')} />
        <div className={cn('absolute bottom-20 right-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px]', !shouldReduceMotion && 'animate-float')} style={{ animationDelay: shouldReduceMotion ? '0s' : '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-pink-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Top HUD */}
      <header className="relative z-10 p-4 sm:p-6">
        <div className="glass rounded-2xl p-4 flex items-center justify-between gap-4">
          {/* Round indicator */}
          <div className="flex items-center gap-3">
            <motion.div
              key={currentRound}
              initial={shouldReduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30"
            >
              <span className="text-2xl font-bold text-white">{currentRound}</span>
            </motion.div>
            <div className="hidden sm:block">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Ronda</div>
              <div className="text-sm text-white font-medium">{currentRound} de {totalRounds}</div>
            </div>
          </div>

          {/* Center - Score */}
          <ScoreDisplayCompact score={score} />

          {/* Right - Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Sound toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={cn(
                "p-2 rounded-lg transition-all",
                soundEnabled ? "bg-white/10 text-white" : "bg-white/5 text-slate-500"
              )}
              aria-pressed={soundEnabled}
              aria-label={soundEnabled ? 'Silenciar' : 'Activar sonido'}
              title={soundEnabled ? 'Silenciar' : 'Activar sonido'}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>

            {/* Pause button */}
            {gameState === 'playing' || gameState === 'paused' ? (
              <button
                onClick={togglePause}
                ref={pauseButtonRef}
                className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all"
                aria-pressed={gameState === 'paused'}
                aria-label={gameState === 'paused' ? 'Reanudar' : 'Pausar'}
                title={gameState === 'paused' ? 'Reanudar' : 'Pausar'}
              >
                {gameState === 'paused' ? <Play size={20} /> : <Pause size={20} />}
              </button>
            ) : null}

            {/* RFID status */}
            <div className={cn(
              "p-2 rounded-lg",
              rfidConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
            )}>
              <output className="sr-only" aria-live="polite">
                {rfidConnected ? 'Sensor RFID conectado' : 'Sensor RFID desconectado'}
              </output>
              {rfidConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>

            <div className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide',
              realtimeStatus === 'connected' && 'bg-emerald-500/20 text-emerald-300',
              realtimeStatus === 'reconnecting' && 'bg-amber-500/20 text-amber-300',
              realtimeStatus === 'disconnected' && 'bg-rose-500/20 text-rose-300',
              realtimeStatus === 'connecting' && 'bg-slate-700/70 text-slate-200'
            )}>
              <output className="sr-only" aria-live="polite" aria-atomic="true">
                {REALTIME_STATUS_COPY[realtimeStatus]?.announcement || 'Conectando el juego.'}
              </output>
              {REALTIME_STATUS_COPY[realtimeStatus]?.label || 'Conectando'}
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 px-4 sm:px-6">
        <RFIDConnector className="max-w-md" showSensorId={false} />
      </div>

      {realtimeError && (
        <div className="relative z-10 px-4 sm:px-6 mt-3">
          <div className="max-w-4xl mx-auto rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {realtimeError.message}
          </div>
        </div>
      )}

      {/* Timer Bar */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="relative z-10 px-4 sm:px-6 mb-4">
          <TimerBar timeLeft={timeLeft} timeLimit={roundTime} shouldReduceMotion={shouldReduceMotion} />
        </div>
      )}

      {/* Main Game Area */}
      <main className="flex-1 relative z-10 flex items-center justify-center p-4 sm:p-8">
        <AnimatePresence mode="wait">
          {/* Waiting screen */}
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
              <p className="text-slate-400 mb-8 text-lg">
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

          {/* Playing / Paused screen */}
          {(gameState === 'playing' || gameState === 'paused') && (
            <motion.div
              key="playing"
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-2xl flex flex-col items-center"
            >
              {/* Challenge display */}
              {isMemoryMode ? (
                <MemoryGameplayPanel
                  board={memoryBoard}
                  attempts={memoryStats.attempts}
                  matchedCount={memoryStats.matchedCount}
                  totalCards={memoryStats.totalCards}
                />
              ) : (
                <AssociationGameplayPanel
                  challenge={challenge}
                  paused={gameState === 'paused'}
                  shouldReduceMotion={shouldReduceMotion}
                />
              )}

              {/* Instruction text */}
              <motion.p
                initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
                className="mt-8 text-center text-slate-200 text-lg font-semibold"
              >
                {isMemoryMode ? (
                  <>Encuentra las parejas antes de que se termine el tiempo.</>
                ) : (
                  <>
                    Busca <span className="text-white font-bold">{challenge?.value || 'la tarjeta correcta'}</span>
                  </>
                )}
              </motion.p>

              {!rfidConnected && (
                <FallbackTouchPanel
                  cards={fallbackCards}
                  onSelectCard={emitFallbackCardScan}
                  onPauseRequest={togglePause}
                  canPause={gameState === 'playing'}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Paused overlay */}
        <AnimatePresence>
          {gameState === 'paused' && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-20"
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
                <h2 id="pause-title" className="text-3xl font-bold text-white mb-2">Juego pausado</h2>
                <p id="pause-description" className="text-slate-300 mb-4">Pulsa continuar para volver al juego.</p>
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

      {/* Character Mascot */}
      <div className="fixed bottom-24 left-4 sm:left-8 z-20">
        <CharacterMascot mood={mascotMood} position="left" shouldReduceMotion={shouldReduceMotion} />
      </div>

      {/* Round progress dots */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <footer className="relative z-10 p-4 sm:p-6">
          <CurrentPlayMetrics
            mode={isMemoryMode ? 'memory' : 'association'}
            score={score}
            correctAnswers={correctAnswers}
            errors={playErrors}
            attempts={playAttempts}
          />
          <div className="flex justify-center items-center gap-2">
            {roundIndicators.map(roundNumber => (
              <motion.div
                key={`round-${roundNumber}`}
                initial={shouldReduceMotion ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: shouldReduceMotion ? 0 : (roundNumber - 1) * 0.05 }}
                className={cn(
                  "w-3 h-3 rounded-full transition-all duration-300",
                  roundNumber < currentRound && "bg-emerald-500 shadow-lg shadow-emerald-500/50",
                  roundNumber === currentRound && "bg-purple-500 shadow-lg shadow-purple-500/50 scale-125",
                  roundNumber > currentRound && "bg-slate-700"
                )}
              />
            ))}
          </div>
        </footer>
      )}

      {/* Feedback Overlay */}
      <AnimatePresence>
        {feedback && (
          <FeedbackOverlay
            type={feedback.type}
            points={feedback.points}
            onComplete={() => setFeedback(null)}
            shouldReduceMotion={shouldReduceMotion}
          />
        )}
      </AnimatePresence>

      {/* Game Over Screen */}
      {gameState === 'finished' && (
        <>
          <GameOverScreen
            score={score}
            correctAnswers={correctAnswers}
            totalRounds={totalRounds}
            bestScore={0}
            onPlayAgain={playAgain}
            onGoHome={goHome}
            shouldReduceMotion={shouldReduceMotion}
          />
          <PlaySummaryCard summary={playSummary} />
        </>
      )}
    </div>
  );
}

function AssociationGameplayPanel({ challenge, paused, shouldReduceMotion }) {
  const resolveAssociationTheme = challengeValue => {
    const challengeKey = (challengeValue || '').toLowerCase();

    if (challengeKey.includes('animal')) {
      return 'animals';
    }

    if (challengeKey.includes('color')) {
      return 'colors';
    }

    if (challengeKey.includes('número') || challengeKey.includes('numero')) {
      return 'numbers';
    }

    return 'default';
  };

  const challengeKey = (challenge?.key || challenge?.value || '').toLowerCase();
  const contextTheme = resolveAssociationTheme(challengeKey);

  return (
    <ChallengeDisplay
      asset={challenge}
      revealed={!paused}
      contextTheme={contextTheme}
      className="w-full"
      shouldReduceMotion={shouldReduceMotion}
    />
  );
}

AssociationGameplayPanel.propTypes = {
  challenge: PropTypes.object,
  paused: PropTypes.bool,
  shouldReduceMotion: PropTypes.bool
};

function MemoryGameplayPanel({ board, attempts, matchedCount, totalCards }) {
  const totalPairs = Math.max(1, Math.ceil(Number(totalCards || 0) / 2));
  const matchedPairs = Math.max(0, Math.floor(Number(matchedCount || 0) / 2));

  return (
    <div className="w-full space-y-4">
      <div className="mx-auto max-w-4xl rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-200 flex flex-wrap items-center justify-between gap-3">
        <span>Intentos: <strong>{attempts}</strong></span>
        <span>Parejas encontradas: <strong>{matchedPairs}/{totalPairs}</strong></span>
      </div>
      <MemoryBoard board={board} />
    </div>
  );
}

MemoryGameplayPanel.propTypes = {
  board: PropTypes.array,
  attempts: PropTypes.number,
  matchedCount: PropTypes.number,
  totalCards: PropTypes.number
};

function CurrentPlayMetrics({ mode, score, correctAnswers, errors, attempts }) {
  const safeAttempts = Math.max(1, attempts || 0);

  return (
    <div className="mb-4 max-w-4xl mx-auto rounded-xl border border-white/10 bg-slate-900/30 px-4 py-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <MetricPill label="⭐ Puntos" value={score} />
        <MetricPill label="✅ Aciertos" value={correctAnswers} />
        <MetricPill
          label={mode === 'memory' ? '🧠 Parejas' : '🎯 Intentos'}
          value={mode === 'memory' ? `${correctAnswers}` : `${safeAttempts - errors}/${safeAttempts}`}
        />
      </div>
    </div>
  );
}

CurrentPlayMetrics.propTypes = {
  mode: PropTypes.string,
  score: PropTypes.number,
  correctAnswers: PropTypes.number,
  errors: PropTypes.number,
  attempts: PropTypes.number
};

function MetricPill({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-800/60 border border-white/5 px-3 py-2">
      <div className="text-[11px] tracking-wide text-slate-300">{label}</div>
      <div className="text-white font-semibold">{value}</div>
    </div>
  );
}

MetricPill.propTypes = {
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

function PlaySummaryCard({ summary }) {
  if (!summary) {
    return null;
  }

  const avgSeconds = summary.averageResponseTimeMs > 0
    ? (summary.averageResponseTimeMs / 1000).toFixed(1)
    : '0.0';

  const totalMinutes = summary.totalTimePlayed > 0
    ? (summary.totalTimePlayed / (1000 * 60)).toFixed(1)
    : '0.0';

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[60] w-[min(92vw,640px)] rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3">Resumen de la partida</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <MetricPill label="Modo" value={summary.mode === 'memory' ? 'Memoria' : 'Asociación'} />
        <MetricPill label="Aciertos" value={summary.correctAnswers} />
        <MetricPill label="Errores" value={summary.errors} />
        <MetricPill label="Intentos" value={summary.attempts} />
        <MetricPill label="Puntos" value={summary.score} />
        <MetricPill label="Respuesta media" value={`${avgSeconds}s`} />
        <MetricPill label="Tiempo total" value={`${totalMinutes} min`} />
      </div>
    </div>
  );
}

PlaySummaryCard.propTypes = {
  summary: PropTypes.shape({
    score: PropTypes.number,
    correctAnswers: PropTypes.number,
    errors: PropTypes.number,
    attempts: PropTypes.number,
    averageResponseTimeMs: PropTypes.number,
    totalTimePlayed: PropTypes.number,
    mode: PropTypes.string
  })
};

function resolveMemoryColumns(totalCards) {
  if (totalCards <= 6) {
    return 3;
  }

  if (totalCards <= 12) {
    return 4;
  }

  return 5;
}

function getMemorySlotClasses(isMatched, isOpen) {
  if (isMatched) {
    return 'border-emerald-500/70 bg-emerald-500/20';
  }

  if (isOpen) {
    return 'border-indigo-400/60 bg-indigo-500/20';
  }

  return 'border-slate-700 bg-slate-800/60';
}

function MemoryBoard({ board }) {
  const safeBoard = Array.isArray(board) ? [...board].sort((a, b) => a.slotIndex - b.slotIndex) : [];
  const total = safeBoard.length;
  const columns = resolveMemoryColumns(total);

  return (
    <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-slate-900/30 p-4 sm:p-6">
      <div className="mb-4 text-center text-sm text-slate-400">Tablero de Memoria</div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {safeBoard.map(slot => {
          const isOpen = Boolean(slot.isRevealed || slot.isMatched);
          const slotClasses = getMemorySlotClasses(slot.isMatched, isOpen);

          return (
            <div
              key={`memory-slot-${slot.slotIndex}`}
              className={cn(
                'aspect-square rounded-xl border p-2 flex items-center justify-center transition-all',
                slotClasses
              )}
            >
              {isOpen ? (
                <CardAssetPreview
                  asset={slot.displayData || { display: slot.assignedValue || '🎴' }}
                  className="w-full h-full rounded-lg"
                  loading="eager"
                  fallbackLabel={slot.displayData?.display || slot.assignedValue || '🎴'}
                />
              ) : (
                <div className="w-full h-full rounded-lg bg-slate-700/60 flex items-center justify-center text-slate-300 text-lg">
                  ?
                </div>
              )}
            </div>
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
  )
};

function FallbackTouchPanel({ cards, onSelectCard, onPauseRequest, canPause }) {
  const visibleCards = Array.isArray(cards) ? cards.slice(0, 12) : [];

  return (
    <div className="mt-6 w-full max-w-3xl rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3 text-amber-100">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Modo táctil temporal activado</p>
          <p className="text-xs text-amber-100/90">
            El lector RFID está desconectado. Toca una carta para seguir y avisa al docente.
          </p>
        </div>
      </div>

      {visibleCards.length > 0 && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {visibleCards.map(card => (
            <button
              key={`fallback-card-${card.uid}`}
              type="button"
              onClick={() => onSelectCard(card)}
              className="rounded-xl border border-white/10 bg-slate-900/40 p-2 text-left hover:bg-slate-900/60 transition-colors"
            >
              <CardAssetPreview
                asset={card.displayData || { display: card.assignedValue || card.uid }}
                className="h-16 w-full rounded-lg"
                fit="contain"
                loading="eager"
                fallbackLabel={card.assignedValue || card.uid}
              />
              <div className="mt-1 text-[11px] text-slate-200 truncate">
                {card.assignedValue || card.uid}
              </div>
            </button>
          ))}
        </div>
      )}

      {canPause && (
        <button
          type="button"
          onClick={onPauseRequest}
          className="mt-4 text-xs px-3 py-2 rounded-lg bg-slate-900/60 text-slate-200 border border-white/10 hover:bg-slate-900/80 transition-colors"
        >
          Pausar para revisar el sensor
        </button>
      )}
    </div>
  );
}

FallbackTouchPanel.propTypes = {
  cards: PropTypes.array,
  onSelectCard: PropTypes.func.isRequired,
  onPauseRequest: PropTypes.func.isRequired,
  canPause: PropTypes.bool
};
