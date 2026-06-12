/**
 * @fileoverview Hook que carga avisos activos del centro (T-942).
 *
 * Lo usa el `<TeacherAnnouncementBanner>` en `AppLayout` para teachers
 * autenticados. Persistencia de dismiss en localStorage: cada usuario
 * mantiene su propio set de avisos descartados.
 *
 * @module hooks/useActiveAnnouncements
 */

import { useCallback, useEffect, useState } from 'react';
import announcementsService from '../services/announcements';
import { useRefetchOnFocus } from './useRefetchOnFocus';

const DISMISS_KEY_PREFIX = 'announcement-dismissed:';

const isDismissed = id => {
  try {
    return localStorage.getItem(`${DISMISS_KEY_PREFIX}${id}`) === '1';
  } catch {
    return false;
  }
};

const persistDismiss = id => {
  try {
    localStorage.setItem(`${DISMISS_KEY_PREFIX}${id}`, '1');
  } catch {
    // localStorage podría no estar disponible (modo incógnito limit, SSR)
  }
};

export function useActiveAnnouncements({ enabled = true } = {}) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchAnnouncements = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await announcementsService.listActiveAnnouncements();
      const items = res?.items || [];
      setAnnouncements(items.filter(a => !isDismissed(a.id)));
    } catch (err) {
      // No es bloqueante para el render del AppLayout.
      setError(err);
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  // Refetch al recuperar foco para captar avisos recién publicados, pero
  // throttle a 30s: antes se refetcheaba en CADA `focus` (cada alt-tab),
  // generando spam de `/announcements/active`. Reusa el hook probado en vez
  // de un listener crudo. No pasamos `hasData` para no anular el refetch
  // (queremos captar avisos nuevos aunque ya haya algunos en pantalla).
  useRefetchOnFocus({
    refetch: fetchAnnouncements,
    enabled,
    isLoading: loading,
    minIntervalMs: 30000,
  });

  const dismissOne = useCallback(id => {
    persistDismiss(id);
    setAnnouncements(prev => prev.filter(a => a.id !== id));
  }, []);

  return { announcements, loading, error, dismissOne, refetch: fetchAnnouncements };
}
