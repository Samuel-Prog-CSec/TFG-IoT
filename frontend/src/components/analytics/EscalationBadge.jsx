/**
 * @fileoverview Badge "Lleva N días activa" para alertas con severity escalation (T-941).
 */

import PropTypes from 'prop-types';
import { Flame } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function EscalationBadge({ daysActive, isEscalated }) {
  if (!daysActive || daysActive < 7) return null;
  return (
    <span
      title={
        isEscalated
          ? 'Esta alerta lleva activa varios días y su urgencia se ha incrementado automáticamente'
          : `Activa desde hace ${daysActive} días`
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
        isEscalated
          ? 'border-amber-400/40 bg-amber-400/10 text-amber-400'
          : 'border-text-muted/30 bg-background-elevated/50 text-text-muted'
      )}
    >
      {isEscalated && <Flame size={10} aria-hidden="true" />}
      Lleva {daysActive}d
    </span>
  );
}

EscalationBadge.propTypes = {
  daysActive: PropTypes.number,
  isEscalated: PropTypes.bool
};
