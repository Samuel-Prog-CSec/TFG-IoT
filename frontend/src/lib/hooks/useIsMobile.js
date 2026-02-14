/**
 * @fileoverview Hook personalizado para detectar dispositivos móviles
 * Usa window.matchMedia para detección responsive.
 * 
 * @module lib/hooks/useIsMobile
 */

import { useState, useEffect } from 'react';

/** Breakpoint móvil (Tailwind sm = 640px) */
const MOBILE_BREAKPOINT = 640;

/**
 * Hook para detectar si el dispositivo es móvil basándose en el ancho de ventana
 * @param {number} [breakpoint=640] - Ancho máximo para considerar móvil (px)
 * @returns {boolean} true si es móvil, false si no
 * 
 * @example
 * const isMobile = useIsMobile();
 * // o con breakpoint personalizado
 * const isTablet = useIsMobile(768);
 */
export default function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  // Inicializar con undefined para evitar hydration mismatch
  const [isMobile, setIsMobile] = useState(undefined);

  useEffect(() => {
    // Crear media query
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    
    // Handler para cambios
    const handleChange = (event) => {
      setIsMobile(event.matches);
    };
    
    // Establecer valor inicial
    setIsMobile(mediaQuery.matches);
    
    // Suscribirse a cambios
    // Usar addEventListener con fallback a addListener para compatibilidad
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      // Fallback para navegadores antiguos
      mediaQuery.addListener(handleChange);
    }
    
    // Cleanup
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [breakpoint]);

  return isMobile;
}
