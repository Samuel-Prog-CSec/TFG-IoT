import { useState, useEffect } from 'react';

/**
 * Hook para detectar si el viewport es móvil
 * @param {number} breakpoint - Breakpoint en píxeles (default: 1024 para lg)
 * @returns {boolean} true si es móvil
 */
export function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(
    typeof globalThis !== 'undefined' ? globalThis.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const checkMobile = () => setIsMobile(globalThis.innerWidth < breakpoint);
    
    // Usar matchMedia para mejor rendimiento
    const mediaQuery = globalThis.matchMedia?.(`(max-width: ${breakpoint - 1}px)`);
    
    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener('change', checkMobile);
      return () => mediaQuery.removeEventListener('change', checkMobile);
    } else {
      // Fallback para navegadores antiguos
      globalThis.addEventListener('resize', checkMobile);
      return () => globalThis.removeEventListener('resize', checkMobile);
    }
  }, [breakpoint]);

  return isMobile;
}

export default useIsMobile;
