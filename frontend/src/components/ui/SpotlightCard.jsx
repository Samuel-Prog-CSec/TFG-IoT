import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

/**
 * Card con efecto spotlight que sigue al cursor
 * Crea un degradado de luz que se mueve según la posición del mouse
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Contenido de la card
 * @param {string} props.className - Clases adicionales
 * @param {string} props.spotlightColor - Color del spotlight (default: rgba(139, 92, 246, 0.15))
 * @param {boolean} props.disabled - Desactiva el efecto spotlight
 */
export default function SpotlightCard({ 
  children, 
  className,
  spotlightColor = 'rgba(139, 92, 246, 0.15)',
  disabled = false,
  ...props 
}) {
  const divRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e) => {
    if (disabled || !divRef.current) return;
    
    const rect = divRef.current.getBoundingClientRect();
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseEnter = () => {
    if (!disabled) setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <article
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative overflow-hidden rounded-2xl',
        'bg-slate-800/40 backdrop-blur-md',
        'border border-white/5',
        'transition-all duration-300',
        'hover:border-white/10',
        className
      )}
      {...props}
    >
      {/* Spotlight gradient */}
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-500"
        aria-hidden="true"
        style={{
          opacity,
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 40%)`,
        }}
      />
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </article>
  );
}

SpotlightCard.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  spotlightColor: PropTypes.string,
  disabled: PropTypes.bool,
};
