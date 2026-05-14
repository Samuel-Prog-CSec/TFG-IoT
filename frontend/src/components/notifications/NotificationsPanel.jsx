/**
 * @fileoverview Panel desplegable de notificaciones (T-955).
 *
 * Popover anclado al trigger (NotificationBell). Lista paginada cursor de
 * las notificaciones del usuario, con acción "Marcar todas leídas" y
 * empty state signature (sobre de papel cerrado).
 *
 * UX:
 *   - Apertura: scale+fade entrante desde la esquina superior derecha
 *     (origen visual del bell). Entrada 240ms / salida 180ms.
 *   - Cierre: ESC, click fuera, click en un item con link.
 *   - Scroll virtualizado por cursor: cuando el último item entra en
 *     viewport, dispara `loadMore`.
 *
 * A11y:
 *   - role="dialog" + aria-modal="false" (no captura foco — es un popover
 *     no bloqueante; el usuario puede seguir navegando con teclado).
 *   - aria-label descriptivo.
 *   - Focus inicial al primer item (o al "Marcar todas leídas" si vacío).
 *
 * @module components/notifications/NotificationsPanel
 */

import { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCheck, X } from 'lucide-react';
import { cn, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import NotificationItem from './NotificationItem';
import EmptyNotificationsIllustration from './EmptyNotificationsIllustration';

export default function NotificationsPanel({
  isOpen,
  notifications,
  unreadCount,
  hasMore,
  isLoading,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onLoadMore
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const panelRef = useRef(null);
  const sentinelRef = useRef(null);
  const firstFocusableRef = useRef(null);

  // Click fuera cierra el panel.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleClick = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        // Mantener el toggle del bell en su sitio: si el click es sobre el
        // botón del bell, ese maneja su propio toggle. Aquí sólo cerramos
        // si el click va a otro sitio del documento.
        const bellButton = document.querySelector('[data-notification-bell="trigger"]');
        if (bellButton?.contains(event.target)) {
          return;
        }
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  // ESC cierra el panel.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Foco inicial al abrir — primer item si hay, si no al botón markAllRead/close.
  useEffect(() => {
    if (isOpen && firstFocusableRef.current) {
      firstFocusableRef.current.focus({ preventScroll: true });
    }
  }, [isOpen]);

  // IntersectionObserver para infinite scroll por cursor.
  useEffect(() => {
    if (!isOpen || !hasMore || !sentinelRef.current) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoading) {
          onLoadMore?.();
        }
      },
      { rootMargin: '40px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isOpen, hasMore, isLoading, onLoadMore]);

  const handleMarkAllRead = useCallback(() => {
    onMarkAllRead?.();
  }, [onMarkAllRead]);

  const showEmpty = !isLoading && notifications.length === 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          ref={panelRef}
          role="dialog"
          aria-label="Centro de notificaciones"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
          transition={{ duration: 0.22, ease: EASING.outExpo }}
          style={{ transformOrigin: 'top right' }}
          className={cn(
            'absolute right-0 mt-3 z-50',
            // U-3: responsive width — fluid en pantallas estrechas (clamp
            // entre 280px y 360px), nunca desborda el viewport (ajusta a
            // 100vw-24px en mobile). Max-height 70vh para no taparla con
            // el sidebar/RFID widget.
            'w-[min(360px,calc(100vw-24px))] min-w-[280px] max-h-[min(520px,70vh)]',
            'rounded-2xl border border-border-default',
            'bg-background-base/95 backdrop-blur-xl',
            'shadow-[var(--shadow-lg)]',
            'flex flex-col overflow-hidden'
          )}
        >
          {/* Header del panel */}
          <header className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="text-sm font-bold text-text-primary truncate">Notificaciones</h2>
              {unreadCount > 0 && (
                <span className="text-[11px] uppercase tracking-wider font-semibold text-brand-light">
                  {unreadCount} sin leer
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  ref={firstFocusableRef}
                  type="button"
                  onClick={handleMarkAllRead}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg',
                    'text-[11px] font-semibold uppercase tracking-wider',
                    'text-text-secondary hover:text-text-primary',
                    'hover:bg-background-elevated transition-colors',
                    'focus-ring'
                  )}
                  aria-label="Marcar todas como leídas"
                >
                  <CheckCheck size={14} />
                  Marcar leídas
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'p-1.5 rounded-lg text-text-muted hover:text-text-primary',
                  'hover:bg-background-elevated transition-colors',
                  'focus-ring'
                )}
                aria-label="Cerrar notificaciones"
              >
                <X size={16} />
              </button>
            </div>
          </header>

          {/* Body — empty / lista */}
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center text-text-muted">
              <EmptyNotificationsIllustration className="text-text-secondary" />
              <p className="text-sm font-semibold text-text-primary">Buzón vacío</p>
              <p className="text-xs leading-snug">Tu clase está tranquila. Te avisaremos en cuanto pase algo.</p>
            </div>
          ) : (
            <ul
              className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar py-1"
              aria-busy={isLoading}
            >
              {notifications.map((notif) => (
                <NotificationItem
                  key={notif.id}
                  notification={notif}
                  onMarkRead={onMarkRead}
                  onClose={onClose}
                />
              ))}
              {hasMore && (
                <li ref={sentinelRef} aria-hidden="true" className="h-4" />
              )}
              {isLoading && notifications.length > 0 && (
                <li className="px-4 py-3 text-center text-xs text-text-muted">
                  Cargando…
                </li>
              )}
            </ul>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

NotificationsPanel.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  notifications: PropTypes.arrayOf(PropTypes.object).isRequired,
  unreadCount: PropTypes.number.isRequired,
  hasMore: PropTypes.bool.isRequired,
  isLoading: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onMarkRead: PropTypes.func.isRequired,
  onMarkAllRead: PropTypes.func.isRequired,
  onLoadMore: PropTypes.func.isRequired
};
