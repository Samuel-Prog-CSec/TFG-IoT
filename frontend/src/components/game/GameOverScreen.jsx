import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { Star, Trophy, RotateCcw, Home } from 'lucide-react';
import { cn, calculateStars } from '../../lib/utils';
import ButtonPremium from '../ui/ButtonPremium';

/**
 * Pantalla de fin de juego
 * Muestra resultados con celebración visual
 * 
 * @param {Object} props
 * @param {number} props.score - Puntuación final
 * @param {number} props.correctAnswers - Respuestas correctas
 * @param {number} props.totalRounds - Total de rondas
 * @param {number} props.bestScore - Mejor puntuación histórica
 * @param {Function} props.onPlayAgain - Callback para jugar de nuevo
 * @param {Function} props.onGoHome - Callback para volver al inicio
 */
function GameOverScreen({
  score = 0,
  correctAnswers = 0,
  totalRounds = 5,
  bestScore = 0,
  summary = null,
  onPlayAgain,
  onGoHome,
  shouldReduceMotion = false,
}) {
  const percentage = totalRounds > 0 ? (correctAnswers / totalRounds) * 100 : 0;
  const stars = calculateStars(percentage);
  const isNewBest = score > bestScore;
  const floatingStars = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        id: index,
        x: 6 + (index % 8) * 11,
        delay: (index % 6) * 0.35,
        duration: 3 + (index % 4) * 0.45,
        symbol: ['⭐', '✨', '🌟'][index % 3]
      })),
    []
  );

  // Mensajes según rendimiento
  const getMessage = () => {
    if (percentage >= 90) return { emoji: '🏆', text: '¡INCREÍBLE!', sub: '¡Eres un campeón!' };
    if (percentage >= 70) return { emoji: '🌟', text: '¡MUY BIEN!', sub: '¡Sigue así!' };
    if (percentage >= 50) return { emoji: '👍', text: '¡BUEN TRABAJO!', sub: '¡Puedes mejorar!' };
    return { emoji: '💪', text: '¡SIGUE INTENTANDO!', sub: '¡Tú puedes!' };
  };

  const message = getMessage();

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
      aria-describedby="game-over-description"
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background-base/95 backdrop-blur-xl"
    >
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className={cn('absolute top-1/4 left-1/4 w-96 h-96 bg-brand-base/20 rounded-full blur-[128px]', !shouldReduceMotion && 'animate-pulse')} />
        <div className={cn('absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-cyan/20 rounded-full blur-[128px]', !shouldReduceMotion && 'animate-pulse')} style={{ animationDelay: '1s' }} />
      </div>

      <motion.article
        initial={shouldReduceMotion ? false : { scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }}
        className="relative max-w-md w-full"
      >
        {/* Main card */}
        <div className="glass-card-gradient p-8 text-center">
          {/* Celebration emoji */}
          <motion.div
            animate={shouldReduceMotion ? { scale: 1, rotate: 0 } : {
              scale: [1, 1.2, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 1, repeat: Infinity }}
            className="text-7xl mb-4"
            aria-hidden="true"
          >
            {message.emoji}
          </motion.div>

          {/* Main message */}
          <motion.h1
            id="game-over-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-4xl font-bold font-display gradient-text-brand mb-2"
          >
            {message.text}
          </motion.h1>
          <p id="game-over-description" className="text-text-muted mb-6">{message.sub}</p>

          {/* Stars */}
          <div 
            className="flex justify-center gap-3 mb-6" 
            role="img" 
            aria-label={`Puntuación: ${stars} de 3 estrellas`}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.3 + i * 0.15, type: 'spring' }}
              >
                <Star
                  size={48}
                  aria-hidden="true"
                  className={cn(
                    "transition-all duration-300",
                    i < stars
                      ? "fill-warning-base text-warning-base drop-shadow-[0_0_15px_var(--color-warning-glow)]"
                      : "fill-background-surface text-text-disabled"
                  )}
                />
              </motion.div>
            ))}
          </div>

          {/* Score display */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-background-elevated/50 rounded-2xl p-6 mb-6"
          >
            <div 
              className="text-5xl font-bold font-display text-white mb-2 tabular-nums"
              aria-label={`Puntuación final: ${score} puntos`}
            >
              {score}
            </div>
            <div className="text-text-muted">puntos</div>

            {/* New best badge */}
            {isNewBest && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.7, type: 'spring' }}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-warning-base/20 text-warning-base rounded-full text-sm font-bold"
                role="status"
              >
                <Trophy size={16} aria-hidden="true" />
                ¡Nuevo récord!
              </motion.div>
            )}
          </motion.div>

          {/* Stats */}
          <dl className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-success-base/10 rounded-xl p-4 border border-success-base/20">
              <dt className="text-xs text-text-muted order-2">Correctas</dt>
              <dd className="text-2xl font-bold text-success-base">{correctAnswers}</dd>
            </div>
            <div className="bg-background-surface/30 rounded-xl p-4 border border-border-subtle">
              <dt className="text-xs text-text-muted order-2">Total</dt>
              <dd className="text-2xl font-bold text-text-secondary">{totalRounds}</dd>
            </div>
          </dl>

          {/* Resumen detallado */}
          {summary && (
            <div className="grid grid-cols-3 gap-2 mb-8 text-xs">
              <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
                <div className="text-text-muted">Errores</div>
                <div className="text-white font-semibold">{summary.errors ?? 0}</div>
              </div>
              <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
                <div className="text-text-muted">Resp. media</div>
                <div className="text-white font-semibold">
                  {summary.averageResponseTimeMs > 0
                    ? `${(summary.averageResponseTimeMs / 1000).toFixed(1)}s`
                    : '—'}
                </div>
              </div>
              <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
                <div className="text-text-muted">Tiempo</div>
                <div className="text-white font-semibold">
                  {summary.totalTimePlayed > 0
                    ? `${(summary.totalTimePlayed / (1000 * 60)).toFixed(1)} min`
                    : '—'}
                </div>
              </div>
            </div>
          )}

          {!summary && <div className="mb-8" />}

          {/* Actions */}
          <nav className="flex flex-col sm:flex-row gap-3" aria-label="Acciones de fin de juego">
            <ButtonPremium
              variant="primary"
              size="lg"
              onClick={onPlayAgain}
              icon={<RotateCcw size={20} aria-hidden="true" />}
              className="flex-1"
            >
              Jugar de Nuevo
            </ButtonPremium>
            <ButtonPremium
              variant="secondary"
              size="lg"
              onClick={onGoHome}
              icon={<Home size={20} aria-hidden="true" />}
              className="flex-1"
            >
              Salir
            </ButtonPremium>
          </nav>
        </div>
      </motion.article>

      {/* Floating stars decoration */}
          {stars >= 2 && !shouldReduceMotion && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {floatingStars.map(piece => (
            <motion.div
              key={`floating-star-${piece.id}`}
              initial={{ 
                x: `${piece.x}%`,
                y: '100%',
                opacity: 0
              }}
              animate={{ 
                y: '-20%',
                opacity: [0, 1, 0]
              }}
              transition={{
                duration: piece.duration,
                repeat: Infinity,
                delay: piece.delay,
              }}
              className="absolute text-2xl"
            >
              {piece.symbol}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

GameOverScreen.propTypes = {
  score: PropTypes.number,
  correctAnswers: PropTypes.number,
  totalRounds: PropTypes.number,
  bestScore: PropTypes.number,
  summary: PropTypes.shape({
    errors: PropTypes.number,
    averageResponseTimeMs: PropTypes.number,
    totalTimePlayed: PropTypes.number,
  }),
  onPlayAgain: PropTypes.func.isRequired,
  onGoHome: PropTypes.func.isRequired,
  shouldReduceMotion: PropTypes.bool,
};

export default memo(GameOverScreen);
