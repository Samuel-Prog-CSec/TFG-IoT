/**
 * @fileoverview AudioUploadModal
 * Modal para subir o reemplazar archivos de audio en un asset existente.
 * Soporta drag-and-drop y seleccion de archivo con validacion client-side.
 * Utilizado desde las tarjetas de asset en ContextDetailPage.
 *
 * @module components/ui/AudioUploadModal
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Music, Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import AudioMiniPlayer from './AudioMiniPlayer';
import { contextsAPI, extractData, extractErrorMessage } from '../../services/api';

/** Tipos MIME de audio aceptados */
const ACCEPTED_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/ogg']);

/** Tamano maximo por defecto en bytes (5 MB) */
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024;

/**
 * Formatea bytes a una cadena legible (KB, MB).
 * @param {number} bytes - Tamano en bytes
 * @returns {string} Tamano formateado
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * AudioUploadModal - Modal para subir/reemplazar audio de un asset.
 *
 * @param {Object} props
 * @param {string} props.assetKey - Key del asset destino
 * @param {string} props.assetValue - Nombre visible del asset (titulo)
 * @param {string} props.contextId - MongoDB _id del contexto
 * @param {string|null} props.currentAudioUrl - URL de audio actual (null si no hay)
 * @param {Function} props.onClose - Callback para cerrar el modal
 * @param {Function} props.onSuccess - Callback tras subida exitosa
 */
export default function AudioUploadModal({
  assetKey,
  assetValue,
  contextId,
  currentAudioUrl,
  onClose,
  onSuccess,
}) {
  const [file, setFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadConfig, setUploadConfig] = useState(null);

  const fileInputRef = useRef(null);
  const modalContentRef = useRef(null);

  // Tamano maximo efectivo: del backend o fallback
  const maxSize = uploadConfig?.audio?.maxSize ?? DEFAULT_MAX_SIZE;

  // --- Cargar configuracion de upload al montar ---
  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const response = await contextsAPI.getUploadConfig();
        const data = extractData(response);
        if (!cancelled) {
          setUploadConfig(data);
        }
      } catch {
        // Si falla se usa la config por defecto; no es critico
      }
    }

    loadConfig();
    return () => { cancelled = true; };
  }, []);

  // --- Cerrar con Escape ---
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, isSubmitting]);

  // --- Validacion del archivo ---
  const validateFile = useCallback(
    (candidate) => {
      if (!ACCEPTED_MIME_TYPES.has(candidate.type)) {
        toast.error('Formato no soportado', {
          description: 'Solo se permiten archivos MP3 y OGG.',
        });
        return false;
      }

      if (candidate.size > maxSize) {
        toast.error('Archivo demasiado grande', {
          description: `El archivo supera el limite de ${formatFileSize(maxSize)}.`,
        });
        return false;
      }

      return true;
    },
    [maxSize]
  );

  // --- Handlers de drag-and-drop ---
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Solo desactivar si se sale del dropzone (no de un hijo)
    if (e.currentTarget === e.target) {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const droppedFile = e.dataTransfer.files?.[0];
      if (!droppedFile) return;

      if (validateFile(droppedFile)) {
        setFile(droppedFile);
      }
    },
    [validateFile]
  );

  // --- Handler del input file ---
  const handleFileChange = useCallback(
    (e) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      if (validateFile(selectedFile)) {
        setFile(selectedFile);
      }

      // Resetear input para permitir seleccionar el mismo archivo de nuevo
      e.target.value = '';
    },
    [validateFile]
  );

  // --- Abrir selector de archivos ---
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // --- Enviar archivo ---
  const handleSubmit = useCallback(async () => {
    if (!file || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      await contextsAPI.attachAudio(contextId, assetKey, formData);

      toast.success('Audio subido correctamente', {
        description: `Audio asignado a "${assetValue}".`,
      });

      onSuccess();
    } catch (error) {
      const message = extractErrorMessage(error);
      toast.error('Error al subir el audio', {
        description: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [file, isSubmitting, contextId, assetKey, assetValue, onSuccess]);

  // --- Click en overlay cierra el modal ---
  const handleOverlayClick = useCallback(() => {
    if (!isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="audio-upload-title"
    >
      {/* Contenido del modal */}
      <motion.div
        ref={modalContentRef}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-background-elevated border border-border-default rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
      >
        {/* Boton cerrar */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className={cn(
            'absolute top-4 right-4 p-1.5 rounded-lg transition-colors',
            'hover:bg-border-default text-text-muted hover:text-text-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          aria-label="Cerrar modal"
        >
          <X size={18} />
        </button>

        {/* Titulo */}
        <h3
          id="audio-upload-title"
          className="text-lg font-semibold text-text-primary mb-5 pr-8"
        >
          Audio para &ldquo;{assetValue}&rdquo;
        </h3>

        {/* Audio actual (si existe) */}
        {currentAudioUrl && (
          <div className="mb-4">
            <p className="text-sm text-text-secondary mb-2">Audio actual</p>
            <AudioMiniPlayer
              audioUrl={currentAudioUrl}
              size="sm"
              variant="solid"
            />
            <p className="text-sm text-text-muted mt-2">Reemplazar con:</p>
          </div>
        )}

        {/* Dropzone */}
        <div
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={openFilePicker}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openFilePicker();
            }
          }}
          aria-label="Zona para arrastrar o seleccionar archivo de audio"
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer',
            'transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo/50',
            dragActive || file
              ? 'border-accent-indigo bg-accent-indigo/5'
              : 'border-background-surface bg-background-base/50 hover:border-border-default'
          )}
        >
          <div className="flex flex-col items-center gap-2">
            {dragActive ? (
              <Upload size={32} className="text-accent-indigo" />
            ) : (
              <Music size={32} className="text-text-muted" />
            )}

            <p className="text-sm text-text-secondary">
              {dragActive
                ? 'Suelta el archivo aqui'
                : 'Arrastra un archivo de audio aqui'}
            </p>
            {!dragActive && (
              <p className="text-xs text-text-muted">
                o haz click para elegir
              </p>
            )}
            <p className="text-xs text-text-muted mt-1">
              MP3, OGG &middot; max {formatFileSize(maxSize)}
            </p>
          </div>
        </div>

        {/* Input file oculto */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/ogg,.mp3,.ogg"
          onChange={handleFileChange}
          className="hidden"
          tabIndex={-1}
        />

        {/* Info del archivo seleccionado */}
        {file && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="text-sm text-text-secondary mt-3 flex items-center gap-1.5"
          >
            <Music size={14} className="text-accent-indigo flex-shrink-0" />
            <span className="truncate">{file.name}</span>
            <span className="text-text-muted flex-shrink-0">
              &middot; {formatFileSize(file.size)}
            </span>
          </motion.p>
        )}

        {/* Acciones */}
        <div className="flex gap-3 justify-end mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={cn(
              'text-text-muted hover:text-text-primary px-6 py-2.5 rounded-xl',
              'transition-colors duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!file || isSubmitting}
            className={cn(
              'bg-accent-indigo hover:bg-accent-indigo/80 text-text-primary',
              'px-6 py-2.5 rounded-xl font-medium',
              'transition-colors duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'inline-flex items-center gap-2'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload size={16} />
                Subir audio
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

AudioUploadModal.propTypes = {
  assetKey: PropTypes.string.isRequired,
  assetValue: PropTypes.string.isRequired,
  contextId: PropTypes.string.isRequired,
  currentAudioUrl: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func.isRequired,
};
