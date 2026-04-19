/**
 * @fileoverview Hook para gestionar el estado de configuracion del wizard de sesion.
 * Maneja la seleccion de mazo, mecanica, dificultad, plan de asociacion, y validacion.
 *
 * @module hooks/useWizardConfig
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  decksAPI,
  extractData
} from '../services/api';
import { webSerialService } from '../services/webSerialService';
import {
  DIFFICULTY_PRESETS,
  MEMORY_DIFFICULTY_PRESETS,
  INITIAL_SESSION_CONFIG,
  isMechanicSelectable,
  resolveMechanicName,
  toDeckCardMappings,
  buildAssociationPlanByRounds
} from '../components/session/sessionHelpers';

/**
 * Gestiona toda la configuracion del wizard de creacion de sesion.
 *
 * @param {Object} params
 * @param {Array} params.mechanics - Lista de mecanicas disponibles
 * @param {number} params.currentStep - Paso actual del wizard
 * @returns {Object} Estado y handlers del wizard
 */
export function useWizardConfig({ mechanics, currentStep }) {
  const [sessionConfig, setSessionConfig] = useState(INITIAL_SESSION_CONFIG);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [selectedMechanic, setSelectedMechanic] = useState(null);
  const [associationChallengePlan, setAssociationChallengePlan] = useState([]);

  // Derivados de la mecanica seleccionada
  const selectedMechanicName = resolveMechanicName(selectedMechanic);
  const isMemorySelected = selectedMechanicName === 'memory';
  const isAssociationSelected = selectedMechanicName === 'association';

  // Cartas del mazo seleccionado
  const deckCards = useMemo(() => toDeckCardMappings(selectedDeck), [selectedDeck]);

  // Validacion de parejas para memoria
  const memoryPairValidation = useMemo(() => {
    if (!isMemorySelected || !selectedDeck?.cardMappings) {
      return { valid: true, message: '' };
    }
    const valueCounts = selectedDeck.cardMappings.reduce((acc, m) => {
      acc.set(m.assignedValue, (acc.get(m.assignedValue) || 0) + 1);
      return acc;
    }, new Map());
    const invalidPairs = [...valueCounts.entries()].filter(([, count]) => count !== 2);
    if (invalidPairs.length > 0) {
      const details = invalidPairs.map(([v, c]) => `${v} (${c}\u00D7)`).join(', ');
      return {
        valid: false,
        message: `El mazo no tiene parejas correctas para memoria. Cada concepto debe tener exactamente 2 tarjetas: ${details}`
      };
    }
    return { valid: true, message: `${valueCounts.size} parejas detectadas` };
  }, [isMemorySelected, selectedDeck]);

  // Inicializar linkSensor con el sensor actual
  useEffect(() => {
    setSessionConfig(prev => ({
      ...prev,
      linkSensor: !!webSerialService.sensorId
    }));
  }, []);

  // Invalidar mecanica seleccionada si deja de estar disponible tras recarga
  useEffect(() => {
    if (!selectedMechanic) return;
    if (!isMechanicSelectable(selectedMechanic)) {
      setSelectedMechanic(null);
      setSessionConfig(prev => ({
        ...prev,
        mechanicId: null
      }));
    }
  }, [mechanics, selectedMechanic]);

  // Reconstruir plan de asociacion cuando cambian parametros relevantes
  useEffect(() => {
    if (!isAssociationSelected) {
      setAssociationChallengePlan([]);
      return;
    }

    setAssociationChallengePlan(prev =>
      buildAssociationPlanByRounds({
        currentPlan: prev,
        cards: deckCards,
        numberOfRounds: sessionConfig.config.numberOfRounds
      })
    );
  }, [isAssociationSelected, deckCards, sessionConfig.config.numberOfRounds]);

  // --- Handlers ---

  const handleSelectDeck = useCallback(async (deck) => {
    const deckId = deck.id || deck._id;
    // Actualizacion inmediata con datos de lista para feedback visual
    setSelectedDeck(deck);
    setSessionConfig(prev => ({
      ...prev,
      deckId,
      name: prev.name || `Sesión - ${deck.name}`
    }));
    // Cargar detalle completo para obtener cardMappings
    try {
      const deckRes = await decksAPI.getDeckById(deckId);
      const fullDeck = extractData(deckRes);
      if (fullDeck) setSelectedDeck(fullDeck);
    } catch {
      // Continuar con datos de lista si falla el detalle
    }
  }, []);

  const handleSelectMechanic = useCallback((mechanic) => {
    if (!isMechanicSelectable(mechanic)) {
      toast.info('Mecanica no habilitada', {
        description: 'Esta mecanica no esta disponible para creacion de sesiones en el entorno actual.'
      });
      return;
    }

    const mechanicId = mechanic.id || mechanic._id;
    const mechanicName = resolveMechanicName(mechanic);
    setSelectedMechanic(mechanic);
    setSessionConfig(prev => {
      let newConfig = { ...prev.config };

      // Ajustar timeLimit por defecto segun la mecanica seleccionada
      if (mechanicName === 'memory' && prev.config.timeLimit === 15) {
        newConfig = { ...newConfig, timeLimit: 90 };
      }
      if (mechanicName !== 'memory' && prev.config.timeLimit === 90) {
        newConfig = { ...newConfig, timeLimit: 15 };
      }

      return {
        ...prev,
        mechanicId,
        config: newConfig
      };
    });
  }, []);

  // Auto-seleccionar la primera mecanica disponible al entrar en el paso 2
  useEffect(() => {
    if (currentStep !== 1 || selectedMechanic !== null || mechanics.length === 0) {
      return;
    }

    const firstSelectable = mechanics.find(isMechanicSelectable);
    if (firstSelectable) {
      handleSelectMechanic(firstSelectable);
    }
  }, [currentStep, selectedMechanic, mechanics, handleSelectMechanic]);

  const handleDifficultyChange = useCallback((difficulty) => {
    const presets = isMemorySelected ? MEMORY_DIFFICULTY_PRESETS : DIFFICULTY_PRESETS;
    setSessionConfig(prev => ({
      ...prev,
      difficulty,
      config: presets[difficulty]
    }));
  }, [isMemorySelected]);

  const handleConfigChange = useCallback((key, value) => {
    setSessionConfig(prev => ({
      ...prev,
      difficulty: 'custom',
      config: {
        ...prev.config,
        [key]: value
      }
    }));
  }, []);

  const handleLinkSensorChange = useCallback((val) => {
    setSessionConfig(prev => ({ ...prev, linkSensor: val }));
  }, []);

  // Validacion para poder avanzar de paso
  const canProceed = useCallback((step) => {
    switch (step) {
      case 0: return sessionConfig.deckId !== null;
      case 1: {
        if (sessionConfig.mechanicId === null) return false;
        if (isMemorySelected && !memoryPairValidation.valid) return false;
        return true;
      }
      case 2:
        // Memoria: las reglas siempre permiten avanzar (el tablero se configura en /board-setup)
        if (isMemorySelected) {
          return true;
        }

        if (isAssociationSelected) {
          const rounds = Number(sessionConfig.config.numberOfRounds);
          if (!Number.isFinite(rounds) || rounds < 1) {
            return false;
          }

          return (
            Array.isArray(associationChallengePlan) &&
            associationChallengePlan.length === rounds &&
            associationChallengePlan.every(item => item?.uid && item?.assignedValue)
          );
        }

        return true;
      case 3: return sessionConfig.name.trim().length >= 3;
      default: return false;
    }
  }, [sessionConfig, isMemorySelected, isAssociationSelected, memoryPairValidation, associationChallengePlan]);

  return {
    sessionConfig,
    setSessionConfig,
    selectedDeck,
    selectedMechanic,
    associationChallengePlan,
    setAssociationChallengePlan,
    deckCards,
    isMemorySelected,
    isAssociationSelected,
    memoryPairValidation,
    handleSelectDeck,
    handleSelectMechanic,
    handleDifficultyChange,
    handleConfigChange,
    handleLinkSensorChange,
    canProceed
  };
}

export default useWizardConfig;
