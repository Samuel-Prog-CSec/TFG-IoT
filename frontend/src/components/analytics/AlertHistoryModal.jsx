/**
 * @fileoverview Modal con la timeline lifecycle de una alerta (T-941 H.2).
 *
 * Llama a `analyticsService.getAlertHistory(id)` y muestra los eventos
 * cronológicamente: created, reseen, escalated, snoozed, dismissed, resolved.
 */

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  Repeat,
  Flame,
  Pause,
  Play,
  BellOff,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import analyticsService from '../../services/analytics';
import { formatRelativeTime } from '../../lib/dateUtils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const EVENT_ICONS = {
  created: Sparkles,
  reseen: Repeat,
  escalated: Flame,
  severity_changed: Flame,
  snoozed: Pause,
  reactivated: Play,
  dismissed: BellOff,
  resolved: CheckCircle2
};

const EVENT_LABELS = {
  created: 'Detectada por primera vez',
  reseen: 'Re-detectada',
  escalated: 'Severidad escalada',
  severity_changed: 'Severidad actualizada',
  snoozed: 'Pausada',
  reactivated: 'Reactivada',
  dismissed: 'Descartada',
  resolved: 'Resuelta'
};

export default function AlertHistoryModal({ alertId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { shouldReduceMotion } = useReducedMotion();

  useEffect(() => {
    if (!alertId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const loadHistory = async () => {
      try {
        const res = await analyticsService.getAlertHistory(alertId, {
          signal: controller.signal
        });
        setData(res);
      } catch (err) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          setError(err.message || 'No se pudo cargar el historial');
        }
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
    return () => controller.abort();
  }, [alertId]);

  return (
    <AnimatePresence>
      {alertId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            role="dialog"
            aria-modal="true"
            aria-label="Historial de la alerta"
            className="w-full max-w-lg rounded-2xl border border-border-default bg-background-surface shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
              <h2 className="text-base font-bold text-text-primary font-display">
                Historial de la alerta
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar historial"
                className="rounded-md p-1 text-text-muted hover:bg-background-elevated/60 hover:text-text-primary"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {loading && (
                <div className="flex items-center justify-center py-8 text-text-muted">
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                  <span className="ml-2 text-sm">Cargando historial…</span>
                </div>
              )}
              {error && !loading && (
                <p className="text-sm text-error-base">{error}</p>
              )}
              {!loading && !error && data?.timeline && (
                <ol className="space-y-3" aria-label="Eventos del ciclo de vida">
                  {data.timeline.map((event, idx) => {
                    const Icon = EVENT_ICONS[event.event] || Sparkles;
                    const label = EVENT_LABELS[event.event] || event.event;
                    return (
                      <li key={`${event.event}-${event.at}-${idx}`} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="flex size-7 items-center justify-center rounded-full border border-border-subtle bg-background-elevated/60 text-text-secondary">
                            <Icon size={13} aria-hidden="true" />
                          </span>
                          {idx < data.timeline.length - 1 && (
                            <span
                              className="mt-1 w-px flex-1 bg-border-subtle"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                        <div className="flex-1 pb-3">
                          <p className="text-sm font-semibold text-text-primary">{label}</p>
                          <p className="mt-0.5 text-xs text-text-muted">
                            {formatRelativeTime(event.at)}
                          </p>
                          {event.severity && (
                            <p className="mt-1 text-micro text-text-muted">
                              Severidad: <span className="font-medium">{event.severity}</span>
                              {event.reason && <span className="ml-2">({event.reason})</span>}
                            </p>
                          )}
                          {event.event === 'snoozed' && event.until && (
                            <p className="mt-1 text-micro text-text-disabled">
                              Hasta: {new Date(event.until).toLocaleDateString('es-ES')}
                            </p>
                          )}
                          {event.event === 'dismissed' && event.reason && (
                            <p className="mt-1 text-micro text-text-disabled">
                              Motivo: {event.reason}
                            </p>
                          )}
                          {event.event === 'resolved' && (
                            <p className="mt-1 text-micro text-text-disabled">
                              {event.automatic ? 'Automática' : 'Manual por el docente'}
                            </p>
                          )}
                          {event.event === 'reseen' && event.occurrencesCount && (
                            <p className="mt-1 text-micro text-text-disabled">
                              Re-confirmada {event.occurrencesCount} veces
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

AlertHistoryModal.propTypes = {
  alertId: PropTypes.string,
  onClose: PropTypes.func.isRequired
};
