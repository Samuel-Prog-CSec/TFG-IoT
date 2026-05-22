/**
 * @fileoverview Accesorios SVG para la mascota del juego.
 * SVGs inline simples superpuestos al emoji base (🦉) para
 * expresar diferentes moods con personalidad visual.
 *
 * Selección por mood (T-953 Fase 2.3): la función `getAccessory(mood,
 * mechanicType)` decide qué componente renderizar. Para `thinking` y
 * `celebrating` se usa una variante diferente por mecánica (Memory →
 * libro, Association → cadena, Sequence → auriculares) para reforzar
 * la signature visual sin saturar al alumno con cambios bruscos.
 *
 * @module components/game/MascotAccessory
 */

import { m as motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const SPRING_POP = { type: 'spring', stiffness: 500, damping: 20 };
const SLIDE_IN = { type: 'spring', stiffness: 300, damping: 25 };

// =============================================================
// Accesorios genéricos (compartidos entre mecánicas)
// =============================================================

/**
 * Gorro de fiesta triangular con estrella en la punta. (celebrating)
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
 * Gafas redondas neutras — fallback de `thinking` cuando la mecánica no
 * está definida (no debería ocurrir en gameplay, pero sí en pruebas
 * unitarias o renders sueltos).
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
      <circle cx="10" cy="8" r="6" stroke="oklch(0.7 0.1 250)" strokeWidth="1.5" fill="oklch(0.7 0.1 250 / 0.15)" />
      <circle cx="26" cy="8" r="6" stroke="oklch(0.7 0.1 250)" strokeWidth="1.5" fill="oklch(0.7 0.1 250 / 0.15)" />
      <path d="M16 8 Q18 5 20 8" stroke="oklch(0.7 0.1 250)" strokeWidth="1.5" fill="none" />
      <path d="M4 8 L0 6" stroke="oklch(0.7 0.1 250)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M32 8 L36 6" stroke="oklch(0.7 0.1 250)" strokeWidth="1.5" strokeLinecap="round" />
    </motion.svg>
  );
}

/**
 * Sparkle-eyes — dos estrellitas sobre los ojos. (happy)
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
      <motion.path
        d="M9 7 L10.5 4 L12 7 L10.5 10 Z M7 7 L10.5 5.5 L14 7 L10.5 8.5 Z"
        fill="oklch(0.88 0.18 90)"
        animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
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
 * Pompón de animación. (encouraging)
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
      <path d="M10 14 L10 24" stroke="oklch(0.6 0.05 60)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="7" r="7" fill="oklch(0.7 0.2 30)" opacity="0.6" />
      <circle cx="8" cy="5" r="4" fill="oklch(0.75 0.18 350)" opacity="0.7" />
      <circle cx="13" cy="6" r="4" fill="oklch(0.8 0.15 60)" opacity="0.7" />
      <circle cx="10" cy="10" r="3.5" fill="oklch(0.72 0.2 300)" opacity="0.6" />
    </motion.svg>
  );
}

/**
 * Tirita/bandita. (sad)
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
      <rect x="0" y="1" width="20" height="8" rx="4" fill="oklch(0.82 0.08 80)" />
      <rect x="6" y="2.5" width="8" height="5" rx="1" fill="oklch(0.9 0.03 80)" />
      <circle cx="9" cy="5" r="0.8" fill="oklch(0.7 0.05 80)" />
      <circle cx="11" cy="5" r="0.8" fill="oklch(0.7 0.05 80)" />
    </motion.svg>
  );
}

// =============================================================
// Accesorios mecánica-aware (T-953 Fase 2.3)
// =============================================================

/**
 * Memory thinking → libro abierto pequeño bajo gafas. Refuerza la idea
 * "concentrarse y recordar" sin necesidad de explicar la mecánica.
 */
function BookGlasses() {
  return (
    <motion.svg
      initial={{ y: 6, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 6, opacity: 0 }}
      transition={SLIDE_IN}
      width="40"
      height="22"
      viewBox="0 0 40 22"
      fill="none"
      className="absolute top-[40%] left-1/2 -translate-x-1/2"
      aria-hidden="true"
    >
      {/* Glasses (sobre los ojos del búho) */}
      <circle cx="12" cy="6" r="5" stroke="var(--color-accent-indigo)" strokeWidth="1.5" fill="var(--color-accent-indigo)" fillOpacity="0.18" />
      <circle cx="28" cy="6" r="5" stroke="var(--color-accent-indigo)" strokeWidth="1.5" fill="var(--color-accent-indigo)" fillOpacity="0.18" />
      <path d="M17 6 Q20 4 23 6" stroke="var(--color-accent-indigo)" strokeWidth="1.5" fill="none" />
      {/* Libro abierto debajo (parte ilustrativa) */}
      <path d="M14 18 L20 16 L26 18 L26 21 L20 19 L14 21 Z" fill="var(--color-accent-indigo)" fillOpacity="0.7" stroke="var(--color-accent-indigo)" strokeWidth="0.8" />
      <path d="M20 16 L20 19" stroke="oklch(0.95 0 0)" strokeWidth="0.6" />
    </motion.svg>
  );
}

/**
 * Association thinking → colgante con eslabón de cadena. Visual que
 * comunica "conectar" sin caer en la metáfora obvia de un símbolo de
 * link gigante (que mostraríamos como icono Lucide en otra parte).
 */
function LinkPendant() {
  return (
    <motion.svg
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1, rotate: [0, 4, -4, 0] }}
      exit={{ scale: 0.7, opacity: 0 }}
      transition={{ ...SPRING_POP, rotate: { duration: 2, repeat: Infinity } }}
      width="22"
      height="26"
      viewBox="0 0 22 26"
      fill="none"
      className="absolute top-[58%] left-1/2 -translate-x-1/2"
      aria-hidden="true"
    >
      {/* Cadena (línea) */}
      <path d="M11 0 L11 8" stroke="var(--color-accent-cyan)" strokeWidth="1.2" strokeDasharray="2 2" />
      {/* Eslabón superior */}
      <ellipse cx="11" cy="13" rx="6" ry="4" stroke="var(--color-accent-cyan)" strokeWidth="2" fill="none" />
      {/* Eslabón inferior entrelazado */}
      <ellipse cx="11" cy="20" rx="6" ry="4" stroke="var(--color-accent-cyan)" strokeWidth="2" fill="var(--color-accent-cyan)" fillOpacity="0.2" />
    </motion.svg>
  );
}

/**
 * Sequence thinking → auriculares con notas musicales saltando.
 * Comunica "sigue el ritmo" usando una metáfora cotidiana del aula.
 */
function RhythmHeadphones() {
  return (
    <motion.svg
      initial={{ y: -4, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -4, opacity: 0 }}
      transition={SLIDE_IN}
      width="44"
      height="20"
      viewBox="0 0 44 20"
      fill="none"
      className="absolute top-[14%] left-1/2 -translate-x-1/2"
      aria-hidden="true"
    >
      {/* Banda superior */}
      <path d="M8 12 Q22 0 36 12" stroke="var(--color-accent-amber)" strokeWidth="2" fill="none" />
      {/* Auriculares (cápsulas ovaladas) */}
      <ellipse cx="8" cy="13" rx="4" ry="5" fill="var(--color-accent-amber)" fillOpacity="0.85" stroke="var(--color-accent-amber)" strokeWidth="1.2" />
      <ellipse cx="36" cy="13" rx="4" ry="5" fill="var(--color-accent-amber)" fillOpacity="0.85" stroke="var(--color-accent-amber)" strokeWidth="1.2" />
      {/* Notas musicales saltando */}
      <motion.g
        animate={{ y: [0, -3, 0], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.4, repeat: Infinity }}
      >
        <circle cx="2" cy="6" r="1.5" fill="var(--color-accent-amber)" />
        <path d="M3.5 6 L3.5 1" stroke="var(--color-accent-amber)" strokeWidth="1" />
      </motion.g>
      <motion.g
        animate={{ y: [0, -3, 0], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.4, repeat: Infinity, delay: 0.6 }}
      >
        <circle cx="42" cy="4" r="1.5" fill="var(--color-accent-amber)" />
        <path d="M40.5 4 L40.5 -1" stroke="var(--color-accent-amber)" strokeWidth="1" />
      </motion.g>
    </motion.svg>
  );
}

// =============================================================
// Accesorios para los nuevos moods (T-953 Fase 2.2)
// =============================================================

/**
 * Manita pequeña apuntando a la derecha. (pointing)
 * El gesto en gameplay sugiere "fíjate aquí" — útil cuando la mascota
 * destaca un elemento del UI (carta, botón).
 */
function PointFinger() {
  return (
    <motion.svg
      initial={{ x: -8, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -8, opacity: 0 }}
      transition={SLIDE_IN}
      width="22"
      height="18"
      viewBox="0 0 22 18"
      fill="none"
      className="absolute top-[55%] -right-5"
      aria-hidden="true"
    >
      {/* Brazo + mano cerrada */}
      <path
        d="M2 9 Q6 9 9 9 L13 8 Q15 8 16 9 L20 9 L20 12 L16 12 L13 11 Q11 11 9 11 L2 11 Z"
        fill="oklch(0.78 0.06 60)"
        stroke="oklch(0.6 0.06 60)"
        strokeWidth="0.8"
      />
      {/* Punta del dedo (más oscura) */}
      <circle cx="20" cy="10.5" r="1.6" fill="oklch(0.6 0.06 60)" />
    </motion.svg>
  );
}

/**
 * Gota de sudor en la frente. (worried)
 * Universal entre culturas, sin estigmatizar el error: comunica
 * "estoy preocupado contigo" sin usar caras tristes que pueden
 * desalentar al alumno.
 */
function WorryDrop() {
  return (
    <motion.svg
      initial={{ y: -6, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -6, opacity: 0 }}
      transition={SPRING_POP}
      width="14"
      height="16"
      viewBox="0 0 14 16"
      fill="none"
      className="absolute -top-2 right-2"
      aria-hidden="true"
    >
      <motion.path
        d="M7 1 Q3 7 3 11 A4 4 0 0 0 11 11 Q11 7 7 1 Z"
        fill="var(--color-info-base)"
        fillOpacity="0.9"
        stroke="var(--color-info-dark)"
        strokeWidth="0.7"
        animate={{ y: [0, 1, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Reflejo (highlight) */}
      <ellipse cx="6" cy="6" rx="0.8" ry="1.5" fill="white" fillOpacity="0.6" />
    </motion.svg>
  );
}

/**
 * Signo de exclamación grande sobre la cabeza. (surprised)
 * Pop in con escala 0 → 1.3 → 1, comunica el "¡ah!" puntual.
 */
function SurpriseExclaim() {
  return (
    <motion.svg
      initial={{ scale: 0, y: 8, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0, y: 4, opacity: 0 }}
      transition={SPRING_POP}
      width="16"
      height="22"
      viewBox="0 0 16 22"
      fill="none"
      className="absolute -top-5 left-1/2 -translate-x-1/2"
      aria-hidden="true"
    >
      <path
        d="M6 1 L10 1 L9 14 L7 14 Z"
        fill="var(--color-accent-pink)"
        stroke="var(--color-accent-pink)"
        strokeWidth="0.5"
      />
      <circle cx="8" cy="18" r="2.2" fill="var(--color-accent-pink)" />
    </motion.svg>
  );
}

// =============================================================
// Selector de accesorio
// =============================================================

/**
 * Renderiza el accesorio JSX correspondiente a `(mood, mechanicType)`.
 * Las reglas de selección siguen la lógica de mood + mecánica
 * descrita arriba (`thinking` mecánica-aware, resto universal).
 *
 * Nota implementación: en lugar de devolver un componente
 * (`return BookGlasses`), devolvemos directamente el JSX. El lint
 * `react-hooks/static-components` rechaza el patrón "elige un
 * componente en render" porque se considera componente "creado en
 * render" — incluso cuando el componente devuelto es estable. Inline
 * resuelve la falsa alarma sin sacrificar legibilidad.
 */
function renderAccessory(mood, mechanicType, key) {
  if (mood === 'thinking') {
    if (mechanicType === 'memory') return <BookGlasses key={key} />;
    if (mechanicType === 'association') return <LinkPendant key={key} />;
    if (mechanicType === 'sequence') return <RhythmHeadphones key={key} />;
    return <Glasses key={key} />;
  }
  if (mood === 'happy') return <SparkleEyes key={key} />;
  if (mood === 'celebrating') return <PartyHat key={key} />;
  if (mood === 'encouraging') return <CheerPom key={key} />;
  if (mood === 'sad') return <Bandage key={key} />;
  if (mood === 'pointing') return <PointFinger key={key} />;
  if (mood === 'worried') return <WorryDrop key={key} />;
  if (mood === 'surprised') return <SurpriseExclaim key={key} />;
  return null;
}

export default function MascotAccessory({ mood = 'idle', mechanicType = null }) {
  const { shouldReduceMotion } = useReducedMotion();
  const accessoryKey = `${mood}-${mechanicType ?? 'default'}`;
  const accessory = renderAccessory(mood, mechanicType, accessoryKey);

  if (shouldReduceMotion) {
    return accessory;
  }

  return (
    <AnimatePresence mode="wait">
      {accessory}
    </AnimatePresence>
  );
}

MascotAccessory.propTypes = {
  mood: PropTypes.oneOf([
    'idle', 'happy', 'encouraging', 'celebrating', 'thinking', 'sad',
    'pointing', 'worried', 'surprised'
  ]),
  // Mecánica activa: solo influye en `thinking`. En otros moods se
  // ignora porque la emoción es universal.
  mechanicType: PropTypes.oneOf(['memory', 'association', 'sequence', null]),
};
