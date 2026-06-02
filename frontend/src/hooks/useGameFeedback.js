/**
 * @fileoverview Hook central para feedback de gameplay.
 * Gestiona estado de feedback, tracking de rachas, selección de mensajes
 * contextuales y disparo de confetti.
 *
 * @module hooks/useGameFeedback
 */

import { useState, useCallback, useRef } from 'react';
import { selectFeedbackMessage } from '../lib/feedbackMessages';
import { pickMascotMessage } from '../lib/mascotDialog';
import { getMechanicTheme } from '../lib/mechanicTheme';
import { useConfetti } from './useConfetti';

const MASCOT_STREAK_THRESHOLD = 3;
// T-953 Fase 2.7 — micro-celebración cada N aciertos consecutivos.
// Sin reset de mood ni de streak, solo un burst de confetti tintado
// con el color de la mecánica activa para reforzar el progreso. Se
// dispara en streak múltiplo de este número y NO en streak=0.
const MICRO_CELEBRATION_EVERY = 5;
// T-953 Fase 2.5 — umbral para mood `worried`: tras 5+ errores totales
// sin acierto suficiente, la mascota se preocupa.
const WORRIED_TOTAL_ERRORS = 5;
// Cooldown del mood `worried`: si la mascota ya está preocupada, no
// volver a disparar la burbuja nueva durante este intervalo (sería
// agobiar al alumno con repeticiones).
const WORRIED_COOLDOWN_MS = 8000;

/**
 * @param {Object} options
 * @param {boolean} options.isMemoryMode
 * @param {boolean} options.shouldReduceMotion
 * @param {string}  [options.mechanicType] - 'memory' | 'association' | 'sequence'
 *   (ADR-D). Si se proporciona, la mascota usa frases del diccionario por
 *   mecánica de `mascotDialog.js`; si no, mantiene el mensaje genérico
 *   producido por `selectFeedbackMessage` (compat. con tests previos).
 */
export function useGameFeedback({
  isMemoryMode = false,
  shouldReduceMotion = false,
  mechanicType = null
} = {}) {
  const [feedbackState, setFeedbackState] = useState('idle');
  const [feedbackPoints, setFeedbackPoints] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isTimeout, setIsTimeout] = useState(false);
  const [mascotMood, setMascotMood] = useState('idle');
  const [mascotMessage, setMascotMessage] = useState('');
  const [streak, setStreak] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);

  const { fireFromElement, fireBurst } = useConfetti();
  const recentMessagesRef = useRef(new Set());
  const challengeRef = useRef(null);
  const streakRef = useRef(0);
  const totalErrorsRef = useRef(0);
  const lastWorriedAtRef = useRef(0);

  // T-953 Fase 4 (QA fix): el `mechanicType` que llega por closure puede
  // estar stale en consumers que registran callbacks de socket cuando la
  // sesión carga (GameSession monta con default `'association'` y cambia
  // a `'sequence'`/`'memory'` cuando llega el `session_state` del
  // backend). Si los listeners socket capturan `processValidationResult`
  // antes del cambio, siguen usando ese mechanicType en cada llamada.
  // Mirror via ref → leemos siempre el valor más reciente al ejecutar.
  const mechanicTypeRef = useRef(mechanicType);
  mechanicTypeRef.current = mechanicType;

  /**
   * Process a validation result from the server.
   * @param {Object} payload - Socket payload { isCorrect, timeout, pointsAwarded, newScore, feedbackDelayMs }
   * @param {Object} gameContext - { currentRound, totalRounds, timeLeft, timeLimit, matchedCount, totalCards, attempts }
   * @returns {{ isCorrect: boolean, points: number, message: string }}
   */
  // eslint-disable-next-line sonarjs/cyclomatic-complexity -- evaluación de feedback (acierto/fallo/timeout/streak) por mecánica; refactor diferido por riesgo en gameplay
  const processValidationResult = useCallback((payload, gameContext = {}) => {
    const isCorrect = Boolean(payload?.isCorrect && !payload?.timeout);
    const points = Number(payload?.pointsAwarded || 0);
    const isTimeoutResult = Boolean(payload?.timeout);
    const previousStreak = streakRef.current;

    // Update streak
    if (isCorrect) {
      streakRef.current += 1;
      setStreak(streakRef.current);
    } else {
      streakRef.current = 0;
      setStreak(0);
      totalErrorsRef.current += 1;
      setTotalErrors(totalErrorsRef.current);
    }

    // Select contextual message
    const message = selectFeedbackMessage({
      isCorrect,
      isTimeout: Boolean(payload?.timeout),
      streak: streakRef.current,
      previousStreak,
      totalErrors: totalErrorsRef.current,
      isMemoryMode,
      recentMessages: recentMessagesRef.current,
      ...gameContext,
    });

    // Update recent messages buffer (keep last 3)
    recentMessagesRef.current.add(message);
    if (recentMessagesRef.current.size > 3) {
      const first = recentMessagesRef.current.values().next().value;
      recentMessagesRef.current.delete(first);
    }

    setFeedbackState(isCorrect ? 'success' : 'error');
    setFeedbackPoints(points);
    setFeedbackMessage(message);
    setIsTimeout(isTimeoutResult);

    // ADR-D + T-953 Fase 2.5: mood + frase de la mascota se calculan
    // a partir del diccionario por mecánica con cinco grados de
    // expresividad escalonados:
    //   - `surprised`: la racha (>=3) se rompió de golpe — frase `streakBroken`.
    //   - `worried`:   5+ errores totales y la racha sigue rota — `worriedRebound`.
    //   - `celebrating`: racha actual >=3 → frase `streakReached`.
    //   - `happy`:      acierto normal → frase `correctAnswer`.
    //   - `sad`:        timeout → frase `timeout`.
    //   - `encouraging`: error puntual → frase `errorAnswer`.
    // Si `mechanicType` no está definido (caller histórico), conservamos
    // el comportamiento previo: 'celebrating'/'encouraging' + el mensaje
    // de `selectFeedbackMessage`.
    let nextMood;
    let nextMessage = message;
    if (isTimeoutResult) {
      nextMood = mechanicTypeRef.current ? 'sad' : 'encouraging';
      if (mechanicTypeRef.current) {
        nextMessage = pickMascotMessage(mechanicTypeRef.current, 'timeout') || message;
      }
    } else if (isCorrect) {
      const reachedStreak = streakRef.current >= MASCOT_STREAK_THRESHOLD;
      nextMood = !reachedStreak && mechanicTypeRef.current ? 'happy' : 'celebrating';
      if (mechanicTypeRef.current) {
        nextMessage =
          pickMascotMessage(mechanicTypeRef.current, reachedStreak ? 'streakReached' : 'correctAnswer') ||
          message;
      }
    } else {
      // Decisiones de error: orden de precedencia
      //   1) racha rota explícitamente (el alumno venía bien) → surprised
      //   2) sostenido en errores (5+) y racha 0 → worried (con cooldown)
      //   3) error puntual → encouraging
      const streakWasHigh = previousStreak >= MASCOT_STREAK_THRESHOLD;
      const accumulatingErrors =
        totalErrorsRef.current >= WORRIED_TOTAL_ERRORS && streakRef.current === 0;
      const now = Date.now();
      const worriedCooldownPassed = now - lastWorriedAtRef.current > WORRIED_COOLDOWN_MS;

      if (streakWasHigh && mechanicType) {
        nextMood = 'surprised';
        nextMessage = pickMascotMessage(mechanicTypeRef.current, 'streakBroken') || message;
      } else if (accumulatingErrors && mechanicType && worriedCooldownPassed) {
        nextMood = 'worried';
        nextMessage = pickMascotMessage(mechanicTypeRef.current, 'worriedRebound') || message;
        lastWorriedAtRef.current = now;
      } else {
        nextMood = 'encouraging';
        if (mechanicTypeRef.current) {
          nextMessage = pickMascotMessage(mechanicTypeRef.current, 'errorAnswer') || message;
        }
      }
    }
    setMascotMood(nextMood);
    setMascotMessage(nextMessage);

    // Fire canvas-confetti for association success
    if (isCorrect && !isMemoryMode && !shouldReduceMotion && challengeRef.current) {
      fireFromElement(challengeRef.current, {
        ticks: 80,
        scalar: 0.9,
        shapes: ['circle', 'square'],
      });
    }

    // T-953 Fase 2.7 — micro-celebración tintada con el accent de la
    // mecánica cada N aciertos consecutivos. Sin cambiar mood ni
    // resetear streak: es un "bonus" visual, no un evento principal.
    // Se omite si streak es exactamente igual a la racha que dispara
    // `celebrating` (no duplicar con el confetti grande del streak).
    if (
      isCorrect &&
      !shouldReduceMotion &&
      mechanicTypeRef.current &&
      streakRef.current > 0 &&
      streakRef.current % MICRO_CELEBRATION_EVERY === 0 &&
      streakRef.current !== MASCOT_STREAK_THRESHOLD
    ) {
      const themeColor = getMechanicTheme(mechanicTypeRef.current).accentHexFallback;
      fireBurst({
        particleCount: 18,
        spread: 60,
        colors: themeColor ? [themeColor] : undefined,
      });
    }

    return { isCorrect, points, message };
    // QA 2026-05-06: añadido `mechanicType` a deps. Sin él, el closure
    // capturaba el valor del PRIMER render (típicamente 'association' por
    // default) y la mascota usaba el diccionario equivocado durante toda
    // la partida — síntoma observado: "Otra es" (Asociación) saliendo en
    // partidas de Secuencia.
    // T-953 Fase 4 (QA fix 2026-05-09): incluso con `mechanicType` en deps
    // el bug reaparecía cuando los listeners de socket capturaban una
    // versión vieja de `processValidationResult` (registrados antes del
    // primer `setMechanicMode('sequence')`). Solución: leer el valor más
    // reciente vía `mechanicTypeRef.current` dentro del callback. Así el
    // callback puede mantenerse estable entre cambios de mecánica y los
    // listeners no necesitan re-registrarse.
    // T-953 Fase 2.7: añadido `fireBurst` para micro-celebraciones cada 5
    // aciertos consecutivos.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mechanicType se lee vía mechanicTypeRef.current a propósito para mantener el callback estable y no re-registrar listeners (ver comentario arriba)
  }, [isMemoryMode, shouldReduceMotion, fireFromElement, fireBurst]);

  const clearFeedback = useCallback(() => {
    setFeedbackState('idle');
    setFeedbackPoints(0);
    setFeedbackMessage('');
    setIsTimeout(false);
  }, []);

  const resetForNewPlay = useCallback(() => {
    clearFeedback();
    setMascotMood('idle');
    setMascotMessage('');
    streakRef.current = 0;
    totalErrorsRef.current = 0;
    setStreak(0);
    setTotalErrors(0);
    recentMessagesRef.current.clear();
    // T-953 Fase 2.5: reset cooldown del mood `worried` para que la
    // siguiente partida pueda volver a disparar la frase de rebound.
    lastWorriedAtRef.current = 0;
  }, [clearFeedback]);

  return {
    feedbackState,
    feedbackPoints,
    feedbackMessage,
    isTimeout,
    mascotMood,
    mascotMessage,
    streak,
    totalErrors,
    challengeRef,
    processValidationResult,
    clearFeedback,
    resetForNewPlay,
  };
}
