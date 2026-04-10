import { motion } from 'framer-motion';
import { useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import MascotAccessory from './MascotAccessory';

const bodyAnimation = {
  float: {
    y: [0, -8, 0],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
  },
  bounce: {
    y: [0, -15, 0],
    scale: [1, 1.1, 1],
    transition: { duration: 0.5, repeat: Infinity }
  },
  jump: {
    y: [0, -30, 0],
    rotate: [0, 10, -10, 0],
    transition: { duration: 0.6, repeat: Infinity }
  },
  nod: {
    rotate: [0, 5, -5, 0],
    transition: { duration: 1, repeat: Infinity }
  },
  tilt: {
    rotate: [0, 15, 0],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
  },
  sway: {
    x: [-5, 5, -5],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
  },
};

const expressions = {
  idle: { bodyAnim: 'float' },
  happy: { bodyAnim: 'bounce' },
  encouraging: { bodyAnim: 'nod' },
  celebrating: { bodyAnim: 'jump' },
  thinking: { bodyAnim: 'tilt' },
  sad: { bodyAnim: 'sway' },
};

const messagePool = {
  idle: ['¡Hola, amigo!', '¡Vamos a jugar!', '¿Listo?'],
  happy: ['¡Muy bien hecho!', '¡Eres genial!', '¡Así se hace!', '¡Fantástico!', '¡Bravo!'],
  encouraging: ['¡Venga, tú puedes!', '¡Ánimo!', '¡Tu siguiente será mejor!', '¡No te rindas!'],
  celebrating: ['¡GENIAL, CAMPEÓN!', '¡INCREÍBLE!', '¡ERES UNA ESTRELLA!'],
  thinking: ['Piensa bien...', 'Tómate tu tiempo...', '¿Cuál será?'],
  sad: ['¡Otra vez, tú puedes!', '¡Inténtalo de nuevo!', '¡Todos nos equivocamos!'],
};

/**
 * Mascota animada híbrida (emoji 🦉 + accesorios SVG) que acompaña al niño durante el juego.
 * El emoji base es siempre 🦉 para consistencia de identidad.
 * La expresividad se logra con accesorios SVG superpuestos y animaciones corporales.
 *
 * @param {Object} props
 * @param {'idle' | 'happy' | 'encouraging' | 'celebrating' | 'thinking' | 'sad'} props.mood
 * @param {string} props.message - Mensaje contextual en burbuja de diálogo
 * @param {'left' | 'right'} props.position
 */
export default function CharacterMascot({
  mood = 'idle',
  message,
  position = 'left',
  className
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const lastMsgRef = useRef(-1);

  const expr = expressions[mood];

  // Selecciona mensaje rotativo evitando repetir el ultimo — memoizado por mood
  const rotatingMessage = useMemo(() => {
    const pool = messagePool[mood] || messagePool.idle;
    if (pool.length <= 1) return pool[0];
    let idx;
    do {
      idx = Math.floor(Math.random() * pool.length);
    } while (idx === lastMsgRef.current && pool.length > 1);
    lastMsgRef.current = idx;
    return pool[idx];
  }, [mood]);

  const displayMessage = message || rotatingMessage;

  return (
    <div className={cn(
      "relative",
      position === 'left' ? 'items-start' : 'items-end',
      className
    )}>
      {/* Speech bubble */}
      {displayMessage && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          key={displayMessage}
          className={cn(
            "absolute -top-20 max-w-48 z-10",
            "bg-glass-bg backdrop-blur-sm",
            "px-3 py-1.5 rounded-2xl",
            "border border-glass-border",
            "text-text-primary text-sm font-medium",
            position === 'left' ? 'left-0' : 'right-0'
          )}
        >
          {displayMessage}
          {/* Bubble tail */}
          <div className={cn(
            "absolute -bottom-2 size-4",
            "bg-glass-bg border-l border-b border-glass-border",
            "rotate-[-45deg]",
            position === 'left' ? 'left-4' : 'right-4'
          )} />
        </motion.div>
      )}

      {/* Mascot container */}
      <motion.div
        animate={shouldReduceMotion ? { x: 0, y: 0, scale: 1, rotate: 0 } : bodyAnimation[expr.bodyAnim]}
        className="relative"
      >
        {/* Glow effect */}
        <div className={cn(
          "absolute inset-0 rounded-full blur-xl",
          mood === 'celebrating' && "bg-warning-base/30",
          mood === 'happy' && "bg-success-base/20",
          mood === 'encouraging' && "bg-brand-light/20",
          (mood === 'idle' || mood === 'thinking') && "bg-text-muted/10"
        )} />

        {/* Mascot emoji — always 🦉 for identity consistency */}
        <motion.div
          key={mood}
          className="relative text-6xl select-none filter drop-shadow-lg"
          animate={!shouldReduceMotion && (mood === 'happy' || mood === 'celebrating') ? {
            scale: [1, 1.1, 1],
          } : { scale: 1 }}
          transition={{ duration: 0.5, repeat: !shouldReduceMotion && (mood === 'happy' || mood === 'celebrating') ? Infinity : 0 }}
        >
          🦉
          {/* SVG accessory overlay */}
          <MascotAccessory mood={mood} />
        </motion.div>

        {/* Extra decorations for celebrating */}
        {mood === 'celebrating' && !shouldReduceMotion && (
          <>
            <motion.span
              className="absolute -top-2 -right-2 text-xl"
              animate={{
                scale: [0, 1, 0],
                rotate: [0, 180, 360]
              }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              ⭐
            </motion.span>
            <motion.span
              className="absolute -top-1 -left-2 text-lg"
              animate={{
                scale: [0, 1, 0],
              }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.3 }}
            >
              ✨
            </motion.span>
          </>
        )}
      </motion.div>
    </div>
  );
}

CharacterMascot.propTypes = {
  mood: PropTypes.oneOf(['idle', 'happy', 'encouraging', 'celebrating', 'thinking', 'sad']),
  message: PropTypes.string,
  position: PropTypes.oneOf(['left', 'right']),
  className: PropTypes.string
};
