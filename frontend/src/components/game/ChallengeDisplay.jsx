/**
 * @fileoverview Componente ChallengeDisplay — feedback-aware.
 * Muestra el desafío del juego (emoji/imagen) y reacciona visualmente
 * a aciertos/fallos con glow, shake, y badge flotante de puntos.
 *
 * @module components/game/ChallengeDisplay
 */

import { m as motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { HelpCircle, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getAssetImageUrl } from '../../lib/cardMapping';
import AudioMiniPlayer from '../ui/AudioMiniPlayer';
import FloatingPointsBadge from './FloatingPointsBadge';

const FEEDBACK_BORDER = {
  idle: '',
  success: 'border-success-base shadow-[0_0_40px] shadow-success-glow',
  error: 'border-error-base/70 shadow-[0_0_20px] shadow-error-glow',
  timeout: 'border-warning-base/70 shadow-[0_0_20px] shadow-warning-glow',
};

const SHAKE_ANIMATION = {
  x: [-6, 6, -4, 4, -2, 2, 0],
  transition: { duration: 0.5 },
};

const SUCCESS_BOUNCE = {
  scale: [1, 1.08, 1.02],
  transition: { type: 'spring', stiffness: 400, damping: 15, duration: 0.6 },
};

const TIMEOUT_ANIMATION = {
  opacity: [1, 0.4, 0.8],
  scale: [1, 0.96, 1],
  transition: { duration: 0.6 },
};

// Particulas de feedback de acierto: precomputadas para no recalcular angulos
// y distancias en cada render, y para tener keys estables sin usar el indice.
const SUCCESS_PARTICLES = Array.from({ length: 6 }, (_, i) => ({
  id: `particle-${i}`,
  index: i,
  angle: (i / 6) * Math.PI * 2,
  distance: 80 + (i % 3) * 20
}));

const themeColors = {
  default: {
    bg: 'from-theme-default/20 to-theme-default-alt/20',
    border: 'border-theme-default/30',
    glow: 'shadow-theme-default/30',
    text: 'text-theme-default-text',
  },
  geography: {
    bg: 'from-theme-geography/20 to-theme-geography-alt/20',
    border: 'border-theme-geography/30',
    glow: 'shadow-theme-geography/30',
    text: 'text-theme-geography-text',
  },
  animals: {
    bg: 'from-theme-animals/20 to-theme-animals-alt/20',
    border: 'border-theme-animals/30',
    glow: 'shadow-theme-animals/30',
    text: 'text-theme-animals-text',
  },
  colors: {
    bg: 'from-theme-colors/20 to-theme-colors-alt/20',
    border: 'border-theme-colors/30',
    glow: 'shadow-theme-colors/30',
    text: 'text-theme-colors-text',
  },
  numbers: {
    bg: 'from-theme-numbers/20 to-theme-numbers-alt/20',
    border: 'border-theme-numbers/30',
    glow: 'shadow-theme-numbers/30',
    text: 'text-theme-numbers-text',
  },
};

/**
 * @param {Object} props
 * @param {Object} props.asset - Asset del desafío { display, value, audioUrl?, imageUrl?, thumbnailUrl? }
 * @param {boolean} props.revealed - Si el desafío está revelado
 * @param {string} props.contextTheme - Tema del contexto para colores
 * @param {'idle'|'success'|'error'} props.feedbackState - Estado de feedback actual
 * @param {number} props.feedbackPoints - Puntos del feedback
 * @param {string} props.feedbackMessage - Mensaje del feedback
 */
// eslint-disable-next-line sonarjs/cyclomatic-complexity -- componente de visualizacion de retos con multiples estados de feedback
const ChallengeDisplay = function ChallengeDisplay({
  ref,
  asset,
  revealed = true,
  contextTheme = 'default',
  feedbackState = 'idle',
  feedbackPoints = 0,
  feedbackMessage = '',
  isTimeout = false,
  className
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  // Usar imagen completa para el display grande (768x768 para retina 2x a 160px CSS)
  const assetImageUrl = getAssetImageUrl(asset, { preferFull: true });

  useEffect(() => {
    setImageError(false);
    setImageLoading(Boolean(assetImageUrl));
  }, [assetImageUrl]);

  const theme = themeColors[contextTheme] || themeColors.default;
  const isIdle = feedbackState === 'idle';
  const isSuccess = feedbackState === 'success';
  const isError = feedbackState === 'error';

  // Determine card-level animation based on feedback
  const cardAnimate = (() => {
    if (shouldReduceMotion || isIdle) return { scale: 1, opacity: 1, x: 0 };
    if (isSuccess) return SUCCESS_BOUNCE;
    if (isError) return isTimeout ? TIMEOUT_ANIMATION : { ...SHAKE_ANIMATION, scale: 1, opacity: 1 };
    return { scale: 1, opacity: 1, x: 0 };
  })();

  // Determine asset animation based on feedback
  const assetFeedbackAnimate = (() => {
    if (shouldReduceMotion || isIdle) return undefined;
    if (isSuccess) return { y: [0, -20, 0], rotate: [0, 5, -5, 0], transition: { duration: 0.6 } };
    return undefined;
  })();

  // Determinar clase de borde segun estado de feedback
  const feedbackBorderClass = isTimeout ? FEEDBACK_BORDER.timeout : FEEDBACK_BORDER[feedbackState];

  return (
    <motion.div
      ref={ref}
      initial={shouldReduceMotion ? false : { scale: 0.8, opacity: 0 }}
      animate={cardAnimate}
      transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 20 }}
      className={cn(
        "relative flex flex-col items-center justify-center",
        // Padding vh-aware: se compacta en viewports de poca altura (720p) para
        // que el reto + el panel táctil quepan SIN recorte (fit-to-viewport).
        "p-[clamp(0.6rem,2.2vh,1.5rem)]",
        "rounded-3xl",
        `bg-gradient-to-br ${theme.bg}`,
        "border-2 transition-[border-color,box-shadow] duration-300",
        isIdle ? `${theme.border} shadow-2xl ${theme.glow}` : feedbackBorderClass,
        "backdrop-blur-xl",
        className
      )}
    >
      {/* Floating Points Badge */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-30">
        <AnimatePresence>
          {!isIdle && (
            <FloatingPointsBadge
              type={feedbackState}
              points={feedbackPoints}
              message={feedbackMessage}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Error flash overlay */}
      {isError && !shouldReduceMotion && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.12, 0] }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 rounded-3xl bg-error-base pointer-events-none z-20"
        />
      )}

      {/* Success particles */}
      {isSuccess && !shouldReduceMotion && (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-visible">
          {SUCCESS_PARTICLES.map(particle => {
            const { index: i, angle, distance } = particle;
            return (
              <motion.div
                key={particle.id}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{
                  x: Math.cos(angle) * distance,
                  y: Math.sin(angle) * distance,
                  opacity: 0,
                  scale: 0,
                }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={cn(
                  'absolute left-1/2 top-1/2 size-3 rounded-full -translate-x-1/2 -translate-y-1/2',
                  i % 3 === 0 && 'bg-success-base',
                  i % 3 === 1 && 'bg-accent-cyan',
                  i % 3 === 2 && 'bg-warning-base'
                )}
              />
            );
          })}
        </div>
      )}

      {/* Decorative rings */}
      <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
        <div className="absolute inset-4 rounded-2xl border border-border-subtle" />
        <div className="absolute inset-8 rounded-xl border border-border-subtle" />
      </div>

      {/* Pulsing glow effect */}
      <div className={cn('absolute inset-0 rounded-3xl opacity-30', !shouldReduceMotion && 'animate-pulse-glow')} />

      {/* Main display area */}
      <AnimatePresence mode="wait">
        <motion.div
          key={asset?.value}
          initial={shouldReduceMotion ? false : { y: 28, opacity: 0, scale: 0.85 }}
          animate={assetFeedbackAnimate || { y: 0, opacity: 1, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { y: -12, opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
          transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 20 }}
          className="relative z-10 text-center"
        >
        {/* Emoji/Image — escalada generosamente en desktop para aprovechar
            el ancho disponible del panel de asociacion (QA 2026-04-23: antes
            quedaba muy pequeña y con aire alrededor). */}
        {assetImageUrl && !imageError ? (
          <div
            className={cn(
              // Tamaño vh-aware: la imagen del reto encoge en viewports de poca
              // altura para evitar recorte del contenido (fit-to-viewport).
              "relative size-[clamp(4rem,13vh,12rem)] mx-auto mb-[clamp(0.2rem,0.9vh,0.5rem)] rounded-2xl overflow-hidden",
              // Marco tematizado: ring + shadow con color del tema
              `ring-2 ring-offset-2 ring-offset-transparent`,
              theme.border.replace('border-', 'ring-'),
              // Sombra interior para profundidad (token-aware: en light el
              // negro hardcoded ahogaba el marco; color-mix adapta el alpha
              // al tema activo).
              "shadow-[inset_0_2px_6px_color-mix(in_oklab,var(--color-text-primary)_30%,transparent)]"
            )}
            style={asset?.dominantColor ? { backgroundColor: asset.dominantColor } : undefined}
          >
            {/* Placeholder shimmer SIEMPRE visible durante el loading,
                independientemente de si hay dominantColor (QA 04/05 BUG-A1:
                la card quedaba VACÍA durante la transición entre rondas en
                Asociación porque la nueva imagen tarda 1-2s en cargar). */}
            {imageLoading && (
              <div className="absolute inset-0 rounded-2xl border border-white/10 bg-white/5 animate-pulse" />
            )}
            {/* Fallback textual: muestra el `value` del asset durante el
                loading. Cuando la imagen carga, se oculta vía opacity. Esto
                evita frame vacío y da feedback inmediato al alumno. */}
            {imageLoading && asset?.value && (
              <div
                aria-hidden="true"
                className={cn(
                  'absolute inset-0 flex items-center justify-center text-center px-2',
                  'font-display font-bold text-3xl sm:text-4xl lg:text-5xl tracking-tight',
                  'transition-opacity duration-300',
                  theme.text
                )}
              >
                {asset.value}
              </div>
            )}
            <motion.img
              src={assetImageUrl}
              alt={asset.value}
              className={cn(
                "size-full object-contain drop-shadow-2xl transition-opacity duration-400 ease-out",
                imageLoading ? "opacity-0" : "opacity-100"
              )}
              animate={shouldReduceMotion ? { scale: 1 } : { scale: [1, 1.05, 1] }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageError(true);
                setImageLoading(false);
              }}
              loading="eager"
              fetchPriority="high"
              decoding="sync"
            />
          </div>
        ) : (
          <motion.div
            className="text-[clamp(3.5rem,12vh,9rem)] mb-[clamp(0.25rem,1vh,0.5rem)] select-none filter drop-shadow-lg leading-none flex items-center justify-center"
            animate={shouldReduceMotion ? { scale: 1, rotate: 0 } : {
              scale: [1, 1.1, 1],
              rotate: [0, 3, -3, 0]
            }}
            transition={shouldReduceMotion ? { duration: 0 } : {
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            {revealed && asset?.display ? (
              asset.display
            ) : (
              // Antes era el emoji '❓' (helado por SO/font). Lucide HelpCircle
              // mantiene el ratio visual y se tiñe con el color tema actual.
              <HelpCircle
                className={cn('size-[0.9em]', theme.text)}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            )}
          </motion.div>
        )}

        {/* Text value — el nombre del target como ayuda visual principal.
            Escalado para desktop porque acompaña a un asset image grande
            (QA 2026-04-23: antes quedaba pequeño junto a la imagen de 128px). */}
        {revealed && asset?.value && (
          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.2 }}
            className={cn(
              "text-[clamp(1.15rem,3.2vh,2.25rem)] font-bold font-display tracking-tight leading-tight",
              theme.text
            )}
          >
            {asset.value}
          </motion.h2>
        )}
        </motion.div>
      </AnimatePresence>

      {/* Audio mini-player */}
      {asset?.audioUrl && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.3 }}
          className="mt-6 w-full max-w-xs"
        >
          <AudioMiniPlayer audioUrl={asset.audioUrl} size="sm" variant="glass" />
        </motion.div>
      )}

      {/* Sparkles decoration */}
      {!shouldReduceMotion && (
        <>
          <ChallengeSparkle className="absolute top-4 left-4" delay={0} />
          <ChallengeSparkle className="absolute top-8 right-8" delay={0.5} />
          <ChallengeSparkle className="absolute bottom-8 left-8" delay={1} />
          <ChallengeSparkle className="absolute bottom-4 right-4" delay={1.5} />
        </>
      )}
    </motion.div>
  );
};

function ChallengeSparkle({ className, delay = 0 }) {
  return (
    <motion.div
      className={cn(
        // Antes era emoji ✨ (text-2xl). Migrado a Lucide Sparkles con
        // tono brand-light para coherencia con el resto del design system.
        'pointer-events-none select-none text-brand-light/70',
        className,
      )}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 0],
        scale: [0, 1, 0],
        rotate: [0, 180, 360]
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        delay,
        ease: "easeInOut"
      }}
    >
      <Sparkles size={20} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
    </motion.div>
  );
}

ChallengeDisplay.propTypes = {
  asset: PropTypes.shape({
    display: PropTypes.string,
    value: PropTypes.string,
    audioUrl: PropTypes.string,
    imageUrl: PropTypes.string,
    thumbnailUrl: PropTypes.string
  }),
  revealed: PropTypes.bool,
  contextTheme: PropTypes.string,
  feedbackState: PropTypes.oneOf(['idle', 'success', 'error']),
  feedbackPoints: PropTypes.number,
  feedbackMessage: PropTypes.string,
  isTimeout: PropTypes.bool,
  className: PropTypes.string
};

ChallengeSparkle.propTypes = {
  className: PropTypes.string,
  delay: PropTypes.number
};

export default ChallengeDisplay;
