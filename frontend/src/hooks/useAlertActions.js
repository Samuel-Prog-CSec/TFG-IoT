/**
 * @fileoverview Hook que encapsula las acciones lifecycle de alertas inteligentes (T-941).
 *
 * Centraliza: dismiss con undo, resolve, snooze, pin/unpin, bulk action.
 * Usa `sonner` para toasts y actualiza optimistically la lista local.
 *
 * @module hooks/useAlertActions
 */

import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import analyticsService from '../services/analytics';

const UNDO_WINDOW_MS = 5000;

/**
 * @param {object} params
 * @param {(updater: (list: object[]) => object[]) => void} params.onListChange - actualiza la lista local
 * @param {() => Promise<void>} [params.onRefetch] - opcional: refetch tras commit
 */
export function useAlertActions({ onListChange, onRefetch }) {
  // Cola de undo: cada entrada `{ alertId, timer, payload }`.
  const pendingDismissRef = useRef(new Map());

  const removeOptimistic = useCallback(
    alertId => {
      onListChange?.(list => list.filter(a => a.id !== alertId));
    },
    [onListChange]
  );

  const restoreOptimistic = useCallback(
    alert => {
      onListChange?.(list => {
        if (list.find(a => a.id === alert.id)) return list;
        return [alert, ...list];
      });
    },
    [onListChange]
  );

  /**
   * Descarta con ventana de undo. El commit al backend se aplica tras 5 s.
   * Si se cancela durante la ventana, no se llama al backend.
   */
  const dismissWithUndo = useCallback(
    (alert, { reason = 'other' } = {}) => {
      removeOptimistic(alert.id);

      const commit = async () => {
        try {
          await analyticsService.dismissAlert(alert.id, { reason });
          pendingDismissRef.current.delete(alert.id);
          onRefetch?.();
        } catch (err) {
          pendingDismissRef.current.delete(alert.id);
          restoreOptimistic(alert);
          toast.error('No se pudo descartar la alerta', { description: err.message });
        }
      };

      const timer = setTimeout(commit, UNDO_WINDOW_MS);
      pendingDismissRef.current.set(alert.id, { alert, timer });

      toast('Alerta descartada', {
        description: alert.studentName
          ? `${alert.studentName} — se confirmará en ${Math.round(UNDO_WINDOW_MS / 1000)} s`
          : `Se confirmará en ${Math.round(UNDO_WINDOW_MS / 1000)} s`,
        duration: UNDO_WINDOW_MS,
        action: {
          label: 'Deshacer',
          onClick: () => {
            const pending = pendingDismissRef.current.get(alert.id);
            if (pending) {
              clearTimeout(pending.timer);
              pendingDismissRef.current.delete(alert.id);
              restoreOptimistic(alert);
              toast.success('Alerta restaurada');
            }
          }
        }
      });
    },
    [onRefetch, removeOptimistic, restoreOptimistic]
  );

  const resolveAlert = useCallback(
    async alert => {
      removeOptimistic(alert.id);
      try {
        await analyticsService.resolveAlert(alert.id);
        toast.success('Alerta marcada como resuelta');
        onRefetch?.();
      } catch (err) {
        restoreOptimistic(alert);
        toast.error('No se pudo resolver', { description: err.message });
      }
    },
    [onRefetch, removeOptimistic, restoreOptimistic]
  );

  const snoozeAlert = useCallback(
    async (alert, { untilDays = 7 } = {}) => {
      removeOptimistic(alert.id);
      try {
        await analyticsService.snoozeAlert(alert.id, { untilDays });
        toast.success(`Pausada durante ${untilDays} día${untilDays === 1 ? '' : 's'}`);
        onRefetch?.();
      } catch (err) {
        restoreOptimistic(alert);
        toast.error('No se pudo pausar', { description: err.message });
      }
    },
    [onRefetch, removeOptimistic, restoreOptimistic]
  );

  const pinAlert = useCallback(
    async alert => {
      try {
        await analyticsService.pinAlert(alert.id);
        toast.success('Alerta fijada');
        onRefetch?.();
      } catch (err) {
        if (err.response?.status === 400) {
          toast.error('Límite de alertas fijadas alcanzado', {
            description: 'Quita la fijación de otra alerta primero'
          });
        } else {
          toast.error('No se pudo fijar', { description: err.message });
        }
      }
    },
    [onRefetch]
  );

  const unpinAlert = useCallback(
    async alert => {
      try {
        await analyticsService.unpinAlert(alert.id);
        toast.success('Fijación retirada');
        onRefetch?.();
      } catch (err) {
        toast.error('No se pudo desfijar', { description: err.message });
      }
    },
    [onRefetch]
  );

  const bulkDismiss = useCallback(
    async (alerts, { reason = 'other' } = {}) => {
      const ids = alerts.map(a => a.id);
      try {
        const result = await analyticsService.bulkAlertAction({ ids, action: 'dismiss', reason });
        toast.success(`${result.ok} alertas descartadas`, {
          description: result.failed > 0 ? `${result.failed} fallaron` : undefined
        });
        onRefetch?.();
      } catch (err) {
        toast.error('Error en acción masiva', { description: err.message });
      }
    },
    [onRefetch]
  );

  const bulkSnooze = useCallback(
    async (alerts, { untilDays = 7 } = {}) => {
      const ids = alerts.map(a => a.id);
      try {
        const result = await analyticsService.bulkAlertAction({
          ids,
          action: 'snooze',
          untilDays
        });
        toast.success(`${result.ok} alertas en pausa`, {
          description: result.failed > 0 ? `${result.failed} fallaron` : undefined
        });
        onRefetch?.();
      } catch (err) {
        toast.error('Error en pausa masiva', { description: err.message });
      }
    },
    [onRefetch]
  );

  return {
    dismissWithUndo,
    resolveAlert,
    snoozeAlert,
    pinAlert,
    unpinAlert,
    bulkDismiss,
    bulkSnooze
  };
}
