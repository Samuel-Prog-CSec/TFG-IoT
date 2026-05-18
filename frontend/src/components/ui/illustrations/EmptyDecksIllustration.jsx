import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

/**
 * Ilustración SVG inline para el estado vacío de Mazos.
 * Stack de cartas en perspectiva con brillo del borde superior que evoca
 * "baraja recién abierta". Coherente con el stack effect de DeckCard.
 */
export default function EmptyDecksIllustration({ size = 160, className = '' }) {
  const { shouldReduceMotion } = useReducedMotion();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Stack de cartas de baraja"
      className={className}
    >
      <defs>
        <linearGradient id="empty-decks-top" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-brand-base)" stopOpacity="0.85" />
          <stop offset="50%" stopColor="var(--color-accent-pink)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="var(--color-accent-indigo)" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      <motion.g
        initial={{ y: 0 }}
        animate={shouldReduceMotion ? { y: 0 } : { y: [0, -4, 0] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Sombra base */}
        <ellipse cx="80" cy="130" rx="44" ry="6"
          fill="var(--color-brand-glow)" opacity="0.35" />

        {/* Carta fondo (más atrás) */}
        <g transform="translate(42 56) rotate(-8)">
          <rect width="52" height="72" rx="8"
            fill="var(--color-background-elevated)"
            stroke="var(--color-brand-base)" strokeOpacity="0.3" strokeWidth="1.5" />
        </g>

        {/* Carta media */}
        <g transform="translate(50 48) rotate(4)">
          <rect width="52" height="72" rx="8"
            fill="var(--color-background-elevated)"
            stroke="var(--color-brand-base)" strokeOpacity="0.55" strokeWidth="1.5" />
        </g>

        {/* Carta frente (destacada) */}
        <g transform="translate(54 42)">
          <rect width="52" height="72" rx="8"
            fill="var(--color-background-elevated)"
            stroke="var(--color-brand-base)" strokeOpacity="0.9" strokeWidth="2" />
          {/* Brillo del borde superior */}
          <rect x="2" y="2" width="48" height="4" rx="2" fill="url(#empty-decks-top)" />
          {/* Icono central */}
          <circle cx="26" cy="36" r="11" fill="var(--color-brand-base)" fillOpacity="0.15"
            stroke="var(--color-brand-base)" strokeOpacity="0.8" strokeWidth="1.8" />
          <path d="M21 36 L25 40 L31 32" stroke="var(--color-brand-base)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="10" y="54" width="32" height="2" rx="1" fill="var(--color-text-muted)" opacity="0.5" />
          <rect x="10" y="60" width="20" height="2" rx="1" fill="var(--color-text-muted)" opacity="0.35" />
        </g>
      </motion.g>
    </svg>
  );
}

EmptyDecksIllustration.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};
