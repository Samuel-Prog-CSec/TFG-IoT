import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/* eslint-disable sonarjs/pseudo-random -- Math.random para efectos visuales (confetti), no para seguridad */

// Tokens de paleta — antes hex hardcoded. Al usar `var(...)` el confetti
// adopta la atmósfera del contexto activo (Geografía azul, Animales
// ámbar, etc.) y se mantiene en sintonía con el tema (light/dark).
const CONFETTI_COLORS = [
  'var(--color-accent-indigo)',
  'var(--color-accent-cyan)',
  'var(--color-accent-pink)',
  'var(--color-warning-base)',
  'var(--color-success-base)',
  'var(--color-accent-orange)',
];

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
  const { shouldReduceMotion } = useReducedMotion();
  const [particles, setParticles] = useState([]);
  const [isActive, setIsActive] = useState(active);

  useEffect(() => {
    // Si el usuario pidio movimiento reducido, no disparamos particulas
    // pero notificamos al caller para que la logica depende de onComplete
    // siga su flujo.
    if (!active || shouldReduceMotion) {
      setIsActive(false);
      if (active && shouldReduceMotion && onComplete) {
        const t = setTimeout(onComplete, 0);
        return () => clearTimeout(t);
      }
      return undefined;
    }

    setIsActive(true);

    // Generate particles
    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100, // Random x position (%)
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
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
  }, [active, particleCount, duration, onComplete, shouldReduceMotion]);

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
  const { shouldReduceMotion } = useReducedMotion();
  const [particles, setParticles] = useState([]);
  const [isActive, setIsActive] = useState(active);

  useEffect(() => {
    if (!active || shouldReduceMotion) {
      setIsActive(false);
      if (active && shouldReduceMotion && onComplete) {
        const t = setTimeout(onComplete, 0);
        return () => clearTimeout(t);
      }
      return undefined;
    }

    setIsActive(true);

    const newParticles = Array.from({ length: particleCount }, (_, i) => {
      const angle = (i / particleCount) * 360;
      const velocity = 100 + Math.random() * 150;
      return {
        id: i,
        angle,
        velocity,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 4 + Math.random() * 6,
      };
    });

    setParticles(newParticles);

    const timeout = setTimeout(() => {
      setIsActive(false);
      onComplete?.();
    }, 1500);

    return () => clearTimeout(timeout);
  }, [active, particleCount, onComplete, shouldReduceMotion]);

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
