import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * Efecto de sparkles/estrellas flotantes
 * Pequeñas estrellas que aparecen y desaparecen
 * 
 * @param {Object} props
 * @param {string} props.color - Color de los sparkles (default: amber)
 * @param {number} props.count - Número de sparkles
 * @param {number} props.minSize - Tamaño mínimo
 * @param {number} props.maxSize - Tamaño máximo
 */
export default function Sparkles({
  color = 'amber',
  count = 20,
  minSize = 10,
  maxSize = 20,
  className,
}) {
  const [sparkles, setSparkles] = useState([]);

  const colorClasses = {
    amber: 'text-amber-400',
    purple: 'text-purple-400',
    cyan: 'text-cyan-400',
    pink: 'text-pink-400',
    white: 'text-white',
  };

  useEffect(() => {
    const generateSparkle = (id) => ({
      id,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: minSize + Math.random() * (maxSize - minSize),
      delay: Math.random() * 2,
      duration: 1 + Math.random() * 2,
    });

    setSparkles(Array.from({ length: count }, (_, i) => generateSparkle(i)));

    // Regenerate sparkles periodically
    const interval = setInterval(() => {
      setSparkles(prev => 
        prev.map((sparkle, i) => 
          Math.random() > 0.7 ? generateSparkle(i) : sparkle
        )
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [count, minSize, maxSize]);

  return (
    <div className={cn("absolute inset-0 pointer-events-none overflow-hidden", className)}>
      {sparkles.map((sparkle) => (
        <motion.div
          key={sparkle.id}
          className={cn("absolute", colorClasses[color])}
          style={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`,
            fontSize: sparkle.size,
          }}
          initial={{ opacity: 0, scale: 0, rotate: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: sparkle.duration,
            delay: sparkle.delay,
            repeat: Infinity,
            repeatDelay: Math.random() * 3,
          }}
        >
          ✦
        </motion.div>
      ))}
    </div>
  );
}

/**
 * Sparkle individual animado
 */
export function Sparkle({ 
  size = 20, 
  color = 'amber',
  style,
  className 
}) {
  const colorClasses = {
    amber: 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]',
    purple: 'text-purple-400 drop-shadow-[0_0_6px_rgba(192,132,252,0.8)]',
    cyan: 'text-cyan-400 drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]',
    pink: 'text-pink-400 drop-shadow-[0_0_6px_rgba(244,114,182,0.8)]',
    white: 'text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]',
  };

  return (
    <motion.span
      className={cn("inline-block select-none", colorClasses[color], className)}
      style={{ fontSize: size, ...style }}
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.8, 1, 0.8],
        rotate: [0, 10, -10, 0],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      ✦
    </motion.span>
  );
}

/**
 * Versión emoji de estrellas
 */
export function StarBurst({ 
  active = true,
  x = '50%',
  y = '50%',
  count = 8 
}) {
  if (!active) return null;

  const stars = ['⭐', '🌟', '✨', '💫'];

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * 360;
        const rad = (angle * Math.PI) / 180;
        const distance = 80 + Math.random() * 60;

        return (
          <motion.div
            key={i}
            className="absolute text-2xl"
            style={{ left: x, top: y }}
            initial={{
              x: 0,
              y: 0,
              scale: 0,
              opacity: 1,
            }}
            animate={{
              x: Math.cos(rad) * distance,
              y: Math.sin(rad) * distance,
              scale: [0, 1.5, 0],
              opacity: [1, 1, 0],
              rotate: Math.random() * 360,
            }}
            transition={{
              duration: 0.8,
              ease: 'easeOut',
            }}
          >
            {stars[Math.floor(Math.random() * stars.length)]}
          </motion.div>
        );
      })}
    </div>
  );
}
