import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge tailwind classes effectively.
 * Combines standard conditional classnames (clsx) con Tailwind class deduplicator (tailwind-merge).
 * 
 * @param {...(string|undefined|null|false|Record<string, boolean>)} inputs
 * @returns {string} Fully resolved and unique tailwind utility string.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Configuración de animaciones para Framer Motion
 */
export const motionConfig = {
  // Spring suave para interacciones UI generales
  spring: {
    type: 'spring',
    stiffness: 400,
    damping: 30,
  },

  // Spring para entradas de elementos de juego (overshoot sutil ~1.03)
  springGame: {
    type: 'spring',
    stiffness: 350,
    damping: 22,
  },

  // Spring para feedback de recompensa (bounce visible)
  springFeedback: {
    type: 'spring',
    stiffness: 400,
    damping: 18,
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
 * Normaliza un título en Title Case español: capitaliza la primera letra de
 * cada palabra salvo artículos/preposiciones cortas (de, con, la, el, los,
 * las, en, a, y, o, del, al), que quedan en minúsculas salvo si son la
 * primera palabra del título.
 *
 * Solo normaliza si el texto está *todo en minúsculas* o *todo en mayúsculas*:
 * si el autor ya tuvo intención de case mixto (p. ej. "Deck de prueba"),
 * respeta su elección para no romper identificadores en tests o decisiones
 * deliberadas del usuario (QA 22/04/2026).
 *
 * Ejemplos:
 *   "colores básicos - repaso"      → "Colores Básicos - Repaso"
 *   "animales de granja"            → "Animales de Granja"
 *   "NÚMEROS 1-6 - PRIMERA SESIÓN"  → "Números 1-6 - Primera Sesión"
 *   "Deck de prueba"                → "Deck de prueba" (respeta case mixto)
 *
 * @param {string} text
 * @returns {string}
 */
export function toTitleCaseEs(text) {
  if (!text || typeof text !== 'string') return text;
  // Solo actuar sobre textos sin casing intencional (todo lower o todo upper).
  // Los textos con mezcla de mayúsculas/minúsculas se devuelven tal cual.
  const hasMixedCase = /[a-záéíóúñ]/.test(text) && /[A-ZÁÉÍÓÚÑ]/.test(text);
  if (hasMixedCase) return text;

  const lowerWords = new Set([
    'de', 'del', 'al', 'a', 'la', 'el', 'los', 'las',
    'y', 'o', 'u', 'en', 'con', 'sin', 'por', 'para'
  ]);
  return text
    .toLowerCase()
    .split(/(\s+|-|·)/)
    .map((token, idx, arr) => {
      if (!token.trim() || token === '-' || token === '·') return token;
      const isFirstWord = idx === 0 || arr.slice(0, idx).every(t => !t.trim() || t === '-' || t === '·');
      if (!isFirstWord && lowerWords.has(token)) return token;
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join('');
}

/**
 * Presets de formato de fecha para Intl.DateTimeFormat
 * @type {Record<string, Intl.DateTimeFormatOptions>}
 */
const DATE_PRESETS = {
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  medium: { day: 'numeric', month: 'long', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  weekday: { weekday: 'short', day: 'numeric', month: 'short' },
};

/**
 * Formatea una fecha usando Intl.DateTimeFormat con locale es-ES.
 * Centraliza el formateo de fechas para consistencia.
 *
 * @param {string|number|Date} date - Fecha a formatear
 * @param {'short'|'medium'|'long'|'weekday'} [variant='medium'] - Preset de formato
 * @returns {string} Fecha formateada en español
 *
 * @example
 * formatDate('2026-03-28')           // "28 de marzo de 2026"
 * formatDate('2026-03-28', 'short')  // "28 mar 2026"
 * formatDate('2026-03-28', 'long')   // "sábado, 28 de marzo de 2026"
 */
export function formatDate(date, variant = 'medium') {
  const d = date instanceof Date ? date : new Date(date);
  const options = DATE_PRESETS[variant] || DATE_PRESETS.medium;
  return new Intl.DateTimeFormat('es-ES', options).format(d);
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
    'var(--color-brand-base)',
    'var(--color-accent-cyan)',
    'var(--color-accent-pink)',
    'var(--color-warning-base)',
    'var(--color-success-base)',
    'var(--color-accent-orange)',
  ];
  // eslint-disable-next-line sonarjs/pseudo-random -- seleccion aleatoria de color visual, no requiere seguridad criptografica
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

// --- Easing (GPU-friendly, sin bounce/elastic) ---
export const EASING = {
  outQuart: [0.25, 1, 0.5, 1],
  outExpo: [0.16, 1, 0.3, 1],
  inOutCubic: [0.65, 0, 0.35, 1],
};

// --- Duraciones (segundos) ---
export const DURATION = {
  feedback: 0.12,
  stateChange: 0.25,
  layout: 0.4,
  entrance: 0.6,
  exit: 0.45,
};

// --- List stagger factory ---
export const listContainerVariants = (staggerDelay = 0.04) => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: staggerDelay, delayChildren: 0.05 },
  },
});

export const listItemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.entrance, ease: EASING.outExpo },
  },
};

// --- Form field entrance (delay secuencial por indice) ---
export const formFieldVariants = (index) => ({
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: DURATION.stateChange,
      ease: EASING.outQuart,
      delay: 0.05 * index,
    },
  },
});

// --- Crossfade (skeleton → contenido) ---
export const crossfadeVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.stateChange, ease: EASING.outQuart } },
  exit: { opacity: 0, transition: { duration: DURATION.stateChange * 0.75, ease: EASING.outQuart } },
};

// --- Page transition (para AppLayout Outlet) ---
export const routeTransition = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: EASING.outExpo },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.15, ease: EASING.outQuart },
  },
};

// --- Shake para validacion ---
export const shakeAnimation = {
  x: [-4, 4, -3, 3, -1, 1, 0],
  transition: { duration: 0.4 },
};

/**
 * Exporta datos a CSV y descarga el archivo.
 * Generacion client-side con Blob + URL.createObjectURL (sin dependencias externas).
 * @param {Array<Object>} data - Array de objetos a exportar
 * @param {string} filename - Nombre del archivo (sin extension)
 * @param {Array<{key: string, label: string}>} columns - Columnas a incluir
 */
export function exportToCSV(data, filename, columns) {
  if (!data?.length || !columns?.length) return;

  const separator = ',';
  const header = columns.map(c => `"${c.label}"`).join(separator);
  const rows = data.map(row =>
    columns.map(c => {
      const val = row[c.key];
      if (val == null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(separator)
  );

  const csv = [header, ...rows].join('\n');
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Descarga un Blob como archivo.
 * Patron identico a exportToCSV pero para cualquier tipo de blob.
 *
 * @param {Blob} blob - Blob a descargar
 * @param {string} filename - Nombre del archivo con extension
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
