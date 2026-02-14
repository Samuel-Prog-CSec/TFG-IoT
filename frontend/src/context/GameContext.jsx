import { createContext, useContext, useReducer, useCallback } from 'react';
import { GAME_STATES, MASCOT_MOODS, GAME_CONFIG } from '../constants/gameConfig';

/**
 * Estado inicial del juego
 */
const initialState = {
  // Estado del juego
  gameState: GAME_STATES.WAITING,
  currentRound: 1,
  totalRounds: GAME_CONFIG.DEFAULT_ROUNDS,
  timeLimit: GAME_CONFIG.DEFAULT_ROUND_TIME,
  
  // Puntuación
  score: 0,
  correctAnswers: 0,
  errors: 0,
  
  // Desafío actual
  challenge: null,
  
  // Feedback
  feedback: null,
  mascotMood: MASCOT_MOODS.IDLE,
  
  // Configuración
  soundEnabled: true,
  
  // RFID
  rfidConnected: false,
};

/**
 * Tipos de acciones
 */
const ACTIONS = {
  START_GAME: 'START_GAME',
  PAUSE_GAME: 'PAUSE_GAME',
  RESUME_GAME: 'RESUME_GAME',
  END_GAME: 'END_GAME',
  NEXT_ROUND: 'NEXT_ROUND',
  SET_CHALLENGE: 'SET_CHALLENGE',
  CORRECT_ANSWER: 'CORRECT_ANSWER',
  WRONG_ANSWER: 'WRONG_ANSWER',
  TIMEOUT: 'TIMEOUT',
  SET_FEEDBACK: 'SET_FEEDBACK',
  CLEAR_FEEDBACK: 'CLEAR_FEEDBACK',
  SET_MASCOT_MOOD: 'SET_MASCOT_MOOD',
  TOGGLE_SOUND: 'TOGGLE_SOUND',
  SET_RFID_STATUS: 'SET_RFID_STATUS',
  RESET_GAME: 'RESET_GAME',
};

/**
 * Reducer del juego
 */
function gameReducer(state, action) {
  switch (action.type) {
    case ACTIONS.START_GAME:
      return {
        ...state,
        gameState: GAME_STATES.PLAYING,
        currentRound: 1,
        score: 0,
        correctAnswers: 0,
        errors: 0,
        mascotMood: MASCOT_MOODS.HAPPY,
        ...action.payload,
      };

    case ACTIONS.PAUSE_GAME:
      return {
        ...state,
        gameState: GAME_STATES.PAUSED,
        mascotMood: MASCOT_MOODS.THINKING,
      };

    case ACTIONS.RESUME_GAME:
      return {
        ...state,
        gameState: GAME_STATES.PLAYING,
        mascotMood: MASCOT_MOODS.IDLE,
      };

    case ACTIONS.END_GAME:
      return {
        ...state,
        gameState: GAME_STATES.FINISHED,
        mascotMood: MASCOT_MOODS.CELEBRATING,
      };

    case ACTIONS.NEXT_ROUND:
      if (state.currentRound >= state.totalRounds) {
        return {
          ...state,
          gameState: GAME_STATES.FINISHED,
          mascotMood: MASCOT_MOODS.CELEBRATING,
        };
      }
      return {
        ...state,
        currentRound: state.currentRound + 1,
        mascotMood: MASCOT_MOODS.IDLE,
      };

    case ACTIONS.SET_CHALLENGE:
      return {
        ...state,
        challenge: action.payload,
      };

    case ACTIONS.CORRECT_ANSWER:
      return {
        ...state,
        score: state.score + (action.payload?.points || GAME_CONFIG.DEFAULT_POINTS_CORRECT),
        correctAnswers: state.correctAnswers + 1,
        mascotMood: MASCOT_MOODS.CELEBRATING,
      };

    case ACTIONS.WRONG_ANSWER:
      return {
        ...state,
        score: Math.max(0, state.score + (action.payload?.points || GAME_CONFIG.DEFAULT_POINTS_ERROR)),
        errors: state.errors + 1,
        mascotMood: MASCOT_MOODS.ENCOURAGING,
      };

    case ACTIONS.TIMEOUT:
      return {
        ...state,
        score: Math.max(0, state.score + GAME_CONFIG.DEFAULT_POINTS_ERROR),
        errors: state.errors + 1,
        mascotMood: MASCOT_MOODS.ENCOURAGING,
      };

    case ACTIONS.SET_FEEDBACK:
      return {
        ...state,
        feedback: action.payload,
      };

    case ACTIONS.CLEAR_FEEDBACK:
      return {
        ...state,
        feedback: null,
      };

    case ACTIONS.SET_MASCOT_MOOD:
      return {
        ...state,
        mascotMood: action.payload,
      };

    case ACTIONS.TOGGLE_SOUND:
      return {
        ...state,
        soundEnabled: !state.soundEnabled,
      };

    case ACTIONS.SET_RFID_STATUS:
      return {
        ...state,
        rfidConnected: action.payload,
      };

    case ACTIONS.RESET_GAME:
      return {
        ...initialState,
        soundEnabled: state.soundEnabled,
        rfidConnected: state.rfidConnected,
      };

    default:
      return state;
  }
}

/**
 * Context
 */
const GameContext = createContext(null);

/**
 * Provider del contexto del juego
 */
export function GameProvider({ children, initialConfig = {} }) {
  const [state, dispatch] = useReducer(gameReducer, {
    ...initialState,
    ...initialConfig,
  });

  // Acciones
  const startGame = useCallback((config = {}) => {
    dispatch({ type: ACTIONS.START_GAME, payload: config });
  }, []);

  const pauseGame = useCallback(() => {
    dispatch({ type: ACTIONS.PAUSE_GAME });
  }, []);

  const resumeGame = useCallback(() => {
    dispatch({ type: ACTIONS.RESUME_GAME });
  }, []);

  const endGame = useCallback(() => {
    dispatch({ type: ACTIONS.END_GAME });
  }, []);

  const nextRound = useCallback(() => {
    dispatch({ type: ACTIONS.NEXT_ROUND });
  }, []);

  const setChallenge = useCallback((challenge) => {
    dispatch({ type: ACTIONS.SET_CHALLENGE, payload: challenge });
  }, []);

  const handleCorrectAnswer = useCallback((points) => {
    dispatch({ type: ACTIONS.CORRECT_ANSWER, payload: { points } });
  }, []);

  const handleWrongAnswer = useCallback((points) => {
    dispatch({ type: ACTIONS.WRONG_ANSWER, payload: { points } });
  }, []);

  const handleTimeout = useCallback(() => {
    dispatch({ type: ACTIONS.TIMEOUT });
  }, []);

  const setFeedback = useCallback((feedback) => {
    dispatch({ type: ACTIONS.SET_FEEDBACK, payload: feedback });
  }, []);

  const clearFeedback = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_FEEDBACK });
  }, []);

  const setMascotMood = useCallback((mood) => {
    dispatch({ type: ACTIONS.SET_MASCOT_MOOD, payload: mood });
  }, []);

  const toggleSound = useCallback(() => {
    dispatch({ type: ACTIONS.TOGGLE_SOUND });
  }, []);

  const setRfidStatus = useCallback((connected) => {
    dispatch({ type: ACTIONS.SET_RFID_STATUS, payload: connected });
  }, []);

  const resetGame = useCallback(() => {
    dispatch({ type: ACTIONS.RESET_GAME });
  }, []);

  const value = {
    // Estado
    ...state,
    
    // Computed
    isPlaying: state.gameState === GAME_STATES.PLAYING,
    isPaused: state.gameState === GAME_STATES.PAUSED,
    isFinished: state.gameState === GAME_STATES.FINISHED,
    isWaiting: state.gameState === GAME_STATES.WAITING,
    percentage: state.totalRounds > 0 
      ? (state.correctAnswers / state.totalRounds) * 100 
      : 0,
    
    // Acciones
    startGame,
    pauseGame,
    resumeGame,
    endGame,
    nextRound,
    setChallenge,
    handleCorrectAnswer,
    handleWrongAnswer,
    handleTimeout,
    setFeedback,
    clearFeedback,
    setMascotMood,
    toggleSound,
    setRfidStatus,
    resetGame,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}

/**
 * Hook para usar el contexto del juego
 */
export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

export default GameContext;
