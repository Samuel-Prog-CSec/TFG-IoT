/**
 * @fileoverview useRouteAtmosphere — deriva la atmósfera del contexto
 * pedagógico desde la ruta activa y mantiene `<html data-atmosphere>` sync.
 *
 * Estrategia:
 *   - `/contexts/:contextId` → leer el contexto y obtener su slug.
 *   - `/decks/:deckId` y `/decks/:deckId/edit` → leer el mazo y obtener el
 *     contexto asociado.
 *   - `/sessions/:sessionId` y `/sessions/:sessionId/edit` → leer la sesión
 *     y obtener el contexto.
 *   - `/game/:sessionId` → idem.
 *   - Resto → `default`.
 *
 * Caché en memoria por id+tipo para evitar refetch al pasar por la misma
 * ruta dos veces seguidas. La caché es de proceso (no persiste).
 *
 * @module hooks/useRouteAtmosphere
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAtmosphere } from '../context/AtmosphereContext';
import { decksAPI, sessionsAPI, contextsAPI, extractData, isAbortError } from '../services/api';

const ROUTE_PATTERNS = [
  { regex: /^\/contexts\/([^/]+)\/?$/, type: 'context' },
  { regex: /^\/decks\/([^/]+)(?:\/edit)?\/?$/, type: 'deck' },
  { regex: /^\/sessions\/([^/]+)(?:\/edit)?\/?$/, type: 'session' },
  { regex: /^\/game\/([^/]+)\/?$/, type: 'session' },
  { regex: /^\/board-setup\/([^/]+)\/?$/, type: 'session' }
];

// Cache simple en memoria. La clave es `${type}:${id}` y el valor el slug
// resuelto. Persiste durante toda la sesión SPA.
const atmosphereCache = new Map();

function matchRoute(pathname) {
  for (const { regex, type } of ROUTE_PATTERNS) {
    const match = regex.exec(pathname);
    if (match) {
      return { type, id: match[1] };
    }
  }
  return null;
}

async function fetchAtmosphereSlug({ type, id }, signal) {
  if (!type || !id) {
    return null;
  }
  // El id "new" del wizard de decks/sessions no es un contextId real.
  if (id === 'new') {
    return null;
  }

  const cacheKey = `${type}:${id}`;
  if (atmosphereCache.has(cacheKey)) {
    return atmosphereCache.get(cacheKey);
  }

  try {
    if (type === 'context') {
      const res = await contextsAPI.getContextById(id, signal ? { signal } : {});
      const data = extractData(res);
      const slug = data?.contextId || data?.slug || data?.id || null;
      atmosphereCache.set(cacheKey, slug);
      return slug;
    }
    if (type === 'deck') {
      const res = await decksAPI.getDeckById(id, signal ? { signal } : {});
      const data = extractData(res);
      // El DTO V1 de deck expone `context` (populado: {id, contextId, name})
      // y `contextId` (string). Preferimos `context` que trae el slug.
      const ctx = data?.context || data?.contextId;
      const slug =
        (typeof ctx === 'object' && ctx) ? ctx.contextId || ctx.slug || null : null;
      atmosphereCache.set(cacheKey, slug);
      return slug;
    }
    if (type === 'session') {
      const res = await sessionsAPI.getSessionById(id, signal ? { signal } : {});
      const data = extractData(res);
      const ctx = data?.context || data?.contextId;
      const slug =
        (typeof ctx === 'object' && ctx) ? ctx.contextId || ctx.slug || null : null;
      atmosphereCache.set(cacheKey, slug);
      return slug;
    }
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }
    // Silenciar errores: si no se puede resolver, mantenemos la atmósfera
    // anterior (la cascada caerá a default en el próximo cambio de ruta).
    atmosphereCache.set(cacheKey, null);
  }
  return null;
}

/**
 * Hook que monta el efecto de sincronización. No devuelve nada — el efecto
 * empuja la atmósfera resuelta al `AtmosphereContext`, que a su vez la
 * aplica como atributo en `<html>`.
 *
 * Se monta una sola vez por layout (AppLayout). El hook es seguro de
 * desmontar y re-montar (cancel via AbortController).
 */
export function useRouteAtmosphere() {
  const location = useLocation();
  const { setAtmosphere, clearAtmosphere } = useAtmosphere();
  const lastResolvedKeyRef = useRef('default');

  useEffect(() => {
    const matched = matchRoute(location.pathname);
    if (!matched) {
      if (lastResolvedKeyRef.current !== 'default') {
        lastResolvedKeyRef.current = 'default';
        clearAtmosphere();
      }
      return undefined;
    }

    const controller = new AbortController();
    let isCancelled = false;

    fetchAtmosphereSlug(matched, controller.signal).then((slug) => {
      if (isCancelled) {
        return;
      }
      if (!slug) {
        if (lastResolvedKeyRef.current !== 'default') {
          lastResolvedKeyRef.current = 'default';
          clearAtmosphere();
        }
        return;
      }
      const key = slug;
      if (lastResolvedKeyRef.current !== key) {
        lastResolvedKeyRef.current = key;
        setAtmosphere(slug);
      }
    });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [location.pathname, setAtmosphere, clearAtmosphere]);
}

export default useRouteAtmosphere;
