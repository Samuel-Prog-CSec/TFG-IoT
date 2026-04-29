import { memo, useMemo, useEffect, useRef } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import PropTypes from 'prop-types';
import { Star, Trophy, RotateCcw, Home, PartyPopper, Flame, Sparkles as SparklesIcon } from 'lucide-react';
import { cn, calculateStars } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useConfetti } from '../../hooks/useConfetti';
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
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const percentage = totalRounds > 0 ? (correctAnswers / totalRounds) * 100 : 0;
  const stars = calculateStars(percentage);
  const isNewBest = score > bestScore;
  const floatingStars = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        id: index,
        x: 5 + index * (90 / 12) + (index % 3) * 2,
        delay: 0.3 + (index % 5) * 0.4,
        duration: 2.5 + (index % 3) * 0.5,
        symbol: ['⭐', '✨', '🌟'][index % 3]
      })),
    []
  );

  // Mensajes y estilo visual segun estrellas obtenidas (4 niveles).
  // Usamos iconos Lucide para consistencia con el resto del design system
  // (en vez de emojis que mezclan con la tipografía del sistema operativo).
  const tierConfig = useMemo(() => {
    switch (stars) {
      case 3: return {
        Icon: Trophy, iconClass: 'text-warning-base drop-shadow-[0_0_18px_var(--color-warning-glow)]',
        text: '¡INCREÍBLE!', sub: '¡Eres un crack!',
        glowA: 'bg-warning-base/25', glowB: 'bg-brand-base/25',
      };
      case 2: return {
        Icon: PartyPopper, iconClass: 'text-success-base drop-shadow-[0_0_14px_rgba(34,197,94,0.55)]',
        text: '¡MUY BIEN!', sub: '¡Sigue así!',
        glowA: 'bg-success-base/20', glowB: 'bg-accent-cyan/20',
      };
      case 1: return {
        Icon: Flame, iconClass: 'text-brand-base drop-shadow-[0_0_14px_rgba(139,92,246,0.5)]',
        text: '¡BUEN INTENTO!', sub: '¡Vas por buen camino!',
        glowA: 'bg-brand-base/20', glowB: 'bg-accent-cyan/15',
      };
      default: return {
        Icon: SparklesIcon, iconClass: 'text-accent-cyan drop-shadow-[0_0_12px_rgba(34,211,238,0.45)]',
        text: '¡NO TE RINDAS!', sub: '¡La práctica hace al maestro!',
        glowA: 'bg-brand-base/15', glowB: 'bg-accent-cyan/10',
      };
    }
  }, [stars]);

  const message = tierConfig;
  const scoreDelta = score - bestScore;

  // Counter animado para el score (0 -> score en 1.5s)
  const springScore = useSpring(0, { stiffness: 50, damping: 20 });
  const displayScore = useTransform(springScore, (v) => Math.round(v));
  const scoreRef = useRef(null);

  useEffect(() => {
    if (shouldReduceMotion) {
      springScore.jump(score);
    } else {
      springScore.set(score);
    }
  }, [score, springScore, shouldReduceMotion]);

  useEffect(() => {
    return displayScore.on('change', (v) => {
      if (scoreRef.current) scoreRef.current.textContent = v;
    });
  }, [displayScore]);

  const { fireSuccess, fireFireworks } = useConfetti();

  useEffect(() => {
    if (shouldReduceMotion || stars < 2) return undefined;
    // 2 estrellas (>=70%): rafagas laterales cortas.
    // 3 estrellas (100%): rafagas + fireworks sostenidos 2s para celebracion completa.
    const timers = [];
    timers.push(setTimeout(() => fireSuccess(), 400));
    if (stars === 3) {
      // Offset sobre el fireSuccess para que se perciban en capas.
      timers.push(setTimeout(() => fireFireworks(2000), 600));
    }
    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [shouldReduceMotion, stars, fireSuccess, fireFireworks]);

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
        <div className={cn('absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-[128px]', tierConfig.glowA, !shouldReduceMotion && 'animate-pulse')} />
        <div className={cn('absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full blur-[128px]', tierConfig.glowB, !shouldReduceMotion && 'animate-pulse')} style={{ animationDelay: '1s' }} />
      </div>

      <motion.article
        initial={shouldReduceMotion ? false : { scale: 0.8, y: 50 }}
        animate={{ scale: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }}
        className="relative max-w-md w-full"
      >
        {/* Main card */}
        <div className="glass-card-gradient p-8 text-center">
          {/* Icono hero del tier (Lucide en vez de emoji para consistencia) */}
          <motion.div
            animate={shouldReduceMotion ? { scale: 1, rotate: 0 } : {
              scale: [1, 1.2, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 1, repeat: 5 }}
            className="mb-4 flex items-center justify-center"
            aria-hidden="true"
          >
            <tierConfig.Icon size={80} className={tierConfig.iconClass} />
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
            {[0, 1, 2].map((i) => {
              const isEarned = i < stars;
              return (
                <motion.div
                  key={i}
                  initial={shouldReduceMotion ? false : { scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.3 + i * 0.2, type: 'spring' }}
                >
                  <motion.div
                    initial={false}
                    animate={isEarned ? {
                      scale: shouldReduceMotion ? 1 : [1, 1.4, 1],
                    } : { scale: 1 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.8 + i * 0.3, duration: 0.4 }}
                  >
                    <Star
                      size={48}
                      aria-hidden="true"
                      className={cn(
                        "transition-colors",
                        isEarned
                          ? "fill-warning-base text-warning-base drop-shadow-[0_0_15px_var(--color-warning-glow)]"
                          : "fill-background-surface text-text-disabled"
                      )}
                      style={isEarned ? {
                        transitionDelay: `${0.8 + i * 0.3}s`,
                        transitionDuration: '0.3s'
                      } : undefined}
                    />
                  </motion.div>
                </motion.div>
              );
            })}
          </div>

          {/* Score display */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-background-elevated/50 rounded-2xl p-6 mb-6"
          >
            <div
              ref={scoreRef}
              className="text-5xl font-bold font-display text-white mb-2 tabular-nums"
              aria-label={`Puntuación final: ${score} puntos`}
            >
              {score}
            </div>
            <div className="text-text-muted">puntos</div>

            {/* New best badge */}
            {isNewBest ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.7, type: 'spring' }}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-warning-base/20 text-warning-base rounded-full text-sm font-bold"
                role="status"
              >
                <Trophy size={16} aria-hidden="true" />
                {bestScore > 0
                  ? `¡Nuevo récord! +${scoreDelta} pts sobre el anterior (${bestScore})`
                  : `¡Tu primer récord! ${score} pts`}
              </motion.div>
            ) : bestScore > 0 && (
              <motion.p
                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="mt-3 text-text-muted text-sm"
              >
                A {Math.abs(scoreDelta)} puntos de tu récord
              </motion.p>
            )}
          </motion.div>

          {/* Stats. En Memoria, "Total" representa parejas (no rondas como en
              Asociación), por eso reetiquetamos para evitar confusión cuando el
              profesor vea Errores > Total (los intentos fallidos no son rondas
              sino taps de cartas que no emparejaron). */}
          <dl className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-success-base/10 rounded-xl p-4 border border-success-base/20">
              <dt className="text-xs text-text-muted order-2">{summary?.mode === 'memory' ? 'Parejas' : 'Correctas'}</dt>
              <dd className="text-2xl font-bold font-display text-success-base">{correctAnswers}</dd>
            </div>
            <div className="bg-background-surface/30 rounded-xl p-4 border border-border-subtle">
              <dt className="text-xs text-text-muted order-2">Total</dt>
              <dd className="text-2xl font-bold font-display text-text-secondary">{totalRounds}</dd>
            </div>
          </dl>

          {/* Resumen detallado. En Asociación desglosamos "Sin completar" en
              Incorrectas (respuestas erroneas) y Sin responder (rondas con
              timeout) para que el profesor vea si el alumno se equivoco o se
              quedo bloqueado. En Memoria "errors" cuenta intentos fallidos
              individuales (no rondas), por lo que omitimos "Sin responder" y
              etiquetamos como "Errores" para evitar mezclar ambas semanticas
              (QA 2026-04-24 PROP-104, QA 2026-04-29 BUG-MEM-1). */}
          {summary && (() => {
            const errors = Number.isFinite(summary.errors) ? summary.errors : null;
            const isMemory = summary.mode === 'memory';
            const unanswered = errors != null && !isMemory
              ? Math.max(0, totalRounds - correctAnswers - errors)
              : null;
            const avgTimeLabel = (() => {
              if (summary.averageResponseTimeMs > 0) return `${(summary.averageResponseTimeMs / 1000).toFixed(1)}s`;
              if (isMemory) return 'N/A';
              return '—';
            })();
            const totalTimeLabel = summary.totalTimePlayed > 0
              ? `${(summary.totalTimePlayed / (1000 * 60)).toFixed(1)} min`
              : '—';
            // Memoria: 3 columnas (Errores, T. medio, Tiempo) — no aplica "Sin responder".
            // Asociación: 4 columnas (Incorrectas, Sin responder, T. medio, Tiempo).
            // Sin summary.errors: fallback a pill unico "Sin completar" (3 columnas).
            if (errors != null && isMemory) {
              return (
                <div className="grid grid-cols-3 gap-2 mb-8 text-xs">
                  <div className="rounded-lg bg-error-base/10 border border-error-base/20 px-3 py-2 text-center" title="Intentos fallidos (parejas mal emparejadas)">
                    <div className="text-text-muted">Errores</div>
                    <div className="text-error-base font-display font-semibold">{errors}</div>
                  </div>
                  <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
                    <div className="text-text-muted">T. medio</div>
                    <div className="text-white font-display font-semibold">{avgTimeLabel}</div>
                  </div>
                  <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
                    <div className="text-text-muted">Tiempo</div>
                    <div className="text-white font-display font-semibold">{totalTimeLabel}</div>
                  </div>
                </div>
              );
            }
            if (errors != null) {
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8 text-xs">
                  <div className="rounded-lg bg-error-base/10 border border-error-base/20 px-3 py-2 text-center" title="Respuestas incorrectas (tarjeta equivocada)">
                    <div className="text-text-muted">Incorrectas</div>
                    <div className="text-error-base font-display font-semibold">{errors}</div>
                  </div>
                  <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center" title="Rondas sin respuesta (timeout)">
                    <div className="text-text-muted">Sin responder</div>
                    <div className="text-white font-display font-semibold">{unanswered}</div>
                  </div>
                  <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
                    <div className="text-text-muted">T. medio</div>
                    <div className="text-white font-display font-semibold">{avgTimeLabel}</div>
                  </div>
                  <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
                    <div className="text-text-muted">Tiempo</div>
                    <div className="text-white font-display font-semibold">{totalTimeLabel}</div>
                  </div>
                </div>
              );
            }
            return (
              <div className="grid grid-cols-3 gap-2 mb-8 text-xs">
                <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center" title="Rondas no completadas (incorrectas + sin responder)">
                  <div className="text-text-muted">Sin completar</div>
                  <div className="text-white font-display font-semibold">{Math.max(0, totalRounds - correctAnswers)}</div>
                </div>
                <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
                  <div className="text-text-muted">T. medio</div>
                  <div className="text-white font-display font-semibold">{avgTimeLabel}</div>
                </div>
                <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
                  <div className="text-text-muted">Tiempo</div>
                  <div className="text-white font-display font-semibold">{totalTimeLabel}</div>
                </div>
              </div>
            );
          })()}

          {!summary && <div className="mb-8" />}

          {/* Actions */}
          <nav className="flex flex-col sm:flex-row gap-3" aria-label="Acciones de fin de juego">
            {/* eslint-disable jsx-a11y/no-autofocus -- autoFocus intencionado: al terminar la partida, el foco debe ir al boton principal */}
            <ButtonPremium
              variant="primary"
              size="lg"
              onClick={onPlayAgain}
              icon={<RotateCcw size={20} aria-hidden="true" />}
              className="flex-1"
              autoFocus
            >
              Jugar de Nuevo
            </ButtonPremium>
            {/* eslint-enable jsx-a11y/no-autofocus */}
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
          {!shouldReduceMotion && (
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
                x: [`${piece.x}%`, `${piece.x + 3}%`, `${piece.x}%`],
                y: '-20%',
                opacity: [0, 1, 0]
              }}
              transition={{
                duration: piece.duration,
                repeat: 2,
                repeatType: 'loop',
                delay: piece.delay,
              }}
              className="absolute text-2xl"
            >
              {piece.symbol}
            </motion.div>
          ))}
        </div>
      )}

      {/* Confetti ahora se dispara via useConfetti hook (useEffect arriba) */}
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
};

export default memo(GameOverScreen);
