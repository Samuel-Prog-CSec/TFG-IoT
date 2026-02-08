/**
 * @fileoverview Modal de confirmación reutilizable
 * Componente para mostrar diálogos de confirmación con animaciones premium.
 * Incluye focus trap y cierre con Escape.
 * 
 * @module components/ui/ConfirmationModal
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Archive, Trash2, Info, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import ButtonPremium from './ButtonPremium';

/**
 * Iconos disponibles según la variante
 */
const VARIANT_ICONS = {
  danger: Trash2,
  warning: AlertTriangle,
  archive: Archive,
  info: Info,
  success: CheckCircle,
};

/**
 * Colores según la variante
 */
const VARIANT_COLORS = {
  danger: {
    bg: 'bg-rose-500/20',
    text: 'text-rose-400',
    button: 'danger',
  },
  warning: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    button: 'warning',
  },
  archive: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    button: 'warning',
  },
  info: {
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    button: 'primary',
  },
  success: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    button: 'success',
  },
};

/**
 * ConfirmationModal - Modal de confirmación reutilizable
 * 
 * @param {Object} props
 * @param {boolean} props.open - Estado de apertura del modal
 * @param {Function} props.onClose - Callback al cerrar
 * @param {Function} props.onConfirm - Callback al confirmar
 * @param {string} props.title - Título del modal
 * @param {string|React.ReactNode} props.description - Descripción o contenido
 * @param {string} [props.confirmText='Confirmar'] - Texto del botón de confirmación
 * @param {string} [props.cancelText='Cancelar'] - Texto del botón de cancelar
 * @param {'danger'|'warning'|'archive'|'info'|'success'} [props.variant='warning'] - Variante visual
 * @param {React.ComponentType} [props.icon] - Icono personalizado
 * @param {string} [props.subtitle] - Subtítulo opcional
 * @param {boolean} [props.loading=false] - Estado de carga del botón confirmar
 * @param {boolean} [props.closeOnOverlay=true] - Cerrar al hacer click en overlay
 * 
 * @example
 * <ConfirmationModal
 *   open={showModal}
 *   onClose={() => setShowModal(false)}
 *   onConfirm={handleDelete}
 *   title="Eliminar elemento"
 *   description="¿Estás seguro de que quieres eliminar este elemento?"
 *   variant="danger"
 *   confirmText="Eliminar"
 * />
 */
export default function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'warning',
  icon: CustomIcon,
  subtitle,
  loading = false,
  closeOnOverlay = true,
}) {
  const modalRef = useRef(null);
  const firstFocusableRef = useRef(null);

  // Configuración de variante
  const variantConfig = VARIANT_COLORS[variant] || VARIANT_COLORS.warning;
  const Icon = CustomIcon || VARIANT_ICONS[variant] || AlertTriangle;

  // Cerrar con Escape
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && !loading) {
      onClose();
    }
  }, [onClose, loading]);

  // Focus trap básico
  useEffect(() => {
    if (open) {
      // Guardar elemento activo antes de abrir
      const previousActiveElement = document.activeElement;
      
      // Enfocar primer elemento focuseable
      setTimeout(() => {
        firstFocusableRef.current?.focus();
      }, 50);

      // Listener para Escape
      document.addEventListener('keydown', handleKeyDown);
      
      // Prevenir scroll del body
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
        // Restaurar foco
        previousActiveElement?.focus?.();
      };
    }
  }, [open, handleKeyDown]);

  const handleOverlayClick = () => {
    if (closeOnOverlay && !loading) {
      onClose();
    }
  };

  const handleConfirm = () => {
    if (!loading) {
      onConfirm();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleOverlayClick}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          aria-describedby="modal-description"
        >
          <motion.div
            ref={modalRef}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl"
          >
            {/* Header con icono */}
            <div className="flex items-start gap-4 mb-4">
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                variantConfig.bg
              )}>
                <Icon className={variantConfig.text} size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 
                  id="modal-title"
                  className="text-lg font-semibold text-white"
                >
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-sm text-slate-400">{subtitle}</p>
                )}
              </div>
              
              {/* Botón cerrar */}
              <button
                ref={firstFocusableRef}
                onClick={onClose}
                disabled={loading}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  'hover:bg-white/10 text-slate-400 hover:text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Descripción */}
            <div 
              id="modal-description"
              className="text-slate-300 mb-6"
            >
              {typeof description === 'string' ? (
                <p>{description}</p>
              ) : (
                description
              )}
            </div>

            {/* Acciones */}
            <div className="flex gap-3 justify-end">
              <ButtonPremium
                variant="ghost"
                onClick={onClose}
                disabled={loading}
              >
                {cancelText}
              </ButtonPremium>
              <ButtonPremium
                variant={variantConfig.button}
                onClick={handleConfirm}
                loading={loading}
                icon={<Icon size={16} />}
              >
                {confirmText}
              </ButtonPremium>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook para manejar estado del modal de confirmación
 * 
 * @returns {Object} Estado y funciones del modal
 * 
 * @example
 * const { modalState, openModal, closeModal, confirmAction } = useConfirmationModal();
 * 
 * const handleDelete = (item) => {
 *   openModal({
 *     title: 'Eliminar',
 *     description: `¿Eliminar "${item.name}"?`,
 *     onConfirm: () => deleteItem(item.id),
 *   });
 * };
 */
export function useConfirmationModal() {
  const [modalState, setModalState] = useState({
    open: false,
    title: '',
    description: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    variant: 'warning',
    onConfirm: () => {},
    loading: false,
  });

  const openModal = useCallback((config) => {
    setModalState({
      open: true,
      title: config.title || '',
      description: config.description || '',
      confirmText: config.confirmText || 'Confirmar',
      cancelText: config.cancelText || 'Cancelar',
      variant: config.variant || 'warning',
      subtitle: config.subtitle,
      icon: config.icon,
      onConfirm: config.onConfirm || (() => {}),
      loading: false,
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalState(prev => ({ ...prev, open: false }));
  }, []);

  const setLoading = useCallback((loading) => {
    setModalState(prev => ({ ...prev, loading }));
  }, []);

  const confirmAction = useCallback(async () => {
    setLoading(true);
    try {
      await modalState.onConfirm();
      closeModal();
    } catch (error) {
      console.error('[ConfirmationModal] Error en confirmación:', error);
    } finally {
      setLoading(false);
    }
  }, [modalState.onConfirm, closeModal, setLoading]);

  return {
    modalState,
    openModal,
    closeModal,
    confirmAction,
    setLoading,
  };
}
