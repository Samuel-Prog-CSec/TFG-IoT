import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

/**
 * Mascota animada que acompaña al niño durante el juego
 * Usa emojis y CSS animations para crear expresiones
 * 
 * @param {Object} props
 * @param {'idle' | 'happy' | 'encouraging' | 'celebrating' | 'thinking' | 'sad'} props.mood - Estado de ánimo
 * @param {string} props.message - Mensaje en burbuja de diálogo
 * @param {'left' | 'right'} props.position - Posición en pantalla
 */
export default function CharacterMascot({ 
  mood = 'idle', 
  message,
  position = 'left',
  className 
}) {
  const mascotEmojis = {
    idle: '🦉',
    happy: '🦉',
    encouraging: '🦉',
    celebrating: '🥳',
    thinking: '🤔',
    sad: '🦉',
  };

  const expressions = {
    idle: { eyeAnim: 'blink', bodyAnim: 'float' },
    happy: { eyeAnim: 'sparkle', bodyAnim: 'bounce' },
    encouraging: { eyeAnim: 'wink', bodyAnim: 'nod' },
    celebrating: { eyeAnim: 'sparkle', bodyAnim: 'jump' },
    thinking: { eyeAnim: 'look', bodyAnim: 'tilt' },
    sad: { eyeAnim: 'droop', bodyAnim: 'sway' },
  };

  const defaultMessages = {
    idle: '¡Hola!',
    happy: '¡Muy bien!',
    encouraging: '¡Tú puedes!',
    celebrating: '¡GENIAL!',
    thinking: 'Hmm...',
    sad: '¡Inténtalo!',
  };

  const expr = expressions[mood];
  const displayMessage = message || defaultMessages[mood];

  // Animaciones según el estado
  const bodyAnimation = {
    float: {
      y: [0, -8, 0],
      transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
    },
    bounce: {
      y: [0, -15, 0],
      scale: [1, 1.1, 1],
      transition: { duration: 0.5, repeat: Infinity }
    },
    jump: {
      y: [0, -30, 0],
      rotate: [0, 10, -10, 0],
      transition: { duration: 0.6, repeat: Infinity }
    },
    nod: {
      rotate: [0, 5, -5, 0],
      transition: { duration: 1, repeat: Infinity }
    },
    tilt: {
      rotate: [0, 15, 0],
      transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
    },
    sway: {
      x: [-5, 5, -5],
      transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
    },
  };

  return (
    <div className={cn(
      "relative",
      position === 'left' ? 'items-start' : 'items-end',
      className
    )}>
      {/* Speech bubble */}
      {displayMessage && (
        <motion.div
          initial={{ opacity: 0, scale: 0, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          key={displayMessage}
          className={cn(
            "absolute -top-16 whitespace-nowrap",
            "bg-white/10 backdrop-blur-sm",
            "px-4 py-2 rounded-2xl",
            "border border-white/20",
            "text-white text-sm font-medium",
            position === 'left' ? 'left-0' : 'right-0'
          )}
        >
          {displayMessage}
          {/* Bubble tail */}
          <div className={cn(
            "absolute -bottom-2 w-4 h-4",
            "bg-white/10 border-l border-b border-white/20",
            "rotate-[-45deg]",
            position === 'left' ? 'left-4' : 'right-4'
          )} />
        </motion.div>
      )}

      {/* Mascot container */}
      <motion.div
        animate={bodyAnimation[expr.bodyAnim]}
        className="relative"
      >
        {/* Glow effect */}
        <div className={cn(
          "absolute inset-0 rounded-full blur-xl",
          mood === 'celebrating' && "bg-amber-400/30",
          mood === 'happy' && "bg-emerald-400/20",
          mood === 'encouraging' && "bg-purple-400/20",
          (mood === 'idle' || mood === 'thinking') && "bg-slate-400/10"
        )} />

        {/* Mascot emoji */}
        <motion.div
          className="relative text-6xl select-none filter drop-shadow-lg"
          animate={mood === 'happy' || mood === 'celebrating' ? {
            scale: [1, 1.1, 1],
          } : {}}
          transition={{ duration: 0.5, repeat: Infinity }}
        >
          {mascotEmojis[mood]}
        </motion.div>

        {/* Extra decorations for celebrating */}
        {mood === 'celebrating' && (
          <>
            <motion.span
              className="absolute -top-2 -right-2 text-xl"
              animate={{ 
                scale: [0, 1, 0],
                rotate: [0, 180, 360]
              }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              ⭐
            </motion.span>
            <motion.span
              className="absolute -top-1 -left-2 text-lg"
              animate={{ 
                scale: [0, 1, 0],
              }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.3 }}
            >
              ✨
            </motion.span>
          </>
        )}
      </motion.div>
    </div>
  );
}
