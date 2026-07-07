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
// Cooldown del re-enganche por inactividad (`idleNudge`): Otto no vuelve a
// "dar un toque" hasta pasado este intervalo, para acompañar sin agobiar.
const IDLE_NUDGE_COOLDOWN_MS = 12000;

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
  // Otto "más vivo": primer acierto de la partida (`firstCorrect`) y
  // cooldown del re-enganche por inactividad (`idleNudge`).
  const hasScoredRef = useRef(false);
  const lastNudgeAtRef = useRef(0);

  // T-953 Fase 4 (QA fix): el `mechanicType` que llega por closure puede
  // estar stale en consumers que registran callbacks de socket cuando la
  // sesión carga (GameSession monta con default `'association'` y cambia
  // a `'sequence'`/`'memory'` cuando llega el `session_state` del
  // backend). Si los listeners socket capturan `processValidationResult`
  // antes del cambio, siguen usando ese mechanicType en cada llamada.
  // Mirror via ref → leemos siempre el valor más reciente al ejecutar.
  const mechanicTypeRef = useRef(mechanicType);
  mechanicTypeRef.current = mechanicType;

  // Mirror del mood actual: `signalRoundStart` (nearWin) lo lee para NO degradar
  // un mood positivo (si Otto acaba de celebrar una racha, la última ronda no
  // debe bajarlo a `encouraging` — sería un bajón tras el subidón).
  const mascotMoodRef = useRef(mascotMood);
  mascotMoodRef.current = mascotMood;

  // Selección de frase de la mascota EVITANDO repetir la última consecutiva.
  // Doble propósito: (1) variedad (no oír "¡Genial!" dos veces seguidas); y
  // (2) el bocadillo de `CharacterMascot` auto-dismiss depende de que el string
  // `message` CAMBIE — si el mismo evento repite la misma frase, el efecto no se
  // re-ejecuta y el bocadillo no reaparece. Forzar string distinto lo arregla.
  const lastMascotMsgRef = useRef('');
  const pickMascotPhrase = useCallback((m, ev) => {
    let msg = pickMascotMessage(m, ev);
    let tries = 0;
    while (msg && msg === lastMascotMsgRef.current && tries < 4) {
      msg = pickMascotMessage(m, ev);
      tries += 1;
    }
    if (msg) lastMascotMsgRef.current = msg;
    return msg;
  }, []);

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

    // Update streak / errores — EXCEPTO en Memoria. El backend emite por pareja
    // TANTO `validation_result` (este path) COMO `memory_turn_state`
    // (`signalMemoryResult`); sin este guard ambos incrementaban racha/errores
    // → el footer "Fallos" mostraba el DOBLE de los fallos reales y la mascota
    // escalaba a la mitad de aciertos. En Memoria `signalMemoryResult` es el
    // dueño único de racha/errores/mascota.
    if (!isMemoryMode) {
      if (isCorrect) {
        streakRef.current += 1;
        setStreak(streakRef.current);
      } else {
        streakRef.current = 0;
        setStreak(0);
        totalErrorsRef.current += 1;
        setTotalErrors(totalErrorsRef.current);
      }
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

    // En Memoria, `signalMemoryResult` (disparado por `memory_turn_state`) es el
    // dueño único de la mascota (mood/frase) y de la micro-celebración por
    // pareja. Cortamos aquí para no duplicarlas (el backend emite ambos eventos
    // por pareja) y dejamos sólo el feedback de tablero ya fijado arriba.
    if (isMemoryMode) {
      return { isCorrect, points, message };
    }

    // ADR-D + T-953 Fase 2.5: mood + frase de la mascota se calculan
    // a partir del diccionario por mecánica con cinco grados de
    // expresividad escalonados:
    //   - `surprised`: la racha (>=3) se rompió de golpe — frase `streakBroken`.
    //   - `worried`:   5+ errores totales y la racha sigue rota — `worriedRebound`.
    //   - `celebrating`: racha actual >=3 → frase `streakReached`.
    //   - `happy`:      acierto normal → frase `correctAnswer`.
    //   - `encouraging`: timeout o error puntual → frase `timeout`/`errorAnswer`.
    // Si `mechanicType` no está definido (caller histórico), conservamos
    // el comportamiento previo: 'celebrating'/'encouraging' + el mensaje
    // de `selectFeedbackMessage`.
    let nextMood;
    let nextMessage = message;
    if (isTimeoutResult) {
      // AS-3: el timeout usa mood de CONSUELO (`encouraging`: pompones de ánimo), no
      // `sad` (ojos caídos + lágrima). Una cara de llanto al agotarse el tiempo —
      // combinada con las frases— transmitía castigo en vez de "la próxima es tuya".
      nextMood = 'encouraging';
      if (mechanicTypeRef.current) {
        nextMessage = pickMascotPhrase(mechanicTypeRef.current, 'timeout') || message;
      }
    } else if (isCorrect) {
      const reachedStreak = streakRef.current >= MASCOT_STREAK_THRESHOLD;
      // `firstCorrect`: el primer acierto de la partida estrena una frase de
      // arranque cálido ("¡Buen comienzo!") en lugar del pool genérico, para
      // que el primer logro se sienta especial. Solo aplica si aún no es racha.
      const isFirstScore = !hasScoredRef.current;
      hasScoredRef.current = true;
      nextMood = !reachedStreak && mechanicTypeRef.current ? 'happy' : 'celebrating';
      if (mechanicTypeRef.current) {
        let correctEvent = 'correctAnswer';
        if (reachedStreak) correctEvent = 'streakReached';
        else if (isFirstScore) correctEvent = 'firstCorrect';
        nextMessage = pickMascotPhrase(mechanicTypeRef.current, correctEvent) || message;
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

      if (streakWasHigh && mechanicTypeRef.current) {
        nextMood = 'surprised';
        nextMessage = pickMascotPhrase(mechanicTypeRef.current, 'streakBroken') || message;
      } else if (accumulatingErrors && mechanicTypeRef.current && worriedCooldownPassed) {
        nextMood = 'worried';
        nextMessage = pickMascotPhrase(mechanicTypeRef.current, 'worriedRebound') || message;
        lastWorriedAtRef.current = now;
      } else {
        nextMood = 'encouraging';
        if (mechanicTypeRef.current) {
          nextMessage = pickMascotPhrase(mechanicTypeRef.current, 'errorAnswer') || message;
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
    // `mechanicType` se lee SIEMPRE vía `mechanicTypeRef.current` (no se
    // referencia el closure), por eso no está en deps y el callback se mantiene
    // estable entre cambios de mecánica sin re-registrar listeners.
  }, [isMemoryMode, shouldReduceMotion, fireFromElement, fireBurst, pickMascotPhrase]);

  // ── Eventos curados "Otto más vivo" (rediseño mascota) ──────────────
  // Señales para momentos que NO son validation_result, donde antes la
  // mascota se quedaba muda. Leen `mechanicTypeRef.current` (estable) y
  // escriben mood + frase contextual del diccionario.

  // Memoria: el backend emite `memory_turn_state` con phase `match`/`mismatch`
  // ADEMÁS de `validation_result` por pareja (la suposición previa de que NO
  // emitía `validation_result` era falsa y causaba doble conteo). Por eso
  // `signalMemoryResult` es el dueño ÚNICO en Memoria de racha, errores y de la
  // reacción de Otto; `processValidationResult` se corta antes vía `isMemoryMode`.
  // Esta señal mueve SÓLO la mascota (mood + frase +
  // racha + micro-celebración) y NO toca el feedback de tablero de Memoria
  // (`memoryFeedbackActive`/`feedbackState`, que GameSession gestiona por fases)
  // ni dispara el confetti de Asociación. Reusa la misma escalera expresiva que
  // `processValidationResult` (happy/celebrating/surprised/worried/encouraging).
  const signalMemoryResult = useCallback((isMatch) => {
    const mech = mechanicTypeRef.current;
    const previousStreak = streakRef.current;

    if (isMatch) {
      streakRef.current += 1;
      setStreak(streakRef.current);
    } else {
      streakRef.current = 0;
      setStreak(0);
      totalErrorsRef.current += 1;
      setTotalErrors(totalErrorsRef.current);
    }

    let nextMood;
    let nextMessage = '';
    if (isMatch) {
      const reachedStreak = streakRef.current >= MASCOT_STREAK_THRESHOLD;
      const isFirstScore = !hasScoredRef.current;
      hasScoredRef.current = true;
      nextMood = reachedStreak ? 'celebrating' : 'happy';
      let correctEvent = 'correctAnswer';
      if (reachedStreak) correctEvent = 'streakReached';
      else if (isFirstScore) correctEvent = 'firstCorrect';
      nextMessage = pickMascotPhrase(mech, correctEvent) || '';
    } else {
      const streakWasHigh = previousStreak >= MASCOT_STREAK_THRESHOLD;
      const accumulatingErrors =
        totalErrorsRef.current >= WORRIED_TOTAL_ERRORS && streakRef.current === 0;
      const now = Date.now();
      const worriedCooldownPassed = now - lastWorriedAtRef.current > WORRIED_COOLDOWN_MS;
      if (streakWasHigh) {
        nextMood = 'surprised';
        nextMessage = pickMascotPhrase(mech, 'streakBroken') || '';
      } else if (accumulatingErrors && worriedCooldownPassed) {
        nextMood = 'worried';
        nextMessage = pickMascotPhrase(mech, 'worriedRebound') || '';
        lastWorriedAtRef.current = now;
      } else {
        nextMood = 'encouraging';
        nextMessage = pickMascotPhrase(mech, 'errorAnswer') || '';
      }
    }
    setMascotMood(nextMood);
    setMascotMessage(nextMessage);

    // Micro-celebración tintada cada N parejas consecutivas (paridad con
    // processValidationResult; sin cambiar mood ni resetear racha).
    if (
      isMatch &&
      !shouldReduceMotion &&
      streakRef.current > 0 &&
      streakRef.current % MICRO_CELEBRATION_EVERY === 0 &&
      streakRef.current !== MASCOT_STREAK_THRESHOLD
    ) {
      const themeColor = getMechanicTheme(mech || 'memory').accentHexFallback;
      fireBurst({
        particleCount: 18,
        spread: 60,
        colors: themeColor ? [themeColor] : undefined,
      });
    }
  }, [shouldReduceMotion, fireBurst, pickMascotPhrase]);

  // Fases de Secuencia: memorizar → `thinking` ("¡Fíjate en el orden!"),
  // reproducir → `pointing` ("¡Ahora te toca!"). Antes Otto no reaccionaba
  // a estas transiciones (solo a card/round results).
  const signalSequencePhase = useCallback((phase) => {
    const mech = mechanicTypeRef.current;
    if (phase === 'memorizing') {
      setMascotMood('thinking');
      setMascotMessage(pickMascotPhrase(mech, 'memorizing') || '');
    } else if (phase === 'reproducing') {
      setMascotMood('pointing');
      setMascotMessage(pickMascotPhrase(mech, 'reproducing') || '');
    }
  }, [pickMascotPhrase]);

  // Inicio de ronda: saludo en la PRIMERA ronda (`roundStart`) e hype suave
  // en la ÚLTIMA (`nearWin`, mood `encouraging`). Las rondas intermedias NO
  // se tocan, para no pisar el `happy`/`celebrating` que arrastra el acierto
  // anterior (sería un bajón de ánimo innecesario).
  const signalRoundStart = useCallback((gameContext = {}) => {
    const mech = mechanicTypeRef.current;
    const round = Number(gameContext.currentRound);
    const total = Number(gameContext.totalRounds);
    if (Number.isFinite(total) && total > 0 && Number.isFinite(round) && round >= total) {
      // Hype de última ronda SIN bajón: si Otto venía positivo (happy/
      // celebrating del acierto anterior), conserva ese mood y solo añade la
      // frase "¡Última ronda!"; si no, lo lleva a `encouraging`.
      const { current: currentMood } = mascotMoodRef;
      if (currentMood !== 'happy' && currentMood !== 'celebrating') {
        setMascotMood('encouraging');
      }
      setMascotMessage(pickMascotPhrase(mech, 'nearWin') || '');
    } else if (Number.isFinite(round) && round <= 1) {
      setMascotMood('idle');
      setMascotMessage(pickMascotPhrase(mech, 'roundStart') || '');
    }
  }, [pickMascotPhrase]);

  // Re-enganche por inactividad: si el alumno lleva un rato sin tocar, Otto
  // "da un toque" amable (`pointing` + "¿Cuál crees?"). NUNCA es un regaño;
  // tiene cooldown para no repetirse.
  const signalIdleNudge = useCallback(() => {
    const now = Date.now();
    if (now - lastNudgeAtRef.current < IDLE_NUDGE_COOLDOWN_MS) return;
    lastNudgeAtRef.current = now;
    setMascotMood('pointing');
    setMascotMessage(pickMascotPhrase(mechanicTypeRef.current, 'idleNudge') || '');
  }, [pickMascotPhrase]);

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
    // Otto "más vivo": reset de firstCorrect y cooldown de nudge por partida.
    hasScoredRef.current = false;
    lastNudgeAtRef.current = 0;
    lastMascotMsgRef.current = '';
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
    signalMemoryResult,
    signalSequencePhase,
    signalRoundStart,
    signalIdleNudge,
    clearFeedback,
    resetForNewPlay,
  };
}
