/**
 * @fileoverview Hook personalizado para cargar y gestionar contextos de juego
 * Centraliza la lógica de carga de contextos que se repite en múltiples páginas.
 * 
 * @module hooks/useContexts
 */

import { useState, useEffect, useCallback } from 'react';
import { contextsAPI, extractData, extractErrorMessage } from '../services/api';

/**
 * Hook para cargar y gestionar contextos de juego
 * 
 * @param {Object} options - Opciones de configuración
 * @param {boolean} [options.autoLoad=true] - Cargar automáticamente al montar
 * @param {boolean} [options.onlyActive=true] - Solo cargar contextos activos
 * @returns {Object} Estado y funciones para gestionar contextos
 * 
 * @example
 * const { contexts, loading, error, refetch } = useContexts();
 * 
 * @example
 * // Sin carga automática
 * const { contexts, loading, loadContexts } = useContexts({ autoLoad: false });
 * useEffect(() => { loadContexts(); }, [someCondition]);
 */
export function useContexts({ autoLoad = true, onlyActive = true } = {}) {
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState(null);

  /**
   * Carga los contextos desde la API
   */
  const loadContexts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = onlyActive ? { isActive: true } : {};
      const response = await contextsAPI.getContexts(params);
      const data = extractData(response) || [];

      setContexts(data);
      return data;
    } catch (err) {
      const errorMsg = extractErrorMessage(err);
      setError(errorMsg);
      console.error('[useContexts] Error cargando contextos:', errorMsg);
      return [];
    } finally {
      setLoading(false);
    }
  }, [onlyActive]);

  /**
   * Busca un contexto por su ID
   * @param {string} contextId - ID del contexto
   * @returns {Object|undefined} Contexto encontrado
   */
  const findContextById = useCallback((contextId) => {
    if (!contextId) return undefined;
    return contexts.find(ctx => 
      ctx._id === contextId || 
      ctx._id === contextId?._id
    );
  }, [contexts]);

  /**
   * Busca un contexto por su contextId (string key)
   * @param {string} contextKey - Key del contexto (ej: 'colors-basic')
   * @returns {Object|undefined} Contexto encontrado
   */
  const findContextByKey = useCallback((contextKey) => {
    if (!contextKey) return undefined;
    return contexts.find(ctx => ctx.contextId === contextKey);
  }, [contexts]);

  // Carga automática al montar
  useEffect(() => {
    if (autoLoad) {
      loadContexts();
    }
  }, [autoLoad, loadContexts]);

  return {
    contexts,
    loading,
    error,
    loadContexts,
    refetch: loadContexts,
    findContextById,
    findContextByKey,
  };
}

export default useContexts;
