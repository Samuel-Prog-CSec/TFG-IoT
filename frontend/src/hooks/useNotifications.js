/**
 * @fileoverview Hook de notificaciones tiempo real (T-955).
 *
 * Encapsula:
 *   - Carga inicial (HTTP) de la página más reciente.
 *   - Suscripción al canal Socket.IO `notification:created` para recibir
 *     eventos push del backend (room `user_<id>`).
 *   - Mutadores: marcar leída, marcar todas leídas, cargar más antiguas
 *     (cursor pagination por `createdAt`).
 *   - Toggle del panel desplegable + foco accesible.
 *
 * No es un store global: AppLayout monta `<NotificationBell />` que llama
 * a este hook. Si en el futuro varias zonas necesitan el estado, lo
 * subimos a un contexto sin cambiar la API pública.
 *
 * @module hooks/useNotifications
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { notificationsAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import socketService from '../services/socket';
import { useAuth } from '../context/AuthContext';
import { getId } from '../lib/entityId';

const DEFAULT_PAGE_SIZE = 20;
const NOTIFICATION_EVENT = 'notification:created';

/**
 * Hook principal. Devuelve estado serializable + acciones puras.
 */
export default function useNotifications({ pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const { isAuthenticated, user } = useAuth();
  const userId = getId(user);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [error, setError] = useState(null);
  // Marca la llegada de una nueva notificación, para que el bell pueda
  // hacer un pulse celebratorio o un confetti sin que tengamos que
  // emitir un evento separado. Se incrementa al recibir push.
  const [pushTick, setPushTick] = useState(0);

  // Evita re-fetch innecesario en StrictMode (dev double mount) y tras
  // cambios de identidad de usuario.
  const initialFetchUserIdRef = useRef(null);

  /**
   * Carga la página inicial. Idempotente para el mismo userId.
   */
  const loadInitial = useCallback(
    async (signal) => {
      if (!isAuthenticated) {
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const [listRes, countRes] = await Promise.all([
          notificationsAPI.list({ limit: pageSize }, signal ? { signal } : {}),
          notificationsAPI.unreadCount(signal ? { signal } : {})
        ]);
        const listData = extractData(listRes);
        const countData = extractData(countRes);
        setNotifications(listData?.items || []);
        setNextCursor(listData?.nextCursor || null);
        setUnreadCount(countData?.count || 0);
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        setError(extractErrorMessage(err));
      } finally {
        setIsLoading(false);
      }
    },
    [isAuthenticated, pageSize]
  );

  /**
   * Carga más antiguas usando el cursor `before`.
   * No bloquea ni resetea las ya visibles.
   */
  const loadMore = useCallback(async () => {
    if (!isAuthenticated || !nextCursor || isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      const res = await notificationsAPI.list({ limit: pageSize, before: nextCursor });
      const data = extractData(res);
      setNotifications((prev) => [...prev, ...(data?.items || [])]);
      setNextCursor(data?.nextCursor || null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, nextCursor, isLoading, pageSize]);

  /**
   * Marca una notificación como leída en backend y actualiza el state
   * de forma optimista (rollback en error).
   */
  const markRead = useCallback(
    async (id) => {
      const previous = notifications;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await notificationsAPI.markRead(id);
      } catch (err) {
        setNotifications(previous);
        setUnreadCount((c) => c + 1);
        setError(extractErrorMessage(err));
      }
    },
    [notifications]
  );

  /**
   * Marca todas como leídas. Optimista.
   */
  const markAllRead = useCallback(async () => {
    if (unreadCount === 0) {
      return;
    }
    const previous = notifications;
    const previousUnread = unreadCount;
    setNotifications((prev) =>
      prev.map((n) =>
        n.read ? n : { ...n, read: true, readAt: new Date().toISOString() }
      )
    );
    setUnreadCount(0);
    try {
      await notificationsAPI.markAllRead();
    } catch (err) {
      setNotifications(previous);
      setUnreadCount(previousUnread);
      setError(extractErrorMessage(err));
    }
  }, [notifications, unreadCount]);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen((v) => !v), []);

  // Suscripción al evento push. Limpia al desmontar / cambiar de usuario.
  useEffect(() => {
    if (!isAuthenticated || !userId) {
      return undefined;
    }
    const handler = (payload) => {
      if (!payload || payload.userId === undefined || payload.userId === userId || !payload.userId) {
        // El backend ya envía sólo al room del destinatario; este chequeo
        // de userId es defensa por si la inyección estuviera mal en otro
        // entorno. payload.userId puede no venir si el DTO V1 no lo expone
        // (no lo expone — entonces aceptamos el evento sin verificar).
        setNotifications((prev) => {
          // Dedup por id por si el evento llega 2 veces tras reconexión.
          if (prev.some((n) => n.id === payload.id)) {
            return prev;
          }
          return [payload, ...prev];
        });
        if (!payload.read) {
          setUnreadCount((c) => c + 1);
        }
        setPushTick((t) => t + 1);

        // T-941: cuando llega una notificación de tipo `student_at_risk`
        // (emitida por alertDetectionService al detectar critical nueva),
        // disparamos un evento DOM para que AlertsHub / AlertsPanel
        // refresquen sin necesidad de reload.
        if (payload.type === 'student_at_risk' && typeof window !== 'undefined') {
          try {
            window.dispatchEvent(
              new CustomEvent('smartalert:created', {
                detail: { alertId: payload.metadata?.alertId, payload }
              })
            );
          } catch {
            // Entornos sin CustomEvent — no-op
          }
        }
      }
    };
    socketService.on(NOTIFICATION_EVENT, handler);
    return () => socketService.off(NOTIFICATION_EVENT, handler);
  }, [isAuthenticated, userId]);

  // Mantén `loadInitial` en un ref para que el effect no se re-ejecute
  // cuando su identidad cambie (el ciclo isAuth:false→true rota el
  // useCallback). QA 2026-05-12.
  const loadInitialRef = useRef(loadInitial);
  useEffect(() => {
    loadInitialRef.current = loadInitial;
  }, [loadInitial]);

  // Carga inicial cuando cambia la identidad o se autentica.
  // NO usamos AbortController aquí: StrictMode dev hace mount→unmount→mount
  // en el primer ciclo, y el cleanup abortaba el fetch antes de completarse.
  // El primer load es ligero (2 GETs cacheables) y no necesita abort —
  // si el usuario cierra sesión, los useState quedan en estado limpio en
  // la rama del effect que detecta isAuthenticated=false.
  useEffect(() => {
    if (!isAuthenticated || !userId) {
      setNotifications([]);
      setUnreadCount(0);
      setNextCursor(null);
      initialFetchUserIdRef.current = null;
      return;
    }
    if (initialFetchUserIdRef.current === userId) {
      return;
    }
    initialFetchUserIdRef.current = userId;
    loadInitialRef.current();
  }, [isAuthenticated, userId]);

  return useMemo(
    () => ({
      notifications,
      unreadCount,
      nextCursor,
      hasMore: !!nextCursor,
      isLoading,
      isPanelOpen,
      error,
      pushTick,
      markRead,
      markAllRead,
      loadMore,
      openPanel,
      closePanel,
      togglePanel,
      refresh: () => loadInitial()
    }),
    [
      notifications,
      unreadCount,
      nextCursor,
      isLoading,
      isPanelOpen,
      error,
      pushTick,
      markRead,
      markAllRead,
      loadMore,
      openPanel,
      closePanel,
      togglePanel,
      loadInitial
    ]
  );
}
