/**
 * @fileoverview Hook central para feedback de gameplay.
 * Gestiona estado de feedback, tracking de rachas, selección de mensajes
 * contextuales y disparo de confetti.
 *
 * @module hooks/useGameFeedback
 */

import { useState, useCallback, useRef } from 'react';
import { selectFeedbackMessage } from '../lib/feedbackMessages';
import { useConfetti } from './useConfetti';

/**
 * @param {Object} options
 * @param {boolean} options.isMemoryMode
 * @param {boolean} options.shouldReduceMotion
 */
export function useGameFeedback({ isMemoryMode = false, shouldReduceMotion = false } = {}) {
  const [feedbackState, setFeedbackState] = useState('idle');
  const [feedbackPoints, setFeedbackPoints] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isTimeout, setIsTimeout] = useState(false);
  const [mascotMood, setMascotMood] = useState('idle');
  const [mascotMessage, setMascotMessage] = useState('');
  const [streak, setStreak] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);

  const { fireFromElement } = useConfetti();
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
    setMascotMood(isCorrect ? 'celebrating' : 'encouraging');
    setMascotMessage(message);

    // Fire canvas-confetti for association success
    if (isCorrect && !isMemoryMode && !shouldReduceMotion && challengeRef.current) {
      fireFromElement(challengeRef.current, {
        ticks: 80,
        scalar: 0.9,
        shapes: ['circle', 'square'],
      });
    }

    return { isCorrect, points, message };
  }, [isMemoryMode, shouldReduceMotion, fireFromElement]);

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
