/**
 * Hook para gestion del onboarding de profesores.
 * Usa localStorage para persistir si el usuario ya completo el tutorial.
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'eduplay:onboarding-completed';

export function useOnboarding() {
  const [isVisible, setIsVisible] = useState(() => {
    return !localStorage.getItem(STORAGE_KEY);
  });
  const [currentStep, setCurrentStep] = useState(0);

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
  }, []);

  const skipOnboarding = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsVisible(false);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep(prev => prev + 1);
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  }, []);

  // Para testing/reset
  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsVisible(true);
    setCurrentStep(0);
  }, []);

  return {
    isVisible,
    currentStep,
    totalSteps: 4,
    nextStep,
    prevStep,
    completeOnboarding,
    skipOnboarding,
    resetOnboarding,
  };
}
