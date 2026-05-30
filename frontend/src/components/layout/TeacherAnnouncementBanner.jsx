/**
 * @fileoverview Banner top global con avisos publicados por super_admin (T-942).
 *
 * Renderizado dentro de `AppLayout` solo para profesores autenticados. Apila
 * hasta 3 banners visibles, ordenados por severidad (urgent > warning > info)
 * y respeta `prefers-reduced-motion`.
 *
 * @module components/layout/TeacherAnnouncementBanner
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Info, AlertTriangle, AlertOctagon, X, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { ANNOUNCEMENT_SEVERITY_STYLES } from '../../constants/systemAlertTypes';

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  urgent: AlertOctagon
};

const SEVERITY_RANK = { urgent: 0, warning: 1, info: 2 };
const MAX_VISIBLE = 3;

function isInternalLink(url) {
  if (!url) return false;
  return url.startsWith('/');
}

export default function TeacherAnnouncementBanner({
  announcements = [],
  onDismiss,
  isPreview = false
}) {
  const { shouldReduceMotion } = useReducedMotion();

  const sorted = useMemo(() => {
    return [...announcements].sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
    );
  }, [announcements]);

  if (!sorted.length) return null;

  const visible = sorted.slice(0, MAX_VISIBLE);
  const hidden = sorted.length - visible.length;

  return (
    <div className="space-y-2" aria-label="Avisos del centro">
      <AnimatePresence initial={false}>
        {visible.map(item => {
          const style = ANNOUNCEMENT_SEVERITY_STYLES[item.severity];
          const Icon = SEVERITY_ICON[item.severity] || Info;
          const isUrgent = item.severity === 'urgent';
          return (
            <motion.div
              key={item.id}
              role={isUrgent ? 'alert' : 'status'}
              aria-live={isUrgent ? 'assertive' : 'polite'}
              initial={shouldReduceMotion ? false : { y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { y: -8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }}
              className={cn(
                'relative flex items-start gap-3 rounded-xl border px-4 py-3',
                style?.container
              )}
            >
              <div className="flex items-center gap-2">
                {isUrgent && !shouldReduceMotion && (
                  <span
                    aria-hidden="true"
                    className="inline-block size-2 rounded-full bg-error-base animate-pulse"
                  />
                )}
                <Icon size={18} className={cn('flex-shrink-0', style?.iconClass)} aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight">{item.title}</p>
                <p className="mt-0.5 text-sm leading-snug opacity-90">{item.body}</p>
                {item.linkUrl && (
                  <a
                    href={item.linkUrl}
                    target={isInternalLink(item.linkUrl) ? undefined : '_blank'}
                    rel={isInternalLink(item.linkUrl) ? undefined : 'noopener noreferrer'}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline"
                  >
                    {item.linkLabel || 'Saber más'}
                    {!isInternalLink(item.linkUrl) && (
                      <ExternalLink size={12} aria-hidden="true" />
                    )}
                  </a>
                )}
              </div>
              {!isPreview && (
                <button
                  type="button"
                  aria-label={`Cerrar aviso ${item.title}`}
                  onClick={() => onDismiss?.(item.id)}
                  className="flex-shrink-0 rounded-md p-1 opacity-75 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {hidden > 0 && (
        <p className="text-xs text-text-muted text-right">+{hidden} aviso(s) más sin mostrar</p>
      )}
    </div>
  );
}

TeacherAnnouncementBanner.propTypes = {
  announcements: PropTypes.array,
  onDismiss: PropTypes.func,
  isPreview: PropTypes.bool
};
