import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases de Tailwind de forma inteligente
 * - Usa clsx para condicionales
 * - Usa tailwind-merge para resolver conflictos
 * 
 * @example
 * cn('px-4 py-2', condition && 'bg-blue-500', 'px-6') // => 'py-2 px-6 bg-blue-500'
 * 
 * @param {...(string | undefined | null | false | Record<string, boolean>)} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Configuración de animaciones para Framer Motion
 */
export const motionConfig = {
  // Spring suave para interacciones
  spring: {
    type: 'spring',
    stiffness: 400,
    damping: 30,
  },
  
  // Transición suave estándar
  smooth: {
    type: 'tween',
    ease: [0.4, 0, 0.2, 1],
    duration: 0.3,
  },
  
  // Transición rápida
  fast: {
    type: 'tween',
    ease: [0.4, 0, 0.2, 1],
    duration: 0.15,
  },
  
  // Transición lenta para efectos dramáticos
  slow: {
    type: 'tween',
    ease: [0.4, 0, 0.2, 1],
    duration: 0.5,
  },
};

/**
 * Variantes de animación para contenedores con stagger
 */
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

/**
 * Variantes de animación para items dentro de stagger
 */
export const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: motionConfig.spring,
  },
};

/**
 * Variantes de animación para transiciones de página
 */
export const pageVariants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.98,
    transition: {
      duration: 0.2,
    },
  },
};

/**
 * Variantes para fade in/out
 */
export const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Variantes para scale in/out
 */
export const scaleVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: motionConfig.spring,
  },
  exit: { 
    opacity: 0, 
    scale: 0.8,
    transition: motionConfig.fast,
  },
};

/**
 * Variantes para slide desde diferentes direcciones
 */
export const slideVariants = {
  fromLeft: {
    hidden: { opacity: 0, x: -50 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
  },
  fromRight: {
    hidden: { opacity: 0, x: 50 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 50 },
  },
  fromTop: {
    hidden: { opacity: 0, y: -50 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -50 },
  },
  fromBottom: {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 50 },
  },
};

/**
 * Formatea un número con separadores de miles
 * @param {number} num 
 * @returns {string}
 */
export function formatNumber(num) {
  return num.toLocaleString('es-ES');
}

/**
 * Formatea segundos a formato MM:SS
 * @param {number} seconds 
 * @returns {string}
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Genera un color aleatorio de la paleta Eduplay
 * @returns {string}
 */
export function getRandomAccentColor() {
  const colors = [
    'var(--primary)',
    'var(--accent-cyan)',
    'var(--accent-pink)',
    'var(--accent-yellow)',
    'var(--accent-mint)',
    'var(--accent-orange)',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Calcula las estrellas basado en el porcentaje de aciertos
 * @param {number} correctPercentage - Porcentaje de respuestas correctas (0-100)
 * @returns {number} - Número de estrellas (0-3)
 */
export function calculateStars(correctPercentage) {
  if (correctPercentage >= 90) return 3;
  if (correctPercentage >= 70) return 2;
  if (correctPercentage >= 50) return 1;
  return 0;
}

/**
 * Delay helper para async/await
 * @param {number} ms 
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
