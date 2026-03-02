import { motion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

/**
 * Componente para mostrar el desafío del juego
 * Muestra emoji/imagen grande con animaciones y botón de audio
 * 
 * @param {Object} props
 * @param {Object} props.asset - Asset del desafío { display: emoji, value: texto, audioUrl?, imageUrl? }
 * @param {boolean} props.revealed - Si el desafío está revelado
 * @param {string} props.contextTheme - Tema del contexto para colores (geography, animals, etc.)
 */
export default function ChallengeDisplay({ 
  asset, 
  revealed = true,
  contextTheme = 'default',
  shouldReduceMotion = false,
  className 
}) {
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    setImageError(false);
    setImageLoading(Boolean(asset?.thumbnailUrl || asset?.imageUrl));
  }, [asset?.imageUrl, asset?.thumbnailUrl]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Colores según el tema del contexto
  const themeColors = {
    default: {
      bg: 'from-purple-500/20 to-indigo-500/20',
      border: 'border-purple-500/30',
      glow: 'shadow-purple-500/30',
      text: 'text-purple-300',
    },
    geography: {
      bg: 'from-blue-500/20 to-cyan-500/20',
      border: 'border-blue-500/30',
      glow: 'shadow-blue-500/30',
      text: 'text-blue-300',
    },
    animals: {
      bg: 'from-amber-500/20 to-orange-500/20',
      border: 'border-amber-500/30',
      glow: 'shadow-amber-500/30',
      text: 'text-amber-300',
    },
    colors: {
      bg: 'from-pink-500/20 to-rose-500/20',
      border: 'border-pink-500/30',
      glow: 'shadow-pink-500/30',
      text: 'text-pink-300',
    },
    numbers: {
      bg: 'from-emerald-500/20 to-teal-500/20',
      border: 'border-emerald-500/30',
      glow: 'shadow-emerald-500/30',
      text: 'text-emerald-300',
    },
  };

  const theme = themeColors[contextTheme] || themeColors.default;

  const playAudio = () => {
    if (!asset?.audioUrl) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    setAudioPlaying(true);
    const audio = new Audio(asset.audioUrl);
    audio.preload = 'auto';
    audioRef.current = audio;
    audio.play().catch(() => {
      setAudioPlaying(false);
    });
    audio.onended = () => setAudioPlaying(false);
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 20 }}
      className={cn(
        "relative flex flex-col items-center justify-center",
        "p-8 sm:p-12",
        "rounded-3xl",
        `bg-gradient-to-br ${theme.bg}`,
        `border-2 ${theme.border}`,
        "backdrop-blur-xl",
        `shadow-2xl ${theme.glow}`,
        className
      )}
    >
      {/* Decorative rings */}
      <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
        <div className="absolute inset-4 rounded-2xl border border-white/5" />
        <div className="absolute inset-8 rounded-xl border border-white/5" />
      </div>

      {/* Pulsing glow effect */}
      <div className={cn('absolute inset-0 rounded-3xl opacity-30', !shouldReduceMotion && 'animate-pulse-glow')} />

      {/* Main display area */}
      <motion.div
        key={asset?.value}
        initial={shouldReduceMotion ? false : { y: 20, opacity: 0, rotateX: -20 }}
        animate={{ y: 0, opacity: 1, rotateX: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 25 }}
        className="relative z-10 text-center"
      >
        {/* Emoji/Image */}
        {(asset?.thumbnailUrl || asset?.imageUrl) && !imageError ? (
          <div className="relative w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-4">
            {imageLoading && (
              <div className="absolute inset-0 rounded-2xl border border-white/10 bg-white/5 animate-pulse" />
            )}
            <motion.img
              src={asset.thumbnailUrl || asset.imageUrl}
              alt={asset.value}
              className="w-32 h-32 sm:w-40 sm:h-40 object-contain mx-auto mb-4 drop-shadow-2xl"
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
            className="text-8xl sm:text-9xl mb-4 select-none filter drop-shadow-lg"
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

        {/* Text value */}
        {revealed && asset?.value && (
          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.2 }}
            className={cn(
              "text-2xl sm:text-3xl font-bold font-display",
              theme.text
            )}
          >
            {asset.value}
          </motion.h2>
        )}
      </motion.div>

      {/* Audio button */}
      {asset?.audioUrl && (
        <motion.button
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.3 }}
          onClick={playAudio}
          disabled={audioPlaying}
          className={cn(
            "mt-6 p-4 rounded-full",
            "bg-white/10 hover:bg-white/20",
            "border border-white/20",
            "transition-all duration-300",
            !shouldReduceMotion && "hover:scale-110",
            audioPlaying && "animate-pulse"
          )}
          aria-label="Reproducir audio"
          title="Escuchar pista"
        >
          {audioPlaying ? (
            <Volume2 className="w-8 h-8 text-white animate-bounce" />
          ) : (
            <VolumeX className="w-8 h-8 text-white/60" />
          )}
        </motion.button>
      )}

      {/* Sparkles decoration */}
      {!shouldReduceMotion && (
        <>
          <Sparkle className="absolute top-4 left-4" delay={0} />
          <Sparkle className="absolute top-8 right-8" delay={0.5} />
          <Sparkle className="absolute bottom-8 left-8" delay={1} />
          <Sparkle className="absolute bottom-4 right-4" delay={1.5} />
        </>
      )}
    </motion.div>
  );
}

// Mini component for sparkle decoration
function Sparkle({ className, delay = 0 }) {
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
  shouldReduceMotion: PropTypes.bool,
  className: PropTypes.string
};

Sparkle.propTypes = {
  className: PropTypes.string,
  delay: PropTypes.number
};
