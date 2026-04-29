import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Filter } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @fileoverview Barra de filtros activos reutilizable
 *
 * Muestra "chips" de filtros activos con boton X para eliminarlos individualmente
 * y un CTA "Limpiar filtros" al final. Evita que el usuario olvide que un
 * filtro esta aplicado cuando la lista queda vacia o corta.
 *
 * Uso:
 *   <ActiveFiltersBar
 *     filters={[
 *       { key: 'context', label: 'Contexto: Geografia', onRemove: () => setContext('all') },
 *       { key: 'status', label: 'Estado: Borrador', onRemove: () => setStatus('all') },
 *     ]}
 *     onClearAll={() => resetFilters()}
 *   />
 */
export default function ActiveFiltersBar({ filters = [], onClearAll, className }) {
  const { shouldReduceMotion } = useReducedMotion();
  const visible = filters.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
      role="region"
      aria-label="Filtros activos"
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-xl border border-brand-base/20 bg-brand-base/5 px-3 py-2',
        className
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <Filter size={14} className="text-brand-base" aria-hidden="true" />
        Filtrando por:
      </span>
      <AnimatePresence initial={false}>
        {visible.map((filter) => (
          <motion.button
            key={filter.key}
            type="button"
            onClick={filter.onRemove}
            layout
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.9 }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1',
              'bg-brand-base/15 text-brand-base text-xs font-medium',
              'border border-brand-base/25',
              'hover:bg-brand-base/25 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base'
            )}
            aria-label={`Quitar filtro: ${filter.label}`}
          >
            <span>{filter.label}</span>
            <X size={12} aria-hidden="true" />
          </motion.button>
        ))}
      </AnimatePresence>
      {onClearAll && visible.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className={cn(
            'ml-auto text-xs font-medium text-text-muted hover:text-text-primary transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base rounded px-2 py-1'
          )}
        >
          Limpiar todo
        </button>
      )}
    </motion.div>
  );
}

ActiveFiltersBar.propTypes = {
  filters: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      onRemove: PropTypes.func.isRequired,
    })
  ),
  onClearAll: PropTypes.func,
  className: PropTypes.string,
};
