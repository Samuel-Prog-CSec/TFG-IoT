/**
 * @fileoverview Badge pill flotante para feedback de puntos.
 * Componente compacto reutilizado por ChallengeDisplay y MemoryBoard.
 *
 * @module components/game/FloatingPointsBadge
 */

import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

const BADGE_STYLES = {
  success: {
    bg: 'bg-emerald-500/20 border-emerald-500/40',
    text: 'text-emerald-300',
    points: 'text-emerald-400',
    shadow: 'shadow-lg shadow-emerald-500/20',
  },
  error: {
    bg: 'bg-rose-500/20 border-rose-500/40',
    text: 'text-rose-300',
    points: 'text-rose-400',
    shadow: '',
  },
};

export default function FloatingPointsBadge({
  type,
  points = 0,
  message = '',
  shouldReduceMotion = false,
  className,
}) {
  const styles = BADGE_STYLES[type];

  return (
    <AnimatePresence>
      {type && styles && (
        <motion.div
          role="status"
          aria-live="assertive"
          aria-label={`${type === 'success' ? 'Correcto' : 'Incorrecto'}. ${type === 'success' ? 'Más' : ''} ${points} puntos. ${message}`}
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.8 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -30, scale: 0.6 }}
          transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 25 }}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-full',
            'backdrop-blur-md border',
            'bg-black/60',
            styles.bg,
            styles.shadow,
            className
          )}
        >
          <span className={cn('font-bold text-lg font-display', styles.points)}>
            {type === 'success' ? `+${points}` : points}
          </span>
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
  shouldReduceMotion: PropTypes.bool,
  className: PropTypes.string,
};
