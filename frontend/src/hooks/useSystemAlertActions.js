/**
 * @fileoverview Hook lifecycle de SystemAlerts (T-942).
 *
 * Espejo de `useAlertActions.js` para alertas del super_admin. Mantiene la
 * misma UX (optimistic update, undo 5 s, toast con sonner) pero apunta al
 * servicio `systemAlerts` y soporta snooze por horas además de días.
 *
 * @module hooks/useSystemAlertActions
 */

import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import systemAlertsService from '../services/systemAlerts';

const UNDO_WINDOW_MS = 5000;

const formatSnoozeUnit = ({ untilHours, untilDays }) => {
  if (untilHours) {
    return `${untilHours} h`;
  }
  if (untilDays) {
    return `${untilDays} día${untilDays === 1 ? '' : 's'}`;
  }
  return 'el plazo indicado';
};

export function useSystemAlertActions({ onListChange, onRefetch }) {
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

  const dismissWithUndo = useCallback(
    (alert, { reason = 'other' } = {}) => {
      removeOptimistic(alert.id);

      const commit = async () => {
        try {
          await systemAlertsService.dismissSystemAlert(alert.id, { reason });
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
        description: `${alert.title || 'Alerta'} — se confirmará en ${Math.round(
          UNDO_WINDOW_MS / 1000
        )} s`,
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
        await systemAlertsService.resolveSystemAlert(alert.id);
        toast.success('Alerta marcada como resuelta');
        onRefetch?.();
      } catch (err) {
        restoreOptimistic(alert);
        toast.error('No se pudo resolver', { description: err.message });
      }
    },
    [onRefetch, removeOptimistic, restoreOptimistic]
  );

  /**
   * Snooze por horas (preset) o por fecha. Se prefiere `untilHours` para
   * incidencias operativas; `untilDays` se acepta por consistencia con
   * `useAlertActions` del teacher.
   */
  const snoozeAlert = useCallback(
    async (alert, { untilHours, untilDays, untilDate } = {}) => {
      const args = {};
      if (untilDate) args.untilDate = untilDate;
      if (untilHours) args.untilHours = untilHours;
      if (untilDays) args.untilDays = untilDays;
      if (!Object.keys(args).length) {
        args.untilHours = 24;
      }
      removeOptimistic(alert.id);
      try {
        await systemAlertsService.snoozeSystemAlert(alert.id, args);
        toast.success(`En pausa durante ${formatSnoozeUnit(args)}`);
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
        await systemAlertsService.pinSystemAlert(alert.id);
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
        await systemAlertsService.unpinSystemAlert(alert.id);
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
        const result = await systemAlertsService.bulkSystemAlertAction({
          ids,
          action: 'dismiss',
          reason
        });
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
    async (alerts, { untilHours = 24 } = {}) => {
      const ids = alerts.map(a => a.id);
      try {
        const result = await systemAlertsService.bulkSystemAlertAction({
          ids,
          action: 'snooze',
          untilHours
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
