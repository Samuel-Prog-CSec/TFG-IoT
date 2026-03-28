import PropTypes from 'prop-types';
import { cva } from 'class-variance-authority';
import { motion } from 'framer-motion';
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
        // Por defecto: superficie ligeramente elevada del fondo principal
        default: [
          'bg-background-elevated/40 backdrop-blur-xl saturate-150',
          'border border-border-subtle',
          'shadow-[0_4px_24px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.05)]'
        ],
        // Para contenidos que necesitan destacar fuertemente
        solid: [
          'bg-background-surface/80 backdrop-blur-2xl',
          'border border-border-default',
          'shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
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
          'shadow-[0_4px_24px_var(--color-brand-glow)]'
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
        // Solo aplica en hover si es interactive, o siempre si queremos que brille fijo
        true: 'hover:shadow-[0_0_30px_var(--color-brand-glow),inset_0_1px_0_rgba(255,255,255,0.2)]',
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
 * @param {string} props.className - Clases adicionales tailwind
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

      {/* Contenido principal posicionado jerárquicamente por encima de los decoradores */}
      <div className="relative z-10 h-full w-full">
        {children}
      </div>
    </Component>
  );
};

GlassCard.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'solid', 'subtle', 'gradient']),
  padding: PropTypes.oneOf(['none', 'sm', 'md', 'lg']),
  interactive: PropTypes.bool,
  animated: PropTypes.bool,
  glow: PropTypes.bool,
  motionProps: PropTypes.object,
};

export default GlassCard;
