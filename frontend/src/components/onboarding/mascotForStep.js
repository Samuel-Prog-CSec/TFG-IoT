/**
 * @fileoverview Lógica pura: mood + frase de Otto para un paso del onboarding.
 *
 * Vive en su propio módulo (no en `OnboardingOverlay.jsx`) para que el overlay
 * exporte SOLO componentes (regla `react-refresh/only-export-components`) y para
 * poder testear la derivación de forma aislada.
 *
 * @module components/onboarding/mascotForStep
 */

/**
 * Calcula `{ mood, line }` de la mascota para un paso del tour leyendo
 * `step.mascotMood`/`step.mascotLine` (definidos en `onboardingTracks.js`).
 * Si el paso no fija `mascotMood`, se DERIVA: paso 0 → `greeting`, último →
 * `celebrating`, `spotlight` → `pointing`, resto modal → `thinking`. El `flip`
 * (orientar a Otto hacia el elemento resaltado) lo decide `SpotlightStep`.
 *
 * @param {Object} step
 * @param {number} currentStep
 * @param {number} totalSteps
 * @returns {{ mood: string, line: string }}
 */
export function mascotForStep(step, currentStep, totalSteps) {
  const line = step?.mascotLine || '';
  if (step?.mascotMood) return { mood: step.mascotMood, line };
  if (currentStep === 0) return { mood: 'greeting', line };
  if (currentStep === totalSteps - 1) return { mood: 'celebrating', line };
  if (step?.type === 'spotlight') return { mood: 'pointing', line };
  return { mood: 'thinking', line };
}
