/**
 * @fileoverview GameBackdrop — fondo inmersivo para la pantalla de partida.
 *
 * Objetivo: que un niño "salga" del entorno admin/dashboard uniforme y entre
 * a un espacio de juego con atmosfera propia por contexto. Añade tres capas
 * sobre el fondo base:
 *
 *   1) Gradient mesh OKLCH con los colores del tema (geography/animals/...).
 *      Orbes de color en 3-4 puntos de la pantalla, muy desaturados y con blur
 *      alto para que queden como "atmosfera" y no compitan con el contenido.
 *   2) Patron geometrico sutil en el fondo — dots a baja opacidad que acentuan
 *      la sensacion de espacio de juego sin distraer.
 *   3) Iconos decorativos flotantes con animacion lenta (2-3 iconos max,
 *      opacity ~0.12, no intercalados con el gameplay).
 *
 * El componente entero es `pointer-events: none` y vive detras del gameplay.
 *
 * Respeta `prefers-reduced-motion` desactivando las animaciones de los orbes
 * y de los iconos flotantes.
 *
 * @module components/game/GameBackdrop
 */

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Paleta de iconos decorativos por tema. Se usan emojis por simplicidad:
 * consistencia cross-platform + 0 bytes de bundle. Para un fondo decorativo
 * (no semantico) es la opcion mas pragmatica.
 */
const THEME_ICONS = {
  default: ['✦', '◆', '●', '▲'],
  geography: ['🌍', '🗺️', '🧭', '✈️'],
  animals: ['🐾', '🌾', '🌱', '☀️'],
  colors: ['🎨', '✨', '●', '◆'],
  numbers: ['➕', '➖', '✖️', '🔢']
};

/**
 * Paleta de colores OKLCH por tema para los orbes de gradient mesh.
 * Cada tema usa los dos colores principales definidos en index.css
 * (--color-theme-X + --color-theme-X-alt).
 */
const THEME_ORBS = {
  default: {
    primary: 'var(--color-theme-default)',
    alt: 'var(--color-theme-default-alt)'
  },
  geography: {
    primary: 'var(--color-theme-geography)',
    alt: 'var(--color-theme-geography-alt)'
  },
  animals: {
    primary: 'var(--color-theme-animals)',
    alt: 'var(--color-theme-animals-alt)'
  },
  colors: {
    primary: 'var(--color-theme-colors)',
    alt: 'var(--color-theme-colors-alt)'
  },
  numbers: {
    primary: 'var(--color-theme-numbers)',
    alt: 'var(--color-theme-numbers-alt)'
  }
};

/**
 * Posiciones fijas para los iconos flotantes (evitamos aleatoriedad entre
 * renders para no generar jitter visual entre rondas).
 */
const FLOATING_POSITIONS = [
  { top: '8%', left: '6%', delay: 0, duration: 9 },
  { top: '18%', right: '9%', delay: 1.5, duration: 11 },
  { bottom: '22%', left: '4%', delay: 3, duration: 10 },
  { bottom: '12%', right: '6%', delay: 0.7, duration: 12 }
];

function GameBackdrop({ theme = 'default' }) {
  const { shouldReduceMotion } = useReducedMotion();
  const icons = THEME_ICONS[theme] || THEME_ICONS.default;
  const orbs = THEME_ORBS[theme] || THEME_ORBS.default;

  // Estabilizar seleccion de iconos para el tema sin aleatoriedad entre renders
  const floatingIcons = useMemo(
    () => FLOATING_POSITIONS.map((pos, i) => ({ ...pos, icon: icons[i % icons.length] })),
    [icons]
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Orbe principal (top-left): color primario del tema */}
      <motion.div
        className="absolute -top-32 -left-32 h-[60vh] w-[60vh] rounded-full blur-[120px] opacity-30"
        style={{ backgroundColor: orbs.primary }}
        animate={
          shouldReduceMotion
            ? undefined
            : { scale: [1, 1.08, 1], x: [0, 20, 0], y: [0, 15, 0] }
        }
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Orbe secundario (bottom-right): color alt del tema */}
      <motion.div
        className="absolute -bottom-40 -right-40 h-[70vh] w-[70vh] rounded-full blur-[140px] opacity-25"
        style={{ backgroundColor: orbs.alt }}
        animate={
          shouldReduceMotion
            ? undefined
            : { scale: [1.1, 1, 1.1], x: [0, -30, 0], y: [0, -20, 0] }
        }
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Orbe tercero (centro-izquierda): primary con opacity muy baja */}
      <motion.div
        className="absolute top-1/3 -left-20 h-[35vh] w-[35vh] rounded-full blur-[100px] opacity-20"
        style={{ backgroundColor: orbs.primary }}
        animate={
          shouldReduceMotion
            ? undefined
            : { scale: [1, 1.15, 1], x: [0, 10, 0] }
        }
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* Patron de puntos sutil — refuerza "espacio de juego" vs "admin UI" */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '32px 32px'
        }}
      />

      {/* Iconos decorativos flotantes — solo 4, muy sutiles (opacity 0.12) */}
      {floatingIcons.map((f, idx) => (
        <motion.span
          key={`backdrop-icon-${idx}`}
          className="absolute text-4xl select-none opacity-[0.12]"
          style={{
            top: f.top,
            left: f.left,
            right: f.right,
            bottom: f.bottom,
            filter: 'blur(0.5px)'
          }}
          animate={
            shouldReduceMotion
              ? undefined
              : { y: [0, -18, 0], rotate: [0, 6, -6, 0] }
          }
          transition={{
            duration: f.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: f.delay
          }}
        >
          {f.icon}
        </motion.span>
      ))}
    </div>
  );
}

GameBackdrop.propTypes = {
  theme: PropTypes.oneOf(['default', 'geography', 'animals', 'colors', 'numbers'])
};

export default memo(GameBackdrop);
