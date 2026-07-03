import { memo, useMemo, useEffect, useRef } from 'react';
import { m as motion, useSpring, useTransform } from 'framer-motion';
import PropTypes from 'prop-types';
import { Star, Trophy, RotateCcw, Home, PartyPopper, Flame, Sparkles as SparklesIcon, Sparkle } from 'lucide-react';
import { cn, calculateStars, MAX_STARS } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useConfetti } from '../../hooks/useConfetti';
import { getGameOverCopy } from '../../lib/gameOverCopy';
import { getMechanicTheme } from '../../lib/mechanicTheme';
import { pickMascotMessage } from '../../lib/mascotDialog';
import soundEffectsService from '../../services/soundEffectsService';
import ButtonPremium from '../ui/ButtonPremium';
import CharacterMascot from './CharacterMascot';
import GameOverStats from './gameover/GameOverStats';

/**
 * Mapeo tier → mood + tier del pool de frases para `pickMascotMessage`, sobre la
 * escala canónica de 5★ (score/maxScore). (JSDoc reescrito — describía la escala
 * antigua de 3★, que ya no corresponde al código.)
 *  - 5★ → `celebrating` + gameOverHigh.
 *  - 4★ → `happy` + gameOverHigh.
 *  - 3★ → `happy` + gameOverMid.
 *  - 2★ → `encouraging` + gameOverMid.
 *  - 0-1★ → `encouraging` + gameOverLow (AS-5: consuelo, no preocupación).
 */
function tierToMascot(stars) {
  if (stars >= 5) return { mood: 'celebrating', tier: 'high' };
  if (stars === 4) return { mood: 'happy', tier: 'high' };
  if (stars === 3) return { mood: 'happy', tier: 'mid' };
  if (stars === 2) return { mood: 'encouraging', tier: 'mid' };
  // AS-5: 0-1★ → `encouraging` (pompones de ánimo), NO `worried` (gota de sudor +
  // wobble + halo ROJO de error). Como CIERRE de partida, una cara agobiada con halo
  // de error para un niño que acertó ~la mitad es una señal punitiva; `encouraging`
  // comunica "ánimo, la próxima" — coherente con la clave amable del rig de Otto.
  return { mood: 'encouraging', tier: 'low' };
}

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
  // % canónico de estrellas = score / maxScore, IDÉNTICO al badge de puntuación
  // de abajo y a la base que usa el backend (`scorePercentToStars`, umbrales
  // 90/75/60/40) para la notificación al docente y las analíticas. Antes las
  // estrellas se calculaban por accuracy (`correctAnswers / totalRounds`) o, en
  // Secuencia, por `sequencesCompleted / totalRounds`: divergían del badge y del
  // backend (p.ej. 3⭐ junto a un badge "52%", y 2★ en la notificación del
  // docente). Con penalización por error (`penaltyPerError` por defecto −2) el
  // score ≠ aciertos·puntos en cualquier partida con fallos, así que la
  // divergencia era el caso común. `score`/`maxScore` ya vienen clampados del
  // backend (`finalScore` post-`complete()`), así que el % queda en [0, 100].
  const percentage = (() => {
    const maxScore = Number(summary?.maxScore || 0);
    if (maxScore > 0) {
      return (Number(score) / maxScore) * 100;
    }
    // Fallback defensivo si no llega `maxScore`: accuracy por rondas.
    if (totalRounds <= 0) return 0;
    return (correctAnswers / totalRounds) * 100;
  })();
  const stars = calculateStars(percentage);
  const isNewBest = score > bestScore;
  // Floating stars: usamos Lucide Star/Sparkle/SparklesIcon en lugar de
  // emojis ⭐✨🌟 — los emojis dependían de la fuente del SO (Apple,
  // Microsoft Segoe, Noto…) y mezclaban varios estilos visuales en la
  // misma escena. Lucide nos da control sobre tamaño, color (warning
  // base) y trazo, manteniendo coherencia con el resto del design system.
  const floatingStars = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        id: index,
        x: 5 + index * (90 / 12) + (index % 3) * 2,
        delay: 0.3 + (index % 5) * 0.4,
        duration: 2.5 + (index % 3) * 0.5,
        IconComponent: [Star, SparklesIcon, Sparkle][index % 3],
        size: [16, 20, 14][index % 3],
      })),
    []
  );

  // Mensajes y estilo visual segun estrellas obtenidas (4 niveles).
  // Usamos iconos Lucide para consistencia con el resto del design system
  // (en vez de emojis que mezclan con la tipografía del sistema operativo).
  // ADR-F: el título y subtítulo se delegan a `gameOverCopy.js` para que
  // varíen por mecánica (un 3⭐ en Memoria dice "MEMORIA DE ELEFANTE";
  // un 3⭐ en Secuencia dice "SIGUES EL RITMO"). Aquí se conserva la
  // configuración visual (Icon + glow) por número de estrellas.
  // T-953 Fase 2.10: el `glowB` (orbe secundario del backdrop) se tinta
  // ahora con el accent de la mecánica activa para reforzar la firma
  // mecánica sin chocar con el color del tier (Icon y estrellas siguen
  // usando warning/success/brand). Excepción Sequence 3⭐: el accent
  // amber colisiona con el warning del Trophy → usamos el orange como
  // accent específico para mantener la diferencia.
  const mechanicAccentVar = useMemo(() => {
    if (!summary?.mode) return null;
    const theme = getMechanicTheme(summary.mode);
    // En Secuencia + nota máxima → forzamos `--color-accent-orange` para alejar
    // del amarillo del Trophy. En el resto, usamos `accentVar` directo.
    if (summary.mode === 'sequence' && stars === MAX_STARS) {
      return '--color-accent-orange';
    }
    return theme.accentVar;
  }, [summary?.mode, stars]);

  const mechanicGlowB = mechanicAccentVar
    ? `bg-[color-mix(in_oklab,var(${mechanicAccentVar})_22%,transparent)]`
    : null;

  // Tinte de la card hero "Correctas/Parejas/Cartas" por mecánica. Antes
  // forzaba success-base para las 3 mecánicas, rompiendo la firma cromática
  // (Memoria=indigo, Asociación=cyan, Secuencia=ámbar). Mantenemos success
  // como fallback SOLO cuando `summary.mode` es null (partidas antiguas o
  // sin payload de mecánica).
  const heroCardTheme = useMemo(() => {
    if (!summary?.mode) {
      return {
        bg: 'bg-success-base/10',
        border: 'border-success-base/20',
        value: 'text-success-base'
      };
    }
    const theme = getMechanicTheme(summary.mode);
    return {
      bg: theme.accentBgSoftClass,
      border: theme.accentBorderClass,
      value: theme.accentClass
    };
  }, [summary?.mode]);

  const tierConfig = useMemo(() => {
    const { title, subtitle } = getGameOverCopy(stars, summary?.mode);
    switch (stars) {
      case 5: return {
        Icon: Trophy, iconClass: 'text-warning-base drop-shadow-[0_0_18px_var(--color-warning-glow)]',
        text: title, sub: subtitle,
        glowA: 'bg-warning-base/25',
        glowB: mechanicGlowB || 'bg-brand-base/25',
      };
      case 4: return {
        Icon: PartyPopper, iconClass: 'text-success-base drop-shadow-[0_0_14px_var(--color-success-glow)]',
        text: title, sub: subtitle,
        glowA: 'bg-success-base/20',
        glowB: mechanicGlowB || 'bg-accent-cyan/20',
      };
      case 3:
      case 2: return {
        Icon: Flame, iconClass: 'text-brand-base drop-shadow-[0_0_14px_var(--color-brand-glow)]',
        text: title, sub: subtitle,
        glowA: 'bg-brand-base/20',
        glowB: mechanicGlowB || 'bg-accent-cyan/15',
      };
      default: return {
        Icon: SparklesIcon, iconClass: 'text-accent-cyan drop-shadow-[0_0_12px_var(--color-accent-cyan-glow)]',
        text: title, sub: subtitle,
        glowA: 'bg-brand-base/15',
        glowB: mechanicGlowB || 'bg-accent-cyan/10',
      };
    }
  }, [stars, summary?.mode, mechanicGlowB]);

  const message = tierConfig;
  const scoreDelta = score - bestScore;

  // Counter animado para el score (0 -> score en 1.5s)
  const springScore = useSpring(0, { stiffness: 50, damping: 20 });
  const displayScore = useTransform(springScore, (v) => Math.round(v));
  const scoreRef = useRef(null);
  const playAgainRef = useRef(null);

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

  // Foco al botón principal al montar (a11y: el foco va a la acción principal
  // al terminar la partida). `preventScroll` evita que el navegador desplace
  // la card hacia el botón — en viewports de poca altura (p.ej. 720p) eso
  // recortaba el icono hero por arriba (QA esta sesión).
  useEffect(() => {
    playAgainRef.current?.focus({ preventScroll: true });
  }, []);

  const { fireSuccess, fireFireworks } = useConfetti();

  // T-953 Fase 2.10: paleta de confetti tintada con el color de la
  // mecánica. Se mezcla con el accent (~70%) y un toque más claro para
  // que las particulas no se vean planas. En modo `null` (legacy) se
  // mantiene la paleta brand del hook.
  const confettiColors = useMemo(() => {
    if (!summary?.mode) return undefined;
    const theme = getMechanicTheme(summary.mode);
    const hex = theme.accentHexFallback;
    if (!hex) return undefined;
    return [hex, '#ffffff', hex];
  }, [summary?.mode]);

  // T-953 Fase 2.10: mascota acoplada al tier + frase tier-aware.
  // El mood cambia con las estrellas; la frase se elige del pool por
  // mecánica × tier (`gameOverHigh|Mid|Low`) en `mascotDialog.js`.
  const mascotConfig = useMemo(() => {
    const { mood, tier } = tierToMascot(stars);
    const message = pickMascotMessage(summary?.mode, 'gameOver', tier) || null;
    return { mood, message };
  }, [stars, summary?.mode]);

  useEffect(() => {
    if (shouldReduceMotion || stars < 3) return undefined;
    // 3-4 estrellas (>=60%): rafagas laterales cortas.
    // 5 estrellas (>=90%): rafagas + fireworks sostenidos 2s para celebracion completa.
    const timers = [];
    timers.push(setTimeout(() => fireSuccess({ colors: confettiColors }), 400));
    if (stars === MAX_STARS) {
      // Offset sobre el fireSuccess para que se perciban en capas.
      timers.push(setTimeout(() => fireFireworks(2000, { colors: confettiColors }), 600));
    }
    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [shouldReduceMotion, stars, fireSuccess, fireFireworks, confettiColors]);

  // Sound effect proporcional al tier (silencio si 0⭐).
  // AS-6: la fanfare NO se acopla a reduced-motion. `useSoundEffects` documenta que el
  // sonido y `prefers-reduced-motion` son ejes de accesibilidad INDEPENDIENTES (WCAG);
  // el sonido incluso gana importancia cuando se reduce el feedback visual. Antes un
  // niño con reduced-motion oía todos los sonidos de la partida MENOS el de cierre. El
  // singleton `soundEffectsService` ya respeta el toggle de sonido (setEnabled).
  useEffect(() => {
    const t = setTimeout(() => soundEffectsService.playGameOverFanfare(stars), 250);
    return () => clearTimeout(t);
  }, [stars]);

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
        className="relative w-full max-w-[min(720px,92vw)]"
      >
        {/* Main card */}
        {/* El scroll (max-h + overflow) vive en la PROPIA card, no en el
            <article> que la envuelve. Si el overflow está en un padre con
            border-radius 0, recorta la drop-shadow de la card en esquinas
            rectas → "picos" cuadrados (más visibles en light, donde la sombra
            negra contrasta con el fondo claro). Una caja no recorta su propia
            sombra, así que con el overflow aquí la sombra sigue redondeada. */}
        {/* FIT-TO-VIEWPORT: la card cabe entera sin scroll; el padding y los
            espaciados internos son vh-aware (clamp con vh) para compactarse en
            viewports de poca altura (p.ej. 720p) y reocupar el tamaño. */}
        <div className="glass-card-gradient p-[clamp(0.85rem,2.6vh,2rem)] text-center max-h-[98dvh] overflow-y-auto custom-scrollbar">
          {/* Icono hero del tier (Lucide en vez de emoji para consistencia) */}
          <motion.div
            animate={shouldReduceMotion ? { scale: 1, rotate: 0 } : {
              scale: [1, 1.2, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 1, repeat: 5 }}
            className="mb-[clamp(0.3rem,1.4vh,1rem)] flex items-center justify-center"
            aria-hidden="true"
          >
            <tierConfig.Icon size={80} className={cn('w-[clamp(2.75rem,7vh,5rem)] h-[clamp(2.75rem,7vh,5rem)]', tierConfig.iconClass)} />
          </motion.div>

          {/* Main message */}
          <motion.h1
            id="game-over-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-[var(--text-fluid-2xl)] font-bold font-display gradient-text-brand mb-2"
          >
            {message.text}
          </motion.h1>
          <p id="game-over-description" className="text-text-muted mb-[clamp(0.4rem,2vh,1.5rem)]">{message.sub}</p>

          {/* Stars */}
          <div 
            className="flex justify-center gap-3 mb-[clamp(0.4rem,2vh,1.5rem)]" 
            role="img" 
            aria-label={`Puntuación: ${stars} de ${MAX_STARS} estrellas`}
          >
            {Array.from({ length: MAX_STARS }, (_, i) => i).map((i) => {
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
                        "size-[clamp(1.75rem,4.5vh,3rem)] transition-colors",
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

          {/* Score display — con maxScore (ADR-114) para dar contexto.
              "32 / 50 puntos · 64%" comunica al alumno qué % del techo
              de la partida logró, en lugar de un score absoluto sin
              referencia. Si el backend no emite maxScore (sesión
              antigua o fallback), caemos a la presentación clásica. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
            className="bg-background-elevated/50 rounded-2xl p-[clamp(0.55rem,1.8vh,1.5rem)] mb-[clamp(0.35rem,1.6vh,1.5rem)]"
          >
            <div
              ref={scoreRef}
              // text-text-primary en lugar de text-white: el primer token se
              // resuelve a oklch 98% en dark (≈blanco) y a oklch 20% en light
              // (gris oscuro). El text-white hardcoded dejaba el "75" en blanco
              // sobre la card translúcida claro = invisible (QA 2026-05-07).
              className="text-[var(--text-fluid-3xl)] font-extrabold font-display text-display-hero text-text-primary mb-2 tabular-nums"
              aria-label={
                summary?.maxScore
                  ? `Puntuación final: ${score} de ${summary.maxScore} puntos`
                  : `Puntuación final: ${score} puntos`
              }
            >
              {score}
            </div>
            {summary?.maxScore ? (
              <div className="text-text-muted text-sm">
                <span className="tabular-nums text-text-secondary font-semibold">
                  / {summary.maxScore}
                </span>
                {' '}puntos
                {Number(summary.maxScore) > 0 && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-background-surface/60 text-text-primary text-xs font-medium tabular-nums">
                    {Math.round((Number(score) / Number(summary.maxScore)) * 100)}%
                  </span>
                )}
              </div>
            ) : (
              <div className="text-text-muted">puntos</div>
            )}

            {/* New best badge */}
            {isNewBest ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.7, type: 'spring' }}
                className="inline-flex items-center gap-2 mt-[clamp(0.4rem,1.5vh,1rem)] px-4 py-1.5 bg-warning-base/20 text-warning-base rounded-full text-sm font-bold"
                role="status"
              >
                <Trophy size={16} aria-hidden="true" />
                {/* "Récord" es por sesión específica (useGameSocket consulta
                    `getPlayerStats(playerId, { sessionId })`). Antes el copy
                    decía "Tu primer récord" sin más, lo que confundía: el
                    alumno con partidas previas en otras sesiones lo veía cada
                    vez que estrenaba una nueva sesión. Ahora se aclara el
                    alcance "en esta sesión" (QA 2026-05-07). */}
                {bestScore > 0
                  ? `¡Nuevo récord en esta sesión! +${scoreDelta} pts sobre tu marca (${bestScore})`
                  : `¡Primer récord en esta sesión! ${score} pts`}
              </motion.div>
            ) : bestScore > 0 && (
              <motion.p
                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="mt-[clamp(0.3rem,1.2vh,0.75rem)] text-text-muted text-sm"
              >
                A {Math.abs(scoreDelta)} puntos de tu récord
              </motion.p>
            )}
          </motion.div>

          {/* Hero metric superior: en Asociación es "Correctas / Total" de
              rondas; en Memoria es "Parejas / Total". En Secuencia es
              "Secuencias / Total" de rondas — antes mostraba `correctAnswers`
              (cartas individuales acertadas) sobre `totalRounds` (rondas),
              mezclando unidades y pudiendo renderizar p.ej. "7 / 3"; el detalle
              por carta está abajo en GameOverStatsSequence. */}
          <dl className="grid grid-cols-2 gap-[clamp(0.5rem,1.5vh,1rem)] mb-[clamp(0.4rem,2vh,1.5rem)]">
            <div className={cn('rounded-xl p-[clamp(0.55rem,1.7vh,1rem)] border', heroCardTheme.bg, heroCardTheme.border)}>
              <dt className="text-xs text-text-muted order-2">
                {(() => {
                  if (summary?.mode === 'memory') return 'Parejas';
                  if (summary?.mode === 'sequence') return 'Secuencias';
                  return 'Correctas';
                })()}
              </dt>
              <dd className={cn('text-[clamp(1.1rem,2.6vh,1.5rem)] font-bold font-display leading-tight', heroCardTheme.value)}>
                {summary?.mode === 'sequence' ? Number(summary?.sequencesCompleted || 0) : correctAnswers}
              </dd>
            </div>
            <div className="bg-background-surface/30 rounded-xl p-[clamp(0.55rem,1.7vh,1rem)] border border-border-subtle">
              <dt className="text-xs text-text-muted order-2">Total</dt>
              <dd className="text-[clamp(1.1rem,2.6vh,1.5rem)] font-bold font-display text-text-secondary leading-tight">{totalRounds}</dd>
            </div>
          </dl>

          {/* Bloque de stats delegado por mecánica (T-922 fase D, ADR-103). */}
          {summary
            ? <GameOverStats summary={summary} totalRounds={totalRounds} correctAnswers={correctAnswers} />
            : <div className="mb-8" />}

          {/* Actions */}
          <nav className="flex flex-wrap gap-3 justify-center" aria-label="Acciones de fin de juego">
            <ButtonPremium
              ref={playAgainRef}
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
          {!shouldReduceMotion && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {floatingStars.map((piece) => {
            const { IconComponent } = piece;
            return (
              <motion.div
                key={`floating-star-${piece.id}`}
                initial={{
                  x: `${piece.x}%`,
                  y: '100%',
                  opacity: 0,
                  rotate: 0,
                }}
                animate={{
                  x: [`${piece.x}%`, `${piece.x + 3}%`, `${piece.x}%`],
                  y: '-20%',
                  opacity: [0, 1, 0],
                  rotate: piece.id % 2 === 0 ? 90 : -90,
                }}
                transition={{
                  duration: piece.duration,
                  repeat: 2,
                  repeatType: 'loop',
                  delay: piece.delay,
                }}
                className="absolute text-warning-base drop-shadow-[0_0_8px_var(--color-warning-glow)]"
              >
                <IconComponent
                  size={piece.size}
                  fill="currentColor"
                  strokeWidth={1.25}
                />
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Confetti ahora se dispara via useConfetti hook (useEffect arriba) */}

      {/* Mascota tier-aware (T-953 Fase 2.10). Posicionada en la esquina
          inferior izquierda del overlay (fuera del card para no competir
          con el scoreboard), escalada 1.4x. Solo visible >=md para no
          saturar pantallas pequeñas. `aria-hidden` porque el dialog ya
          comunica la información importante (`aria-labelledby`/`aria-describedby`)
          y la mascota duplicaría con la burbuja. */}
      <div
        aria-hidden="true"
        className="hidden md:block absolute bottom-16 left-16 pointer-events-none"
      >
        <div className="origin-bottom-left">
          <CharacterMascot
            mood={mascotConfig.mood}
            message={mascotConfig.message}
            mechanicType={summary?.mode}
            position="left"
            size="lg"
            isFirstAppearance
          />
        </div>
      </div>
    </motion.div>
  );
}

GameOverScreen.propTypes = {
  score: PropTypes.number,
  correctAnswers: PropTypes.number,
  totalRounds: PropTypes.number,
  bestScore: PropTypes.number,
  summary: PropTypes.shape({
    mode: PropTypes.string,
    maxScore: PropTypes.number,
    errors: PropTypes.number,
    averageResponseTimeMs: PropTypes.number,
    totalTimePlayed: PropTypes.number,
    sequencesCompleted: PropTypes.number,
  }),
  onPlayAgain: PropTypes.func.isRequired,
  onGoHome: PropTypes.func.isRequired,
};

export default memo(GameOverScreen);
