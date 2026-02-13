import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { cn } from '../lib/utils';
import RFIDConnector from '../components/ui/RFIDConnector';
import webSerialService from '../services/webSerialService';
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
  // Game configuration
  const ROUND_TIME = 15; // segundos por ronda
  const TOTAL_ROUNDS = 5;
  const POINTS_CORRECT = 10;
  const POINTS_ERROR = -2;

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

  // Mock challenge data - will come from backend
  const [challenge, setChallenge] = useState({
    display: '🇪🇸',
    value: 'España',
    audioUrl: null,
    imageUrl: null,
  });

  // Assets pool for demo
  const assetsPool = useMemo(() => [
    { display: '🇪🇸', value: 'España' },
    { display: '🇫🇷', value: 'Francia' },
    { display: '🇮🇹', value: 'Italia' },
    { display: '🇩🇪', value: 'Alemania' },
    { display: '🇬🇧', value: 'Reino Unido' },
    { display: '🇵🇹', value: 'Portugal' },
    { display: '🇯🇵', value: 'Japón' },
    { display: '🇧🇷', value: 'Brasil' },
  ], []);

  // Advance to next round or finish game
  const advanceRound = useCallback(() => {
    if (currentRound >= TOTAL_ROUNDS) {
      setGameState('finished');
      setMascotMood('celebrating');
    } else {
      setCurrentRound(r => r + 1);
      setTimeLeft(ROUND_TIME);
      // Pick random challenge
      const randomAsset = assetsPool[Math.floor(Math.random() * assetsPool.length)];
      setChallenge(randomAsset);
      setMascotMood('idle');
    }
  }, [currentRound, TOTAL_ROUNDS, assetsPool]);

  // Handle timeout (no response in time)
  const handleTimeout = useCallback(() => {
    setFeedback({ type: 'error', points: POINTS_ERROR });
    setScore(s => Math.max(0, s + POINTS_ERROR));
    setMascotMood('encouraging');

    setTimeout(() => {
      setFeedback(null);
      advanceRound();
    }, 1500);
  }, [advanceRound, POINTS_ERROR]);

  // Timer effect
  useEffect(() => {
    if (gameState !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleTimeout();
          return ROUND_TIME;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, currentRound, handleTimeout]);

  // Simulacion de escaneo para fallback local
  const handleSimulatedScan = useCallback(() => {
    if (gameState !== 'playing') return;

    // Simulate random success/fail (70% success rate for demo)
    const isCorrect = Math.random() > 0.3;

    if (isCorrect) {
      setFeedback({ type: 'success', points: POINTS_CORRECT });
      setScore(s => s + POINTS_CORRECT);
      setCorrectAnswers(c => c + 1);
      setMascotMood('celebrating');
    } else {
      setFeedback({ type: 'error', points: POINTS_ERROR });
      setScore(s => Math.max(0, s + POINTS_ERROR));
      setMascotMood('encouraging');
    }

    setTimeout(() => {
      setFeedback(null);
      advanceRound();
    }, 1500);
  }, [gameState, POINTS_CORRECT, POINTS_ERROR, advanceRound]);

  useEffect(() => {
    const handleStatus = (payload) => {
      const nextStatus = payload?.status;
      setRfidConnected(nextStatus === 'connected' || nextStatus === 'reading');
    };

    const handleScan = () => {
      handleSimulatedScan();
    };

    webSerialService.on('status', handleStatus);
    webSerialService.on('scan', handleScan);

    return () => {
      webSerialService.off('status', handleStatus);
      webSerialService.off('scan', handleScan);
    };
  }, [handleSimulatedScan]);

  // Start game
  const startGame = () => {
    setGameState('playing');
    setCurrentRound(1);
    setScore(0);
    setCorrectAnswers(0);
    setTimeLeft(ROUND_TIME);
    setMascotMood('happy');
    const randomAsset = assetsPool[Math.floor(Math.random() * assetsPool.length)];
    setChallenge(randomAsset);
  };

  // Toggle pause
  const togglePause = () => {
    if (gameState === 'playing') {
      setGameState('paused');
      setMascotMood('thinking');
    } else if (gameState === 'paused') {
      setGameState('playing');
      setMascotMood('idle');
    }
  };

  // Play again
  const playAgain = () => {
    startGame();
  };

  // Go home
  const goHome = () => {
    // Will navigate to dashboard
    globalThis.location.href = '/';
  };

  return (
    <div className="game-bg min-h-screen flex flex-col relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-purple-500/10 rounded-full blur-[100px] animate-float" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-[100px] animate-float" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-pink-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Top HUD */}
      <header className="relative z-10 p-4 sm:p-6">
        <div className="glass rounded-2xl p-4 flex items-center justify-between gap-4">
          {/* Round indicator */}
          <div className="flex items-center gap-3">
            <motion.div
              key={currentRound}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30"
            >
              <span className="text-2xl font-bold text-white">{currentRound}</span>
            </motion.div>
            <div className="hidden sm:block">
              <div className="text-xs text-slate-500 uppercase tracking-wider">Ronda</div>
              <div className="text-sm text-white font-medium">{currentRound} de {TOTAL_ROUNDS}</div>
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
          <TimerBar timeLeft={timeLeft} timeLimit={ROUND_TIME} />
        </div>
      )}

      {/* Main Game Area */}
      <main className="flex-1 relative z-10 flex items-center justify-center p-4 sm:p-8">
        <AnimatePresence mode="wait">
          {/* Waiting screen */}
          {gameState === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-8xl mb-6"
              >
                🎮
              </motion.div>
              <h1 className="text-4xl sm:text-5xl font-bold font-display gradient-text-brand mb-4">
                ¡Hora de Jugar!
              </h1>
              <p className="text-slate-400 mb-8 text-lg">
                Encuentra la tarjeta correcta
              </p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={startGame}
                className="btn-game text-2xl px-12 py-5"
              >
                <Play size={28} />
                EMPEZAR
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
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-8 text-center text-slate-400 text-lg"
              >
                ¡Busca la tarjeta de <span className="text-white font-bold">{challenge.value}</span>!
              </motion.p>

              {!rfidConnected && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  onClick={handleSimulatedScan}
                  className="mt-8 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 text-sm hover:bg-white/10 transition-all"
                >
                  Simular escaneo RFID
                </motion.button>
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
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
              <motion.div
                key={`round-${i}`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={cn(
                  "w-3 h-3 rounded-full transition-all duration-300",
                  i < currentRound - 1 && "bg-emerald-500 shadow-lg shadow-emerald-500/50",
                  i === currentRound - 1 && "bg-purple-500 shadow-lg shadow-purple-500/50 scale-125",
                  i > currentRound - 1 && "bg-slate-700"
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
          totalRounds={TOTAL_ROUNDS}
          bestScore={0}
          onPlayAgain={playAgain}
          onGoHome={goHome}
        />
      )}
    </div>
  );
}
