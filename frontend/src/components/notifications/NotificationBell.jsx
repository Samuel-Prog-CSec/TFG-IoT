/**
 * @fileoverview NotificationBell — botón con badge y panel desplegable (T-955).
 *
 * Vive en el sidebar (AppLayout). Combina:
 *   - Botón Bell de Lucide con badge contador de no leídas.
 *   - Pulse subtle cuando hay no-leídas (respeta reduced-motion).
 *   - Micro-celebración (scale + glow extra) cuando llega una notif
 *     `play_completed` con 4-5 estrellas (Phase 7 polish).
 *   - Trigger del `NotificationsPanel` con click o `Shift+B`.
 *
 * @module components/notifications/NotificationBell
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { m as motion, useAnimationControls, AnimatePresence } from 'framer-motion';
import { Bell, BellRing } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useNotificationsContext } from '../../context/NotificationsContext';
import NotificationsPanel from './NotificationsPanel';

/**
 * Detecta si el último push fue celebratorio (play_completed con 3⭐).
 * Mira la primera notificación tras un cambio de pushTick.
 *
 * @param {Array} notifications
 * @returns {boolean}
 */
function isCelebratoryPush(notifications) {
  if (!Array.isArray(notifications) || notifications.length === 0) {
    return false;
  }
  const head = notifications[0];
  if (head?.type !== 'play_completed') {
    return false;
  }
  const stars = head?.metadata?.stars;
  // Escala canónica 1-5: celebramos las 2 notas más altas (4-5⭐, >=75%).
  return typeof stars === 'number' && stars >= 4;
}

export default function NotificationBell({ compact = false }) {
  const { shouldReduceMotion } = useReducedMotion();
  const controls = useAnimationControls();
  const buttonRef = useRef(null);
  const containerRef = useRef(null);
  const {
    notifications,
    unreadCount,
    hasMore,
    isLoading,
    isPanelOpen,
    pushTick,
    markRead,
    markAllRead,
    loadMore,
    closePanel,
    togglePanel
  } = useNotificationsContext();

  // Atajo Shift+B → toggle panel. Coexiste con ShortcutRegistry y
  // GlobalShortcuts; registramos un listener específico aquí para no
  // depender del context registry desde un componente que también vive
  // en Login/Register (donde no hay sidebar). El handler ignora eventos
  // si el target es un input o textarea, para no interferir con teclear.
  useEffect(() => {
    const handler = (event) => {
      if (event.shiftKey && (event.key === 'B' || event.key === 'b')) {
        const tag = event.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) {
          return;
        }
        event.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePanel]);

  // Animación de celebración: spring scale 1 → 1.18 → 1, sin si reduced-motion.
  const [celebrationActive, setCelebrationActive] = useState(false);
  useEffect(() => {
    if (pushTick === 0 || shouldReduceMotion) {
      return;
    }
    if (isCelebratoryPush(notifications)) {
      setCelebrationActive(true);
      controls
        .start({
          scale: [1, 1.18, 0.96, 1.06, 1],
          rotate: [0, -8, 6, -3, 0],
          transition: { duration: 0.8, ease: 'easeOut' }
        })
        .then(() => setCelebrationActive(false))
        .catch(() => setCelebrationActive(false));
    } else {
      // Bump suave para cualquier otra notif.
      controls.start({
        scale: [1, 1.08, 1],
        transition: { duration: 0.32, ease: 'easeOut' }
      });
    }
  }, [pushTick, notifications, controls, shouldReduceMotion]);

  const handleClick = useCallback(() => {
    togglePanel();
  }, [togglePanel]);

  const IconComponent = unreadCount > 0 ? BellRing : Bell;
  const badgeLabel = unreadCount > 99 ? '99+' : unreadCount.toString();

  return (
    <div ref={containerRef} className={cn('relative', compact ? '' : 'flex-shrink-0')}>
      <motion.button
        ref={buttonRef}
        data-notification-bell="trigger"
        type="button"
        onClick={handleClick}
        animate={controls}
        whileHover={shouldReduceMotion ? undefined : { scale: 1.05 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
        aria-label={
          unreadCount > 0
            ? `Notificaciones, ${unreadCount} sin leer`
            : 'Notificaciones'
        }
        aria-haspopup="dialog"
        aria-expanded={isPanelOpen}
        className={cn(
          'relative inline-flex items-center justify-center',
          'size-9 rounded-xl',
          'text-text-secondary hover:text-text-primary',
          'bg-background-elevated/60 hover:bg-background-elevated',
          'border border-border-subtle hover:border-border-default',
          'transition-colors duration-200',
          'focus-ring',
          unreadCount > 0 && 'text-brand-light'
        )}
      >
        {/* Pulse ring sutil si hay no-leídas (CSS-only para no costar JS por frame) */}
        {unreadCount > 0 && !shouldReduceMotion && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-xl ring-2 ring-brand-base/40 animate-ping opacity-50"
            style={{ animationDuration: '2.4s' }}
          />
        )}

        <IconComponent
          size={18}
          strokeWidth={2.25}
          className="relative z-10"
        />

        {/* Badge contador con animación al incrementar (U-4). El número
            cambia de slot con un slide vertical (spring) cuando el contador
            sube. AnimatePresence + key={badgeLabel} fuerza mount del nuevo
            número y exit del anterior. Si reduced-motion, cambia sin slide. */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute -top-1 -right-1 z-20',
              'min-w-[18px] h-[18px] px-1 rounded-full',
              'bg-gradient-to-br from-brand-base to-accent-pink',
              // OJO: el color del número va en los <span> hoja (más abajo), NO
              // aquí. tailwind-merge dentro de `cn` malclasifica el tamaño custom
              // `text-nano` como si fuera un `text-{color}` y, al fusionar, elimina
              // `text-white` → el contador heredaba el morado `text-brand-light`
              // del botón (contraste ~1.7:1 sobre el degradado). Manteniendo el
              // tamaño aquí y el color en la hoja evitamos el conflicto de merge.
              'text-nano font-bold leading-none',
              'flex items-center justify-center',
              'shadow-[0_4px_10px_var(--color-brand-glow)]',
              'border border-background-base overflow-hidden',
              celebrationActive && !shouldReduceMotion && 'animate-pulse'
            )}
          >
            {shouldReduceMotion ? (
              <span className="text-white">{badgeLabel}</span>
            ) : (
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={badgeLabel}
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 10, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  className="inline-block text-white"
                >
                  {badgeLabel}
                </motion.span>
              </AnimatePresence>
            )}
          </span>
        )}
      </motion.button>

      <NotificationsPanel
        isOpen={isPanelOpen}
        notifications={notifications}
        unreadCount={unreadCount}
        hasMore={hasMore}
        isLoading={isLoading}
        onClose={closePanel}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onLoadMore={loadMore}
      />
    </div>
  );
}

NotificationBell.propTypes = {
  /** Modo rail (sidebar compacta): renderiza el bell sin label. */
  compact: PropTypes.bool
};
