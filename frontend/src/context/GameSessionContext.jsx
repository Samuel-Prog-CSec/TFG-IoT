/**
 * @fileoverview Contexto de sesión de juego para compartir estado con componentes hijos
 * Proporciona estado de la partida activa (puntuación, rondas, tiempo, feedback, mascota)
 * a componentes profundamente anidados, eliminando la necesidad de prop drilling.
 *
 * @module context/GameSessionContext
 */

import { createContext, useContext, useMemo } from 'react';
import PropTypes from 'prop-types';

// ============================================
// CONTEXTO
// ============================================

const GameSessionContext = createContext(null);

/**
 * Hook para usar el contexto de sesión de juego
 * @returns {Object} Estado de la sesión de juego
 */
// eslint-disable-next-line react-refresh/only-export-components -- standard context+hook pattern
export function useGameSession() {
  const context = useContext(GameSessionContext);
  if (!context) {
    throw new Error('useGameSession debe usarse dentro de un GameSessionProvider');
  }
  return context;
}

// ============================================
// PROVIDER
// ============================================

/**
 * Proveedor de contexto de sesión de juego
 *
 * Centraliza el estado de la partida activa para que los componentes hijos
 * (ChallengeDisplay, TimerBar, ScoreDisplay, GameOverScreen, CharacterMascot, etc.)
 * puedan consumirlo sin necesidad de pasar props manualmente.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Componentes hijos
 * @param {number} props.score - Puntuación actual del jugador
 * @param {number} props.currentRound - Ronda actual (1-based)
 * @param {number} props.totalRounds - Número total de rondas de la partida
 * @param {number} props.timeLeft - Tiempo restante en la ronda actual (ms o s según implementación)
 * @param {number} props.roundTime - Duración total configurada por ronda
 * @param {string} props.gameState - Estado actual del juego: 'loading'|'playing'|'paused'|'finished'
 * @param {Object|null} props.challenge - Desafío actual a resolver (null si no hay)
 * @param {boolean} props.isAwaitingResponse - Si se está esperando respuesta del servidor
 * @param {string} props.feedbackState - Estado del feedback visual: 'idle'|'success'|'error'
 * @param {number} props.feedbackPoints - Puntos otorgados/restados en la última respuesta
 * @param {string} props.feedbackMessage - Mensaje de feedback para el jugador
 * @param {boolean} props.feedbackIsTimeout - Si el feedback actual es por timeout de ronda
 * @param {string} props.mascotMood - Estado de ánimo de la mascota (afecta su animación)
 * @param {string} props.mascotMessage - Mensaje que muestra la mascota al jugador
 */
export function GameSessionProvider({
  children,
  score,
  currentRound,
  totalRounds,
  timeLeft,
  roundTime,
  gameState,
  challenge,
  isAwaitingResponse,
  feedbackState,
  feedbackPoints,
  feedbackMessage,
  feedbackIsTimeout,
  mascotMood,
  mascotMessage,
}) {
  // Valor memoizado para evitar re-renders innecesarios en consumidores
  const value = useMemo(() => ({
    // Estado de la partida
    score,
    currentRound,
    totalRounds,
    timeLeft,
    roundTime,
    gameState,

    // Desafío actual
    challenge,
    isAwaitingResponse,

    // Feedback visual
    feedbackState,
    feedbackPoints,
    feedbackMessage,
    feedbackIsTimeout,

    // Mascota
    mascotMood,
    mascotMessage,
  }), [
    score,
    currentRound,
    totalRounds,
    timeLeft,
    roundTime,
    gameState,
    challenge,
    isAwaitingResponse,
    feedbackState,
    feedbackPoints,
    feedbackMessage,
    feedbackIsTimeout,
    mascotMood,
    mascotMessage,
  ]);

  return (
    <GameSessionContext.Provider value={value}>
      {children}
    </GameSessionContext.Provider>
  );
}

GameSessionProvider.propTypes = {
  children: PropTypes.node.isRequired,
  score: PropTypes.number.isRequired,
  currentRound: PropTypes.number.isRequired,
  totalRounds: PropTypes.number.isRequired,
  timeLeft: PropTypes.number.isRequired,
  roundTime: PropTypes.number.isRequired,
  gameState: PropTypes.oneOf(['loading', 'waiting', 'playing', 'paused', 'finished']).isRequired,
  challenge: PropTypes.object,
  isAwaitingResponse: PropTypes.bool.isRequired,
  feedbackState: PropTypes.oneOf(['idle', 'success', 'error']).isRequired,
  feedbackPoints: PropTypes.number.isRequired,
  feedbackMessage: PropTypes.string.isRequired,
  feedbackIsTimeout: PropTypes.bool.isRequired,
  mascotMood: PropTypes.string.isRequired,
  mascotMessage: PropTypes.string.isRequired,
};

GameSessionProvider.defaultProps = {
  challenge: null,
};

export default GameSessionContext;
