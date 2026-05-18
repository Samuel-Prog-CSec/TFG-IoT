/**
 * @fileoverview Filtro de estado (Activas / Resueltas / Descartadas / En pausa) para AlertsHub (T-941).
 *
 * Pills horizontales con conteo. La selección actual destaca con el color
 * semántico del estado.
 */

import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import { STATUS_STYLES, STATUS_ORDER } from '../../constants/alertTypes';

export default function AlertStatusFilter({ value, onChange, counts = {} }) {
  return (
    <div
      role="tablist"
      aria-label="Filtrar alertas por estado"
      className="flex flex-wrap items-center gap-2"
    >
      {STATUS_ORDER.map(status => {
        const style = STATUS_STYLES[status];
        const Icon = style.Icon;
        const isActive = value === status;
        const count = counts[status] ?? 0;
        return (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(status)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? style.badge
                : 'border-border-subtle bg-background-elevated/40 text-text-muted hover:text-text-secondary'
            )}
          >
            <Icon size={13} aria-hidden="true" />
            <span>{style.label}</span>
            <span
              className={cn(
                'tabular-nums rounded-md px-1.5 py-0.5 text-[10px]',
                isActive
                  ? 'bg-background-base/40'
                  : 'bg-background-surface/40 text-text-disabled'
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

AlertStatusFilter.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  counts: PropTypes.object
};
