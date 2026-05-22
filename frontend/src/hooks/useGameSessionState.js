/**
 * @fileoverview Estado coordinado del juego de GameSession.
 *
 * Extraído de `pages/GameSession.jsx` en Sprint 0 pre-v1.0.0 (C2 parcial) para:
 *  - Aislar el reducer del JSX (testeable como unidad pura).
 *  - Reducir el tamaño de GameSession.jsx (eslint-disable cyclomatic-complexity).
 *  - Documentar el contrato de transiciones de estado en un único sitio.
 *
 * Decisión: NO se envuelve en React Context. El estado se consume solo
 * dentro de `GameSession.jsx`; un Provider añadiría overhead sin beneficio
 * de reuso. Si en el futuro componentes hermanos necesitan acceder al
 * estado, se promueve a Context aquí mismo sin cambiar la API del hook.
 *
 * @module hooks/useGameSessionState
 */

import { useReducer, useRef } from 'react';

/**
 * Estado inicial del juego. Campos coordinados que deben transicionar
 * atómicamente — por eso van en el mismo reducer y no en useState
 * separados (evita desincronización entre socket events y timers).
 */
export const INITIAL_GAME_STATE = Object.freeze({
  gameState: 'waiting', // 'waiting' | 'playing' | 'paused' | 'finished'
  currentRound: 1,
  score: 0,
  correctAnswers: 0,
  isAwaitingResponse: false
});

/**
 * Reducer para estado coordinado del juego.
 * Garantiza transiciones atómicas entre estados y evita desincronización
 * cuando eventos de socket y timeouts llegan simultáneamente.
 *
 * @param {typeof INITIAL_GAME_STATE} state
 * @param {Object} action
 * @returns {typeof INITIAL_GAME_STATE}
 */
export function gameReducer(state, action) {
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
        isAwaitingResponse: false
      };
    case 'ANSWER_INCORRECT':
      return {
        ...state,
        score: action.score,
        isAwaitingResponse: false
      };
    case 'NEW_ROUND':
      return {
        ...state,
        gameState: 'playing',
        currentRound: action.round,
        score: action.score,
        isAwaitingResponse: true
      };
    case 'PAUSE':
      return { ...state, gameState: 'paused', isAwaitingResponse: false };
    case 'RESUME':
      return { ...state, gameState: 'playing', isAwaitingResponse: true };
    case 'FINISH':
      return { ...state, gameState: 'finished', isAwaitingResponse: false, score: action.score };
    case 'PLAY_STATE_SYNC': {
      // Sincronización parcial desde el servidor: solo actualiza campos presentes.
      const next = { ...state };
      if (action.gameState !== undefined) next.gameState = action.gameState;
      if (action.currentRound !== undefined) next.currentRound = action.currentRound;
      if (action.score !== undefined) next.score = action.score;
      if (action.isAwaitingResponse !== undefined) {
        next.isAwaitingResponse = action.isAwaitingResponse;
      }
      return next;
    }
    case 'RESET':
      return { ...INITIAL_GAME_STATE };
    default:
      return state;
  }
}

/**
 * Hook que expone el estado coordinado del juego.
 *
 * Devuelve:
 *  - `game`: el estado completo (objeto).
 *  - `dispatch`: dispatch del reducer (acciones documentadas en `gameReducer`).
 *  - `gameStateRef`: ref espejo del campo `gameState`, útil para cerrar sobre
 *    el valor más reciente desde callbacks de socket sin re-suscribirse.
 *
 * @returns {{
 *   game: typeof INITIAL_GAME_STATE,
 *   dispatch: import('react').Dispatch<Object>,
 *   gameStateRef: import('react').MutableRefObject<string>
 * }}
 */
export function useGameSessionState() {
  const [game, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const gameStateRef = useRef(game.gameState);
  // Mantener ref espejada del último gameState para closures de socket.
  // Se actualiza en cada render — no necesita useEffect porque la lectura
  // siempre es post-render.
  gameStateRef.current = game.gameState;

  return { game, dispatch, gameStateRef };
}
