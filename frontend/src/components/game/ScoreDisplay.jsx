import { memo, useState, useEffect, useRef } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { Star } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// FE-9: eliminado el componente `ScoreDisplay` (export default) — código muerto: no
// se importaba en ningún sitio (solo `ScoreDisplayCompactMemo`) y su cálculo de
// estrellas usaba umbrales propios (90/70/50 sobre accuracy, escala de 3★) que
// CONTRADECÍAN la escala canónica de 5 niveles sobre `score/maxScore` (`calculateStars`
// en lib/utils.js). Se conserva solo la versión compacta usada por el HUD.

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

export const ScoreDisplayCompactMemo = memo(ScoreDisplayCompact);
