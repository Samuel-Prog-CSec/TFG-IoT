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
