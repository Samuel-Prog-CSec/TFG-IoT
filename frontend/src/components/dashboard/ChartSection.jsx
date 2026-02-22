import { memo, useId } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

function ChartSection({ title, children, className, period = '7d', onPeriodChange, periodOptions = null }) {
  const titleId = useId();
  const resolvedPeriodOptions = periodOptions?.length ? periodOptions : [
    { value: '7d', label: 'Últimos 7 días' },
    { value: '30d', label: 'Últimos 30 días' },
  ];

  return (
    <motion.section 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      aria-labelledby={titleId}
      className={cn(
        "relative overflow-hidden",
        "bg-slate-800/40 backdrop-blur-xl",
        "p-6 rounded-2xl",
        "border border-white/5",
        "h-full",
        className
      )}
    >
      {/* Top highlight */}
      <div 
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" 
        aria-hidden="true" 
      />
      
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h3 id={titleId} className="text-xl font-bold text-white font-display">{title}</h3>
        <label className="sr-only" htmlFor={`${titleId}-period`}>Seleccionar período de tiempo</label>
        <select 
          id={`${titleId}-period`}
          aria-label="Filtro de período de tiempo"
          value={period}
          onChange={(event) => onPeriodChange?.(event.target.value)}
          className="bg-slate-900/80 border border-white/10 text-slate-300 text-sm rounded-xl px-4 py-2 outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all cursor-pointer hover:bg-slate-800/80"
        >
          {resolvedPeriodOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </header>
      
      {/* Chart Content */}
      <figure aria-label={`Gráfico de ${title}`}>
        {children}
      </figure>
    </motion.section>
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
