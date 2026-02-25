import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Pause, Play, Volume2, VolumeX } from 'lucide-react';
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

/**
 * Pantalla principal de juego para niños de 4-6 años
 * Diseño colorido, amigable y sin texto complejo
 */
export default function GameSession() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { shouldReduceMotion } = useReducedMotion();
  const pendingTimeoutRef = useRef([]);
  const playIdRef = useRef(null);

  const ROUND_TIME = 15;

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

  const [challenge, setChallenge] = useState(null);
  const roundIndicators = [];
  for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
    roundIndicators.push(roundNumber);
  }

  useEffect(() => {
    playIdRef.current = playId;
  }, [playId]);

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
      const pointsAwarded = Number(payload?.pointsAwarded || 0);
      const isCorrect = Boolean(payload?.isCorrect && !payload?.timeout);

      setFeedback({ type: isCorrect ? 'success' : 'error', points: pointsAwarded });
      setScore(Number.isFinite(payload?.newScore) ? payload.newScore : 0);
      setMascotMood(isCorrect ? 'celebrating' : 'encouraging');
      setIsAwaitingResponse(false);

      if (isCorrect) {
        setCorrectAnswers(prev => prev + 1);
      }

      scheduleFeedbackClear();
    },
    [scheduleFeedbackClear]
  );

  const handleNewRound = useCallback(
    payload => {
      clearPendingTimeouts();
      setFeedback(null);
      setGameState('playing');
      setCurrentRound(Number(payload?.roundNumber || 1));

      const nextTotalRounds = Number(payload?.totalRounds || totalRounds || 5);
      const nextTimeLimit = Number(payload?.timeLimit || roundTime || ROUND_TIME);

      setTotalRounds(nextTotalRounds);
      setRoundTime(nextTimeLimit);
      setTimeLeft(nextTimeLimit);
      setScore(Number.isFinite(payload?.score) ? payload.score : 0);
      setChallenge(normalizeChallenge(payload?.challenge));
      setMascotMood('idle');
      setIsAwaitingResponse(true);
    },
    [clearPendingTimeouts, normalizeChallenge, roundTime, totalRounds]
  );

  const handlePlayPaused = useCallback(payload => {
    const remaining = Number(payload?.remainingTimeMs);
    setGameState('paused');
    setMascotMood('thinking');
    setIsAwaitingResponse(false);

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
    },
    [normalizeChallenge]
  );

  const handlePlayState = useCallback(payload => {
    if (Number.isFinite(payload?.currentRound)) {
      setCurrentRound(payload.currentRound);
    }
    if (Number.isFinite(payload?.score)) {
      setScore(payload.score);
    }
    if (Number.isFinite(payload?.maxRounds)) {
      setTotalRounds(payload.maxRounds);
    }
  }, []);

  const handleGameOver = useCallback(payload => {
    clearPendingTimeouts();
    setIsAwaitingResponse(false);
    setGameState('finished');
    setMascotMood('celebrating');
    if (Number.isFinite(payload?.finalScore)) {
      setScore(payload.finalScore);
    }
  }, [clearPendingTimeouts]);

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
      const knownCodes = new Set([
        'RFID_MODE_INVALID',
        'RFID_SENSOR_UNAUTHORIZED',
        'RFID_SENSOR_MISMATCH',
        'PLAY_NOT_ACTIVE',
        'ROUND_BLOCKED',
        'RFID_SOCKET_NOT_ACTIVE',
        'RFID_MODE_TAKEN_OVER'
      ]);
      if (knownCodes.has(payload?.code)) {
        toast.warning(payload?.message || 'Evento RFID no permitido.');
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

        socketService.on(SOCKET_EVENTS.NEW_ROUND, handleNewRound);
        socketService.on(SOCKET_EVENTS.VALIDATION_RESULT, handleValidationResult);
        socketService.on(SOCKET_EVENTS.GAME_OVER, handleGameOver);
        socketService.on(SOCKET_EVENTS.PLAY_PAUSED, handlePlayPaused);
        socketService.on(SOCKET_EVENTS.PLAY_RESUMED, handlePlayResumed);
        socketService.on(SOCKET_EVENTS.PLAY_STATE, handlePlayState);
        socketService.on(SOCKET_EVENTS.ERROR, onSocketError);

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
      socketService.off(SOCKET_EVENTS.VALIDATION_RESULT, handleValidationResult);
      socketService.off(SOCKET_EVENTS.GAME_OVER, handleGameOver);
      socketService.off(SOCKET_EVENTS.PLAY_PAUSED, handlePlayPaused);
      socketService.off(SOCKET_EVENTS.PLAY_RESUMED, handlePlayResumed);
      socketService.off(SOCKET_EVENTS.PLAY_STATE, handlePlayState);
      socketService.off(SOCKET_EVENTS.ERROR, onSocketError);
      clearPendingTimeouts();
    };
  }, [
    bootstrapPlay,
    clearPendingTimeouts,
    handleGameOver,
    handleNewRound,
    handlePlayPaused,
    handlePlayResumed,
    handlePlayState,
    handleValidationResult,
    sessionId
  ]);

  // Timer effect
  useEffect(() => {
    if (gameState !== 'playing' || !isAwaitingResponse) return;
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, isAwaitingResponse, timeLeft]);

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
  };

  // Toggle pause
  const togglePause = async () => {
    if (!playId) {
      return;
    }

    if (gameState === 'playing') {
      const sent = socketService.sendCommand(SOCKET_EVENTS.PAUSE_PLAY, { playId });
      if (!sent) {
        try {
          await playsAPI.pausePlay(playId);
          setGameState('paused');
          setMascotMood('thinking');
          setIsAwaitingResponse(false);
        } catch (error) {
          toast.error(extractErrorMessage(error));
        }
      }
    } else if (gameState === 'paused') {
      const sent = socketService.sendCommand(SOCKET_EVENTS.RESUME_PLAY, { playId });
      if (!sent) {
        try {
          await playsAPI.resumePlay(playId);
          setGameState('playing');
          setMascotMood('idle');
          setIsAwaitingResponse(true);
        } catch (error) {
          toast.error(extractErrorMessage(error));
        }
      }
    }
  };

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
      setFeedback(null);
      setIsAwaitingResponse(false);

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

  return (
    <div className="game-bg min-h-screen flex flex-col relative overflow-hidden">
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
              aria-label={soundEnabled ? 'Silenciar' : 'Activar sonido'}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>

            {/* Pause button */}
            {gameState === 'playing' || gameState === 'paused' ? (
              <button
                onClick={togglePause}
                className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all"
                aria-label={gameState === 'paused' ? 'Reanudar' : 'Pausar'}
              >
                {gameState === 'paused' ? <Play size={20} /> : <Pause size={20} />}
              </button>
            ) : null}

            {/* RFID status */}
            <div className={cn(
              "p-2 rounded-lg",
              rfidConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
            )}>
              {rfidConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 px-4 sm:px-6">
        <RFIDConnector className="max-w-md" showSensorId={false} />
      </div>

      {/* Timer Bar */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="relative z-10 px-4 sm:px-6 mb-4">
          <TimerBar timeLeft={timeLeft} timeLimit={roundTime} />
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
                  ? `Encuentra la tarjeta correcta de ${session.deck.name}`
                  : 'Encuentra la tarjeta correcta'}
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-2xl flex flex-col items-center"
            >
              {/* Challenge display */}
              <ChallengeDisplay
                asset={challenge}
                revealed={gameState !== 'paused'}
                contextTheme="geography"
                className="w-full"
              />

              {/* Instruction text */}
              <motion.p
                initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
                className="mt-8 text-center text-slate-400 text-lg"
              >
                ¡Busca la tarjeta de <span className="text-white font-bold">{challenge?.value || '---'}</span>!
              </motion.p>

              {!rfidConnected && (
                <p className="mt-8 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 text-sm text-center">
                  Conecta el sensor RFID para responder las rondas en tiempo real.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Paused overlay */}
        <AnimatePresence>
          {gameState === 'paused' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-20"
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="text-center"
              >
                <div className="text-6xl mb-4">⏸️</div>
                <h2 className="text-3xl font-bold text-white mb-4">Juego Pausado</h2>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={togglePause}
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
        <CharacterMascot mood={mascotMood} position="left" />
      </div>

      {/* Round progress dots */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <footer className="relative z-10 p-4 sm:p-6">
          <div className="flex justify-center items-center gap-2">
            {roundIndicators.map(roundNumber => (
              <motion.div
                key={`round-${roundNumber}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: (roundNumber - 1) * 0.05 }}
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
          />
        )}
      </AnimatePresence>

      {/* Game Over Screen */}
      {gameState === 'finished' && (
        <GameOverScreen
          score={score}
          correctAnswers={correctAnswers}
          totalRounds={totalRounds}
          bestScore={0}
          onPlayAgain={playAgain}
          onGoHome={goHome}
        />
      )}
    </div>
  );
}
