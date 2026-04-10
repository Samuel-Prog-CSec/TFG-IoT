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
import { cn, DURATION, EASING } from '../../lib/utils';
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
    bg: 'bg-error-base/20',
    text: 'text-error-base',
    button: 'danger',
  },
  warning: {
    bg: 'bg-warning-base/20',
    text: 'text-warning-base',
    button: 'warning',
  },
  archive: {
    bg: 'bg-warning-base/20',
    text: 'text-warning-base',
    button: 'warning',
  },
  info: {
    bg: 'bg-info-base/20',
    text: 'text-info-base',
    button: 'primary',
  },
  success: {
    bg: 'bg-success-base/20',
    text: 'text-success-base',
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

  // Manejo de teclado: Escape para cerrar, Tab para focus trap
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && !loading) {
      onClose();
      return;
    }

    // Focus trap: ciclar Tab dentro del modal
    if (e.key === 'Tab' && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const firstEl = focusableElements[0];
      const lastEl = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  }, [onClose, loading]);

  // Focus management al abrir/cerrar
  useEffect(() => {
    if (open) {
      const previousActiveElement = document.activeElement;

      // Enfocar primer elemento focuseable
      setTimeout(() => {
        firstFocusableRef.current?.focus();
      }, 50);

      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-backdrop backdrop-blur-sm"
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
            className="bg-background-base border border-border-default rounded-2xl p-6 max-w-md w-full shadow-2xl overscroll-contain"
          >
            {/* Header con icono */}
            <motion.div
              className="flex items-start gap-4 mb-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: DURATION.stateChange, ease: EASING.outQuart }}
            >
              <div className={cn(
                'size-12 rounded-xl flex items-center justify-center flex-shrink-0',
                variantConfig.bg
              )}>
                <Icon className={variantConfig.text} size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  id="modal-title"
                  className="text-lg font-semibold text-text-primary"
                >
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-sm text-text-muted">{subtitle}</p>
                )}
              </div>

              {/* Botón cerrar */}
              <button
                ref={firstFocusableRef}
                onClick={onClose}
                disabled={loading}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  'hover:bg-border-default text-text-muted hover:text-text-primary',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                aria-label="Cerrar modal"
              >
                <X size={18} />
              </button>
            </motion.div>

            {/* Descripción */}
            <motion.div
              id="modal-description"
              className="text-text-secondary mb-6"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: DURATION.stateChange, ease: EASING.outQuart }}
            >
              {typeof description === 'string' ? (
                <p>{description}</p>
              ) : (
                description
              )}
            </motion.div>

            {/* Acciones */}
            <motion.div
              className="flex gap-3 justify-end"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: DURATION.stateChange, ease: EASING.outQuart }}
            >
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
            </motion.div>
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
// eslint-disable-next-line react-refresh/only-export-components -- co-located hook for convenience
export function useConfirmationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState({});

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const openModal = useCallback((modalConfig = {}) => {
    setConfig(modalConfig);
    setIsOpen(true);
  }, []);

  const modalProps = {
    open: isOpen,
    onClose: close,
    title: config.title,
    description: config.description || config.message,
    confirmText: config.confirmText,
    cancelText: config.cancelText,
    variant: config.variant,
    onConfirm: config.onConfirm,
  };

  return {
    isOpen,
    open,
    close,
    openModal,
    closeModal: close,
    modalProps,
  };
}
