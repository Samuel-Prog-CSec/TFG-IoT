import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook para manejar el temporizador del juego
 * 
 * @param {Object} options
 * @param {number} options.initialTime - Tiempo inicial en segundos
 * @param {boolean} options.autoStart - Si iniciar automáticamente
 * @param {Function} options.onTimeout - Callback cuando el tiempo se agota
 * @param {Function} options.onTick - Callback en cada tick (opcional)
 */
export function useGameTimer({ 
  initialTime = 15, 
  autoStart = false, 
  onTimeout,
  onTick 
}) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(autoStart);
  const intervalRef = useRef(null);
  const onTimeoutRef = useRef(onTimeout);
  const onTickRef = useRef(onTick);

  // Mantener refs actualizadas
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
    onTickRef.current = onTick;
  }, [onTimeout, onTick]);

  // Limpiar intervalo al desmontar
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Manejar el tick del timer
  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = prev - 1;
        
        if (onTickRef.current) {
          onTickRef.current(newTime);
        }

        if (newTime <= 0) {
          setIsRunning(false);
          if (onTimeoutRef.current) {
            onTimeoutRef.current();
          }
          return 0;
        }
        
        return newTime;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const start = useCallback(() => {
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback((newTime = initialTime) => {
    setTimeLeft(newTime);
    setIsRunning(false);
  }, [initialTime]);

  const restart = useCallback((newTime = initialTime) => {
    setTimeLeft(newTime);
    setIsRunning(true);
  }, [initialTime]);

  return {
    timeLeft,
    isRunning,
    start,
    pause,
    reset,
    restart,
    percentage: (timeLeft / initialTime) * 100,
  };
}

export default useGameTimer;
