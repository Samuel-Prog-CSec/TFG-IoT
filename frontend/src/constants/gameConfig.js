/**
 * Configuración del juego
 * Centraliza todas las constantes relacionadas con la mecánica de juego
 */

export const GAME_CONFIG = {
  // Tiempo
  DEFAULT_ROUND_TIME: 15, // segundos
  MIN_ROUND_TIME: 3,
  MAX_ROUND_TIME: 60,

  // Rondas
  DEFAULT_ROUNDS: 5,
  MIN_ROUNDS: 1,
  MAX_ROUNDS: 20,

  // Puntuación
  DEFAULT_POINTS_CORRECT: 10,
  DEFAULT_POINTS_ERROR: -2,
  MIN_POINTS: 0,
  MAX_POINTS: 100,

  // Tarjetas
  MIN_CARDS: 2,
  MAX_CARDS: 20,
  DEFAULT_CARDS: 4,

  // Timer thresholds (porcentaje)
  TIMER_WARNING_THRESHOLD: 40, // Amarillo
  TIMER_CRITICAL_THRESHOLD: 20, // Rojo
};

/**
 * Configuración de dificultad
 */
export const DIFFICULTY_CONFIG = {
  easy: {
    label: 'Fácil',
    roundTime: 20,
    rounds: 3,
    cards: 4,
  },
  medium: {
    label: 'Medio',
    roundTime: 15,
    rounds: 5,
    cards: 6,
  },
  hard: {
    label: 'Difícil',
    roundTime: 10,
    rounds: 7,
    cards: 8,
  },
};

/**
 * Estados del juego
 */
export const GAME_STATES = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  PAUSED: 'paused',
  FINISHED: 'finished',
};

/**
 * Tipos de feedback
 */
export const FEEDBACK_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  TIMEOUT: 'timeout',
};

/**
 * Estados de ánimo de la mascota
 */
export const MASCOT_MOODS = {
  IDLE: 'idle',
  HAPPY: 'happy',
  ENCOURAGING: 'encouraging',
  CELEBRATING: 'celebrating',
  THINKING: 'thinking',
  SAD: 'sad',
};

/**
 * Calcula estrellas basado en porcentaje
 * @param {number} percentage - Porcentaje de aciertos (0-100)
 * @returns {number} Número de estrellas (0-3)
 */
export function calculateStars(percentage) {
  if (percentage >= 90) return 3;
  if (percentage >= 70) return 2;
  if (percentage >= 50) return 1;
  return 0;
}

/**
 * Obtiene color según el valor y umbrales
 * @param {number} value - Valor actual
 * @param {number} total - Valor total
 * @param {Object} thresholds - { warning: number, critical: number }
 * @returns {'success' | 'warning' | 'critical'}
 */
export function getColorByThreshold(value, total, thresholds = {}) {
  const { 
    warning = GAME_CONFIG.TIMER_WARNING_THRESHOLD, 
    critical = GAME_CONFIG.TIMER_CRITICAL_THRESHOLD 
  } = thresholds;
  
  const percentage = (value / total) * 100;
  
  if (percentage <= critical) return 'critical';
  if (percentage <= warning) return 'warning';
  return 'success';
}
