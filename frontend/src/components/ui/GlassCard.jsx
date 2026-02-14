import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

/**
 * Card con efecto glassmorphism premium
 * Incluye opciones para bordes con gradiente y diferentes niveles de opacidad
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Contenido de la card
 * @param {string} props.className - Clases adicionales
 * @param {'default' | 'solid' | 'gradient'} props.variant - Variante de estilo
 * @param {boolean} props.hover - Activa efectos hover
 * @param {boolean} props.glow - Añade glow en hover
 */
export default function GlassCard({ 
  children, 
  className,
  variant = 'default',
  hover = true,
  glow = false,
  ...props 
}) {
  const variants = {
    default: 'glass-card',
    solid: 'glass-solid rounded-2xl',
    gradient: 'glass-card-gradient',
  };

  return (
    <article
      className={cn(
        variants[variant],
        hover && 'transition-all duration-300 hover:border-white/10 hover:shadow-lg',
        glow && 'hover:shadow-[0_0_30px_rgba(139,92,246,0.2)]',
        className
      )}
      {...props}
    >
      {children}
    </article>
  );
}

GlassCard.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'solid', 'gradient']),
  hover: PropTypes.bool,
  glow: PropTypes.bool,
};
