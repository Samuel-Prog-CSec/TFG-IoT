import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

/**
 * Ilustración SVG inline para el estado vacío de Contextos.
 * Paisaje minimalista con tres iconos representando dominios típicos
 * (libro / animal / mundo) dispuestos como cartas de referencia.
 */
export default function EmptyContextsIllustration({ size = 160, className = '' }) {
  const { shouldReduceMotion } = useReducedMotion();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Contextos educativos"
      className={className}
    >
      <defs>
        <linearGradient id="empty-ctx-horizon" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--color-accent-cyan)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--color-brand-base)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Fondo horizonte */}
      <rect x="16" y="30" width="128" height="90" rx="14" fill="url(#empty-ctx-horizon)" />
      <rect x="16" y="30" width="128" height="90" rx="14" fill="none"
        stroke="var(--color-brand-base)" strokeOpacity="0.2" strokeWidth="1.5" />

      {/* Tres tokens, ligeros bobbing desfasados */}
      <motion.g
        initial={{ y: 0 }}
        animate={shouldReduceMotion ? { y: 0 } : { y: [0, -3, 0] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Libro */}
        <g transform="translate(34 62)">
          <rect width="26" height="34" rx="3" fill="var(--color-brand-base)" fillOpacity="0.2"
            stroke="var(--color-brand-base)" strokeOpacity="0.75" strokeWidth="1.8" />
          <line x1="13" y1="4" x2="13" y2="30" stroke="var(--color-brand-base)" strokeOpacity="0.75" strokeWidth="1.5" />
          <line x1="5" y1="10" x2="10" y2="10" stroke="var(--color-brand-base)" strokeOpacity="0.55" strokeWidth="1.2" />
          <line x1="5" y1="16" x2="10" y2="16" stroke="var(--color-brand-base)" strokeOpacity="0.55" strokeWidth="1.2" />
        </g>
      </motion.g>

      <motion.g
        initial={{ y: 0 }}
        animate={shouldReduceMotion ? { y: 0 } : { y: [0, -4, 0] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
      >
        {/* Globo / mundo (central) */}
        <g transform="translate(68 58)">
          <circle cx="12" cy="16" r="15" fill="var(--color-accent-indigo)" fillOpacity="0.22"
            stroke="var(--color-accent-indigo)" strokeOpacity="0.9" strokeWidth="1.8" />
          <ellipse cx="12" cy="16" rx="15" ry="6" fill="none"
            stroke="var(--color-accent-indigo)" strokeOpacity="0.55" strokeWidth="1.2" />
          <line x1="12" y1="1" x2="12" y2="31" stroke="var(--color-accent-indigo)" strokeOpacity="0.55" strokeWidth="1.2" />
        </g>
      </motion.g>

      <motion.g
        initial={{ y: 0 }}
        animate={shouldReduceMotion ? { y: 0 } : { y: [0, -3, 0] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
      >
        {/* Animal (huella estilizada) */}
        <g transform="translate(108 62)">
          <circle cx="6" cy="10" r="3.5" fill="var(--color-accent-pink)" fillOpacity="0.7" />
          <circle cx="14" cy="6" r="3.5" fill="var(--color-accent-pink)" fillOpacity="0.7" />
          <circle cx="22" cy="10" r="3.5" fill="var(--color-accent-pink)" fillOpacity="0.7" />
          <ellipse cx="14" cy="22" rx="9" ry="8" fill="var(--color-accent-pink)" fillOpacity="0.45"
            stroke="var(--color-accent-pink)" strokeOpacity="0.85" strokeWidth="1.5" />
        </g>
      </motion.g>

      {/* Línea base punteada */}
      <line x1="26" y1="118" x2="134" y2="118" stroke="var(--color-brand-base)"
        strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 4" />
    </svg>
  );
}

EmptyContextsIllustration.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};
