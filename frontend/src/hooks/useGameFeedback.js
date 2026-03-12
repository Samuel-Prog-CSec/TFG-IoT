/**
 * @fileoverview Hook central para feedback de gameplay.
 * Gestiona estado de feedback, tracking de rachas, selección de mensajes
 * contextuales y disparo de confetti.
 *
 * @module hooks/useGameFeedback
 */

import { useState, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { selectFeedbackMessage } from '../lib/feedbackMessages';

/**
 * Dispara confetti desde el centro de un elemento DOM.
 * @param {HTMLElement} element
 */
function fireConfettiFromElement(element) {
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const x = (rect.left + rect.width / 2) / globalThis.innerWidth;
  const y = (rect.top + rect.height / 2) / globalThis.innerHeight;

  confetti({
    particleCount: 25,
    spread: 55,
    origin: { x, y },
    colors: ['#8b5cf6', '#22d3ee', '#f472b6', '#facc15', '#4ade80'],
    ticks: 80,
    gravity: 1.2,
    scalar: 0.9,
    shapes: ['circle', 'square'],
    disableForReducedMotion: true,
  });
}

/**
 * @param {Object} options
 * @param {boolean} options.isMemoryMode
 * @param {boolean} options.shouldReduceMotion
 */
export function useGameFeedback({ isMemoryMode = false, shouldReduceMotion = false } = {}) {
  const [feedbackState, setFeedbackState] = useState('idle');
  const [feedbackPoints, setFeedbackPoints] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [mascotMood, setMascotMood] = useState('idle');
  const [mascotMessage, setMascotMessage] = useState('');
  const [streak, setStreak] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);

  const recentMessagesRef = useRef(new Set());
  const challengeRef = useRef(null);
  const streakRef = useRef(0);
  const totalErrorsRef = useRef(0);

  /**
   * Process a validation result from the server.
   * @param {Object} payload - Socket payload { isCorrect, timeout, pointsAwarded, newScore, feedbackDelayMs }
   * @param {Object} gameContext - { currentRound, totalRounds, timeLeft, timeLimit, matchedCount, totalCards, attempts }
   * @returns {{ isCorrect: boolean, points: number, message: string }}
   */
  const processValidationResult = useCallback((payload, gameContext = {}) => {
    const isCorrect = Boolean(payload?.isCorrect && !payload?.timeout);
    const points = Number(payload?.pointsAwarded || 0);
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
    setMascotMood(isCorrect ? 'celebrating' : 'encouraging');
    setMascotMessage(message);

    // Fire canvas-confetti for association success
    if (isCorrect && !isMemoryMode && !shouldReduceMotion && challengeRef.current) {
      fireConfettiFromElement(challengeRef.current);
    }

    return { isCorrect, points, message };
  }, [isMemoryMode, shouldReduceMotion]);

  const clearFeedback = useCallback(() => {
    setFeedbackState('idle');
    setFeedbackPoints(0);
    setFeedbackMessage('');
    setMascotMood('idle');
    setMascotMessage('');
  }, []);

  const resetForNewPlay = useCallback(() => {
    clearFeedback();
    streakRef.current = 0;
    totalErrorsRef.current = 0;
    setStreak(0);
    setTotalErrors(0);
    recentMessagesRef.current.clear();
  }, [clearFeedback]);

  return {
    feedbackState,
    feedbackPoints,
    feedbackMessage,
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
