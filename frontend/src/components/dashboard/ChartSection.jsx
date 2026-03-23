import { memo, useId } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';

function ChartSection({ title, children, className, period = '7d', onPeriodChange, periodOptions = null }) {
  const titleId = useId();
  const resolvedPeriodOptions = periodOptions?.length ? periodOptions : [
    { value: '7d', label: 'Últimos 7 días' },
    { value: '30d', label: 'Últimos 30 días' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="h-full"
    >
      <GlassCard 
        variant="default"
        padding="lg"
        className={cn("flex flex-col h-full", className)}
      >
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 relative z-10">
          <h3 id={titleId} className="text-xl font-bold text-text-primary font-display">{title}</h3>
          
          {onPeriodChange && (
            <>
              <label className="sr-only" htmlFor={`${titleId}-period`}>Seleccionar período de tiempo</label>
              <select 
                id={`${titleId}-period`}
                aria-label="Filtro de período de tiempo"
                value={period}
                onChange={(event) => onPeriodChange(event.target.value)}
                className="bg-background-surface/80 border border-border-default text-text-secondary text-sm font-medium rounded-xl px-4 py-2 outline-none focus:border-brand-base focus:ring-2 focus:ring-brand-base/20 transition-all cursor-pointer hover:bg-background-elevated"
              >
                {resolvedPeriodOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </>
          )}
        </header>
        
        {/* Chart Content */}
        <figure aria-label={`Gráfico de ${title}`} className="flex-1 relative z-10">
          {children}
        </figure>
      </GlassCard>
    </motion.div>
  );
}

ChartSection.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  period: PropTypes.string,
  onPeriodChange: PropTypes.func,
  periodOptions: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
  })),
};

export default memo(ChartSection);
