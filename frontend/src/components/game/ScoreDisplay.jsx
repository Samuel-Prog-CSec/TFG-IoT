import { memo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { Star } from 'lucide-react';
import { cn } from '../../lib/utils';

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
  const starsEarned = percentage >= 90 ? 3 : percentage >= 70 ? 2 : percentage >= 50 ? 1 : 0;

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
        {[...Array(maxStars)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, rotate: -180 }}
            animate={{ 
              scale: i < starsEarned ? 1 : 0.8,
              rotate: 0
            }}
            transition={{ 
              delay: i * 0.1,
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
                i < starsEarned
                  ? "fill-warning-base text-warning-base drop-shadow-[0_0_10px_rgba(251,191,36,0.6)]" // TOKEN-EXCEPTION: drop-shadow filter requires direct rgba value
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
  const prevScoreRef = useRef(score);
  const [scoreDelta, setScoreDelta] = useState(null);

  useEffect(() => {
    const delta = score - prevScoreRef.current;
    if (delta > 0) {
      setScoreDelta(delta);
      const timer = setTimeout(() => setScoreDelta(null), 1200);
      prevScoreRef.current = score;
      return () => clearTimeout(timer);
    }
    prevScoreRef.current = score;
  }, [score]);

  return (
    <motion.div
      key={score}
      initial={{ scale: 1.2 }}
      animate={{ scale: 1 }}
      className={cn("flex items-center gap-2 relative", className)}
      aria-label={`Puntuación: ${score} puntos`}
    >
      <Star size={20} className="fill-warning-base text-warning-base" aria-hidden="true" />
      <span className="text-2xl font-bold font-display text-text-primary tabular-nums">{score}</span>
      <AnimatePresence>
        {scoreDelta !== null && (
          <motion.span
            key={`delta-${score}`}
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 0, y: -24 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="absolute -top-1 -right-6 text-sm font-bold font-display text-success-base pointer-events-none"
          >
            +{scoreDelta}
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
