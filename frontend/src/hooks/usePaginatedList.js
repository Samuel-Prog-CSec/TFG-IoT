/**
 * @fileoverview Hook reutilizable para listados con paginación clásica
 * (T-952 Fase B).
 *
 * Extrae el patrón repetido en SessionsPage, CardDecksPage,
 * StudentManagement y similares: estado de página/limit/filtros, cancelación
 * con AbortController, debounce de búsqueda, y reset de página al cambiar
 * filtros. Trabaja contra cualquier endpoint que devuelva el envelope
 * canónico del backend:
 *
 *   { data: [...items], pagination: { page, limit, total, totalPages } }
 *
 * O bien la forma alternativa que utilizan algunos endpoints
 * (`{ data: { data: [...], pagination: {...} } }`). El hook normaliza
 * ambas internamente.
 *
 * Filosofía: hook agnóstico al dominio. No conoce sessions, decks ni
 * users — el consumidor pasa el `fetcher` y los `initialFilters` que
 * necesite. El hook se encarga de la "fontanería": page, limit, debounce,
 * abort, refetch coherentes.
 *
 * @module hooks/usePaginatedList
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAbortError } from '../services/api';

/**
 * Extrae `items` y `pagination` del response del backend cubriendo las
 * dos formas conocidas (envelope estándar y envelope anidado).
 */
function normalizeResponse(response) {
  if (!response) return { items: [], pagination: {} };

  const root = response.data ?? response;
  // Forma A: { data: [...items], pagination: {...} } (lo más común)
  if (Array.isArray(root?.data) && (root?.pagination || typeof root?.pagination === 'object')) {
    return { items: root.data, pagination: root.pagination || {} };
  }
  // Forma B: { data: { data: [...], pagination: {...} } } (admin endpoints)
  if (root?.data?.data && Array.isArray(root.data.data)) {
    return { items: root.data.data, pagination: root.data.pagination || {} };
  }
  // Forma C: ya viene plano como [items]
  if (Array.isArray(root)) {
    return { items: root, pagination: {} };
  }
  // Forma D: { data: [...] } sin pagination
  if (Array.isArray(root?.data)) {
    return { items: root.data, pagination: {} };
  }
  return { items: [], pagination: {} };
}

/**
 * @typedef {Object} PaginatedFilters
 * @property {string} [search] — Texto de búsqueda libre (será debounced).
 * @property {string} [sortBy]
 * @property {'asc'|'desc'} [order]
 *
 * @typedef {Object} UsePaginatedListOptions
 * @property {(params: object, options: { signal: AbortSignal }) => Promise<any>} fetcher
 *   Función asíncrona que llama al backend. Recibe los params construidos
 *   (page, limit, search, ...filters extra) y un objeto con `signal` para
 *   cancelación. Debe devolver la respuesta del backend tal cual (el hook
 *   normaliza).
 * @property {number} [initialPage=1]
 * @property {number} [initialLimit=12]
 * @property {object} [initialFilters={}] — Filtros adicionales (status,
 *   difficulty, contextId, etc.). Cualquier cambio reseteará page=1.
 * @property {string} [initialSortBy=null]
 * @property {'asc'|'desc'} [initialOrder='desc']
 * @property {number} [searchDebounceMs=300]
 * @property {boolean} [enabled=true] — Permite suspender los fetches
 *   automáticos (útil si el consumidor quiere controlar el momento
 *   exacto del primer fetch).
 * @property {(error: unknown) => void} [onError]
 *
 * @returns {{
 *   items: any[],
 *   pagination: { page: number, limit: number, total: number, totalPages: number },
 *   page: number,
 *   setPage: (page: number) => void,
 *   limit: number,
 *   setLimit: (limit: number) => void,
 *   filters: object,
 *   setFilters: (filters: object | ((prev: object) => object)) => void,
 *   setSearch: (search: string) => void,
 *   search: string,
 *   sortBy: string|null,
 *   order: 'asc'|'desc',
 *   setSort: (sortBy: string|null, order?: 'asc'|'desc') => void,
 *   isLoading: boolean,
 *   error: unknown,
 *   refetch: () => void,
 * }}
 */
export function usePaginatedList({
  fetcher,
  initialPage = 1,
  initialLimit = 12,
  initialFilters = {},
  initialSortBy = null,
  initialOrder = 'desc',
  searchDebounceMs = 300,
  enabled = true,
  onError,
} = {}) {
  const [page, setPageState] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [filters, setFiltersState] = useState(initialFilters);
  const [search, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState(initialSortBy);
  const [order, setOrder] = useState(initialOrder);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    page: initialPage,
    limit: initialLimit,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Debounce de búsqueda — el consumidor llama setSearch en cada keystroke,
  // pero solo disparamos refetch cuando el usuario pausa la escritura.
  useEffect(() => {
    if (search === debouncedSearch) return undefined;
    const handle = globalThis.setTimeout(() => {
      setDebouncedSearch(search);
      setPageState(1);
    }, searchDebounceMs);
    return () => globalThis.clearTimeout(handle);
  }, [search, debouncedSearch, searchDebounceMs]);

  // Setters que reset page=1 cuando cambian — evita "página 3 vacía"
  // al aplicar un filtro nuevo que tiene menos resultados.
  const setFilters = useCallback((updater) => {
    setFiltersState((prev) => {
      return typeof updater === 'function' ? updater(prev) : updater;
    });
    setPageState(1);
  }, []);

  const setSort = useCallback((nextSortBy, nextOrder = 'desc') => {
    setSortBy(nextSortBy);
    setOrder(nextOrder);
    setPageState(1);
  }, []);

  const setPage = useCallback((nextPage) => {
    setPageState(Math.max(1, Math.floor(Number(nextPage) || 1)));
  }, []);

  const setSearch = useCallback((nextSearch) => {
    setSearchInput(String(nextSearch ?? ''));
  }, []);

  // Construye los params del fetcher. Memoizado por entradas estables
  // — evita refetches espurios cuando el consumidor pasa un objeto
  // `filters` nuevo en cada render pero con mismos valores.
  const params = useMemo(() => {
    const result = {
      page,
      limit,
      ...filters,
    };
    if (debouncedSearch) result.search = debouncedSearch;
    if (sortBy) {
      result.sortBy = sortBy;
      result.order = order;
    }
    return result;
  }, [page, limit, filters, debouncedSearch, sortBy, order]);

  // Effect principal: dispara fetch cuando params cambia. Cancela el
  // anterior con AbortController para evitar carrera entre páginas
  // (el usuario clicka rápidamente prev/next).
  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof fetcherRef.current !== 'function') return undefined;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await fetcherRef.current(params, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const normalized = normalizeResponse(response);
        setItems(normalized.items);
        setPagination({
          page: normalized.pagination?.page ?? params.page,
          limit: normalized.pagination?.limit ?? params.limit,
          total: normalized.pagination?.total ?? normalized.items.length,
          totalPages: normalized.pagination?.totalPages ?? 1,
        });
      } catch (err) {
        if (isAbortError(err)) return;
        setError(err);
        if (typeof onErrorRef.current === 'function') {
          onErrorRef.current(err);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [params, enabled]);

  const refetch = useCallback(() => {
    // Forzar un re-fetch idéntico al actual recreando `params` no es
    // posible sin un trigger explícito; rompemos la igualdad con un
    // identity bump del filter object.
    setFiltersState((prev) => ({ ...prev }));
  }, []);

  return {
    items,
    pagination,
    page,
    setPage,
    limit,
    setLimit,
    filters,
    setFilters,
    search,
    setSearch,
    sortBy,
    order,
    setSort,
    isLoading,
    error,
    refetch,
  };
}

