import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @fileoverview HoverLiftCard — primitive unificado para cards con hover lift
 * y glow contextual en los 3 listados del profesor (Sesiones, Mazos, Contextos).
 *
 * Motivacion (P14): hoy cada listado tiene su propio patron de hover (y=-4
 * vs z=20 vs nada), lo que rompe la sensacion de tactilidad uniforme en la UI.
 * Este componente centraliza la micro-interaccion para que los 3 reaccionen
 * identicamente, con un tint de glow que distingue el tipo (brand/context/...).
 *
 * Acepta children y solo envuelve con el motion + glow — NO renderiza un
 * GlassCard automaticamente para favorecer composicion explicita (ver
 * vercel-composition-patterns: avoid boolean-prop proliferation).
 */

const TINT_GLOW = {
  // Glows pensados para dark theme con tokens OKLCH del sistema.
  // Cada uno es sutil (alpha 0.25-0.35) para no competir con el contenido.
  brand: 'hover:shadow-[0_14px_38px_-14px_var(--color-brand-glow)]',
  // `atmosphere` lee el glow del contexto pedagógico activo
  // (`--color-atmosphere-glow`). Cuando no hay contexto activo el token
  // cae al brand y el resultado es idéntico a `glowTint="brand"`. T-954.
  atmosphere: 'hover:shadow-[0_14px_38px_-14px_var(--color-atmosphere-glow)]',
  indigo: 'hover:shadow-[0_14px_38px_-14px_rgba(99,102,241,0.45)]',
  cyan: 'hover:shadow-[0_14px_38px_-14px_rgba(34,211,238,0.4)]',
  success: 'hover:shadow-[0_14px_38px_-14px_rgba(74,222,128,0.4)]',
  warning: 'hover:shadow-[0_14px_38px_-14px_rgba(250,204,21,0.4)]',
  error: 'hover:shadow-[0_14px_38px_-14px_rgba(248,113,113,0.4)]',
  pink: 'hover:shadow-[0_14px_38px_-14px_rgba(244,114,182,0.4)]'
};

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {'brand'|'atmosphere'|'indigo'|'cyan'|'success'|'warning'|'error'|'pink'} [props.glowTint='brand']
 * @param {string} [props.className]
 * @param {Function} [props.onClick]
 * @param {string} [props.ariaLabel]
 */
export default function HoverLiftCard({
  children,
  glowTint = 'brand',
  className,
  onClick,
  ariaLabel,
  ...rest
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const glowCls = TINT_GLOW[glowTint] || TINT_GLOW.brand;

  return (
    <motion.div
      onClick={onClick}
      aria-label={ariaLabel}
      whileHover={shouldReduceMotion ? undefined : { y: -4, scale: 1.01 }}
      whileTap={shouldReduceMotion || !onClick ? undefined : { scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'relative transition-shadow duration-300 will-change-transform',
        glowCls,
        className
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

HoverLiftCard.propTypes = {
  children: PropTypes.node.isRequired,
  glowTint: PropTypes.oneOf(['brand', 'atmosphere', 'indigo', 'cyan', 'success', 'warning', 'error', 'pink']),
  className: PropTypes.string,
  onClick: PropTypes.func,
  ariaLabel: PropTypes.string
};
