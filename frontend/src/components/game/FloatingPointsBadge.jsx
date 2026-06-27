/**
 * @fileoverview Badge pill flotante para feedback de puntos.
 * Componente compacto reutilizado por ChallengeDisplay y MemoryBoard.
 *
 * @module components/game/FloatingPointsBadge
 */

import { m as motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const BADGE_STYLES = {
  success: {
    bg: 'bg-success-base/20 border-success-base/40',
    text: 'text-success-base',
    points: 'text-success-base',
    shadow: 'shadow-lg shadow-success-base/20',
  },
  error: {
    bg: 'bg-error-base/20 border-error-base/40',
    text: 'text-error-base',
    points: 'text-error-base',
    shadow: '',
  },
};

export default function FloatingPointsBadge({
  type,
  points = 0,
  message = '',
  className,
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const styles = BADGE_STYLES[type];
  const isSuccess = type === 'success';

  // `points` llega del backend como `pointsAwarded`: positivo en acierto y
  // negativo (config.penaltyPerError) en penalización. Es 0 cuando no hay
  // penalización configurada o es un timeout: en ese caso NO mostramos número
  // (un "0"/"−0" confunde) y dejamos solo el mensaje.
  let pointsLabel = null;
  if (isSuccess) {
    pointsLabel = `+${points}`;
  } else if (points < 0) {
    pointsLabel = `−${Math.abs(points)}`;
  }

  // aria-label compuesto fuera del JSX para evitar ternarios/templates anidados.
  const resultWord = isSuccess ? 'Correcto' : 'Incorrecto';
  const pointsSpeechVerb = isSuccess ? 'Más' : 'Menos';
  const pointsSpeech = pointsLabel ? `${pointsSpeechVerb} ${Math.abs(points)} puntos.` : '';
  const ariaLabel = `${resultWord}. ${pointsSpeech} ${message}`.replace(/\s+/g, ' ').trim();

  return (
    <AnimatePresence>
      {type && styles && (
        <motion.div
          role="status"
          aria-live="assertive"
          aria-label={ariaLabel}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.8 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : {
            opacity: 0,
            y: type === 'success' ? -50 : -20,
            scale: type === 'success' ? 0.8 : 0.6,
          }}
          transition={shouldReduceMotion ? { duration: 0 } : {
            type: 'spring',
            stiffness: type === 'success' ? 350 : 400,
            damping: type === 'success' ? 18 : 25,
          }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-full',
            'backdrop-blur-md border',
            'bg-backdrop',
            styles.bg,
            styles.shadow,
            className
          )}
        >
          {pointsLabel && (
            <span className={cn('font-bold text-lg font-display', styles.points)}>
              {pointsLabel}
            </span>
          )}
          {message && (
            <span className={cn('text-sm font-medium', styles.text)}>
              {message}
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

FloatingPointsBadge.propTypes = {
  type: PropTypes.oneOf(['success', 'error']),
  points: PropTypes.number,
  message: PropTypes.string,
  className: PropTypes.string,
};
