/**
 * @fileoverview Modal de confirmación reutilizable
 * Componente para mostrar diálogos de confirmación con animaciones premium.
 * Incluye focus trap y cierre con Escape.
 * 
 * @module components/ui/ConfirmationModal
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Archive, Trash2, Info, CheckCircle } from 'lucide-react';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
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
    border: 'border-error-base/30',
    tint: 'from-error-base/10 to-transparent',
    glow: 'shadow-[0_0_24px_var(--color-error-glow)]',
  },
  warning: {
    bg: 'bg-warning-base/20',
    text: 'text-warning-base',
    button: 'warning',
    border: 'border-warning-base/30',
    tint: 'from-warning-base/10 to-transparent',
    glow: 'shadow-[0_0_18px_var(--color-warning-glow)]',
  },
  archive: {
    bg: 'bg-warning-base/20',
    text: 'text-warning-base',
    button: 'warning',
    border: 'border-warning-base/25',
    tint: 'from-warning-base/8 to-transparent',
    glow: 'shadow-[0_0_14px_var(--color-warning-glow)]',
  },
  info: {
    bg: 'bg-info-base/20',
    text: 'text-info-base',
    button: 'primary',
    border: 'border-info-base/25',
    tint: 'from-info-base/8 to-transparent',
    glow: 'shadow-[0_0_14px_var(--color-info-glow)]',
  },
  success: {
    bg: 'bg-success-base/20',
    text: 'text-success-base',
    button: 'success',
    border: 'border-success-base/30',
    tint: 'from-success-base/10 to-transparent',
    glow: 'shadow-[0_0_18px_var(--color-success-glow)]',
  },
};

/**
 * Variantes de animacion para el icono segun el tipo del modal.
 * Cada variante transmite la emocion adecuada: peligro pulsa, success confirma,
 * warning oscila ligeramente al entrar, archive entra lateral, info permanece
 * quieto con glow estatico.
 */
const getIconAnimation = (variant, shouldReduceMotion) => {
  if (shouldReduceMotion) {
    return { initial: false, animate: { scale: 1, rotate: 0, x: 0 } };
  }
  switch (variant) {
    case 'danger':
      return {
        initial: { scale: 0.8, opacity: 0 },
        animate: {
          scale: [0.8, 1.08, 1],
          opacity: 1,
        },
        transition: { duration: 0.6, times: [0, 0.6, 1], ease: 'easeOut' },
      };
    case 'warning':
      return {
        initial: { scale: 0.85, rotate: -8, opacity: 0 },
        animate: { scale: 1, rotate: [-8, 6, -3, 0], opacity: 1 },
        transition: { duration: 0.55, ease: 'easeOut' },
      };
    case 'success':
      return {
        initial: { scale: 0.5, opacity: 0 },
        animate: { scale: [0.5, 1.12, 1], opacity: 1 },
        transition: { duration: 0.45, ease: 'backOut' },
      };
    case 'archive':
      return {
        initial: { x: -10, opacity: 0 },
        animate: { x: 0, opacity: 1 },
        transition: { duration: 0.4, ease: 'easeOut' },
      };
    case 'info':
    default:
      return {
        initial: { opacity: 0, scale: 0.9 },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.3, ease: 'easeOut' },
      };
  }
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
 * @param {boolean} [props.confirmDisabled=false] - Deshabilita el botón confirmar (ej: un bloqueante explicado en la descripción impide la acción)
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
  confirmDisabled = false,
  closeOnOverlay = true,
}) {
  const modalRef = useRef(null);
  const firstFocusableRef = useRef(null);
  const { shouldReduceMotion } = useReducedMotion();

  // Configuración de variante
  const variantConfig = VARIANT_COLORS[variant] || VARIANT_COLORS.warning;
  const Icon = CustomIcon || VARIANT_ICONS[variant] || AlertTriangle;
  const iconAnimation = getIconAnimation(variant, shouldReduceMotion);
  // Para acciones criticas (danger) el modal entra con un flip 3D sutil
  // reforzando la metafora "estas tocando un papel fisico - piensalo bien".
  const useFlipEntry = variant === 'danger' && !shouldReduceMotion;
  // Blip radial en variantes criticas: un unico pulso saliente del icono al
  // abrir, marcando "accion irreversible". No se usa en info/archive/success.
  const showOpenBlip = (variant === 'danger' || variant === 'warning') && !shouldReduceMotion;

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
      } else if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
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
    return undefined;
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
          aria-busy={loading}
          aria-labelledby="modal-title"
          aria-describedby="modal-description"
        >
          <motion.div
            ref={modalRef}
            initial={useFlipEntry
              ? { scale: 0.94, opacity: 0, rotateX: -8 }
              : { scale: 0.9, opacity: 0, y: 20 }}
            animate={useFlipEntry
              ? { scale: 1, opacity: 1, rotateX: 0 }
              : { scale: 1, opacity: 1, y: 0 }}
            exit={useFlipEntry
              ? { scale: 0.94, opacity: 0, rotateX: -8 }
              : { scale: 0.9, opacity: 0, y: 20 }}
            transition={useFlipEntry
              ? { duration: 0.24, ease: EASING.outExpo }
              : { type: 'spring', damping: 25, stiffness: 300 }}
            style={useFlipEntry ? { transformStyle: 'preserve-3d', transformPerspective: 1000 } : undefined}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'relative bg-background-base border rounded-2xl p-6 w-full shadow-2xl overscroll-contain',
              // Modal fluido: ancho responde al viewport (cap 560px), alto cap
              // 88dvh con scroll interno cuando el contenido excede (1366×768).
              'max-w-[min(560px,92vw)] max-h-[88dvh] overflow-y-auto custom-scrollbar',
              variantConfig.border
            )}
          >
            {/* Tint superior sutil por variante (no intrusivo) */}
            <div
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-70',
                variantConfig.tint
              )}
            />
            {/* Header con icono */}
            <motion.div
              className="relative flex items-start gap-4 mb-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: DURATION.stateChange, ease: EASING.outQuart }}
            >
              <motion.div
                initial={iconAnimation.initial}
                animate={iconAnimation.animate}
                transition={iconAnimation.transition}
                className={cn(
                  'relative size-12 rounded-xl flex items-center justify-center flex-shrink-0',
                  variantConfig.bg,
                  variantConfig.glow
                )}
              >
                {/* Blip radial de apertura: anillo saliente unico que refuerza la
                    idea "tocaste algo importante" en acciones criticas. */}
                {showOpenBlip && (
                  <motion.span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none absolute inset-0 rounded-xl border-2',
                      variant === 'danger' ? 'border-error-base/60' : 'border-warning-base/60'
                    )}
                    initial={{ scale: 1, opacity: 0.55 }}
                    animate={{ scale: 2.4, opacity: 0 }}
                    transition={{ duration: 0.65, ease: EASING.outExpo, delay: 0.15 }}
                  />
                )}
                {variant === 'danger' && !shouldReduceMotion ? (
                  <motion.span
                    className="flex"
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                  >
                    <Icon className={variantConfig.text} size={24} aria-hidden="true" />
                  </motion.span>
                ) : (
                  <Icon className={variantConfig.text} size={24} aria-hidden="true" />
                )}
              </motion.div>
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
                  // (D3-008) `min-h-11 min-w-11` garantiza target táctil
                  // ≥44px (WCAG 2.2 SC 2.5.8). `p-2` solo daba ~32px reales
                  // entre padding+icono. Mantener `inline-flex` + centrado
                  // para que el icono X siga visualmente centrado.
                  'min-h-11 min-w-11 inline-flex items-center justify-center',
                  'rounded-lg transition-[colors,transform]',
                  'hover:bg-border-default text-text-muted hover:text-text-primary active:scale-90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                aria-label="Cerrar modal"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </motion.div>

            {/* Descripción */}
            <motion.div
              id="modal-description"
              className="relative text-text-secondary mb-6"
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
              className="relative flex gap-3 justify-end"
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
                disabled={confirmDisabled}
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

  // Cierre automatico tras confirmar (sea sync o async). Antes cada consumidor
  // tenia que llamar a close() manualmente y la mayoria no lo hacia, dejando
  // el modal visible despues de eliminar/archivar (QA v0.5.0: BUG modal queda
  // abierto al confirmar). Si onConfirm lanza, el consumidor mostro toast pero
  // el modal tambien se cierra para evitar bloquear la UI.
  const handleConfirm = useCallback(async () => {
    try {
      if (typeof config.onConfirm === 'function') {
        await config.onConfirm();
      }
    } finally {
      setIsOpen(false);
    }
  }, [config]);

  const modalProps = {
    open: isOpen,
    onClose: close,
    title: config.title,
    description: config.description || config.message,
    confirmText: config.confirmText,
    cancelText: config.cancelText,
    variant: config.variant,
    confirmDisabled: config.confirmDisabled,
    onConfirm: handleConfirm,
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
