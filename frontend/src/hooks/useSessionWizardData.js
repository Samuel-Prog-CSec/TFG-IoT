/**
 * @fileoverview Hook para cargar los datos necesarios del wizard de creacion de sesion.
 * Gestiona la carga de mazos y mecanicas, abort controller, y refetch on focus.
 *
 * @module hooks/useSessionWizardData
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { webSerialService } from '../services/webSerialService';
import {
  decksAPI,
  mechanicsAPI,
  extractData,
  extractErrorMessage,
  isAbortError
} from '../services/api';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { isMechanicSelectable } from '../components/session/sessionHelpers';

/**
 * Carga mazos y mecanicas para el wizard de creacion de sesion.
 *
 * @returns {{
 *   decks: Array,
 *   mechanics: Array,
 *   loadingDecks: boolean,
 *   loadingMechanics: boolean,
 *   currentSensorId: string|null,
 *   loadData: Function
 * }}
 */
export function useSessionWizardData() {
  const [decks, setDecks] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [loadingMechanics, setLoadingMechanics] = useState(true);
  const [currentSensorId, setCurrentSensorId] = useState(null);

  const dataAbortRef = useRef(null);

  const loadData = useCallback(() => {
    dataAbortRef.current?.abort();
    const controller = new AbortController();
    dataAbortRef.current = controller;

    const run = async () => {
      try {
        const [decksRes, mechsRes] = await Promise.all([
          decksAPI.getDecks({ limit: 50, status: 'active' }, { signal: controller.signal }),
          mechanicsAPI.getMechanics(undefined, { signal: controller.signal })
        ]);

        const decksData = extractData(decksRes) || [];
        const mechsData = extractData(mechsRes) || [];
        const orderedMechanics = mechsData.toSorted((a, b) => {
          const aSelectable = isMechanicSelectable(a) ? 1 : 0;
          const bSelectable = isMechanicSelectable(b) ? 1 : 0;
          return bSelectable - aSelectable;
        });

        setDecks(decksData);
        setMechanics(orderedMechanics);
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        toast.error('No pudimos cargar los datos de la sesión', {
          description: extractErrorMessage(err)
        });
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDecks(false);
          setLoadingMechanics(false);
        }
      }
    };

    run();
  }, []);

  // Cargar datos y sensor ID al montar
  useEffect(() => {
    setCurrentSensorId(webSerialService.sensorId);
    loadData();
    return () => dataAbortRef.current?.abort();
  }, [loadData]);

  // Reintentar carga al recuperar foco
  useRefetchOnFocus({
    refetch: loadData,
    isLoading: loadingDecks || loadingMechanics,
    hasData: decks.length > 0 || mechanics.length > 0
  });

  return {
    decks,
    mechanics,
    loadingDecks,
    loadingMechanics,
    currentSensorId,
    loadData
  };
}

