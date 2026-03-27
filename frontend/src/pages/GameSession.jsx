import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Pause, Play, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn } from '../lib/utils';
import { useReducedMotion } from '../hooks/useReducedMotion';
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
import ErrorBoundary from '../components/common/ErrorBoundary';
import ChallengeDisplay from '../components/game/ChallengeDisplay';
import TimerBar from '../components/game/TimerBar';
import { ScoreDisplayCompactMemo as ScoreDisplayCompact } from '../components/game/ScoreDisplay';
import FloatingPointsBadge from '../components/game/FloatingPointsBadge';
import GameOverScreen from '../components/game/GameOverScreen';
import CharacterMascot from '../components/game/CharacterMascot';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import { useGameFeedback } from '../hooks/useGameFeedback';

const SOCKET_ERROR_MESSAGES = {
  RFID_MODE_INVALID: 'El lector de tarjetas no está listo. Avisa al profesor.',
  RFID_SENSOR_UNAUTHORIZED: 'Este lector no está configurado para esta sesión. Avisa al profesor.',
  RFID_SENSOR_MISMATCH: 'Se detectó un cambio en el lector durante la partida.',
  PLAY_NOT_ACTIVE: 'La partida ha terminado o fue interrumpida.',
  ROUND_BLOCKED: 'Espera un momento antes de pasar la siguiente tarjeta.',
  RFID_SOCKET_NOT_ACTIVE: 'El juego se abrió en otra ventana. Cierra las demás para continuar.',
  RFID_MODE_TAKEN_OVER: 'Otra ventana tomó el control del lector. Usa solo esta ventana.',
  FORBIDDEN: 'No tienes permisos para ejecutar esta acción.',
  AUTH_REQUIRED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  ENGINE_ERROR: 'Algo salió mal. Inténtalo de nuevo o avisa al profesor.'
};

const REALTIME_STATUS_COPY = {
  connected: { label: 'Juego listo', announcement: 'El juego está conectado.' },
  reconnecting: { label: 'Reconectando', announcement: 'Reconectando el juego.' },
  disconnected: { label: 'Sin conexión', announcement: 'Se perdió la conexión del juego.' },
  connecting: { label: 'Conectando', announcement: 'Conectando el juego.' }
};

const TIMER_ANNOUNCEMENT_THRESHOLDS = new Set([10, 5, 3, 2, 1, 0]);

const FLOAT_DELAY_STYLE = { animationDelay: '1s' };
const FLOAT_DELAY_NONE = { animationDelay: '0s' };

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
  const initCalledRef = useRef(false);
  const lastSocketErrorToastRef = useRef(0);
  const lastRetryAtRef = useRef(0);
  const RETRY_COOLDOWN_MS = 5000;

  // Game state
  const [gameState, setGameState] = useState('waiting'); // waiting, playing, paused, finished
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [score, setScore] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  // feedback and mascotMood are now managed by useGameFeedback hook
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
  const [bestScore, setBestScore] = useState(0);
  const [srAnnouncement, setSrAnnouncement] = useState('');
  const [showPreCelebration, setShowPreCelebration] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const gameStateRef = useRef('waiting');

  const [challenge, setChallenge] = useState(null);
  const [memoryBoard, setMemoryBoard] = useState([]);
  const fallbackCards = Array.isArray(session?.cardMappings) ? session.cardMappings : [];
  const roundIndicators = useMemo(
    () => Array.from({ length: totalRounds }, (_, i) => i + 1),
    [totalRounds]
  );

  useEffect(() => {
    playIdRef.current = playId;
    roundTimeRef.current = roundTime;
    totalRoundsRef.current = totalRounds;
    gameStateRef.current = gameState;
  }, [playId, roundTime, totalRounds, gameState]);

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

  const isMemoryMode = session?.mechanic?.name === 'memory';

  const gameFeedback = useGameFeedback({ isMemoryMode, shouldReduceMotion });

  const clearPendingTimeouts = useCallback(() => {
    pendingTimeoutRef.current.forEach(timeoutId => globalThis.clearTimeout(timeoutId));
    pendingTimeoutRef.current = [];
  }, []);

  const scheduleFeedbackClear = useCallback((delayMs = 1400) => {
    const timeoutId = globalThis.setTimeout(() => {
      gameFeedback.clearFeedback();
    }, delayMs);
    pendingTimeoutRef.current.push(timeoutId);
  }, [gameFeedback]);

  const handleValidationResult = useCallback(
    payload => {
      const feedbackDelayMs = Number(payload?.feedbackDelayMs || 1400);

      const gameContext = {
        currentRound, totalRounds, timeLeft, timeLimit: roundTime,
        matchedCount: memoryStats.matchedCount,
        totalCards: memoryStats.totalCards,
        attempts: memoryStats.attempts,
      };

      const { isCorrect } = gameFeedback.processValidationResult(payload, gameContext);

      setScore(Number.isFinite(payload?.newScore) ? payload.newScore : 0);
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
    [isMemoryMode, scheduleFeedbackClear, gameFeedback, currentRound, totalRounds, timeLeft, roundTime, memoryStats]
  );

  const handleNewRound = useCallback(
    payload => {
      announcedThresholdsRef.current.clear();
      clearPendingTimeouts();
      gameFeedback.clearFeedback();
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
      setIsAwaitingResponse(true);
      setSrAnnouncement(`Ronda ${Number(payload?.roundNumber || 1)} iniciada.`);
    },
    [clearPendingTimeouts, normalizeChallenge, gameFeedback]
  );

  const handlePlayPaused = useCallback(payload => {
    const remaining = Number(payload?.remainingTimeMs);
    setGameState('paused');
    gameFeedback.clearFeedback();  // reset to idle includes thinking-like state for pause
    setIsAwaitingResponse(false);
    setSrAnnouncement('Partida en pausa.');

    if (Number.isFinite(remaining) && remaining >= 0) {
      setTimeLeft(Math.max(0, Math.ceil(remaining / 1000)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- gameFeedback is not referentially stable
  }, []);

  const handlePlayResumed = useCallback(
    payload => {
      const remaining = Number(payload?.remainingTimeMs);
      setGameState('playing');
      gameFeedback.clearFeedback();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gameFeedback is not referentially stable
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
    setMemoryFeedbackActive(false);
    gameFeedback.clearFeedback();
    setRealtimeError(null);

    const finalScore = Number.isFinite(payload?.finalScore) ? payload.finalScore : 0;
    setScore(finalScore);
    setSrAnnouncement('Partida finalizada.');
    setPlaySummary(
      normalizeFinalSummary(payload?.metrics, finalScore, correctAnswers, isMemoryMode)
    );

    // Brief celebration before showing game over screen (skip if reduced motion)
    if (shouldReduceMotion) {
      setGameState('finished');
    } else {
      setShowPreCelebration(true);
      const celebrationTimeout = globalThis.setTimeout(() => {
        setShowPreCelebration(false);
        setGameState('finished');
      }, 1200);
      pendingTimeoutRef.current.push(celebrationTimeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- gameFeedback is not referentially stable
  }, [clearPendingTimeouts, correctAnswers, isMemoryMode, shouldReduceMotion]);

  const handlePlayInterrupted = useCallback(payload => {
    clearPendingTimeouts();
    gameFeedback.clearFeedback();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- gameFeedback is not referentially stable
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

  const bootstrapPlay = useCallback(async (signal) => {
    const inProgressRes = await playsAPI.getPlays({ sessionId, status: 'in-progress', limit: 1 }, { signal });
    const inProgressPlays = extractData(inProgressRes) || [];
    const foundInProgress = inProgressPlays?.[0];
    if (foundInProgress?.id || foundInProgress?._id) {
      return {
        playId: foundInProgress.id || foundInProgress._id,
        playerId: foundInProgress.playerId || foundInProgress.player?.id || foundInProgress.player?._id
      };
    }

    const pausedRes = await playsAPI.getPlays({ sessionId, status: 'paused', limit: 1 }, { signal });
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

      // Deduplicate socket error toasts — max 1 every 5 seconds
      const now = Date.now();
      if (now - lastSocketErrorToastRef.current > 5000) {
        lastSocketErrorToastRef.current = now;
        toast.warning(normalized.message, { id: 'socket-error' });
      }
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
      // Prevent re-initialization when useEffect re-runs due to dependency changes
      if (initCalledRef.current) {
        return;
      }
      initCalledRef.current = true;

      try {
        if (!sessionId) {
          throw new Error('No se ha indicado una sesión válida.');
        }

        setLoadingSession(true);
        setBootstrappingPlay(true);
        setSessionError(null);

        // 1. Conectar socket primero (crea this.socket si no existe)
        if (!socketService.isSocketConnected()) {
          await socketService.connect();
        }
        if (controller.signal.aborted) return;

        // 2. Registrar listeners (this.socket ya existe)
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

        setRealtimeStatus(socketService.isSocketConnected() ? 'connected' : 'connecting');
        setRealtimeError(null);

        // 3. API calls después de que socket y listeners estén listos
        const response = await sessionsAPI.getSessionById(sessionId, {
          signal: controller.signal
        });

        let sessionData = extractData(response);
        if (controller.signal.aborted) return;

        if (sessionData?.status === 'created') {
          const startSessionRes = await sessionsAPI.startSession(sessionId);
          sessionData = extractData(startSessionRes) || sessionData;
        }
        if (controller.signal.aborted) return;

        setSession(sessionData);

        const configuredRounds = Number(sessionData?.config?.numberOfRounds);
        setTotalRounds(Number.isFinite(configuredRounds) && configuredRounds > 0 ? configuredRounds : 5);

        const configuredTime = Number(sessionData?.config?.timeLimit);
        setRoundTime(Number.isFinite(configuredTime) && configuredTime > 0 ? configuredTime : ROUND_TIME);

        const resolvedPlay = await bootstrapPlay(controller.signal);
        if (controller.signal.aborted) return;
        if (!resolvedPlay?.playId) {
          throw new Error('No se pudo inicializar una partida de juego.');
        }

        setPlayId(resolvedPlay.playId);
        setSelectedPlayerId(resolvedPlay.playerId || null);

        // Obtener mejor puntuación histórica del jugador en esta sesión
        if (resolvedPlay.playerId) {
          playsAPI.getPlayerStats(resolvedPlay.playerId, { sessionId })
            .then(statsRes => {
              if (controller.signal.aborted) return;
              const stats = extractData(statsRes);
              if (Number.isFinite(stats?.stats?.bestScore)) {
                setBestScore(stats.stats.bestScore);
              }
            })
            .catch(() => { /* No bloquear gameplay si las stats fallan */ });
        }

        if (controller.signal.aborted) return;
        socketService.sendCommand(SOCKET_EVENTS.JOIN_PLAY, { playId: resolvedPlay.playId });
        socketService.sendCommand(SOCKET_EVENTS.START_PLAY, { playId: resolvedPlay.playId });
        // Sincronizar estado en caso de que rondas avanzaran durante la inicialización
        socketService.requestPlayStateSync(resolvedPlay.playId);
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
      initCalledRef.current = false;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- init effect must run once per sessionId/retry; handlers use refs for current state
  }, [sessionId, retryKey]);

  useEffect(() => {
    if (gameFeedback.feedbackState === 'idle') {
      setMemoryFeedbackActive(false);
    }
  }, [gameFeedback.feedbackState]);

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

  // Recuperar estado del juego tras reconexión del socket.
  // Envía play_state_sync (fire-and-forget); el listener de play_state (línea ~560)
  // maneja la respuesta del servidor y actualiza el estado local automáticamente.
  useEffect(() => {
    const handleSocketReconnected = () => {
      const currentPlayId = playIdRef.current;
      if (!currentPlayId || gameStateRef.current === 'finished') {
        return;
      }

      const sent = socketService.requestPlayStateSync(currentPlayId);
      if (sent) {
        toast.success('Reconectado', {
          description: 'Sincronizando estado del juego...'
        });
      }
    };

    window.addEventListener('socket_reconnected', handleSocketReconnected);
    return () => {
      window.removeEventListener('socket_reconnected', handleSocketReconnected);
    };
  }, []);

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
      toast.error('La partida aún no está lista. Espera un momento.');
      return;
    }

    if (!socketService.sendCommand(SOCKET_EVENTS.START_PLAY, { playId })) {
      toast.error('No se puede iniciar: se perdió la conexión.');
      return;
    }

    setGameState('playing');
    gameFeedback.clearFeedback();
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
        toast.error('No se puede pausar: se perdió la conexión. Inténtalo de nuevo.');
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
        toast.error('No se puede reanudar: se perdió la conexión. Inténtalo de nuevo.');
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
        toast.error('No se pudo enviar la respuesta. Comprueba la conexión.');
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
      setShowPreCelebration(false);
      setCurrentRound(1);
      setScore(0);
      setCorrectAnswers(0);
      setChallenge(null);
      setMemoryBoard([]);
      gameFeedback.resetForNewPlay();
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
              const now = Date.now();
              const elapsed = now - lastRetryAtRef.current;
              if (elapsed < RETRY_COOLDOWN_MS) {
                const remaining = Math.ceil((RETRY_COOLDOWN_MS - elapsed) / 1000);
                toast.info(`Espera ${remaining}s antes de reintentar.`, { id: 'retry-cooldown' });
                return;
              }
              lastRetryAtRef.current = now;
              initCalledRef.current = false;
              setSessionError(null);
              setRetryKey(prev => prev + 1);
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

  const playAttempts = isMemoryMode ? memoryStats.attempts : Math.max(0, currentRound - 1);
  const playErrors = Math.max(0, playAttempts - correctAnswers);

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
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={cn('absolute top-20 left-10 w-64 h-64 bg-brand-base/10 rounded-full blur-[100px]', !shouldReduceMotion && 'animate-float')} />
        <div className={cn('absolute bottom-20 right-10 w-80 h-80 bg-accent-cyan/10 rounded-full blur-[100px]', !shouldReduceMotion && 'animate-float')} style={shouldReduceMotion ? FLOAT_DELAY_NONE : FLOAT_DELAY_STYLE} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-pink/5 rounded-full blur-[120px]" />
      </div>

      {/* Top HUD */}
      <header className="relative z-10 p-2 sm:p-3 shrink-0">
        <div className="glass rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-3">
          {/* Round indicator */}
          <div className="flex items-center gap-3">
            <motion.div
              key={currentRound}
              initial={shouldReduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              className="size-12 rounded-xl bg-gradient-to-br from-brand-base to-accent-indigo flex items-center justify-center shadow-lg shadow-brand-glow"
            >
              <span className="text-2xl font-bold font-display text-text-primary">{currentRound}</span>
            </motion.div>
            <div className="hidden sm:block">
              <div className="text-xs text-text-disabled uppercase tracking-wider">Ronda</div>
              <div className="text-sm text-text-primary font-medium">{currentRound} de {totalRounds}</div>
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
                "p-2.5 min-w-10 min-h-10 rounded-lg transition-all active:scale-95",
                soundEnabled ? "bg-border-default text-text-primary" : "bg-border-subtle text-text-disabled"
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
                className="p-2.5 min-w-10 min-h-10 rounded-lg bg-border-default text-text-primary hover:bg-border-strong active:scale-95 active:bg-border-strong transition-all"
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
              rfidConnected ? "bg-success-base/20 text-success-base" : "bg-error-base/20 text-error-base"
            )}>
              <output className="sr-only" aria-live="polite">
                {rfidConnected ? 'Sensor RFID conectado' : 'Sensor RFID desconectado'}
              </output>
              {rfidConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>

            <div className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide',
              realtimeStatus === 'connected' && 'bg-success-base/20 text-success-base',
              realtimeStatus === 'reconnecting' && 'bg-warning-base/20 text-warning-base',
              realtimeStatus === 'disconnected' && 'bg-error-base/20 text-error-base',
              realtimeStatus === 'connecting' && 'bg-background-surface/70 text-text-secondary'
            )}>
              <output className="sr-only" aria-live="polite" aria-atomic="true">
                {REALTIME_STATUS_COPY[realtimeStatus]?.announcement || 'Conectando el juego.'}
              </output>
              {realtimeStatus === 'connected' && '✅ '}
              {realtimeStatus === 'reconnecting' && '⏳ '}
              {realtimeStatus === 'disconnected' && '❌ '}
              {realtimeStatus === 'connecting' && '⏳ '}
              {REALTIME_STATUS_COPY[realtimeStatus]?.label || 'Conectando'}
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

      {/* Timer Bar */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="relative z-10 px-3 sm:px-4 mb-1 shrink-0">
          <TimerBar timeLeft={timeLeft} timeLimit={roundTime} shouldReduceMotion={shouldReduceMotion} />
        </div>
      )}

      {/* Main Game Area */}
      <main className="flex-1 min-h-0 relative z-10 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
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
                  feedbackState={gameFeedback.feedbackState}
                  feedbackPoints={gameFeedback.feedbackPoints}
                  feedbackMessage={gameFeedback.feedbackMessage}
                  shouldReduceMotion={shouldReduceMotion}
                />
              ) : (
                <AssociationGameplayPanel
                  ref={gameFeedback.challengeRef}
                  challenge={challenge}
                  paused={gameState === 'paused'}
                  feedbackState={gameFeedback.feedbackState}
                  feedbackPoints={gameFeedback.feedbackPoints}
                  feedbackMessage={gameFeedback.feedbackMessage}
                  isTimeout={gameFeedback.isTimeout}
                  shouldReduceMotion={shouldReduceMotion}
                />
              )}

              {/* Instruction text */}
              <motion.p
                initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
                className="mt-3 text-center text-text-secondary text-base font-semibold"
              >
                {isMemoryMode ? (
                  <>Encuentra las parejas antes de que se termine el tiempo.</>
                ) : (
                  <>
                    Busca <span className="text-text-primary font-bold">{challenge?.value || 'la tarjeta correcta'}</span>
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

      {/* Character Mascot */}
      <div className="fixed bottom-4 left-3 sm:left-6 z-20 scale-90 origin-bottom-left">
        <CharacterMascot
          mood={gameFeedback.mascotMood}
          message={gameFeedback.mascotMessage || undefined}
          position="left"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>

      {/* Round progress dots */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <footer className="relative z-10 px-3 py-2 sm:px-4 sm:py-2 shrink-0">
          <CurrentPlayMetrics
            mode={isMemoryMode ? 'memory' : 'association'}
            score={score}
            correctAnswers={correctAnswers}
            errors={playErrors}
            attempts={playAttempts}
          />
          <div
            className="flex justify-center items-center gap-2"
            aria-label={`Progreso: ronda ${currentRound} de ${totalRounds}`}
          >
            {totalRounds <= 8 && roundIndicators.map(roundNumber => (
              <motion.div
                key={`round-${roundNumber}`}
                initial={shouldReduceMotion ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: shouldReduceMotion ? 0 : (roundNumber - 1) * 0.05 }}
                className={cn(
                  "size-3.5 rounded-full transition-all duration-300",
                  roundNumber < currentRound && "bg-success-base shadow-lg shadow-success-glow",
                  roundNumber === currentRound && "bg-brand-base shadow-lg shadow-brand-glow scale-125",
                  roundNumber > currentRound && "bg-background-surface"
                )}
              />
            ))}
          </div>
          {/* Barra de progreso de rondas */}
          <div className="w-full max-w-md mx-auto mt-2 h-1.5 bg-background-elevated/60 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand-base to-success-base"
              initial={{ width: 0 }}
              animate={{ width: `${totalRounds > 0 ? ((currentRound - 1) / totalRounds) * 100 : 0}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
        </footer>
      )}

      {/* Feedback is now rendered inline in ChallengeDisplay / MemoryBoard */}

      {/* Pre-GameOver celebration */}
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

      {/* Game Over Screen */}
      {gameState === 'finished' && (
        <GameOverScreen
          score={score}
          correctAnswers={correctAnswers}
          totalRounds={totalRounds}
          bestScore={bestScore}
          summary={playSummary}
          onPlayAgain={playAgain}
          onGoHome={goHome}
          shouldReduceMotion={shouldReduceMotion}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}

const AssociationGameplayPanel = memo(function AssociationGameplayPanel({
  ref, challenge, paused, feedbackState, feedbackPoints, feedbackMessage, isTimeout, shouldReduceMotion
}) {
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
      ref={ref}
      asset={challenge}
      revealed={!paused}
      contextTheme={contextTheme}
      feedbackState={feedbackState}
      feedbackPoints={feedbackPoints}
      feedbackMessage={feedbackMessage}
      isTimeout={isTimeout}
      className="w-full"
      shouldReduceMotion={shouldReduceMotion}
    />
  );
});

AssociationGameplayPanel.propTypes = {
  challenge: PropTypes.object,
  paused: PropTypes.bool,
  feedbackState: PropTypes.oneOf(['idle', 'success', 'error']),
  feedbackPoints: PropTypes.number,
  feedbackMessage: PropTypes.string,
  isTimeout: PropTypes.bool,
  shouldReduceMotion: PropTypes.bool
};

const MemoryGameplayPanel = memo(function MemoryGameplayPanel({
  board, attempts, matchedCount, totalCards,
  feedbackState, feedbackPoints, feedbackMessage, shouldReduceMotion
}) {
  const totalPairs = Math.max(1, Math.ceil(Number(totalCards || 0) / 2));
  const matchedPairs = Math.max(0, Math.floor(Number(matchedCount || 0) / 2));
  const isSuccess = feedbackState === 'success';
  const isError = feedbackState === 'error';

  return (
    <div className="w-full space-y-4 relative">
      {/* Stats bar with reactive feedback */}
      <div className="mx-auto max-w-4xl rounded-xl border border-border-default bg-background-base/40 px-4 py-3 text-sm text-text-secondary flex flex-wrap items-center justify-between gap-3">
        <motion.span
          // TOKEN-EXCEPTION: Framer Motion color interpolation requires direct color values
          animate={isError ? { color: ['#e2e8f0', '#fb7185', '#e2e8f0'] } : {}}
          transition={{ duration: 0.6 }}
        >
          Intentos: <strong>{attempts}</strong>
        </motion.span>
        <motion.span
          // TOKEN-EXCEPTION: Framer Motion color interpolation requires direct color values
          animate={isSuccess ? { color: ['#e2e8f0', '#34d399', '#e2e8f0'] } : {}}
          transition={{ duration: 0.6 }}
        >
          Parejas encontradas: <strong>{matchedPairs}/{totalPairs}</strong>
        </motion.span>
      </div>
      <MemoryBoard
        board={board}
        feedbackState={feedbackState}
        feedbackPoints={feedbackPoints}
        feedbackMessage={feedbackMessage}
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
  );
});

MemoryGameplayPanel.propTypes = {
  board: PropTypes.array,
  attempts: PropTypes.number,
  matchedCount: PropTypes.number,
  totalCards: PropTypes.number,
  feedbackState: PropTypes.oneOf(['idle', 'success', 'error']),
  feedbackPoints: PropTypes.number,
  feedbackMessage: PropTypes.string,
  shouldReduceMotion: PropTypes.bool
};

const CurrentPlayMetrics = memo(function CurrentPlayMetrics({ mode, score, correctAnswers, errors, attempts }) {
  const safeAttempts = Math.max(1, attempts || 0);

  return (
    <div className="mb-1.5 max-w-4xl mx-auto rounded-lg border border-border-default bg-background-base/30 px-3 py-1.5">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <MetricPill label="⭐ Puntos" value={score} />
        <MetricPill label="✅ Aciertos" value={correctAnswers} />
        <MetricPill
          label={mode === 'memory' ? '🧠 Parejas' : '🎯 Intentos'}
          value={mode === 'memory' ? `${correctAnswers}` : `${safeAttempts - errors}/${safeAttempts}`}
        />
      </div>
    </div>
  );
});

CurrentPlayMetrics.propTypes = {
  mode: PropTypes.string,
  score: PropTypes.number,
  correctAnswers: PropTypes.number,
  errors: PropTypes.number,
  attempts: PropTypes.number
};

function MetricPill({ label, value }) {
  return (
    <div className="rounded-md bg-background-elevated/60 border border-border-subtle px-2 py-1">
      <div className="text-[11px] tracking-wide text-text-secondary">{label}</div>
      <div className="text-text-primary text-sm font-semibold">{value}</div>
    </div>
  );
}

MetricPill.propTypes = {
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
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

const GRID_STYLES = {
  3: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
  4: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
  5: { gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }
};

function getMemorySlotClasses(isMatched, isOpen) {
  if (isMatched) {
    return 'border-success-base/70 bg-success-base/20';
  }

  if (isOpen) {
    return 'border-accent-indigo/60 bg-accent-indigo/20';
  }

  return 'border-background-surface bg-background-elevated/60';
}

function MemoryBoard({ board, feedbackState, feedbackPoints, feedbackMessage, shouldReduceMotion }) {
  const safeBoard = Array.isArray(board) ? [...board].sort((a, b) => a.slotIndex - b.slotIndex) : [];
  const total = safeBoard.length;
  const columns = resolveMemoryColumns(total);
  const gridStyle = GRID_STYLES[columns] || GRID_STYLES[3];
  const [prevBoard, setPrevBoard] = useState([]);

  // Detect which slots just changed (newly matched or revealed for feedback)
  const feedbackSlots = new Set();
  if (feedbackState !== 'idle') {
    for (const slot of safeBoard) {
      const prev = prevBoard.find(p => p.slotIndex === slot.slotIndex);
      if (!prev) continue;
      // Newly matched
      if (slot.isMatched && !prev.isMatched) {
        feedbackSlots.add(slot.slotIndex);
      }
      // Newly revealed (for mismatch shake)
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

      {/* Floating badge for match */}
      {isSuccess && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-30">
          <FloatingPointsBadge
            type="success"
            points={feedbackPoints}
            message={feedbackMessage}
            shouldReduceMotion={shouldReduceMotion}
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
                'aspect-square rounded-xl border transition-all memory-card-flip',
                slotClasses,
                isMatchFeedback && 'shadow-[0_0_20px] shadow-success-glow',
                isMismatchFeedback && 'border-error-base/60'
              )}
              animate={
                shouldReduceMotion ? {} :
                isMatchFeedback ? { scale: [1, 1.1, 1], transition: { duration: 0.4 } } :
                isMismatchFeedback ? { x: [-3, 3, -2, 2, 0], transition: { duration: 0.4 } } :
                {}
              }
              role="gridcell"
              aria-label={slotLabel}
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
  shouldReduceMotion: PropTypes.bool
};

function FallbackTouchPanel({ cards, onSelectCard, onPauseRequest, canPause }) {
  const visibleCards = Array.isArray(cards) ? cards.slice(0, 12) : [];

  return (
    <div className="mt-3 w-full max-w-3xl rounded-xl border border-warning-base/30 bg-warning-base/10 p-2.5">
      <div className="flex items-center gap-2 text-warning-base">
        <AlertTriangle size={14} className="shrink-0" />
        <p className="text-xs font-semibold">Sin sensor RFID — toca una carta para responder</p>
      </div>

      {visibleCards.length > 0 && (
        <fieldset
          className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-1.5 border-0 p-0 m-0"
          aria-label="Cartas disponibles para selección táctil"
        >
          {visibleCards.map(card => (
            <motion.button
              key={`fallback-card-${card.uid}`}
              type="button"
              onClick={() => onSelectCard(card)}
              // TOKEN-EXCEPTION: Framer Motion whileTap requires direct color value for interpolation
              whileTap={{ scale: 0.92, backgroundColor: 'rgba(99, 102, 241, 0.2)' }}
              aria-label={`Seleccionar carta: ${card.assignedValue || card.uid}`}
              className="rounded-lg border border-border-default bg-background-base/40 p-1.5 text-center hover:bg-background-base/60 transition-colors focus-visible:ring-2 focus-visible:ring-accent-indigo"
            >
              <CardAssetPreview
                asset={card.displayData || { display: card.assignedValue || card.uid }}
                className="h-14 w-full rounded"
                fit="contain"
                loading="eager"
                fallbackLabel={card.assignedValue || card.uid}
              />
            </motion.button>
          ))}
        </fieldset>
      )}

      {canPause && (
        <button
          type="button"
          onClick={onPauseRequest}
          className="mt-2 text-[10px] px-2 py-1 rounded bg-background-base/60 text-text-secondary border border-border-subtle hover:bg-background-base/80 transition-colors"
        >
          Pausar para revisar sensor
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
