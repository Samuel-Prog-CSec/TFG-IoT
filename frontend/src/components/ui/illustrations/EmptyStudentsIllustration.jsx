import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../../../hooks/useReducedMotion';

/**
 * Ilustración SVG inline para el estado vacío de Alumnos.
 * Grupo de avatares minimalistas con un "+" prominente en el centro como
 * invitación a crear / aprobar estudiantes.
 */
export default function EmptyStudentsIllustration({ size = 160, className = '' }) {
  const { shouldReduceMotion } = useReducedMotion();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Grupo de alumnos"
      className={className}
    >
      <defs>
        <linearGradient id="empty-students-plus" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-brand-base)" />
          <stop offset="100%" stopColor="var(--color-accent-indigo)" />
        </linearGradient>
      </defs>

      {/* Avatar izquierdo */}
      <motion.g
        initial={{ y: 0 }}
        animate={shouldReduceMotion ? { y: 0 } : { y: [0, -3, 0] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <g transform="translate(22 62)">
          <circle cx="18" cy="18" r="18" fill="var(--color-background-elevated)"
            stroke="var(--color-brand-base)" strokeOpacity="0.5" strokeWidth="1.8" />
          <circle cx="18" cy="14" r="5" fill="var(--color-brand-base)" fillOpacity="0.6" />
          <path d="M8 30 Q18 22 28 30" stroke="var(--color-brand-base)" strokeOpacity="0.6" strokeWidth="1.8"
            strokeLinecap="round" fill="none" />
        </g>
      </motion.g>

      {/* Avatar derecho */}
      <motion.g
        initial={{ y: 0 }}
        animate={shouldReduceMotion ? { y: 0 } : { y: [0, -3, 0] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
      >
        <g transform="translate(104 62)">
          <circle cx="18" cy="18" r="18" fill="var(--color-background-elevated)"
            stroke="var(--color-accent-indigo)" strokeOpacity="0.5" strokeWidth="1.8" />
          <circle cx="18" cy="14" r="5" fill="var(--color-accent-indigo)" fillOpacity="0.6" />
          <path d="M8 30 Q18 22 28 30" stroke="var(--color-accent-indigo)" strokeOpacity="0.6" strokeWidth="1.8"
            strokeLinecap="round" fill="none" />
        </g>
      </motion.g>

      {/* Avatar central destacado con + */}
      <motion.g
        initial={{ scale: 1 }}
        animate={shouldReduceMotion ? { scale: 1 } : { scale: [1, 1.04, 1] }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: '80px 80px' }}
      >
        <circle cx="80" cy="80" r="28" fill="var(--color-brand-glow)" opacity="0.5" />
        <circle cx="80" cy="80" r="24" fill="url(#empty-students-plus)" />
        <path d="M70 80 H90 M80 70 V90" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}

EmptyStudentsIllustration.propTypes = {
  size: PropTypes.number,
  className: PropTypes.string,
};
