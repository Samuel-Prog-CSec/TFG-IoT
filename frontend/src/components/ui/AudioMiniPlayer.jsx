/**
 * @fileoverview AudioMiniPlayer
 * Reproductor de audio compacto para la plataforma educativa RFID.
 * Soporta dos tamanos (sm/md) y dos variantes visuales (glass/solid).
 * Utilizado en ChallengeDisplay (sm) y ContextDetailPage (md).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Formatea segundos a formato M:SS.
 * @param {number} seconds - Segundos a formatear
 * @returns {string} Tiempo formateado (ej. "0:03", "1:12")
 */
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Variantes de animacion para los iconos de play/pause */
const iconVariants = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.6 },
};

const iconTransition = { duration: 0.15, ease: [0.4, 0, 0.2, 1] };

/**
 * Reproductor de audio compacto con soporte glassmorphism.
 *
 * @param {Object} props
 * @param {string} props.audioUrl - URL del archivo de audio (requerido)
 * @param {'sm'|'md'} props.size - Tamano del reproductor
 * @param {'glass'|'solid'} props.variant - Variante visual
 * @param {string} props.className - Clases adicionales de Tailwind
 */
export default function AudioMiniPlayer({
  audioUrl,
  size = 'sm',
  variant = 'glass',
  className,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const audioRef = useRef(null);
  const progressBarRef = useRef(null);

  // Crear y configurar el elemento de audio
  useEffect(() => {
    const audio = new Audio(audioUrl);
    // preload='metadata': trae solo la duración (pocos KB) para pintar la barra,
    // NO el clip completo hasta que el usuario pulse Play (ahorra egress de Supabase
    // cuando el reproductor se monta pero no se reproduce). El audio es la única
    // clase de asset sin optimizar en servidor, así que esto importa.
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
      setHasError(false);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onError = () => {
      setHasError(true);
      setIsLoaded(false);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      // (C3) Quitar los listeners ANTES de liberar, para no capturar el evento
      // 'error' de la descarga de limpieza.
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      // NO usar `audio.src = ''`: el navegador lo resuelve contra la URL base del
      // documento (SPA) e intenta cargarla → petición HTTP espuria + un MediaError
      // en consola en CADA cambio de ronda/URL o desmontaje. removeAttribute('src')
      // + load() libera el buffer sin disparar ninguna carga.
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [audioUrl]);

  // Resetear estado cuando cambia la URL
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsLoaded(false);
    setHasError(false);
  }, [audioUrl]);

  // Sincronizar estado de mute con el elemento de audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || hasError) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
        return undefined;
      }).catch(() => {
        // El navegador bloqueo la reproduccion (autoplay policy)
        setIsPlaying(false);
      });
    }
  }, [isPlaying, hasError]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleSeek = useCallback(
    (event) => {
      const audio = audioRef.current;
      const bar = progressBarRef.current;
      if (!audio || !bar || hasError || !isLoaded) return;

      const rect = bar.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const newTime = ratio * duration;

      audio.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration, hasError, isLoaded]
  );

  // Soporte de teclado para la barra de progreso (flechas izquierda/derecha)
  const handleProgressKeyDown = useCallback(
    (event) => {
      const audio = audioRef.current;
      if (!audio || hasError || !isLoaded) return;

      const STEP = 5; // Salto de 5 segundos
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const newTime = Math.min(duration, audio.currentTime + STEP);
        audio.currentTime = newTime;
        setCurrentTime(newTime);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const newTime = Math.max(0, audio.currentTime - STEP);
        audio.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [duration, hasError, isLoaded]
  );

  // Calcular porcentaje de progreso
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Clave para AnimatePresence del icono play/pause/error
  function getPlayIconKey() {
    if (hasError) return 'error';
    if (isPlaying) return 'pause';
    return 'play';
  }
  const playIconKey = getPlayIconKey();

  // Clases de contenedor segun variante
  const containerClasses = cn(
    'flex items-center gap-2 rounded-xl',
    'px-3 py-2',
    variant === 'glass'
      ? 'bg-glass-bg border border-glass-border backdrop-blur-xl saturate-150'
      : 'bg-background-elevated/60 border border-border-subtle',
    hasError && 'opacity-50 cursor-not-allowed',
    className
  );

  // Tamano de los botones
  const buttonSize = size === 'sm' ? 'size-7' : 'size-8';
  const iconSize = 14;

  return (
    <div className={containerClasses} title="Escuchar audio">
      {/* Boton Play/Pause */}
      <motion.button
        type="button"
        whileTap={!hasError ? { scale: 0.9 } : undefined}
        onClick={togglePlay}
        disabled={hasError}
        aria-label={isPlaying ? 'Pausar audio' : 'Reproducir audio'}
        className={cn(
          'flex-shrink-0 flex items-center justify-center rounded-full',
          'bg-accent-indigo/20 hover:bg-accent-indigo/30',
          'text-text-primary transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo/50',
          buttonSize,
          hasError && 'pointer-events-none'
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={playIconKey}
            variants={iconVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={iconTransition}
            className="flex items-center justify-center"
          >
            {hasError && <AlertCircle size={iconSize} />}
            {!hasError && isPlaying && <Pause size={iconSize} />}
            {!hasError && !isPlaying && <Play size={iconSize} className="ml-0.5" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* Barra de progreso */}
      <div
        ref={progressBarRef}
        role="progressbar"
        tabIndex={hasError ? -1 : 0}
        aria-valuenow={Math.round(currentTime)}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-label="Progreso del audio"
        aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
        onClick={handleSeek}
        onKeyDown={handleProgressKeyDown}
        className={cn(
          'flex-1 h-[3px] rounded-full cursor-pointer',
          'bg-background-surface/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          hasError && 'pointer-events-none'
        )}
      >
        <div
          className="bg-accent-indigo rounded-full h-[3px] transition-[width] duration-200"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Duracion */}
      <span className="flex-shrink-0 text-text-muted font-mono text-xs tabular-nums select-none">
        {formatTime(currentTime)}/{formatTime(duration)}
      </span>

      {/* Boton de volumen (solo en tamano md) */}
      {size === 'md' && (
        <motion.button
          type="button"
          whileTap={!hasError ? { scale: 0.9 } : undefined}
          onClick={toggleMute}
          disabled={hasError}
          aria-label={isMuted ? 'Activar sonido' : 'Silenciar audio'}
          className={cn(
            'flex-shrink-0 flex items-center justify-center rounded-full',
            'bg-accent-indigo/20 hover:bg-accent-indigo/30',
            'text-text-primary transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo/50',
            'size-6',
            hasError && 'pointer-events-none'
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isMuted ? (
              <motion.span
                key="muted"
                variants={iconVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={iconTransition}
                className="flex items-center justify-center"
              >
                <VolumeX size={iconSize} />
              </motion.span>
            ) : (
              <motion.span
                key="unmuted"
                variants={iconVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={iconTransition}
                className="flex items-center justify-center"
              >
                <Volume2 size={iconSize} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      )}
    </div>
  );
}

AudioMiniPlayer.propTypes = {
  audioUrl: PropTypes.string.isRequired,
  size: PropTypes.oneOf(['sm', 'md']),
  variant: PropTypes.oneOf(['glass', 'solid']),
  className: PropTypes.string,
};
