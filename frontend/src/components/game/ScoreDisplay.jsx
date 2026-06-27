import { memo, useState, useEffect, useRef } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { Star } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Display de puntuación con estrellas animadas
 * Diseñado para ser visualmente atractivo para niños
 * 
 * @param {Object} props
 * @param {number} props.score - Puntuación actual
 * @param {number} props.maxStars - Número máximo de estrellas
 * @param {number} props.correctAnswers - Respuestas correctas
 * @param {number} props.totalQuestions - Total de preguntas
 * @param {string} [props.className] - Clases adicionales
 */
function ScoreDisplay({ 
  score = 0, 
  maxStars = 3,
  correctAnswers = 0,
  totalQuestions = 5,
  className 
}) {
  // Calcular estrellas basado en el porcentaje de respuestas correctas
  const percentage = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
  const starsEarned = (() => {
    if (percentage >= 90) return 3;
    if (percentage >= 70) return 2;
    if (percentage >= 50) return 1;
    return 0;
  })();

  return (
    <div 
      className={cn("flex flex-col items-center gap-3", className)}
      aria-label={`Puntuación: ${score} puntos, ${starsEarned} de ${maxStars} estrellas`}
    >
      {/* Estrellas */}
      <div 
        className="flex items-center gap-2"
        role="img"
        aria-label={`${starsEarned} estrellas de ${maxStars}`}
      >
        {Array.from({ length: maxStars }, (_, i) => ({ id: `star-${i}`, index: i })).map(star => (
          <motion.div
            key={star.id}
            initial={{ scale: 0, rotate: -180 }}
            animate={{
              scale: star.index < starsEarned ? 1 : 0.8,
              rotate: 0
            }}
            transition={{
              delay: star.index * 0.1,
              type: 'spring',
              stiffness: 300,
              damping: 15
            }}
          >
            <Star
              size={32}
              aria-hidden="true"
              className={cn(
                "transition-colors duration-300",
                star.index < starsEarned
                  ? "fill-warning-base text-warning-base drop-shadow-[0_0_10px_var(--color-warning-glow)]"
                  : "fill-background-surface text-text-disabled"
              )}
            />
          </motion.div>
        ))}
      </div>

      {/* Score numérico con animación */}
      <motion.div
        key={score}
        initial={{ scale: 1.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative"
      >
        <div 
          className="text-4xl font-bold font-display gradient-text-brand tabular-nums"
          aria-live="polite"
        >
          {score}
        </div>
        <div className="text-xs text-text-muted text-center mt-1">puntos</div>
      </motion.div>
    </div>
  );
}

ScoreDisplay.propTypes = {
  score: PropTypes.number,
  maxStars: PropTypes.number,
  correctAnswers: PropTypes.number,
  totalQuestions: PropTypes.number,
  className: PropTypes.string,
};

/**
 * Versión compacta del ScoreDisplay para el HUD
 */
function ScoreDisplayCompact({ score = 0, className }) {
  const { shouldReduceMotion } = useReducedMotion();
  // Clamp UI a 0 — el backend reduce score con penalizaciones y, aunque hay
  // un clamp en el modelo Mongoose, durante la transición de eventos socket
  // (incorrect → score actualizado) la UI puede recibir valores negativos
  // intermedios. QA 04/05 vio "-2" en pantalla durante Secuencia.
  const displayScore = Math.max(0, score);
  const prevScoreRef = useRef(displayScore);
  const [scoreDelta, setScoreDelta] = useState(null);

  useEffect(() => {
    const delta = displayScore - prevScoreRef.current;
    prevScoreRef.current = displayScore;
    // Animar tanto la SUMA (acierto) como la RESTA (penalización). Antes solo
    // entraba `delta > 0`, por eso una penalización bajaba el marcador sin
    // mostrar nunca la animación de resta (bug reportado por el usuario).
    if (delta === 0) return undefined;
    setScoreDelta(delta);
    const timer = setTimeout(() => setScoreDelta(null), 1200);
    return () => clearTimeout(timer);
  }, [displayScore]);

  const isPenalty = scoreDelta !== null && scoreDelta < 0;

  return (
    <motion.div
      key={displayScore}
      initial={shouldReduceMotion ? false : { scale: 1.2 }}
      animate={{ scale: 1 }}
      className={cn("flex items-center gap-2 relative", className)}
      aria-label={`Puntuación: ${displayScore} puntos`}
    >
      <Star size={20} className="fill-warning-base text-warning-base" aria-hidden="true" />
      <span className="text-2xl font-bold font-display text-text-primary tabular-nums">{displayScore}</span>
      <AnimatePresence>
        {scoreDelta !== null && scoreDelta !== 0 && (
          <motion.span
            key={`delta-${displayScore}-${scoreDelta}`}
            initial={{ opacity: 1, y: 0 }}
            // Acierto: flota hacia arriba en verde. Penalización: flota hacia
            // ABAJO en rojo, reforzando visualmente la pérdida de puntos.
            animate={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: isPenalty ? 24 : -24 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0.4 } : { duration: 1, ease: 'easeOut' }}
            className={cn(
              'absolute -top-1 -right-6 text-sm font-bold font-display pointer-events-none tabular-nums',
              isPenalty ? 'text-error-base' : 'text-success-base'
            )}
          >
            {isPenalty ? `−${Math.abs(scoreDelta)}` : `+${scoreDelta}`}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

ScoreDisplayCompact.propTypes = {
  score: PropTypes.number,
  className: PropTypes.string,
};

export default memo(ScoreDisplay);
export const ScoreDisplayCompactMemo = memo(ScoreDisplayCompact);
