/**
 * @fileoverview Hook personalizado para cargar y gestionar contextos de juego
 * Centraliza la lógica de carga de contextos que se repite en múltiples páginas.
 *
 * @module hooks/useContexts
 */

import { useState, useEffect, useCallback } from 'react';
import { contextsAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';

/**
 * Hook para cargar y gestionar contextos de juego
 *
 * @param {Object} options - Opciones de configuración
 * @param {boolean} [options.autoLoad=true] - Cargar automáticamente al montar
 * @param {boolean} [options.onlyActive=true] - Solo cargar contextos activos
 * @param {boolean} [options.showInactive=false] - Incluir contextos inactivos (para super_admin)
 * @returns {Object} Estado y funciones para gestionar contextos
 *
 * @example
 * const { contexts, loading, error, refetch } = useContexts();
 *
 * @example
 * // Super_admin ve todos los contextos
 * const { contexts } = useContexts({ showInactive: true });
 *
 * @example
 * // Sin carga automática
 * const { contexts, loading, loadContexts } = useContexts({ autoLoad: false });
 * useEffect(() => { loadContexts(); }, [someCondition]);
 */
export function useContexts({ autoLoad = true, onlyActive = true, showInactive = false } = {}) {
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState(null);

  /**
   * Carga los contextos desde la API
   */
  const loadContexts = useCallback(
    async signal => {
      try {
        setLoading(true);
        setError(null);

        // showInactive=true → no filtrar; onlyActive=true → solo activos; ambos false → todos
        const params = showInactive ? {} : onlyActive ? { isActive: true } : {};
        const response = await contextsAPI.getContexts(params, signal ? { signal } : {});
        const data = extractData(response) || [];

        setContexts(data);
        return data;
      } catch (err) {
        if (isAbortError(err)) {
          return [];
        }

        const errorMsg = extractErrorMessage(err);
        setError(errorMsg);
        return [];
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [onlyActive, showInactive]
  );

  /**
   * Crea un nuevo contexto y recarga la lista.
   * Solo disponible para super_admin (el backend rechaza con 403 si no).
   * @param {Object} data - { contextId: string, name: string }
   * @returns {Promise<Object|null>} El contexto creado o null si falla
   */
  const createContext = useCallback(
    async data => {
      const result = await contextsAPI.createContext(data);
      const created = extractData(result);
      await loadContexts();
      return created;
    },
    [loadContexts]
  );

  /**
   * Actualiza los metadatos de un contexto y recarga la lista.
   * Solo disponible para super_admin (el backend rechaza con 403 si no).
   * @param {string} contextMongoId - MongoDB _id del contexto
   * @param {Object} data - Campos a actualizar: { name?, contextId? }
   * @returns {Promise<Object|null>} El contexto actualizado o null si falla
   */
  const updateContext = useCallback(
    async (contextMongoId, data) => {
      const result = await contextsAPI.updateContext(contextMongoId, data);
      const updated = extractData(result);
      await loadContexts();
      return updated;
    },
    [loadContexts]
  );

  /**
   * Busca un contexto por su ID
   * @param {string} contextId - ID del contexto
   * @returns {Object|undefined} Contexto encontrado
   */
  const findContextById = useCallback(
    contextId => {
      if (!contextId) return undefined;
      return contexts.find(ctx => ctx._id === contextId || ctx._id === contextId?._id);
    },
    [contexts]
  );

  /**
   * Busca un contexto por su contextId (string key)
   * @param {string} contextKey - Key del contexto (ej: 'colors-basic')
   * @returns {Object|undefined} Contexto encontrado
   */
  const findContextByKey = useCallback(
    contextKey => {
      if (!contextKey) return undefined;
      return contexts.find(ctx => ctx.contextId === contextKey);
    },
    [contexts]
  );

  // Carga automática al montar
  useEffect(() => {
    if (autoLoad) {
      const controller = new AbortController();
      loadContexts(controller.signal);
      return () => controller.abort();
    }
    return undefined;
  }, [autoLoad, loadContexts]);

  return {
    contexts,
    loading,
    error,
    loadContexts,
    refetch: loadContexts,
    createContext,
    updateContext,
    findContextById,
    findContextByKey
  };
}

export default useContexts;
