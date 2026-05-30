/**
 * @fileoverview Overlay que aparece entre la fase memorizing y reproducing
 * con un mensaje + cuenta atrás ("Reproduce la secuencia").
 *
 * La duración del countdown se deriva del `durationMs` recibido por prop,
 * que el frontend toma del evento `sequence_phase_reproducing.gracePeriodMs`
 * (backend `SEQUENCE_REPRODUCE_GRACE_MS`, hoy 2400ms). Si el backend ajusta
 * el grace, el overlay queda sincronizado sin tocar el frontend.
 *
 * Respeta `prefers-reduced-motion`: sin la animación de scale, sólo fade.
 * Usa `aria-live="polite"` para que el lector de pantalla anuncie la
 * transición sin interrumpir lo que estuviera leyendo.
 */
import { memo, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Eye } from 'lucide-react';

// Fallback usado si el backend no envía `gracePeriodMs` (eventos antiguos
// o tests). Coincide con `SEQUENCE_REPRODUCE_GRACE_MS` del backend.
const DEFAULT_DURATION_MS = 2400;

function PhaseTransitionOverlay({
  visible,
  label = 'Reproduce la secuencia',
  reduceMotion = false,
  durationMs = DEFAULT_DURATION_MS
}) {
  const initialCount = Math.max(1, Math.ceil(durationMs / 1000));
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    if (!visible) {
      setCount(initialCount);
      return undefined;
    }
    setCount(initialCount);
    const interval = setInterval(() => {
      setCount(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, initialCount]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background-base/85 backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <motion.div
            initial={reduceMotion ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 18 }}
            className="size-20 rounded-full bg-accent-amber/20 flex items-center justify-center"
          >
            <Eye size={40} className="text-accent-amber" aria-hidden="true" />
          </motion.div>
          <p className="text-2xl font-bold font-display gradient-text-brand">{label}</p>
          <p className="text-text-muted text-sm">Reproduce la secuencia · empieza por la primera carta</p>
          <div
            className="text-5xl font-bold font-display text-text-primary tabular-nums"
            aria-hidden="true"
          >
            {count > 0 ? count : '¡Ya!'}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

PhaseTransitionOverlay.propTypes = {
  visible: PropTypes.bool.isRequired,
  label: PropTypes.string,
  reduceMotion: PropTypes.bool,
  durationMs: PropTypes.number
};

export default memo(PhaseTransitionOverlay);
