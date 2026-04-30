/**
 * @fileoverview AudioPlayBadge
 * Badge circular compacto que indica que un asset tiene audio y permite
 * su reproduccion rapida al hacer click. Pensado para superponerse sobre
 * thumbnails de assets en grids de cards, selectores y vistas de detalle.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Volume2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/** Mapa de tamanos: clases del contenedor y tamano del icono */
const SIZE_MAP = {
  xs: { container: 'size-5', icon: 10 },
  sm: { container: 'size-6', icon: 12 },
};

/**
 * Badge circular de reproduccion rapida de audio.
 *
 * @param {Object} props
 * @param {string} props.audioUrl - URL del archivo de audio (requerido)
 * @param {'xs'|'sm'} props.size - Tamano del badge (por defecto 'xs')
 * @param {string} props.className - Clases adicionales de Tailwind
 */
export default function AudioPlayBadge({ audioUrl, size = 'xs', className }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const { shouldReduceMotion } = useReducedMotion();

  const { container: sizeClass, icon: iconSize } = SIZE_MAP[size] || SIZE_MAP.xs;

  // Limpiar audio al desmontar
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Detener y resetear cuando cambia la URL
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, [audioUrl]);

  const handleToggle = useCallback(
    (event) => {
      event.stopPropagation();

      if (isPlaying && audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
        return;
      }

      const audio = new Audio(audioUrl);

      audio.addEventListener('ended', () => {
        setIsPlaying(false);
        audioRef.current = null;
      });

      audio.play().then(() => {
        audioRef.current = audio;
        setIsPlaying(true);
        return undefined;
      }).catch(() => {
        // El navegador bloqueo la reproduccion (autoplay policy)
        setIsPlaying(false);
      });
    },
    [audioUrl, isPlaying]
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleToggle(event);
      }
    },
    [handleToggle]
  );

  return (
    <button
      type="button"
      aria-label={isPlaying ? 'Detener audio' : 'Reproducir audio'}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={cn(
        'rounded-full flex items-center justify-center cursor-pointer shadow-sm backdrop-blur-sm border-0',
        'transition-colors duration-200',
        sizeClass,
        isPlaying
          ? 'bg-accent-indigo'
          : 'bg-brand-base/80 hover:bg-brand-base',
        className
      )}
    >
      <Volume2
        size={iconSize}
        className={cn(
          'text-text-primary',
          // Pulse solo si esta reproduciendo y el usuario no prefiere menos movimiento.
          isPlaying && !shouldReduceMotion && 'animate-pulse'
        )}
      />
    </button>
  );
}

AudioPlayBadge.propTypes = {
  audioUrl: PropTypes.string.isRequired,
  size: PropTypes.oneOf(['xs', 'sm']),
  className: PropTypes.string,
};
