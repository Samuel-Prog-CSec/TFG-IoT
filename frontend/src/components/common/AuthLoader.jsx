/**
 * @fileoverview Componente de carga para estados de autenticación
 * Muestra un spinner animado con mensaje personalizable.
 * 
 * @module components/common/AuthLoader
 */

import PropTypes from 'prop-types';
import { motion } from 'framer-motion';

/**
 * Loader de autenticación con animaciones premium
 * @param {Object} props
 * @param {string} [props.message='Cargando...'] - Mensaje a mostrar bajo el spinner
 * @param {boolean} [props.fullScreen=true] - Si ocupa toda la pantalla
 * @param {string} [props.className] - Clases CSS adicionales
 */
export default function AuthLoader({ 
  message = 'Cargando...', 
  fullScreen = true,
  className = '' 
}) {
  const containerClasses = fullScreen 
    ? 'min-h-screen flex items-center justify-center bg-slate-950'
    : 'flex items-center justify-center p-8';

  return (
    <div 
      className={`${containerClasses} ${className}`}
      role="status"
      aria-label={message}
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        {/* Spinner principal */}
        <div className="relative">
          <motion.div 
            className="w-16 h-16 rounded-full border-4 border-purple-500/20"
            style={{ borderTopColor: '#8b5cf6' }}
            animate={{ rotate: 360 }}
            transition={{ 
              duration: 1, 
              repeat: Infinity, 
              ease: 'linear' 
            }}
            aria-hidden="true"
          />
          {/* Efecto de ping */}
          <motion.div 
            className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent"
            style={{ borderTopColor: 'rgba(139, 92, 246, 0.3)' }}
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.5, 0, 0.5]
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity, 
              ease: 'easeInOut' 
            }}
            aria-hidden="true"
          />
        </div>
        
        {/* Mensaje con animación de pulso */}
        <motion.p 
          className="text-slate-400 text-sm"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ 
            duration: 2, 
            repeat: Infinity, 
            ease: 'easeInOut' 
          }}
        >
          {message}
        </motion.p>
      </div>
    </div>
  );
}

AuthLoader.propTypes = {
  /** Mensaje a mostrar bajo el spinner */
  message: PropTypes.string,
  /** Si ocupa toda la pantalla */
  fullScreen: PropTypes.bool,
  /** Clases CSS adicionales */
  className: PropTypes.string,
};
