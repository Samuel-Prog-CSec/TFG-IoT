import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

/**
 * Ilustración SVG inline para el estado vacío de Sesiones.
 * Muestra una "mesa de juego" abstracta con cartas RFID dispersas y un glow
 * sutil en la base, transmitiendo expectativa de actividad por comenzar.
 *
 * Usa tokens OKLCH del @theme: `--color-brand-base`, `--color-accent-indigo`,
 * `--color-brand-glow`.
 *
 * Respeta `prefers-reduced-motion`: desactiva el "breathe" del glow si el
 * usuario lo tiene habilitado.
 */
export default function EmptySessionsIllustration({ size = 160, className = '' }) {
  const { shouldReduceMotion } = useReducedMotion();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Mesa de juego esperando sesiones"
      className={className}
    >
      <defs>
        <radialGradient id="empty-sessions-glow" cx="50%" cy="75%" r="55%">
          <stop offset="0%" stopColor="var(--color-brand-glow)" stopOpacity="0.45" />
          <stop offset="70%" stopColor="var(--color-brand-glow)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="empty-sessions-table" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-brand-base)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--color-accent-indigo)" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {/* Halo inferior respirando */}
      <motion.ellipse
        cx="80" cy="120" rx="58" ry="14"
        fill="url(#empty-sessions-glow)"
        initial={{ opacity: 0.6 }}
        animate={shouldReduceMotion ? { opacity: 0.6 } : { opacity: [0.4, 0.75, 0.4] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Mesa elíptica */}
      <ellipse
        cx="80" cy="110" rx="56" ry="10"
        fill="url(#empty-sessions-table)"
        stroke="var(--color-brand-base)" strokeOpacity="0.28" strokeWidth="1.5"
      />

      {/* Tres cartas en abanico */}
      <motion.g
        initial={{ y: 0 }}
        animate={shouldReduceMotion ? { y: 0 } : { y: [0, -2, 0] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Carta izquierda */}
        <g transform="translate(36 50) rotate(-14)">
          <rect width="32" height="46" rx="5" fill="var(--color-background-elevated)"
            stroke="var(--color-brand-base)" strokeOpacity="0.55" strokeWidth="1.5" />
          <circle cx="16" cy="14" r="4" fill="var(--color-brand-base)" fillOpacity="0.55" />
          <rect x="6" y="26" width="20" height="2" rx="1" fill="var(--color-brand-base)" fillOpacity="0.35" />
          <rect x="6" y="32" width="14" height="2" rx="1" fill="var(--color-brand-base)" fillOpacity="0.25" />
        </g>
        {/* Carta central (elevada) */}
        <g transform="translate(64 42)">
          <rect width="32" height="48" rx="5" fill="var(--color-background-elevated)"
            stroke="var(--color-brand-base)" strokeOpacity="0.85" strokeWidth="1.8" />
          <circle cx="16" cy="16" r="6" fill="var(--color-brand-base)" fillOpacity="0.8" />
          <circle cx="16" cy="16" r="6" fill="none" stroke="var(--color-brand-base)" strokeWidth="1" opacity="0.6">
            <animate
              attributeName="r"
              values="6;10;6"
              dur="2.4s"
              repeatCount={shouldReduceMotion ? '1' : 'indefinite'}
            />
            <animate
              attributeName="opacity"
              values="0.6;0;0.6"
              dur="2.4s"
              repeatCount={shouldReduceMotion ? '1' : 'indefinite'}
            />
          </circle>
          <rect x="6" y="28" width="20" height="2" rx="1" fill="var(--color-brand-base)" fillOpacity="0.4" />
          <rect x="6" y="34" width="14" height="2" rx="1" fill="var(--color-brand-base)" fillOpacity="0.3" />
        </g>
        {/* Carta derecha */}
        <g transform="translate(92 50) rotate(14)">
          <rect width="32" height="46" rx="5" fill="var(--color-background-elevated)"
            stroke="var(--color-accent-indigo)" strokeOpacity="0.55" strokeWidth="1.5" />
          <circle cx="16" cy="14" r="4" fill="var(--color-accent-indigo)" fillOpacity="0.55" />
          <rect x="6" y="26" width="20" height="2" rx="1" fill="var(--color-accent-indigo)" fillOpacity="0.35" />
          <rect x="6" y="32" width="14" height="2" rx="1" fill="var(--color-accent-indigo)" fillOpacity="0.25" />
        </g>
      </motion.g>
    </svg>
  );
}

EmptySessionsIllustration.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};
