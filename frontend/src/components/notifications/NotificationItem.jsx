/**
 * @fileoverview Item individual del panel de notificaciones (T-955).
 *
 * Cada notificación muestra:
 *   - Icono adaptado al tipo (`type` del DTO V1).
 *   - Título bold + body con line-clamp-2.
 *   - Timestamp relativo (es-ES).
 *   - Dot de "no leída" + acento de prioridad si aplica.
 *   - Click: navega al `link` (si existe) y marca como leída.
 *
 * @module components/notifications/NotificationItem
 */

import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Trophy, UserPlus, AlertTriangle, Layers, Megaphone, Bell } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useRelativeTime } from '../../hooks/useRelativeTime';

/**
 * Mapping de tipo de notificación → icono Lucide + clase de tinte.
 * Mantener alineado con el enum NOTIFICATION_TYPES del backend (constants/enums.js).
 */
const TYPE_VISUALS = {
  play_completed: {
    Icon: Trophy,
    iconBg: 'bg-success-base/15',
    iconText: 'text-success-base'
  },
  registration_pending: {
    Icon: UserPlus,
    iconBg: 'bg-warning-base/15',
    iconText: 'text-warning-base'
  },
  student_at_risk: {
    Icon: AlertTriangle,
    iconBg: 'bg-error-base/15',
    iconText: 'text-error-base'
  },
  context_shared: {
    Icon: Layers,
    iconBg: 'bg-accent-indigo/15',
    iconText: 'text-accent-indigo'
  },
  system_announcement: {
    Icon: Megaphone,
    iconBg: 'bg-accent-cyan/15',
    iconText: 'text-accent-cyan'
  }
};

const FALLBACK_VISUAL = {
  Icon: Bell,
  iconBg: 'bg-background-elevated',
  iconText: 'text-text-muted'
};

/**
 * Renderiza un item del listado de notificaciones.
 *
 * @param {Object} props
 * @param {Object} props.notification - DTO V1 de Notification.
 * @param {Function} props.onMarkRead - Callback al pulsar (recibe el id).
 * @param {Function} [props.onClose] - Cierra el panel tras la navegación.
 */
export default function NotificationItem({ notification, onMarkRead, onClose }) {
  const navigate = useNavigate();
  const relative = useRelativeTime(notification?.createdAt);
  const visual = TYPE_VISUALS[notification.type] || FALLBACK_VISUAL;
  const { Icon, iconBg, iconText } = visual;

  const isUnread = !notification.read;

  const handleClick = () => {
    if (isUnread) {
      onMarkRead?.(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      onClose?.();
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <motion.li
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${notification.title}. ${isUnread ? 'Sin leer.' : 'Leída.'} ${relative}`}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group relative flex items-start gap-3 px-4 py-3',
        'cursor-pointer focus-ring rounded-lg',
        'transition-colors duration-200',
        isUnread
          ? 'bg-background-elevated/40 hover:bg-background-elevated/70'
          : 'opacity-80 hover:bg-background-elevated/40'
      )}
    >
      {/* Dot de no leída */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-3 right-3 size-2 rounded-full transition-opacity',
          isUnread ? 'bg-brand-base opacity-100' : 'opacity-0'
        )}
      />

      {/* Icono */}
      <div
        aria-hidden="true"
        className={cn(
          'flex-shrink-0 size-9 rounded-xl flex items-center justify-center',
          iconBg
        )}
      >
        <Icon size={18} className={iconText} strokeWidth={2.25} />
      </div>

      {/* Contenido */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm leading-snug line-clamp-2',
            isUnread ? 'font-semibold text-text-primary' : 'text-text-secondary'
          )}
        >
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 text-xs text-text-muted line-clamp-2">{notification.body}</p>
        )}
        <p className="mt-1 text-micro text-text-muted/80 font-medium uppercase tracking-wider">
          {relative}
        </p>
      </div>
    </motion.li>
  );
}

NotificationItem.propTypes = {
  notification: PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    body: PropTypes.string,
    link: PropTypes.string,
    read: PropTypes.bool,
    createdAt: PropTypes.string,
    priority: PropTypes.string
  }).isRequired,
  onMarkRead: PropTypes.func.isRequired,
  onClose: PropTypes.func
};
