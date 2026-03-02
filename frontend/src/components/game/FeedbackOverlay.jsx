import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

/**
 * Overlay de feedback tras cada respuesta
 * Muestra celebración (confeti) para aciertos o mensaje de ánimo para errores
 * 
 * @param {Object} props
 * @param {'success' | 'error' | null} props.type - Tipo de feedback
 * @param {number} props.points - Puntos ganados/perdidos
 * @param {Function} props.onComplete - Callback cuando termina la animación
 */
function FeedbackOverlay({ type, points = 0, onComplete, shouldReduceMotion = false }) {
  if (!type) return null;

  const isSuccess = type === 'success';
  const feedbackMessage = isSuccess ? '¡Genial!' : '¡Sigue intentando!';

  return (
    <AnimatePresence onExitComplete={onComplete}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-live="assertive"
        aria-label={`Resultado: ${feedbackMessage}. ${isSuccess ? 'Ganaste' : ''} ${points} puntos`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      >
        {/* Background overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden="true"
          className={cn(
            "absolute inset-0",
            isSuccess 
              ? "bg-emerald-500/10" 
              : "bg-rose-500/10"
          )}
        />

        {/* Central feedback */}
        <motion.div
          initial={shouldReduceMotion ? false : { scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 20 }}
          className="relative z-10 text-center"
        >
          {/* Emoji */}
          <motion.div
            animate={shouldReduceMotion ? { scale: 1, rotate: 0 } : {
              scale: [1, 1.2, 1],
              rotate: [0, 10, -10, 0]
            }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5 }}
            className="text-8xl sm:text-9xl mb-4"
            aria-hidden="true"
          >
            {isSuccess ? '🎉' : '💪'}
          </motion.div>

          {/* Message */}
          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.1 }}
            className={cn(
              "text-3xl sm:text-4xl font-bold font-display mb-2",
              isSuccess ? "text-emerald-400" : "text-rose-300"
            )}
          >
            {feedbackMessage}
          </motion.h2>

          {/* Points */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.2 }}
            className={cn(
              "text-2xl font-bold px-6 py-2 rounded-full inline-block",
              isSuccess 
                ? "bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/20" 
                : "bg-rose-500/20 text-rose-400"
            )}
            aria-label={`Puntos: ${isSuccess ? '+' : ''}${points}`}
          >
            {isSuccess ? `+${points}` : points}
          </motion.div>
        </motion.div>

        {/* Confetti for success */}
        {isSuccess && !shouldReduceMotion && <Confetti />}

        {/* Floating emojis */}
        {isSuccess && !shouldReduceMotion && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {['⭐', '🌟', '✨', '💫', '🎊'].map((emoji, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 500),
                  y: typeof window !== 'undefined' ? window.innerHeight : 500,
                  scale: 0
                }}
                animate={{ 
                  y: -100,
                  scale: [0, 1, 0],
                  rotate: Math.random() * 360
                }}
                transition={{ 
                  duration: 1.5,
                  delay: i * 0.1,
                  ease: 'easeOut'
                }}
                className="absolute text-4xl"
              >
                {emoji}
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// Confetti component
function Confetti() {
  const colors = ['#8b5cf6', '#22d3ee', '#f472b6', '#facc15', '#4ade80'];
  const pieces = Array.from({ length: 50 });

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {pieces.map((_, i) => (
        <motion.div
          key={i}
          initial={{
            x: '50%',
            y: '50%',
            scale: 0,
          }}
          animate={{
            x: `${Math.random() * 100}%`,
            y: `${100 + Math.random() * 50}%`,
            scale: [0, 1, 1],
            rotate: Math.random() * 720,
          }}
          transition={{
            duration: 1 + Math.random(),
            ease: 'easeOut',
          }}
          className="absolute"
          style={{
            width: 8 + Math.random() * 8,
            height: 8 + Math.random() * 8,
            backgroundColor: colors[Math.floor(Math.random() * colors.length)],
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}

FeedbackOverlay.propTypes = {
  type: PropTypes.oneOf(['success', 'error']),
  points: PropTypes.number,
  onComplete: PropTypes.func,
  shouldReduceMotion: PropTypes.bool,
};

Confetti.propTypes = {};

export default memo(FeedbackOverlay);
