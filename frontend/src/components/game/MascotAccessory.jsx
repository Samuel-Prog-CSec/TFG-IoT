/**
 * @fileoverview Accesorios SVG para la mascota del juego.
 * SVGs inline simples superpuestos al emoji base (🦉) para
 * expresar diferentes moods con personalidad visual.
 *
 * @module components/game/MascotAccessory
 */

import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const SPRING_POP = { type: 'spring', stiffness: 500, damping: 20 };
const SLIDE_IN = { type: 'spring', stiffness: 300, damping: 25 };

/**
 * Gorro de fiesta triangular con estrella en la punta.
 */
function PartyHat() {
  return (
    <motion.svg
      initial={{ scale: 0, y: 10, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0, y: 10, opacity: 0 }}
      transition={SPRING_POP}
      width="32"
      height="28"
      viewBox="0 0 32 28"
      fill="none"
      className="absolute -top-5 left-1/2 -translate-x-1/2"
      aria-hidden="true"
    >
      {/* Hat body */}
      <path
        d="M16 2 L26 26 L6 26 Z"
        fill="url(#hatGradient)"
        stroke="oklch(0.8 0.15 300)"
        strokeWidth="1"
      />
      {/* Stripes */}
      <path d="M12 14 L20 14" stroke="oklch(0.9 0.1 80)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 20 L22 20" stroke="oklch(0.85 0.12 170)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Star on top */}
      <motion.g
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        style={{ originX: '16px', originY: '2px' }}
      >
        <path
          d="M16 -2 L17.2 1 L20 1.5 L18 3.5 L18.5 6 L16 4.8 L13.5 6 L14 3.5 L12 1.5 L14.8 1 Z"
          fill="oklch(0.88 0.18 90)"
        />
      </motion.g>
      <defs>
        <linearGradient id="hatGradient" x1="6" y1="26" x2="26" y2="2">
          <stop offset="0%" stopColor="oklch(0.55 0.2 300)" />
          <stop offset="100%" stopColor="oklch(0.65 0.22 330)" />
        </linearGradient>
      </defs>
    </motion.svg>
  );
}

/**
 * Gafas redondas (thinking).
 */
function Glasses() {
  return (
    <motion.svg
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -20, opacity: 0 }}
      transition={SLIDE_IN}
      width="36"
      height="16"
      viewBox="0 0 36 16"
      fill="none"
      className="absolute top-[42%] left-1/2 -translate-x-1/2"
      aria-hidden="true"
    >
      {/* Left lens */}
      <circle cx="10" cy="8" r="6" stroke="oklch(0.7 0.1 250)" strokeWidth="1.5" fill="oklch(0.7 0.1 250 / 0.15)" />
      {/* Right lens */}
      <circle cx="26" cy="8" r="6" stroke="oklch(0.7 0.1 250)" strokeWidth="1.5" fill="oklch(0.7 0.1 250 / 0.15)" />
      {/* Bridge */}
      <path d="M16 8 Q18 5 20 8" stroke="oklch(0.7 0.1 250)" strokeWidth="1.5" fill="none" />
      {/* Temple arms */}
      <path d="M4 8 L0 6" stroke="oklch(0.7 0.1 250)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M32 8 L36 6" stroke="oklch(0.7 0.1 250)" strokeWidth="1.5" strokeLinecap="round" />
    </motion.svg>
  );
}

/**
 * Sparkle-eyes — dos estrellitas sobre los ojos.
 */
function SparkleEyes() {
  return (
    <motion.svg
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={SPRING_POP}
      width="36"
      height="14"
      viewBox="0 0 36 14"
      fill="none"
      className="absolute top-[38%] left-1/2 -translate-x-1/2"
      aria-hidden="true"
    >
      {/* Left sparkle */}
      <motion.path
        d="M9 7 L10.5 4 L12 7 L10.5 10 Z M7 7 L10.5 5.5 L14 7 L10.5 8.5 Z"
        fill="oklch(0.88 0.18 90)"
        animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      {/* Right sparkle */}
      <motion.path
        d="M25 7 L26.5 4 L28 7 L26.5 10 Z M23 7 L26.5 5.5 L30 7 L26.5 8.5 Z"
        fill="oklch(0.88 0.18 90)"
        animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
      />
    </motion.svg>
  );
}

/**
 * Pompón de animación (encouraging).
 */
function CheerPom() {
  return (
    <motion.svg
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, rotate: [0, 8, -8, 0] }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ ...SPRING_POP, rotate: { duration: 0.8, repeat: Infinity } }}
      width="20"
      height="24"
      viewBox="0 0 20 24"
      fill="none"
      className="absolute -right-4 top-[20%]"
      aria-hidden="true"
    >
      {/* Stick */}
      <path d="M10 14 L10 24" stroke="oklch(0.6 0.05 60)" strokeWidth="2" strokeLinecap="round" />
      {/* Pom strands */}
      <circle cx="10" cy="7" r="7" fill="oklch(0.7 0.2 30)" opacity="0.6" />
      <circle cx="8" cy="5" r="4" fill="oklch(0.75 0.18 350)" opacity="0.7" />
      <circle cx="13" cy="6" r="4" fill="oklch(0.8 0.15 60)" opacity="0.7" />
      <circle cx="10" cy="10" r="3.5" fill="oklch(0.72 0.2 300)" opacity="0.6" />
    </motion.svg>
  );
}

/**
 * Tirita/bandita (sad).
 */
function Bandage() {
  return (
    <motion.svg
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      width="20"
      height="10"
      viewBox="0 0 20 10"
      fill="none"
      className="absolute top-[55%] left-[55%] rotate-[-15deg]"
      aria-hidden="true"
    >
      {/* Band base */}
      <rect x="0" y="1" width="20" height="8" rx="4" fill="oklch(0.82 0.08 80)" />
      {/* Center pad */}
      <rect x="6" y="2.5" width="8" height="5" rx="1" fill="oklch(0.9 0.03 80)" />
      {/* Dots */}
      <circle cx="9" cy="5" r="0.8" fill="oklch(0.7 0.05 80)" />
      <circle cx="11" cy="5" r="0.8" fill="oklch(0.7 0.05 80)" />
    </motion.svg>
  );
}

const ACCESSORY_MAP = {
  idle: null,
  happy: SparkleEyes,
  encouraging: CheerPom,
  celebrating: PartyHat,
  thinking: Glasses,
  sad: Bandage,
};

export default function MascotAccessory({ mood = 'idle' }) {
  const { shouldReduceMotion } = useReducedMotion();

  const AccessoryComponent = ACCESSORY_MAP[mood];

  if (shouldReduceMotion) {
    // Renderizar sin animacion pero mantener el accesorio visible
    return AccessoryComponent ? <AccessoryComponent key={mood} /> : null;
  }

  return (
    <AnimatePresence mode="wait">
      {AccessoryComponent && (
        <AccessoryComponent key={mood} />
      )}
    </AnimatePresence>
  );
}

MascotAccessory.propTypes = {
  mood: PropTypes.oneOf(['idle', 'happy', 'encouraging', 'celebrating', 'thinking', 'sad']),
};
