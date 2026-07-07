import PropTypes from 'prop-types';
import { cva } from 'class-variance-authority';
import { m as motion } from 'framer-motion';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @fileoverview Componente GlassCard
 * Contenedor principal de la interfaz "Eduplay V2".
 * Sustituye las sombras profundas genéricas por variaciones sutiles de color de fondo (Squint Test).
 * Utiliza bordes translúcidos e imita una jerarquía de elevación sólida basada en interfaz de usuario profesional.
 */

const cardVariants = cva(
  'rounded-2xl transition-[background-color,box-shadow,border-color,transform,opacity] duration-300 relative overflow-hidden',
  {
    variants: {
      variant: {
        // Por defecto: superficie ligeramente elevada del fondo principal.
        // Las shadows se delegan a los tokens semánticos `--shadow-*` que
        // varían por tema (en dark son negras al 35%, en light al 8%).
        default: [
          'bg-background-elevated/40 backdrop-blur-xl saturate-150',
          'border border-border-subtle',
          'shadow-[var(--shadow-md),var(--shadow-inset-card)]'
        ],
        // Para contenidos que necesitan destacar fuertemente
        solid: [
          'bg-background-surface/80 backdrop-blur-2xl',
          'border border-border-default',
          'shadow-[var(--shadow-lg),var(--shadow-inset-card)]'
        ],
        // Para "vacíos" o espacios contenedores secundarios
        subtle: [
          'bg-background-elevated/10 backdrop-blur-md',
          'border border-transparent hover:border-border-subtle'
        ],
        // Énfasis de marca (para sesiones activas o destacados)
        gradient: [
          'bg-background-surface/60 backdrop-blur-xl',
          'border border-brand-base/30',
          'shadow-[var(--shadow-glow)]'
        ]
      },
      padding: {
        none: 'p-0',
        sm: 'p-4',
        md: 'p-6 lg:p-8',
        lg: 'p-8 lg:p-10'
      },
      interactive: {
        true: 'cursor-pointer hover:border-border-strong hover:shadow-lg',
        false: ''
      },
      animated: {
        true: '',
        false: ''
      },
      glow: {
        // Solo aplica en hover si es interactive, o siempre si queremos que brille fijo.
        // El glow grande usa el token --shadow-glow (24px brand-glow) y
        // refuerza con un inset card sutil para sensación de "lift" táctil.
        true: 'hover:shadow-[var(--shadow-glow),var(--shadow-inset-card)]',
        false: ''
      }
    },
    compoundVariants: [
      {
        interactive: true,
        animated: false,
        className: 'hover:-translate-y-1',
      },
    ],
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      interactive: false,
      animated: false,
      glow: false
    },
  }
);

/**
 * Contenedor Card con efecto glassmorphism premium refactorizado.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Contenido de la card
 * @param {string} props.className - Clases adicionales tailwind (van a la RAÍZ
 *   de la card: padding, borde, hover, sombra…).
 * @param {string} [props.contentClassName] - Clases de LAYOUT para el wrapper
 *   interno que contiene a los children (flex/grid/items/justify/gap). NECESARIO
 *   para alinear los hijos: GlassCard envuelve los children en un div propio, así
 *   que las clases de layout pasadas por `className` se aplican a la raíz y NO
 *   alinean a los hijos. Usa `contentClassName` para eso (QA 2026-06-04).
 * @param {'default'|'solid'|'subtle'|'gradient'} props.variant - Variante visual
 * @param {'none'|'sm'|'md'|'lg'} props.padding - Padding interno
 * @param {boolean} props.interactive - Activa efectos de hover (elevación y border)
 * @param {boolean} props.animated - Usa Framer Motion para entrada animada (opt-in)
 * @param {boolean} props.glow - Añade un resplandor OKLCH en hover (útil para cards clickables)
 * @param {Object} props.motionProps - Props adicionales de Framer Motion (variants, custom, etc.)
 */
const GlassCard = ({
  ref,
  children,
  className,
  contentClassName,
  variant,
  padding,
  interactive,
  animated = false,
  glow,
  motionProps: extraMotionProps,
  ...props
}) => {
  const { shouldReduceMotion } = useReducedMotion();
  const useMotion = animated && !shouldReduceMotion;
  const Component = useMotion ? motion.article : 'article';

  const motionAttrs = useMotion ? {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURATION.entrance, ease: EASING.outExpo },
    ...(interactive ? { whileHover: { y: -4 }, whileTap: { scale: 0.99 } } : {}),
    ...extraMotionProps,
  } : {};

  return (
    <Component
      ref={ref}
      className={cn(cardVariants({ variant, padding, interactive, animated, glow, className }))}
      {...motionAttrs}
      {...props}
    >
      {/* Efecto pseudo-borde dinámico de acento en variantes 'gradient' */}
      {variant === 'gradient' && (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-base/20 to-transparent opacity-50 pointer-events-none" />
      )}

      {/* Contenido principal posicionado jerárquicamente por encima de los
          decoradores. `contentClassName` permite que las clases de layout
          (flex/grid…) alineen a los children desde aquí (ver JSDoc). */}
      <div className={cn('relative z-10 h-full w-full', contentClassName)}>
        {children}
      </div>
    </Component>
  );
};

GlassCard.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  contentClassName: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'solid', 'subtle', 'gradient']),
  padding: PropTypes.oneOf(['none', 'sm', 'md', 'lg']),
  interactive: PropTypes.bool,
  animated: PropTypes.bool,
  glow: PropTypes.bool,
  motionProps: PropTypes.object,
};

export default GlassCard;
