/**
 * @fileoverview Hook que decide la reacción de la mascota a partir del
 * último evento del juego (ADR-D, sesión 04/05/2026).
 *
 * Mientras que `CharacterMascot` se centra en cómo *renderizar* el mood,
 * este hook decide cuándo cambiar de mood y qué frase mostrar a partir
 * de los eventos reales del juego (`correctAnswer`, `errorAnswer`,
 * `timeout`, `streakReached`, `roundStart`, `gameOver`).
 *
 * Reglas de diseño:
 *   - Cooldown 1.2s entre cambios para evitar epilepsia visual cuando
 *     el alumno encadena scans rápidos.
 *   - Una racha >= STREAK_THRESHOLD eleva el mood de un acierto normal
 *     (`happy`) a `celebrating` con frases de la categoría
 *     `streakReached`.
 *   - Tras INACTIVITY_MS sin eventos, vuelve a `idle` para no quedarse
 *     "sad" o "celebrating" eternamente.
 *   - Pure function-friendly: la fuente de aleatoriedad se puede
 *     inyectar con `seedRef` para test snapshots reproducibles.
 *
 * @module hooks/useMascotReactions
 */

import { useEffect, useRef, useState } from 'react';
import { pickMascotMessage } from '../lib/mascotDialog';

const DEFAULT_COOLDOWN_MS = 1200;
const DEFAULT_INACTIVITY_MS = 7000;
const STREAK_THRESHOLD = 3;

const EVENT_TO_MOOD = Object.freeze({
  correctAnswer: 'happy',
  errorAnswer: 'encouraging',
  timeout: 'sad',
  streakReached: 'celebrating',
  roundStart: 'thinking',
  gameOver: 'celebrating'
});

/**
 * @param {Object} params
 * @param {string} params.mechanicType - 'memory' | 'association' | 'sequence'.
 * @param {Object|null} params.lastEvent - El evento más reciente del juego.
 * @param {string} params.lastEvent.type - p.ej. 'correctAnswer', 'timeout'.
 * @param {string|number} [params.lastEvent.id] - Identificador único del
 *   evento; permite que dos eventos del mismo `type` se procesen como
 *   distintos (ADR-D). En GameSession bastará con `Date.now()` o el id de
 *   la ronda.
 * @param {number} [params.streak=0]   - Racha de aciertos actual.
 * @param {string|null} [params.gameOverTier=null] - 'high'|'mid'|'low' al
 *   terminar la partida.
 * @param {Object} [options]
 * @param {number} [options.cooldownMs=1200]
 * @param {number} [options.inactivityMs=7000]
 * @param {number} [options.streakThreshold=3]
 * @param {() => number} [options.now=Date.now] - Inyectable para tests.
 * @returns {{ mood: string, message: string|null }}
 */
export function useMascotReactions(
  { mechanicType, lastEvent, streak = 0, gameOverTier = null } = {},
  {
    cooldownMs = DEFAULT_COOLDOWN_MS,
    inactivityMs = DEFAULT_INACTIVITY_MS,
    streakThreshold = STREAK_THRESHOLD,
    now = Date.now
  } = {}
) {
  const [reaction, setReaction] = useState({ mood: 'idle', message: null });
  const lastUpdateAtRef = useRef(0);
  const lastEventKeyRef = useRef(null);

  useEffect(() => {
    if (!lastEvent || !lastEvent.type) {
      return undefined;
    }

    const key = `${lastEvent.type}:${lastEvent.id ?? ''}`;
    if (key === lastEventKeyRef.current) {
      // Mismo evento (re-render sin nuevo input): no actuamos.
      return undefined;
    }

    const currentTime = now();
    // El primer evento siempre se procesa: `lastUpdateAtRef.current === 0`
    // representa "nunca hubo evento anterior". Sin esta excepción, una
    // partida que arranca con `now()` < cooldownMs no actualizaría la
    // mascota hasta el segundo evento (bug detectado en QA del hook).
    if (
      lastUpdateAtRef.current !== 0 &&
      currentTime - lastUpdateAtRef.current < cooldownMs
    ) {
      // Dentro de cooldown: ignoramos para no saturar la mascota.
      return undefined;
    }

    lastEventKeyRef.current = key;
    lastUpdateAtRef.current = currentTime;

    // Promoción a streakReached cuando la racha supera el umbral. Esto
    // evita tener que añadir "streak" como evento explícito en el caller
    // — el hook lo deriva del propio acierto.
    let resolvedEvent = lastEvent.type;
    if (resolvedEvent === 'correctAnswer' && streak >= streakThreshold) {
      resolvedEvent = 'streakReached';
    }

    const mood = EVENT_TO_MOOD[resolvedEvent] || 'idle';
    const message = pickMascotMessage(mechanicType, resolvedEvent, gameOverTier);

    setReaction({ mood, message });

    // Programa la vuelta a idle si no llegan más eventos en
    // `inactivityMs`. Cancelable cuando llega un nuevo evento.
    const timeoutId = setTimeout(() => {
      // Solo volvemos a idle si ese mismo evento sigue siendo el último.
      // Si llegó otro entre tanto, su efecto ya repuso un mood nuevo y
      // este timer está cancelado por React (cleanup en el siguiente
      // useEffect run).
      setReaction(prev =>
        prev.mood === mood && prev.message === message ? { mood: 'idle', message: null } : prev
      );
    }, inactivityMs);

    return () => clearTimeout(timeoutId);
  }, [
    lastEvent,
    streak,
    mechanicType,
    gameOverTier,
    cooldownMs,
    inactivityMs,
    streakThreshold,
    now
  ]);

  return reaction;
}

export default useMascotReactions;
