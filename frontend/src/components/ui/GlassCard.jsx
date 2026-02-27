import React from 'react';
import PropTypes from 'prop-types';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * @fileoverview Componente GlassCard
 * Contenedor principal de la interfaz "Eduplay V2".
 * Sustituye las sombras profundas genéricas por variaciones sutiles de color de fondo (Squint Test).
 * Utiliza bordes translúcidos e imita una jerarquía de elevación sólida basada en interfaz de usuario profesional.
 */

const cardVariants = cva(
  'rounded-2xl transition-all duration-300 relative overflow-hidden',
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
        true: 'cursor-pointer hover:border-border-strong hover:-translate-y-1 hover:shadow-lg',
        false: ''
      },
      glow: {
        // Solo aplica en hover si es interactive, o siempre si queremos que brille fijo
        true: 'hover:shadow-[0_0_30px_var(--color-brand-glow),inset_0_1px_0_rgba(255,255,255,0.2)]',
        false: ''
      }
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      interactive: false,
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
 * @param {boolean} props.glow - Añade un resplandor OKLCH en hover (útil para cards clickables)
 */
const GlassCard = React.forwardRef(({ 
  children, 
  className,
  variant,
  padding,
  interactive,
  glow,
  ...props 
}, ref) => {
  return (
    <article
      ref={ref}
      className={cn(cardVariants({ variant, padding, interactive, glow, className }))}
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
    </article>
  );
});

GlassCard.displayName = "GlassCard";

GlassCard.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'solid', 'subtle', 'gradient']),
  padding: PropTypes.oneOf(['none', 'sm', 'md', 'lg']),
  interactive: PropTypes.bool,
  glow: PropTypes.bool,
};

export default GlassCard;
