/**
 * @fileoverview Hook para persistencia de borrador del wizard de creación de mazos
 * Guarda el estado del wizard en localStorage para recuperar en caso de cierre accidental.
 * 
 * @module hooks/useDeckWizardDraft
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'deck_wizard_draft';
const DEBOUNCE_MS = 500;

/**
 * @typedef {Object} DeckWizardState
 * @property {number} currentStep - Paso actual del wizard (1-4)
 * @property {Array} scannedCards - Tarjetas escaneadas
 * @property {string|null} contextId - ID del contexto seleccionado
 * @property {Object} cardMappings - Mapeos tarjeta -> asset
 * @property {string} name - Nombre del mazo
 * @property {string} description - Descripción del mazo
 * @property {number} lastUpdated - Timestamp de última actualización
 */

/**
 * Estado inicial del wizard
 * @type {DeckWizardState}
 */
const INITIAL_STATE = {
  currentStep: 1,
  scannedCards: [],
  contextId: null,
  cardMappings: {},
  name: '',
  description: '',
  lastUpdated: null,
};

/**
 * Hook para gestionar la persistencia del borrador del wizard de mazos
 * 
 * @returns {Object} Estado y funciones del hook
 * @property {DeckWizardState} state - Estado actual del wizard
 * @property {Function} setState - Actualizar estado (dispara auto-guardado)
 * @property {Function} updateField - Actualizar un campo específico
 * @property {boolean} hasDraft - Si existe un borrador guardado
 * @property {Function} restoreDraft - Restaurar el borrador
 * @property {Function} discardDraft - Descartar el borrador
 * @property {Function} clearDraft - Limpiar el borrador (al completar)
 * @property {Date|null} draftDate - Fecha del borrador guardado
 * 
 * @example
 * ```jsx
 * const {
 *   state,
 *   updateField,
 *   hasDraft,
 *   restoreDraft,
 *   discardDraft,
 *   clearDraft,
 * } = useDeckWizardDraft();
 * 
 * // Actualizar campo
 * updateField('name', 'Mi Mazo');
 * 
 * // Actualizar múltiples campos
 * setState(prev => ({ ...prev, contextId: 'ctx_123', currentStep: 2 }));
 * 
 * // Al completar el wizard
 * await createDeck(state);
 * clearDraft();
 * ```
 */
export default function useDeckWizardDraft() {
  const [state, setStateInternal] = useState(INITIAL_STATE);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftDate, setDraftDate] = useState(null);
  const [isRestored, setIsRestored] = useState(false);
  
  const debounceRef = useRef(null);
  const isInitializedRef = useRef(false);

  // Verificar si hay borrador al montar
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Verificar que el borrador no sea muy antiguo (más de 7 días)
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        if (parsed.lastUpdated && parsed.lastUpdated > sevenDaysAgo) {
          setHasDraft(true);
          setDraftDate(new Date(parsed.lastUpdated));
        } else {
          // Borrador muy antiguo, eliminar
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // Error al leer localStorage, ignorar
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Guardar borrador con debounce
  const saveDraft = useCallback((newState) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      try {
        const toSave = {
          ...newState,
          lastUpdated: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        setDraftDate(new Date(toSave.lastUpdated));
        setHasDraft(true);
      } catch {
        // Error al guardar, ignorar (localStorage lleno, etc.)
        console.warn('[DeckWizardDraft] Error al guardar borrador');
      }
    }, DEBOUNCE_MS);
  }, []);

  // Actualizar estado con auto-guardado
  const setState = useCallback((updater) => {
    setStateInternal((prev) => {
      const newState = typeof updater === 'function' ? updater(prev) : updater;
      
      // Solo guardar si hay datos significativos
      if (
        newState.scannedCards?.length > 0 ||
        newState.contextId ||
        newState.name ||
        Object.keys(newState.cardMappings || {}).length > 0
      ) {
        saveDraft(newState);
      }
      
      return newState;
    });
  }, [saveDraft]);

  // Actualizar un campo específico
  const updateField = useCallback((field, value) => {
    setState((prev) => ({ ...prev, [field]: value }));
  }, [setState]);

  // Restaurar borrador
  const restoreDraft = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setStateInternal(parsed);
        setIsRestored(true);
        return true;
      }
    } catch {
      console.warn('[DeckWizardDraft] Error al restaurar borrador');
    }
    return false;
  }, []);

  // Descartar borrador (mantener estado actual pero limpiar storage)
  const discardDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHasDraft(false);
    setDraftDate(null);
    setIsRestored(false);
  }, []);

  // Limpiar borrador y resetear estado (al completar wizard)
  const clearDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setStateInternal(INITIAL_STATE);
    setHasDraft(false);
    setDraftDate(null);
    setIsRestored(false);
  }, []);

  // Resetear a estado inicial sin limpiar storage
  const resetState = useCallback(() => {
    setStateInternal(INITIAL_STATE);
  }, []);

  // Limpiar debounce al desmontar
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    state,
    setState,
    updateField,
    hasDraft,
    draftDate,
    isRestored,
    restoreDraft,
    discardDraft,
    clearDraft,
    resetState,
  };
}

/**
 * Formatear fecha del borrador para mostrar en UI
 * @param {Date} date - Fecha del borrador
 * @returns {string} Fecha formateada
 */
export function formatDraftDate(date) {
  if (!date) return '';
  
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'hace unos segundos';
  if (minutes < 60) return `hace ${minutes} minuto${minutes !== 1 ? 's' : ''}`;
  if (hours < 24) return `hace ${hours} hora${hours !== 1 ? 's' : ''}`;
  if (days < 7) return `hace ${days} día${days !== 1 ? 's' : ''}`;
  
  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
