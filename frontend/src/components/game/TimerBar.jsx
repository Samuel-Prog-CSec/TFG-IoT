import { memo } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

/**
 * Barra de tiempo visual para el juego
 * Cambia de color según el tiempo restante (verde → amarillo → rojo)
 * Sin números para ser amigable para niños de 4-6 años
 * 
 * @param {Object} props
 * @param {number} props.timeLeft - Tiempo restante en segundos
 * @param {number} props.timeLimit - Tiempo total en segundos
 * @param {string} [props.className] - Clases adicionales
 */
function TimerBar({ timeLeft, timeLimit, className }) {
  const percentage = (timeLeft / timeLimit) * 100;
  
  // Determinar color y estado según el porcentaje
  let colorClass = 'from-emerald-400 to-cyan-400';
  let glowColor = 'rgba(74, 222, 128, 0.4)';
  let isUrgent = false;
  let isCritical = false;

  if (percentage <= 20) {
    colorClass = 'from-rose-500 to-red-500';
    glowColor = 'rgba(251, 113, 133, 0.5)';
    isUrgent = true;
    isCritical = true;
  } else if (percentage <= 40) {
    colorClass = 'from-amber-400 to-orange-400';
    glowColor = 'rgba(251, 191, 36, 0.4)';
    isUrgent = true;
  }

  // Texto para screen readers
  const timeStatus = isCritical ? 'crítico' : isUrgent ? 'poco tiempo' : 'suficiente tiempo';

  return (
    <div 
      className={cn("w-full", className)}
      role="timer"
      aria-live="polite"
      aria-label={`Tiempo restante: ${Math.ceil(timeLeft)} segundos, estado: ${timeStatus}`}
    >
      {/* Timer label con icono animado */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <motion.span
          animate={isCritical ? { 
            scale: [1, 1.2, 1],
            rotate: [0, -10, 10, 0]
          } : {}}
          transition={{ duration: 0.5, repeat: isCritical ? Infinity : 0 }}
          className="text-2xl"
          aria-hidden="true"
        >
          ⏰
        </motion.span>
        {isUrgent && (
          <motion.span
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "text-sm font-bold px-3 py-1 rounded-full",
              isCritical 
                ? "bg-rose-500/20 text-rose-400 animate-pulse"
                : "bg-amber-500/20 text-amber-400"
            )}
            role="alert"
          >
            {isCritical ? '¡Rápido!' : '¡Vamos!'}
          </motion.span>
        )}
      </div>

      {/* Track */}
      <div 
        className={cn(
          "relative h-6 rounded-full overflow-hidden",
          "bg-slate-800/80 backdrop-blur-sm",
          "border-2 border-white/10",
          isCritical && "animate-[shake_0.5s_ease-in-out_infinite]"
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={timeLimit}
        aria-valuenow={timeLeft}
        aria-valuetext={`${Math.round(percentage)}% del tiempo restante`}
      >
        {/* Fill */}
        <motion.div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            `bg-gradient-to-r ${colorClass}`
          )}
          initial={{ width: '100%' }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3, ease: 'linear' }}
          style={{
            boxShadow: `0 0 20px ${glowColor}`,
          }}
        />

        {/* Shimmer effect */}
        <div 
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{
            animation: 'shimmer 2s infinite',
            width: '50%',
          }}
        />

        {/* Decorative dots */}
        <div className="absolute inset-0 flex items-center justify-evenly px-2 pointer-events-none" aria-hidden="true">
          {[...Array(5)].map((_, i) => (
            <div 
              key={i} 
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors duration-300",
                percentage > (i + 1) * 20 ? "bg-white/30" : "bg-white/10"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

TimerBar.propTypes = {
  timeLeft: PropTypes.number.isRequired,
  timeLimit: PropTypes.number.isRequired,
  className: PropTypes.string,
};

export default memo(TimerBar);
