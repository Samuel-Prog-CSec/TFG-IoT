/**
 * @fileoverview Menú kebab de acciones para una alerta (T-941).
 *
 * Acciones contextuales por estado:
 *  - active: Resolver / Descartar / Pausar 7d / Pausar 30d / Fijar / Ver historial
 *  - snoozed: Reactivar (resolver) / Descartar / Ver historial
 *  - dismissed / resolved: Ver historial
 *
 * Implementación deliberadamente simple (sin librería de menús) para no añadir
 * dependencias; cierra al perder foco o al pulsar fuera.
 */

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { MoreVertical, CheckCircle2, BellOff, Pause, Pin, History, PinOff } from 'lucide-react';
import { cn } from '../../lib/utils';

const ITEM_BASE =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-secondary hover:bg-background-elevated/60 hover:text-text-primary focus:outline-none focus:bg-background-elevated/80';

export default function AlertActionsMenu({
  alert,
  onResolve,
  onDismiss,
  onSnooze,
  onPin,
  onUnpin,
  onHistory
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handle = e => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    const handleKey = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const isActive = alert.status === 'active';
  const isSnoozed = alert.status === 'snoozed';
  const canPin = isActive && !alert.pinned;
  const canUnpin = alert.pinned;

  const handle = fn => () => {
    setOpen(false);
    fn?.(alert);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setOpen(o => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Más acciones para ${alert.studentName || 'alerta'}`}
        className="rounded-md p-1 text-text-muted hover:bg-background-elevated/60 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/60"
      >
        <MoreVertical size={14} aria-hidden="true" />
      </button>

      {open && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- onClick solo hace stopPropagation (evita que el clic en un ítem burbujee a la fila); los ítems del menú son <button> nativos con soporte de teclado completo
        <div
          role="menu"
          aria-label="Acciones de la alerta"
          className={cn(
            'absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-border-subtle bg-background-surface shadow-lg'
          )}
          onClick={e => e.stopPropagation()}
        >
          {(isActive || isSnoozed) && (
            <button type="button" className={ITEM_BASE} onClick={handle(onResolve)}>
              <CheckCircle2 size={13} aria-hidden="true" className="text-success-base" />
              Marcar como resuelta
            </button>
          )}
          {isActive && (
            <>
              <button
                type="button"
                className={ITEM_BASE}
                onClick={handle(a => onSnooze?.(a, { untilDays: 7 }))}
              >
                <Pause size={13} aria-hidden="true" className="text-info-base" />
                Pausar 7 días
              </button>
              <button
                type="button"
                className={ITEM_BASE}
                onClick={handle(a => onSnooze?.(a, { untilDays: 30 }))}
              >
                <Pause size={13} aria-hidden="true" className="text-info-base" />
                Pausar 30 días
              </button>
            </>
          )}
          {(isActive || isSnoozed) && (
            <button type="button" className={ITEM_BASE} onClick={handle(onDismiss)}>
              <BellOff size={13} aria-hidden="true" className="text-text-muted" />
              Descartar
            </button>
          )}
          {canPin && (
            <button type="button" className={ITEM_BASE} onClick={handle(onPin)}>
              <Pin size={13} aria-hidden="true" className="text-amber-400" />
              Fijar al principio
            </button>
          )}
          {canUnpin && (
            <button type="button" className={ITEM_BASE} onClick={handle(onUnpin)}>
              <PinOff size={13} aria-hidden="true" className="text-text-muted" />
              Quitar fijación
            </button>
          )}
          <div className="my-1 border-t border-border-subtle" />
          <button type="button" className={ITEM_BASE} onClick={handle(onHistory)}>
            <History size={13} aria-hidden="true" className="text-text-muted" />
            Ver historial
          </button>
        </div>
      )}
    </div>
  );
}

AlertActionsMenu.propTypes = {
  alert: PropTypes.object.isRequired,
  onResolve: PropTypes.func,
  onDismiss: PropTypes.func,
  onSnooze: PropTypes.func,
  onPin: PropTypes.func,
  onUnpin: PropTypes.func,
  onHistory: PropTypes.func
};
