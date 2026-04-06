import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle, Clock, Pause, Zap, XCircle, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { cn, listContainerVariants, listItemVariants } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Mapeo de severidad a estilos visuales RAG
 */
const SEVERITY_STYLES = {
  critical: {
    container: 'bg-error-base/10 border-error-base/20',
    icon: 'text-error-base',
    dot: 'bg-error-base',
  },
  warning: {
    container: 'bg-warning-base/10 border-warning-base/20',
    icon: 'text-warning-base',
    dot: 'bg-warning-base',
  },
  info: {
    container: 'bg-info-base/10 border-info-base/20',
    icon: 'text-info-base',
    dot: 'bg-info-base',
  },
};

/**
 * Mapeo de tipo de alerta a icono
 */
const ALERT_ICONS = {
  declining_performance: TrendingDown,
  inactivity: Clock,
  sudden_score_drop: AlertTriangle,
  consistent_timeout: Pause,
  improving_fast: TrendingUp,
  plateau_detected: Pause,
  high_abandonment: XCircle,
};

/**
 * Panel de alertas inteligentes del backend.
 * Muestra alertas con severidad RAG, accion directa al perfil del estudiante,
 * y estado vacio positivo cuando no hay alertas.
 *
 * @param {Object} props
 * @param {Array} props.alerts - Alertas del backend (de getAlerts endpoint)
 */
export default function AlertsPanel({ alerts }) {
  const { shouldReduceMotion } = useReducedMotion();
  const navigate = useNavigate();

  const hasAlerts = Array.isArray(alerts) && alerts.length > 0;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between px-1">
        <h3 className="text-lg font-bold text-text-primary font-display">Alertas Inteligentes</h3>
        {hasAlerts && (
          <button
            onClick={() => navigate('/analytics/insights')}
            className="text-xs text-brand-light hover:text-brand-base transition-colors font-medium"
          >
            Ver todas
          </button>
        )}
      </header>

      {hasAlerts ? (
        <motion.div
          className="space-y-3"
          variants={listContainerVariants(0.08)}
          initial={shouldReduceMotion ? false : "hidden"}
          animate="visible"
        >
          {alerts.map((alert, index) => {
            const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
            const IconComponent = ALERT_ICONS[alert.type] || AlertTriangle;
            const isCritical = alert.severity === 'critical';

            return (
              <motion.div
                key={alert.id || index}
                variants={shouldReduceMotion ? {} : listItemVariants}
                className={cn(
                  'p-4 rounded-xl border flex items-start gap-3 group transition-colors',
                  severity.container,
                  alert.studentId && 'cursor-pointer hover:border-opacity-40 focus:outline-none focus:ring-1 focus:ring-brand-base/40 focus:bg-background-surface/20'
                )}
                onClick={alert.studentId ? () => navigate(`/students/${alert.studentId}`) : undefined}
                role={alert.studentId ? 'button' : undefined}
                tabIndex={alert.studentId ? 0 : undefined}
                onKeyDown={alert.studentId ? (e) => { if (e.key === 'Enter') navigate(`/students/${alert.studentId}`); } : undefined}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {isCritical && !shouldReduceMotion ? (
                    <motion.div
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
                    >
                      <IconComponent className={severity.icon} size={18} aria-hidden="true" />
                    </motion.div>
                  ) : (
                    <IconComponent className={severity.icon} size={18} aria-hidden="true" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-text-primary truncate">
                      {alert.studentName || alert.title}
                    </h4>
                    <span className={cn("size-1.5 rounded-full flex-shrink-0", severity.dot)} aria-hidden="true" />
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 leading-relaxed font-medium line-clamp-2">
                    {alert.message || alert.description}
                  </p>
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
