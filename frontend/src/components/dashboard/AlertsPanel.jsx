import { useMemo } from 'react';
import { AlertTriangle, CheckCircle, ChevronRight, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { cn, listContainerVariants, listItemVariants } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { formatRelativeTime } from '../../lib/dateUtils';
import {
  ALERT_TYPE_ICONS,
  SEVERITY_STYLES,
  PIN_ICON
} from '../../constants/alertTypes';

/**
 * Panel de alertas inteligentes del Dashboard (T-941).
 *
 * Cambios v2:
 *  - Constantes desde `constants/alertTypes.js` (DRY con AlertsHub).
 *  - Muestra `detectedAt` real con `formatRelativeTime` (antes salía "hace 7m" para todas).
 *  - Resalta alertas `pinned` con icono dorado.
 *  - Soporta el shape `items[]` (nuevo) o `alerts[]` (compat).
 *
 * @param {Object} props
 * @param {Array} props.alerts - Alertas del backend (DTO V1)
 */
export default function AlertsPanel({ alerts }) {
  const { shouldReduceMotion } = useReducedMotion();
  const navigate = useNavigate();

  // Compat: aceptamos array directo, {items}, o {alerts}
  const list = useMemo(() => {
    if (Array.isArray(alerts)) return alerts;
    if (alerts?.items) return alerts.items;
    if (alerts?.alerts) return alerts.alerts;
    return [];
  }, [alerts]);

  const hasAlerts = list.length > 0;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between px-1">
        <h3 className="text-lg font-semibold text-text-primary font-display">
          Alertas Inteligentes
        </h3>
        {hasAlerts && (
          <button
            type="button"
            onClick={() => navigate('/analytics/insights')}
            // BUG-A11Y-TARGET-A (QA Sprint 0 post-v0.5.0): target size mínimo
            // de WCAG 2.2 AA (2.5.8) son 24×24 CSS px. Antes era 50×16, fallaba
            // la pauta. Añadido padding e inline-flex con min-h para subir
            // el target sin cambiar la jerarquía tipográfica.
            className="inline-flex items-center min-h-[24px] px-2 py-1 -mr-2 rounded-md text-xs text-brand-base hover:text-brand-dark hover:bg-brand-base/10 focus-visible:bg-brand-base/10 transition-colors font-medium"
          >
            Ver todas
          </button>
        )}
      </header>

      {hasAlerts ? (
        <motion.div
          className="space-y-3"
          variants={listContainerVariants(0.08)}
          initial={shouldReduceMotion ? false : 'hidden'}
          animate="visible"
        >
          {list.map((alert, index) => {
            const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
            const IconComponent = ALERT_TYPE_ICONS[alert.type] || AlertTriangle;
            const isCritical = alert.severity === 'critical';
            const alertKey =
              alert.id || `alert-${alert.type}-${alert.studentId || 'global'}-${index}`;
            const detectedAt = alert.detectedAt || alert.createdAt;

            return (
              <motion.div
                key={alertKey}
                variants={shouldReduceMotion ? {} : listItemVariants}
                className={cn(
                  'p-4 rounded-xl border flex items-start gap-3 group transition-colors',
                  severity.bg,
                  severity.border,
                  alert.pinned && 'ring-1 ring-amber-400/40 shadow-[0_0_10px_rgba(251,191,36,0.18)]',
                  alert.studentId &&
                    'cursor-pointer hover:border-opacity-40 focus:outline-none focus:ring-1 focus:ring-brand-base/40 focus:bg-background-surface/20'
                )}
                onClick={alert.studentId ? () => navigate(`/students/${alert.studentId}`) : undefined}
                role={alert.studentId ? 'button' : undefined}
                tabIndex={alert.studentId ? 0 : undefined}
                onKeyDown={
                  alert.studentId
                    ? e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/students/${alert.studentId}`);
                        }
                      }
                    : undefined
                }
              >
                <div className="mt-0.5 flex-shrink-0">
                  {isCritical && !shouldReduceMotion ? (
                    <motion.div
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                    >
                      <IconComponent className={severity.text} size={18} aria-hidden="true" />
                    </motion.div>
                  ) : (
                    <IconComponent className={severity.text} size={18} aria-hidden="true" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-text-primary truncate">
                      {alert.studentName || alert.title || 'Alumno'}
                    </h4>
                    {alert.pinned && (
                      <PIN_ICON size={11} className="text-amber-400" aria-label="Fijada" />
                    )}
                    {alert.status === 'snoozed' && (
                      <Pause size={11} className="text-info-base" aria-label="En pausa" />
                    )}
                    <span
                      className={cn('size-1.5 rounded-full flex-shrink-0', severity.dot)}
                      aria-hidden="true"
                    />
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 leading-relaxed font-medium line-clamp-2">
                    {alert.description || alert.message}
                  </p>
                  {detectedAt && (
                    <p className="text-[10px] text-text-muted mt-1">
                      {formatRelativeTime(detectedAt)}
                      {alert.daysActive > 7 && (
                        <span className="ml-2 text-warning-base font-medium">
                          · Lleva {alert.daysActive}d
                        </span>
                      )}
                    </p>
                  )}
                </div>

                {alert.studentId && (
                  <ChevronRight
                    size={14}
                    className="text-text-muted/30 group-hover:text-text-muted mt-1 flex-shrink-0 transition-colors"
                    aria-hidden="true"
                  />
                )}
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-xl border border-success-base/20 bg-success-base/5 text-center"
        >
          <CheckCircle className="text-success-base mx-auto mb-2" size={28} aria-hidden="true" />
          <p className="text-sm font-semibold text-text-primary">Todo marcha bien</p>
          <p className="text-xs text-text-muted mt-1">No hay alertas activas en este momento.</p>
        </motion.div>
      )}
    </div>
  );
}
