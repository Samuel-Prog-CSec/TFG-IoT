import { memo } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

const TIMER_MARKERS = [20, 40, 60, 80, 100];

/**
 * Barra de tiempo visual para el juego
 * Cambia de color según el tiempo restante (verde → amarillo → rojo)
 * Sin números para ser amigable para niños de 4-8 años
 * 
 * @param {Object} props
 * @param {number} props.timeLeft - Tiempo restante en segundos
 * @param {number} props.timeLimit - Tiempo total en segundos
 * @param {string} [props.className] - Clases adicionales
 */
function TimerBar({ timeLeft, timeLimit, className, shouldReduceMotion = false }) {
  const safeTimeLimit = Math.max(1, Number(timeLimit || 0));
  const safeTimeLeft = Math.max(0, Number(timeLeft || 0));
  const percentage = (safeTimeLeft / safeTimeLimit) * 100;
  
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
  let timeStatus = 'suficiente tiempo';
  if (isUrgent) {
    timeStatus = 'poco tiempo';
  }
  if (isCritical) {
    timeStatus = 'crítico';
  }

  return (
    <div className={cn("w-full", className)}>
      <span className="sr-only">Tiempo restante: {Math.ceil(safeTimeLeft)} segundos, estado: {timeStatus}</span>
      {/* Timer label con icono animado */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <motion.span
          animate={isCritical && !shouldReduceMotion ? {
            scale: [1, 1.2, 1],
            rotate: [0, -10, 10, 0]
          } : {}}
          transition={{ duration: 0.5, repeat: isCritical && !shouldReduceMotion ? Infinity : 0 }}
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
                ? cn("bg-rose-500/20 text-rose-400", !shouldReduceMotion && "animate-pulse")
                : "bg-amber-500/20 text-amber-400"
            )}
            role="status"
            aria-live="polite"
          >
            {isCritical ? '¡Rápido!' : '¡Vamos!'}
          </motion.span>
        )}
      </div>

      {/* Track */}
      <progress className="sr-only" max={safeTimeLimit} value={safeTimeLeft}>
        {safeTimeLeft} de {safeTimeLimit}
      </progress>

      <div
        className={cn(
          "relative h-6 rounded-full overflow-hidden",
          "bg-slate-800/80 backdrop-blur-sm",
          "border-2 border-white/10",
          isCritical && !shouldReduceMotion && "animate-[shake_0.5s_ease-in-out_infinite]"
        )}
        aria-hidden="true"
      >
        {/* Fill */}
        <motion.div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            `bg-gradient-to-r ${colorClass}`
          )}
          initial={{ width: '100%' }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.3, ease: 'linear' }}
          style={{
            boxShadow: `0 0 20px ${glowColor}`,
          }}
        />

        {/* Shimmer effect */}
        <div 
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
          style={{
            animation: shouldReduceMotion ? 'none' : 'shimmer 2s infinite',
            width: '50%',
          }}
        />

        {/* Decorative dots */}
        <div className="absolute inset-0 flex items-center justify-evenly px-2 pointer-events-none" aria-hidden="true">
          {TIMER_MARKERS.map(marker => (
            <div 
              key={`timer-marker-${marker}`}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors duration-300",
                percentage > marker ? "bg-white/30" : "bg-white/10"
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
  shouldReduceMotion: PropTypes.bool,
};

export default memo(TimerBar);
