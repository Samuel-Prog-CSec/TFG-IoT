/**
 * @fileoverview Barra inferior que aparece al seleccionar varias alertas (T-941).
 * Permite acciones masivas: descartar / pausar 7d.
 */

import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { BellOff, Pause, X } from 'lucide-react';

export default function AlertBulkBar({ count, onDismissAll, onSnoozeAll, onClear }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 32, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          role="region"
          aria-label={`${count} alertas seleccionadas`}
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full border border-border-default bg-background-surface/95 px-3 py-2 shadow-xl backdrop-blur-sm"
        >
          <span className="text-xs font-medium text-text-primary tabular-nums px-2">
            {count} seleccionadas
          </span>
          <button
            type="button"
            onClick={onDismissAll}
            className="inline-flex items-center gap-1.5 rounded-full bg-error-base/10 px-3 py-1.5 text-xs font-medium text-error-base hover:bg-error-base/20 transition-colors"
          >
            <BellOff size={12} aria-hidden="true" />
            Descartar
          </button>
          <button
            type="button"
            onClick={onSnoozeAll}
            className="inline-flex items-center gap-1.5 rounded-full bg-info-base/10 px-3 py-1.5 text-xs font-medium text-info-base hover:bg-info-base/20 transition-colors"
          >
            <Pause size={12} aria-hidden="true" />
            Pausar 7 días
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label="Limpiar selección"
            className="rounded-full p-1.5 text-text-muted hover:bg-background-elevated/60 hover:text-text-primary"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

AlertBulkBar.propTypes = {
  count: PropTypes.number.isRequired,
  onDismissAll: PropTypes.func.isRequired,
  onSnoozeAll: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired
};
