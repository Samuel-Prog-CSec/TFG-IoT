/**
 * @fileoverview Overlay que aparece entre la fase memorizing y reproducing
 * con un mensaje + cuenta atrás 2s ("Reproduce la secuencia").
 *
 * Respeta `prefers-reduced-motion`: sin la animación de scale, sólo fade.
 * Usa `aria-live="polite"` para que el lector de pantalla anuncie la
 * transición sin interrumpir lo que estuviera leyendo.
 */
import { memo, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye } from 'lucide-react';

const COUNTDOWN_SECONDS = 2;

function PhaseTransitionOverlay({ visible, label = 'Reproduce la secuencia', reduceMotion = false }) {
  const [count, setCount] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!visible) {
      setCount(COUNTDOWN_SECONDS);
      return undefined;
    }
    setCount(COUNTDOWN_SECONDS);
    const interval = setInterval(() => {
      setCount(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [visible]);

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
  reduceMotion: PropTypes.bool
};

export default memo(PhaseTransitionOverlay);
