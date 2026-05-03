/**
 * @fileoverview Carta individual del SequenceBoard.
 *
 * Estados visuales:
 *  - `hidden`: cara oculta (boca abajo) durante la fase reproducing.
 *  - `correct`: revelada con borde verde + check Lucide en esquina.
 *  - `blocked`: revelada con borde rojo + XCircle en esquina + overlay 30%.
 *  - `timedOut`: revelada con borde ámbar + Clock3 en esquina + overlay 30%.
 *
 * El flip 3D reutiliza las clases CSS de MemoryBoard (`memory-card-flip`,
 * `memory-card-inner`, `memory-card-back`, `memory-card-face`) que ya están
 * en el bundle.
 *
 * Durante memorizing, las cartas se muestran *abiertas* sin estado de
 * acierto/fallo (el alumno está leyendo la secuencia visualmente).
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Clock3 } from 'lucide-react';
import CardAssetPreview from '../../ui/CardAssetPreview';
import { cn } from '../../../lib/utils';
import { SEQUENCE_CARD_STATES } from '../../../constants/sequenceConfig';

const STATUS_CONFIG = Object.freeze({
  [SEQUENCE_CARD_STATES.CORRECT]: {
    border: 'border-success-base',
    overlay: null,
    Icon: CheckCircle2,
    iconClass: 'text-success-base',
    label: 'Carta acertada'
  },
  [SEQUENCE_CARD_STATES.BLOCKED]: {
    border: 'border-error-base',
    overlay: 'bg-error-base/30',
    Icon: XCircle,
    iconClass: 'text-error-base',
    label: 'Carta fallada'
  },
  [SEQUENCE_CARD_STATES.TIMED_OUT]: {
    border: 'border-accent-amber/70',
    overlay: 'bg-accent-amber/30',
    Icon: Clock3,
    iconClass: 'text-accent-amber',
    label: 'Carta sin completar a tiempo'
  }
});

function SequenceCard({
  uid,
  assignedValue,
  displayData,
  status = SEQUENCE_CARD_STATES.HIDDEN,
  highlightOrder,
  isFaceUp,
  reduceMotion = false
}) {
  const isRevealed = status !== SEQUENCE_CARD_STATES.HIDDEN || isFaceUp;
  const statusConfig = STATUS_CONFIG[status];

  return (
    <div className="relative w-full aspect-square">
      <motion.div
        className={cn(
          'memory-card-flip h-full w-full',
          isRevealed && 'memory-card-flipped',
          highlightOrder != null && !reduceMotion && 'sequence-card-highlight'
        )}
      >
        <div className="memory-card-inner">
          {/* Cara oculta (back) */}
          <div className="memory-card-back rounded-xl bg-gradient-to-br from-brand-base/20 to-accent-cyan/15 border-2 border-border-default flex items-center justify-center text-text-muted/40 font-display text-3xl">
            ?
          </div>

          {/* Cara visible */}
          <div
            className={cn(
              'memory-card-face rounded-xl bg-background-base/80 border-2 overflow-hidden relative',
              statusConfig?.border || 'border-border-default'
            )}
          >
            <CardAssetPreview
              asset={displayData || { display: assignedValue || uid }}
              className="h-full w-full"
              fit="contain"
              loading="eager"
              fallbackLabel={assignedValue || uid}
              largeFallback
            />

            {/* Overlay translúcido para fail/timeout */}
            {statusConfig?.overlay && (
              <div
                className={cn('absolute inset-0 pointer-events-none', statusConfig.overlay)}
                aria-hidden="true"
              />
            )}

            {/* Icono Lucide en esquina superior derecha */}
            {statusConfig?.Icon && (
              <div
                className="absolute top-1.5 right-1.5 size-7 rounded-full bg-background-base/90 flex items-center justify-center shadow"
                aria-label={statusConfig.label}
                role="img"
              >
                <statusConfig.Icon size={18} className={statusConfig.iconClass} />
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Numerito de orden durante memorizing */}
      <AnimatePresence>
        {highlightOrder != null && (
          <motion.div
            key={`order-${uid}`}
            initial={reduceMotion ? false : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 20 }}
            className="absolute -top-2 -left-2 size-9 rounded-full bg-accent-amber text-background-base font-bold font-display text-lg flex items-center justify-center shadow-lg"
            aria-hidden="true"
          >
            {highlightOrder}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

SequenceCard.propTypes = {
  uid: PropTypes.string.isRequired,
  assignedValue: PropTypes.string,
  displayData: PropTypes.object,
  status: PropTypes.oneOf(Object.values(SEQUENCE_CARD_STATES)),
  highlightOrder: PropTypes.number,
  isFaceUp: PropTypes.bool,
  reduceMotion: PropTypes.bool
};

export default memo(SequenceCard);
