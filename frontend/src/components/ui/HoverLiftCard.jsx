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
  // Glows pensados para los dos temas con tokens OKLCH del sistema.
  // Cada uno es sutil (alpha 0.25-0.45 según token) para no competir con el contenido.
  // Antes los seis últimos usaban `rgba(...)` hardcoded — el alpha y la
  // saturación no respetaban el ajuste por tema definido en `index.css`
  // (auditoría UI/UX 24/05/2026). Ahora todos consumen el token
  // `--color-{tone}-glow` correspondiente, que ya tiene variante por tema.
  brand: 'hover:shadow-[0_14px_38px_-14px_var(--color-brand-glow)]',
  // `atmosphere` lee el glow del contexto pedagógico activo
  // (`--color-atmosphere-glow`). Cuando no hay contexto activo el token
  // cae al brand y el resultado es idéntico a `glowTint="brand"`. T-954.
  atmosphere: 'hover:shadow-[0_14px_38px_-14px_var(--color-atmosphere-glow)]',
  indigo: 'hover:shadow-[0_14px_38px_-14px_var(--color-accent-indigo-glow)]',
  cyan: 'hover:shadow-[0_14px_38px_-14px_var(--color-accent-cyan-glow)]',
  success: 'hover:shadow-[0_14px_38px_-14px_var(--color-success-glow)]',
  warning: 'hover:shadow-[0_14px_38px_-14px_var(--color-warning-glow)]',
  error: 'hover:shadow-[0_14px_38px_-14px_var(--color-error-glow)]',
  pink: 'hover:shadow-[0_14px_38px_-14px_var(--color-accent-pink-glow)]'
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

  // Si la card es clicable debe ser operable por teclado: role=button, foco
  // tabulable y activación con Enter/Espacio (WCAG 2.1.1 Keyboard + 2.4.7 Focus
  // Visible). Sin esto, las cards con onClick sin botón interno (p. ej. las de
  // Contextos) dejaban fuera a usuarios de teclado y lector de pantalla.
  const interactiveProps = onClick
    ? {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(e);
          }
        },
      }
    : {};

  return (
    <motion.div
      onClick={onClick}
      aria-label={ariaLabel}
      whileHover={shouldReduceMotion ? undefined : { y: -4, scale: 1.01 }}
      whileTap={shouldReduceMotion || !onClick ? undefined : { scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'relative transition-shadow duration-300 will-change-transform',
        onClick &&
          'rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base',
        glowCls,
        className
      )}
      {...interactiveProps}
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
