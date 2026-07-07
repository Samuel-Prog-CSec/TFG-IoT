/**
 * @fileoverview Dots horizontales que indican el progreso del cursor dentro
 * de una secuencia (X de N). Cada dot puede estar en estado:
 *  - `correct` (verde): la carta de esa posición se acertó.
 *  - `blocked` (rojo): se falló y bloqueó.
 *  - `timedOut` (ámbar): la ronda terminó sin alcanzar esa posición.
 *  - `pending`: aún por jugar.
 */
import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { cn } from '../../../lib/utils';

const STATUS_COLORS = {
  correct: 'bg-success-base',
  blocked: 'bg-error-base',
  timedOut: 'bg-accent-amber',
  current: 'bg-brand-base ring-2 ring-brand-base/40 ring-offset-2 ring-offset-background-base',
  pending: 'bg-background-elevated border border-border-default'
};

const EMPTY_STATUSES = [];

export default function SequenceProgressDots({ length, statuses = EMPTY_STATUSES, cursor = 0, reduceMotion = false }) {
  const dots = Array.from({ length }, (_, index) => {
    if (statuses[index]) return statuses[index];
    if (index === cursor) return 'current';
    return 'pending';
  });

  return (
    <div
      className="flex items-center justify-center gap-2"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={length}
      aria-valuenow={Math.min(cursor, length)}
      aria-label={`Progreso de la secuencia: ${cursor} de ${length}`}
    >
      {dots.map((status, index) => (
        <motion.span
          key={`dot-${index}`}
          className={cn(
            'size-3 rounded-full transition-colors',
            STATUS_COLORS[status] || STATUS_COLORS.pending
          )}
          initial={reduceMotion ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduceMotion ? { duration: 0 } : { delay: index * 0.04, type: 'spring' }}
        />
      ))}
    </div>
  );
}

SequenceProgressDots.propTypes = {
  length: PropTypes.number.isRequired,
  statuses: PropTypes.arrayOf(PropTypes.oneOf(['correct', 'blocked', 'timedOut', 'current', 'pending'])),
  cursor: PropTypes.number,
  reduceMotion: PropTypes.bool
};
