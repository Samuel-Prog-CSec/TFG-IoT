/**
 * @fileoverview TopProgressBar — barra de progreso fina superior tipo NProgress.
 *
 * Aparece automaticamente durante transiciones de ruta para dar feedback visual
 * inmediato (mejor que dejar la pantalla "muerta" entre paginas con suspense).
 *
 * Diseño:
 *  - 2px de alto, fixed top-0
 *  - Gradiente brand → cyan con leve glow
 *  - Crecimiento asintotico: avanza rapido al inicio, se ralentiza, completa
 *    de golpe al terminar la navegacion
 *  - Respeta reduced-motion: salta directamente al estado completed
 *
 * @module components/ui/TopProgressBar
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const ASYMPTOTIC_LIMIT = 0.92;
const TICK_INTERVAL_MS = 200;
const TRICKLE_DELTA = 0.07;
const COMPLETION_HOLD_MS = 220;

export default function TopProgressBar() {
  const location = useLocation();
  const { shouldReduceMotion } = useReducedMotion();

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const tickRef = useRef(null);
  const lastPathRef = useRef(location.pathname);

  // Iniciar barra cuando cambia el pathname. Cubre Suspense lazy load y cambios
  // entre rutas; aunque el cambio sea instantaneo, dar una micro-pulsacion visible
  // mejora la sensacion de respuesta.
  useEffect(() => {
    const pathChanged = lastPathRef.current !== location.pathname;
    if (!pathChanged) return undefined;

    lastPathRef.current = location.pathname;
    setVisible(true);
    setProgress(0.15);

    if (shouldReduceMotion) {
      const t = setTimeout(() => {
        setProgress(1);
        setTimeout(() => setVisible(false), COMPLETION_HOLD_MS);
      }, 80);
      return () => clearTimeout(t);
    }

    // Trickle: aproximacion asintotica al limite
    tickRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= ASYMPTOTIC_LIMIT) return prev;
        return Math.min(ASYMPTOTIC_LIMIT, prev + TRICKLE_DELTA * (1 - prev));
      });
    }, TICK_INTERVAL_MS);

    // Completion: tras ~600ms del cambio de path forzamos el cierre porque
    // los lazy-loaded chunks suelen estar listos. useNavigation se encargaria
    // del caso de loaders verdaderos.
    const completionTimer = setTimeout(() => {
      clearInterval(tickRef.current);
      setProgress(1);
      setTimeout(() => setVisible(false), COMPLETION_HOLD_MS);
    }, 600);

    return () => {
      clearInterval(tickRef.current);
      clearTimeout(completionTimer);
    };
  }, [location.pathname, shouldReduceMotion]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="top-progress"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          className="fixed top-0 left-0 right-0 z-[200] h-[2px] bg-transparent pointer-events-none"
          aria-hidden="true"
        >
          <motion.div
            className="h-full rounded-r-full bg-gradient-to-r from-brand-base via-accent-indigo to-accent-cyan shadow-[0_0_8px_var(--color-brand-glow)]"
            style={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
