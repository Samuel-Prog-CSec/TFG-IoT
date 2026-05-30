/**
 * @fileoverview Wrapper que revela su contenido con fade-in al hacer scroll.
 * Usa IntersectionObserver via useInView de Framer Motion.
 * La animacion se ejecuta una sola vez (once: true).
 *
 * @module components/ui/ScrollRevealSection
 */

import { useRef } from 'react';
import { m as motion, useInView } from 'framer-motion';
import { DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 * @param {number} [props.delay=0] - Delay adicional en segundos
 */
export default function ScrollRevealSection({ children, className, delay = 0 }) {
  const { shouldReduceMotion } = useReducedMotion();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.section
      ref={ref}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={shouldReduceMotion
        ? { duration: 0 }
        : { duration: DURATION.entrance, ease: EASING.outExpo, delay }
      }
      className={className}
    >
      {children}
    </motion.section>
  );
}
