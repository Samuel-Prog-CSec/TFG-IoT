import { memo, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { PartyPopper, Flame } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useConfetti } from '../../hooks/useConfetti';

/**
 * Overlay de feedback tras cada respuesta
 * Muestra celebración (confeti) para aciertos o mensaje de ánimo para errores
 * 
 * @param {Object} props
 * @param {'success' | 'error' | null} props.type - Tipo de feedback
 * @param {number} props.points - Puntos ganados/perdidos
 * @param {Function} props.onComplete - Callback cuando termina la animación
 */
function FeedbackOverlay({ type, points = 0, onComplete }) {
  const { shouldReduceMotion } = useReducedMotion();
  const { fireBurst } = useConfetti();

  // Disparar confetti via canvas-confetti para éxito
  useEffect(() => {
    if (type === 'success') {
      fireBurst();
    }
  }, [type, fireBurst]);

  // Permitir cerrar con Escape
  useEffect(() => {
    if (!type) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onComplete) {
        onComplete();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [type, onComplete]);

  const floatingEmojiSeeds = useMemo(
    () =>
      ['⭐', '🌟', '✨', '💫', '🎊'].map((emoji, index) => ({
        id: index,
        emoji,
        x: 10 + index * 18,
        rotation: 30 + index * 40,
        delay: index * 0.1
      })),
    []
  );

  if (!type) return null;

  const isSuccess = type === 'success';
  const feedbackMessage = isSuccess ? '¡Genial!' : '¡Sigue intentando!';

  return (
    <AnimatePresence onExitComplete={onComplete}>
      <motion.div
        role="status"
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
              ? "bg-success-base/10"
              : "bg-error-base/10"
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
          {/* Icono hero (Lucide en vez de emoji para consistencia con el
              resto del design system). */}
          <motion.div
            animate={shouldReduceMotion ? { scale: 1, rotate: 0 } : {
              scale: [1, 1.2, 1],
              rotate: [0, 10, -10, 0]
            }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5 }}
            className="mb-4 flex items-center justify-center"
            aria-hidden="true"
          >
            {isSuccess ? (
              <PartyPopper size={112} className="text-success-base drop-shadow-[0_0_24px_rgba(34,197,94,0.55)]" />
            ) : (
              <Flame size={112} className="text-brand-base drop-shadow-[0_0_20px_rgba(139,92,246,0.5)]" />
            )}
          </motion.div>

          {/* Message */}
          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.1 }}
            className={cn(
              "text-3xl sm:text-4xl font-bold font-display mb-2",
              isSuccess ? "text-success-base" : "text-error-base"
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
                ? "bg-success-base/20 text-success-base shadow-lg shadow-success-base/20"
                : "bg-error-base/20 text-error-base"
            )}
            aria-label={`Puntos: ${isSuccess ? '+' : ''}${points}`}
          >
            {isSuccess ? `+${points}` : points}
          </motion.div>
        </motion.div>

        {/* Confetti ahora se dispara via useConfetti hook (useEffect arriba) */}

        {/* Floating emojis */}
        {isSuccess && !shouldReduceMotion && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {floatingEmojiSeeds.map(seed => (
              <motion.div
                key={`floating-emoji-${seed.id}`}
                initial={{ 
                  x: `${seed.x}%`,
                  y: typeof window !== 'undefined' ? window.innerHeight : 500,
                  scale: 0
                }}
                animate={{ 
                  y: -100,
                  scale: [0, 1, 0],
                  rotate: seed.rotation
                }}
                transition={{ 
                  duration: 1.5,
                  delay: seed.delay,
                  ease: 'easeOut'
                }}
                className="absolute text-4xl"
              >
                {seed.emoji}
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

FeedbackOverlay.propTypes = {
  type: PropTypes.oneOf(['success', 'error']),
  points: PropTypes.number,
  onComplete: PropTypes.func,
};

export default memo(FeedbackOverlay);
