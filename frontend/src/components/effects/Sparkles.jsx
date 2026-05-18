import { m as motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

const COLOR_CLASSES = {
  amber: 'text-warning-base',
  purple: 'text-brand-light',
  cyan: 'text-accent-cyan',
  pink: 'text-accent-pink',
  white: 'text-text-primary',
};

// TOKEN-EXCEPTION: drop-shadow filter strings require direct rgba values; CSS vars cannot be used inside filter()
const SPARKLE_AURAS = {
  amber: 'text-warning-base drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]',
  purple: 'text-brand-light drop-shadow-[0_0_6px_rgba(192,132,252,0.8)]',
  cyan: 'text-accent-cyan drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]',
  pink: 'text-accent-pink drop-shadow-[0_0_6px_rgba(244,114,182,0.8)]',
  white: 'text-text-primary drop-shadow-[0_0_6px_rgba(255,255,255,0.8)]',
};

const getSecureRandomUnit = () => {
  const randomBuffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(randomBuffer);
  return randomBuffer[0] / 4294967296;
};

const getSecureRandomInRange = (min, max) => min + getSecureRandomUnit() * (max - min);

const createSparkle = ({ id, minSize, maxSize }) => ({
  id,
  x: getSecureRandomInRange(0, 100),
  y: getSecureRandomInRange(0, 100),
  size: getSecureRandomInRange(minSize, maxSize),
  delay: getSecureRandomInRange(0, 2),
  duration: getSecureRandomInRange(1, 3),
});

const createSparkleBatch = ({ count, minSize, maxSize }) =>
  Array.from({ length: count }, (_, index) =>
    createSparkle({ id: index, minSize, maxSize })
  );

const regenerateSparkles = ({ prevSparkles, minSize, maxSize }) =>
  prevSparkles.map((sparkle, index) =>
    getSecureRandomUnit() > 0.7 ? createSparkle({ id: index, minSize, maxSize }) : sparkle
  );

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

  useEffect(() => {
    setSparkles(createSparkleBatch({ count, minSize, maxSize }));

    // Regenerate sparkles periodically
    const interval = setInterval(() => {
      setSparkles(prevSparkles =>
        regenerateSparkles({ prevSparkles, minSize, maxSize })
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [count, minSize, maxSize]);

  return (
    <div className={cn("absolute inset-0 pointer-events-none overflow-hidden", className)}>
      {sparkles.map((sparkle) => (
        <motion.div
          key={sparkle.id}
          className={cn("absolute", COLOR_CLASSES[color])}
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
            repeatDelay: getSecureRandomInRange(0, 3),
          }}
        >
          ✦
        </motion.div>
      ))}
    </div>
  );
}

Sparkles.propTypes = {
  color: PropTypes.oneOf(['amber', 'purple', 'cyan', 'pink', 'white']),
  count: PropTypes.number,
  minSize: PropTypes.number,
  maxSize: PropTypes.number,
  className: PropTypes.string,
};

/**
 * Sparkle individual animado
 */
export function Sparkle({ 
  size = 20, 
  color = 'amber',
  style,
  className 
}) {
  return (
    <motion.span
      className={cn("inline-block select-none", SPARKLE_AURAS[color], className)}
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

Sparkle.propTypes = {
  size: PropTypes.number,
  color: PropTypes.oneOf(['amber', 'purple', 'cyan', 'pink', 'white']),
  style: PropTypes.object,
  className: PropTypes.string,
};

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
        const distance = getSecureRandomInRange(80, 140);
        const starId = `star-burst-${angle}-${x}-${y}`;

        return (
          <motion.div
            key={starId}
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
              rotate: getSecureRandomInRange(0, 360),
            }}
            transition={{
              duration: 0.8,
              ease: 'easeOut',
            }}
          >
            {stars[Math.floor(getSecureRandomInRange(0, stars.length))]}
          </motion.div>
        );
      })}
    </div>
  );
}

StarBurst.propTypes = {
  active: PropTypes.bool,
  x: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  y: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  count: PropTypes.number,
};
