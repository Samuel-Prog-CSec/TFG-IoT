import { memo } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

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
function TimerBar({ timeLeft, timeLimit, className }) {
  const { shouldReduceMotion } = useReducedMotion();
  const safeTimeLimit = Math.max(1, Number(timeLimit || 0));
  const safeTimeLeft = Math.max(0, Number(timeLeft || 0));
  const percentage = (safeTimeLeft / safeTimeLimit) * 100;
  
  // Determinar estado de urgencia según el porcentaje
  let isUrgent = false;
  let isCritical = false;

  if (percentage <= 20) {
    isUrgent = true;
    isCritical = true;
  } else if (percentage <= 40) {
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
            scale: [1, 1.15, 1],
          } : {}}
          transition={{ duration: 1.5, repeat: isCritical && !shouldReduceMotion ? Infinity : 0, ease: 'easeInOut' }}
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
                ? cn("bg-timer-critical/20 text-timer-critical", !shouldReduceMotion && "animate-pulse")
                : "bg-timer-warning/20 text-timer-warning"
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
          "bg-background-elevated/80 backdrop-blur-sm",
          "border-2",
          !isUrgent && "border-border-default",
          isUrgent && !isCritical && "border-dashed border-timer-warning/50",
          isCritical && "border-timer-critical/70",
          isCritical && !shouldReduceMotion && "animate-shake"
        )}
        aria-hidden="true"
      >
        {/* Fill — 3 capas superpuestas con crossfade de opacity para transicion suave de color */}
        {[
          { tier: 'safe', active: percentage > 40, gradient: 'from-timer-safe to-timer-safe-alt', glow: 'var(--color-timer-safe-glow)' },
          { tier: 'warning', active: percentage > 20 && percentage <= 40, gradient: 'from-timer-warning to-timer-warning-alt', glow: 'var(--color-timer-warning-glow)' },
          { tier: 'critical', active: percentage <= 20, gradient: 'from-timer-critical to-timer-critical-alt', glow: 'var(--color-timer-critical-glow)' },
        ].map(({ tier, active, gradient, glow }) => (
          <motion.div
            key={tier}
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              `bg-gradient-to-r ${gradient}`,
              "transition-opacity duration-500"
            )}
            initial={{ width: '100%' }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.3, ease: 'linear' }}
            style={{
              boxShadow: `0 0 20px ${glow}`,
              opacity: active ? 1 : 0,
            }}
          />
        ))}

        {/* Shimmer effect */}
        <div 
          className="absolute inset-0 bg-gradient-to-r from-transparent via-border-strong to-transparent"
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
                "size-1.5 rounded-full transition-colors duration-300",
                percentage > marker ? "bg-border-strong" : "bg-border-default"
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
