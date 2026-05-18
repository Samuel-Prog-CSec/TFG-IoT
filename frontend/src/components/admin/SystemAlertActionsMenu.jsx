/**
 * @fileoverview Menú kebab de acciones para una SystemAlert (T-942).
 *
 * Mismo patrón visual que `AlertActionsMenu.jsx` (alertas pedagógicas) pero
 * los presets de snooze son en HORAS (1h, 6h, 24h, 72h) porque las
 * incidencias operativas evolucionan en escala mucho más corta que el
 * desempeño pedagógico.
 *
 * @module components/admin/SystemAlertActionsMenu
 */

import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  MoreVertical,
  CheckCircle2,
  BellOff,
  Pause,
  Pin,
  History,
  PinOff
} from 'lucide-react';
import { cn } from '../../lib/utils';

const ITEM_BASE =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text-secondary hover:bg-background-elevated/60 hover:text-text-primary focus:outline-none focus:bg-background-elevated/80';

export default function SystemAlertActionsMenu({
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
        aria-label={`Más acciones para ${alert.title || 'alerta del sistema'}`}
        className="rounded-md p-1 text-text-muted hover:bg-background-elevated/60 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/60"
      >
        <MoreVertical size={14} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          tabIndex={-1}
          aria-label="Acciones de la alerta de sistema"
          className={cn(
            'absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-border-subtle bg-background-surface shadow-lg'
          )}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
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
                onClick={handle(a => onSnooze?.(a, { untilHours: 1 }))}
              >
                <Pause size={13} aria-hidden="true" className="text-info-base" />
                Pausar 1 hora
              </button>
              <button
                type="button"
                className={ITEM_BASE}
                onClick={handle(a => onSnooze?.(a, { untilHours: 6 }))}
              >
                <Pause size={13} aria-hidden="true" className="text-info-base" />
                Pausar 6 horas
              </button>
              <button
                type="button"
                className={ITEM_BASE}
                onClick={handle(a => onSnooze?.(a, { untilHours: 24 }))}
              >
                <Pause size={13} aria-hidden="true" className="text-info-base" />
                Pausar 24 horas
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

SystemAlertActionsMenu.propTypes = {
  alert: PropTypes.object.isRequired,
  onResolve: PropTypes.func,
  onDismiss: PropTypes.func,
  onSnooze: PropTypes.func,
  onPin: PropTypes.func,
  onUnpin: PropTypes.func,
  onHistory: PropTypes.func
};
