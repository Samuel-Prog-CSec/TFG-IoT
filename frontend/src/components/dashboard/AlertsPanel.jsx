import { AlertTriangle, TrendingUp, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn, listContainerVariants, listItemVariants } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const ALERT_CONTAINER_VARIANTS = {
  risk: 'bg-error-base/10 border-error-base/20',
  improvement: 'bg-success-base/10 border-success-base/20',
  milestone: 'bg-brand-base/10 border-brand-base/20',
  default: 'bg-background-elevated border-border-default'
};

export default function AlertsPanel({ alerts }) {
  const { shouldReduceMotion } = useReducedMotion();

  if (!alerts || alerts.length === 0) {
    return null;
  }

  const getIcon = (type) => {
      switch(type) {
          case 'risk': return <AlertTriangle className="text-error-base" size={20} />;
          case 'improvement': return <TrendingUp className="text-success-base" size={20} />;
          case 'milestone': return <CheckCircle className="text-brand-base" size={20} />;
          default: return <AlertTriangle className="text-text-muted" size={20} />;
      }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-text-primary mb-4 px-1 font-display">Alertas y Avisos</h3>
      <motion.div
        className="space-y-3"
        variants={listContainerVariants(0.08)}
        initial={shouldReduceMotion ? false : "hidden"}
        animate="visible"
      >
        {alerts.map((alert, index) => (
          <motion.div
            key={index}
            variants={shouldReduceMotion ? {} : listItemVariants}
            className={cn(
              'p-4 rounded-xl border flex items-start gap-4',
              ALERT_CONTAINER_VARIANTS[alert.type] || ALERT_CONTAINER_VARIANTS.default
            )}
          >
            <div className="mt-1 flex-shrink-0">
                {alert.type === 'risk' && !shouldReduceMotion ? (
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1.5 }}
                  >
                    {getIcon(alert.type)}
                  </motion.div>
                ) : (
                  getIcon(alert.type)
                )}
            </div>
            <div>
                <h4 className="text-sm font-semibold text-text-primary">{alert.title}</h4>
                <p className="text-xs text-text-muted mt-1 leading-relaxed font-medium">
                    {alert.message}
                </p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
