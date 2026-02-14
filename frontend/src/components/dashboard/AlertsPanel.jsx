import { AlertTriangle, TrendingUp, TrendingDown, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AlertsPanel({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return null; // O mostrar un estado empty "Todo tranquilo"
  }

  const getIcon = (type) => {
      switch(type) {
          case 'risk': return <AlertTriangle className="text-rose-400" size={20} />;
          case 'improvement': return <TrendingUp className="text-emerald-400" size={20} />;
          case 'milestone': return <CheckCircle className="text-purple-400" size={20} />;
          default: return <AlertTriangle className="text-slate-400" size={20} />;
      }
  };

  const getBgColor = (type) => {
      switch(type) {
          case 'risk': return 'bg-rose-500/10 border-rose-500/20';
          case 'improvement': return 'bg-emerald-500/10 border-emerald-500/20';
          case 'milestone': return 'bg-purple-500/10 border-purple-500/20';
          default: return 'bg-slate-800 border-white/5';
      }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-white mb-4 px-1">Alertas y Avisos</h3>
      <div className="space-y-3">
        {alerts.map((alert, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`p-4 rounded-xl border flex items-start gap-4 ${getBgColor(alert.type)}`}
          >
            <div className="mt-1 flex-shrink-0">
                {getIcon(alert.type)}
            </div>
            <div>
                <h4 className="text-sm font-semibold text-white">{alert.title}</h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {alert.message}
                </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
