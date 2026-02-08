import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Efecto de confetti para celebraciones
 * Partículas animadas que caen desde arriba
 * 
 * @param {Object} props
 * @param {boolean} props.active - Si el confetti está activo
 * @param {number} props.duration - Duración en ms (default: 3000)
 * @param {number} props.particleCount - Número de partículas (default: 50)
 */
export default function Confetti({ 
  active = true, 
  duration = 3000, 
  particleCount = 50,
  onComplete 
}) {
  const [particles, setParticles] = useState([]);
  const [isActive, setIsActive] = useState(active);

  const colors = [
    '#8b5cf6', // Purple
    '#22d3ee', // Cyan
    '#f472b6', // Pink
    '#facc15', // Yellow
    '#4ade80', // Green
    '#fb923c', // Orange
  ];

  useEffect(() => {
    if (!active) {
      setIsActive(false);
      return;
    }

    setIsActive(true);

    // Generate particles
    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100, // Random x position (%)
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 6 + Math.random() * 8, // 6-14px
      delay: Math.random() * 0.5, // 0-0.5s delay
      duration: 1.5 + Math.random() * 1.5, // 1.5-3s fall duration
      rotation: Math.random() * 720 - 360, // -360 to 360 degrees
      shape: Math.random() > 0.5 ? 'circle' : 'square',
    }));

    setParticles(newParticles);

    // Cleanup after duration
    const timeout = setTimeout(() => {
      setIsActive(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timeout);
  }, [active, particleCount, duration, onComplete]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          initial={{
            x: `${particle.x}vw`,
            y: '-5vh',
            rotate: 0,
            scale: 0,
          }}
          animate={{
            y: '105vh',
            rotate: particle.rotation,
            scale: [0, 1, 1, 0.8],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            ease: 'easeIn',
          }}
          className="absolute"
          style={{
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            borderRadius: particle.shape === 'circle' ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Confetti explosivo desde un punto central
 */
export function ConfettiBurst({ 
  active = true,
  x = '50%',
  y = '50%',
  particleCount = 30,
  onComplete 
}) {
  const [particles, setParticles] = useState([]);
  const [isActive, setIsActive] = useState(active);

  const colors = ['#8b5cf6', '#22d3ee', '#f472b6', '#facc15', '#4ade80'];

  useEffect(() => {
    if (!active) {
      setIsActive(false);
      return;
    }

    setIsActive(true);

    const newParticles = Array.from({ length: particleCount }, (_, i) => {
      const angle = (i / particleCount) * 360;
      const velocity = 100 + Math.random() * 150;
      return {
        id: i,
        angle,
        velocity,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 6,
      };
    });

    setParticles(newParticles);

    const timeout = setTimeout(() => {
      setIsActive(false);
      onComplete?.();
    }, 1500);

    return () => clearTimeout(timeout);
  }, [active, particleCount, onComplete]);

  if (!isActive) return null;

  return (
    <div 
      className="fixed inset-0 pointer-events-none overflow-hidden z-50"
      style={{ perspective: '500px' }}
    >
      {particles.map((particle) => {
        const rad = (particle.angle * Math.PI) / 180;
        const endX = Math.cos(rad) * particle.velocity;
        const endY = Math.sin(rad) * particle.velocity;

        return (
          <motion.div
            key={particle.id}
            initial={{
              left: x,
              top: y,
              x: 0,
              y: 0,
              scale: 0,
              opacity: 1,
            }}
            animate={{
              x: endX,
              y: endY,
              scale: [0, 1, 0.5],
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: 0.8 + Math.random() * 0.4,
              ease: 'easeOut',
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              width: particle.size,
              height: particle.size,
              backgroundColor: particle.color,
              borderRadius: '50%',
            }}
          />
        );
      })}
    </div>
  );
}
