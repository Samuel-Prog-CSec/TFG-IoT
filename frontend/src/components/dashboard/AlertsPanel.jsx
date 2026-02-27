import { AlertTriangle, TrendingUp, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const ALERT_CONTAINER_VARIANTS = {
  risk: 'bg-error-base/10 border-error-base/20',
  improvement: 'bg-success-base/10 border-success-base/20',
  milestone: 'bg-brand-base/10 border-brand-base/20',
  default: 'bg-background-elevated border-border-default'
};

export default function AlertsPanel({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return null; // O mostrar un estado empty "Todo tranquilo"
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
      <div className="space-y-3">
        {alerts.map((alert, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={cn(
              'p-4 rounded-xl border flex items-start gap-4',
              ALERT_CONTAINER_VARIANTS[alert.type] || ALERT_CONTAINER_VARIANTS.default
            )}
          >
            <div className="mt-1 flex-shrink-0">
                {getIcon(alert.type)}
            </div>
            <div>
                <h4 className="text-sm font-semibold text-text-primary">{alert.title}</h4>
                <p className="text-xs text-text-muted mt-1 leading-relaxed font-medium">
                    {alert.message}
                </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
