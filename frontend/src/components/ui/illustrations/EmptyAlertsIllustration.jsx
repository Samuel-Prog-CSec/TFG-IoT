import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

/**
 * Ilustración SVG inline para el estado vacío de Alertas.
 * Campana en reposo con dos ondas apagadas descendiendo, transmitiendo
 * calma: no hay nada que requiera atencion del profesor.
 *
 * Respeta `prefers-reduced-motion`: reposo total si el usuario lo tiene activado.
 */
export default function EmptyAlertsIllustration({ size = 160, className = '' }) {
  const { shouldReduceMotion } = useReducedMotion();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Sin alertas, todo en calma"
      className={className}
    >
      <defs>
        <radialGradient id="empty-alerts-glow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="var(--color-success-glow)" stopOpacity="0.5" />
          <stop offset="70%" stopColor="var(--color-success-glow)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="empty-alerts-bell" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-background-elevated)" />
          <stop offset="100%" stopColor="var(--color-background-surface)" />
        </linearGradient>
      </defs>

      {/* Halo de calma detras de la campana */}
      <motion.circle
        cx="80" cy="72" r="48"
        fill="url(#empty-alerts-glow)"
        initial={{ opacity: 0.55 }}
        animate={shouldReduceMotion ? { opacity: 0.55 } : { opacity: [0.4, 0.65, 0.4] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Campana (silueta minimal) */}
      <motion.g
        initial={{ rotate: 0 }}
        animate={shouldReduceMotion ? { rotate: 0 } : { rotate: [-1.5, 1.5, -1.5] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '80px 48px' }}
      >
        <path
          d="M60 88 Q60 60 80 54 Q100 60 100 88 L104 94 L56 94 Z"
          fill="url(#empty-alerts-bell)"
          stroke="var(--color-success-base)" strokeOpacity="0.55" strokeWidth="1.8"
          strokeLinejoin="round"
        />
        {/* Remache superior */}
        <circle cx="80" cy="50" r="3" fill="var(--color-success-base)" fillOpacity="0.7" />
        {/* Badentro (badajo) caido en reposo */}
        <circle cx="80" cy="88" r="3.5" fill="var(--color-success-base)" fillOpacity="0.55" />
      </motion.g>

      {/* Base horizontal donde reposa */}
      <rect x="52" y="96" width="56" height="2" rx="1"
        fill="var(--color-success-base)" fillOpacity="0.35" />

      {/* Ondas apagadas descendentes: sugieren "silencio" */}
      <motion.path
        d="M40 116 Q60 112 80 116 T120 116"
        fill="none"
        stroke="var(--color-success-base)" strokeOpacity="0.4" strokeWidth="1.6"
        strokeLinecap="round" strokeDasharray="3 5"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={shouldReduceMotion ? { pathLength: 1, opacity: 0.5 } : { pathLength: 1, opacity: [0, 0.5, 0] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.path
        d="M32 128 Q56 124 80 128 T128 128"
        fill="none"
        stroke="var(--color-success-base)" strokeOpacity="0.28" strokeWidth="1.4"
        strokeLinecap="round" strokeDasharray="2 6"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={shouldReduceMotion ? { pathLength: 1, opacity: 0.35 } : { pathLength: 1, opacity: [0, 0.35, 0] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
      />
    </svg>
  );
}

EmptyAlertsIllustration.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};
