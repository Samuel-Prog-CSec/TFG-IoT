/**
 * @fileoverview Componente ChallengeDisplay — feedback-aware.
 * Muestra el desafío del juego (emoji/imagen) y reacciona visualmente
 * a aciertos/fallos con glow, shake, y badge flotante de puntos.
 *
 * @module components/game/ChallengeDisplay
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
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
        // Padding ajustado para que la tarjeta no domine la pantalla y deje
        // espacio al fallback panel y a la mascota sin necesidad de scroll.
        "p-4 sm:p-6",
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
          {Array.from({ length: 6 }).map((_, i) => {
            const angle = (i / 6) * Math.PI * 2;
            const distance = 80 + (i % 3) * 20;
            return (
              <motion.div
                key={`particle-${i}`}
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
        {/* Emoji/Image */}
        {assetImageUrl && !imageError ? (
          <div
            className={cn(
              "relative size-24 sm:size-32 mx-auto mb-2 rounded-2xl overflow-hidden",
              // Marco tematizado: ring + shadow con color del tema
              `ring-2 ring-offset-2 ring-offset-transparent`,
              theme.border.replace('border-', 'ring-'),
              // Sombra interior para profundidad
              "shadow-[inset_0_2px_6px_rgba(0,0,0,0.3)]"
            )}
            style={asset?.dominantColor ? { backgroundColor: asset.dominantColor } : undefined}
          >
            {imageLoading && !asset?.dominantColor && (
              <div className="absolute inset-0 rounded-2xl border border-white/10 bg-white/5 animate-pulse" />
            )}
            <motion.img
              src={assetImageUrl}
              alt={asset.value}
              className={cn(
                "size-24 sm:size-32 object-contain drop-shadow-2xl transition-opacity duration-400 ease-out",
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
            className="text-7xl sm:text-8xl mb-2 select-none filter drop-shadow-lg"
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
            {revealed ? asset?.display : '❓'}
          </motion.div>
        )}

        {/* Text value — tamaño reducido para que el bloque no acapare altura,
            el prompt "¿Dónde está X?" ya refuerza el nombre del target. */}
        {revealed && asset?.value && (
          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.2 }}
            className={cn(
              "text-xl sm:text-2xl font-bold font-display",
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
      className={cn("text-2xl pointer-events-none select-none", className)}
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
      ✨
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
