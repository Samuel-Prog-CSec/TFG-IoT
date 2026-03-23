import { useEffect, useRef } from 'react';

/**
 * Hook para actualizar el título del documento dinámicamente
 * Restaura el título original al desmontar
 * 
 * @param {string} title - Nuevo título de la página
 * @param {boolean} restoreOnUnmount - Si restaurar el título al desmontar (default: true)
 */
export function useDocumentTitle(title, restoreOnUnmount = true) {
  const originalTitle = useRef(document.title);

  useEffect(() => {
    document.title = title ? `${title} | EduPlay` : 'EduPlay - Juegos Educativos RFID';
  }, [title]);

  useEffect(() => {
    const savedTitle = originalTitle.current;
    return () => {
      if (restoreOnUnmount) {
        document.title = savedTitle;
      }
    };
  }, [restoreOnUnmount]);
}

export default useDocumentTitle;
