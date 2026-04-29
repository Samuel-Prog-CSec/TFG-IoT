import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @fileoverview ScanlineOverlay — linea sutil que barre de arriba hacia abajo
 * reforzando la metafora "tactile/scan" del producto RFID. Se usa en las
 * tarjetas secundarias de listado (SessionCard, ContextCard) como firma visual
 * diferenciadora cuando el usuario esta hover sobre ellas.
 *
 * DeckCard NO usa este primitivo: ya tiene su propio signature (gradient-shift
 * en el borde). Se reserva para las tarjetas que carecen de peso propio.
 *
 * Diseño CSS-controlled: el componente siempre renderiza la motion.span del
 * barrido; la visibilidad se controla desde fuera con utilidades Tailwind
 * (tipicamente `opacity-0 group-hover:opacity-100 transition-opacity`). Esto
 * evita anadir onMouseEnter/Leave al wrapper padre, que en tests con userEvent
 * rompe la propagacion del click a los buttons internos cuando el padre es un
 * motion.div con whileTap (framer-motion 12 en jsdom).
 *
 * Reglas de uso:
 *  - Solo en tarjetas interactivas primarias; nunca en botones pequenos ni inputs.
 *  - El contenedor padre debe tener `position: relative` y `overflow: hidden`,
 *    ademas de la clase `group` para que `group-hover:` tenga efecto.
 *  - Respeta `prefers-reduced-motion`: si esta activado, no renderiza nada.
 */
export default function ScanlineOverlay({
  color = 'var(--color-brand-glow)',
  duration = 1.6,
  opacity = 0.18,
  className,
}) {
  const { shouldReduceMotion } = useReducedMotion();
  if (shouldReduceMotion) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]',
        className
      )}
    >
      <motion.span
        className="absolute inset-x-0 h-[1.5px]"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
          opacity,
          willChange: 'transform',
        }}
        initial={{ y: '-100%' }}
        animate={{ y: '100%' }}
        transition={{
          duration,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatDelay: 0.2,
        }}
      />
    </div>
  );
}

ScanlineOverlay.propTypes = {
  color: PropTypes.string,
  duration: PropTypes.number,
  opacity: PropTypes.number,
  className: PropTypes.string,
};
