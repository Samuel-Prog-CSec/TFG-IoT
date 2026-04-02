/**
 * @fileoverview Página de creación de sesiones de juego
 * Wizard simplificado de 4 pasos que usa mazos predefinidos.
 * 
 * Pasos:
 * 1. Seleccionar Mazo (ya tiene cartas + contexto + asignaciones)
 * 2. Seleccionar Mecánica de juego
 * 3. Configurar Reglas (rondas, tiempo, puntos)
 * 4. Revisar y Crear
 * 
 * @module pages/CreateSession
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import PropTypes from 'prop-types';
import { webSerialService } from '../services/webSerialService';
import { 
  Layers, 
  Settings, 
  Save, 
  Check, 
  ChevronRight, 
  ChevronLeft,
  CreditCard,
  Palette,
  Clock,
  Target,
  Zap,
  Plus,
  AlertTriangle,
  Sparkles,
  Wifi
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  decksAPI, 
  mechanicsAPI, 
  sessionsAPI, 
  extractData, 
  extractErrorMessage,
  isAbortError
} from '../services/api';
import WizardStepper from '../components/ui/WizardStepper';
import ButtonPremium from '../components/ui/ButtonPremium';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import AudioPlayBadge from '../components/ui/AudioPlayBadge';
import GlassCard from '../components/ui/GlassCard';
import InputPremium from '../components/ui/InputPremium';
import SelectPremium from '../components/ui/SelectPremium';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import { ROUTES } from '../constants/routes';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import { toast } from 'sonner';

// Configuración del wizard
const WIZARD_STEPS = [
  {
    id: 'deck',
    title: 'Seleccionar Mazo',
    subtitle: 'Elige las cartas',
    icon: CreditCard,
    description: 'El mazo define las tarjetas y assets que usarán los estudiantes'
  },
  {
    id: 'mechanic',
    title: 'Mecánica',
    subtitle: 'Tipo de juego',
    icon: Layers,
    description: 'Elige cómo interactuarán los estudiantes con las tarjetas'
  },
  {
    id: 'rules',
    title: 'Reglas',
    subtitle: 'Configura parámetros',
    icon: Settings,
    description: 'Define tiempo, puntos y número de rondas'
  },
  {
    id: 'review',
    title: 'Crear',
    subtitle: 'Revisa y lanza',
    icon: Save,
    description: 'Revisa la configuración antes de crear la sesión'
  }
];

// Configuraciones por defecto según dificultad
const DIFFICULTY_PRESETS = {
  easy: {
    numberOfRounds: 3,
    timeLimit: 20,
    pointsPerCorrect: 10,
    penaltyPerError: 0
  },
  medium: {
    numberOfRounds: 5,
    timeLimit: 15,
    pointsPerCorrect: 10,
    penaltyPerError: -2
  },
  hard: {
    numberOfRounds: 7,
    timeLimit: 10,
    pointsPerCorrect: 15,
    penaltyPerError: -5
  }
};

// Configuraciones por defecto de memoria según dificultad
const MEMORY_DIFFICULTY_PRESETS = {
  easy: {
    timeLimit: 120,
    pointsPerCorrect: 10,
    penaltyPerError: 0
  },
  medium: {
    timeLimit: 90,
    pointsPerCorrect: 10,
    penaltyPerError: -2
  },
  hard: {
    timeLimit: 60,
    pointsPerCorrect: 15,
    penaltyPerError: -5
  }
};

const DIFFICULTY_VARIANT_STYLES = {
  easy: {
    selectedCard: 'border-success-base bg-success-base/10',
    selectedText: 'text-success-base',
    selectedIndicator: 'bg-success-base'
  },
  medium: {
    selectedCard: 'border-warning-base bg-warning-base/10',
    selectedText: 'text-warning-base',
    selectedIndicator: 'bg-warning-base'
  },
  hard: {
    selectedCard: 'border-error-base bg-error-base/10',
    selectedText: 'text-error-base',
    selectedIndicator: 'bg-error-base'
  }
};

const DEFAULT_ENABLED_MECHANICS = ['association', 'memory'];

const parseEnabledMechanics = () => {
  const raw = import.meta.env.VITE_ENABLED_SESSION_MECHANICS;
  if (!raw || typeof raw !== 'string') {
    return new Set(DEFAULT_ENABLED_MECHANICS);
  }

  const parsed = raw
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

  return new Set(parsed.length > 0 ? parsed : DEFAULT_ENABLED_MECHANICS);
};

const ENABLED_SESSION_MECHANICS = parseEnabledMechanics();

const normalizeMechanicName = mechanic => (mechanic?.name || '').toString().toLowerCase();

const isMechanicSelectable = mechanic => {
  const normalizedName = normalizeMechanicName(mechanic);
  const availability = mechanic?.rules?.behavior?.availability;

  if (availability === 'coming_soon') {
    return false;
  }

  return ENABLED_SESSION_MECHANICS.has(normalizedName);
};

const resolveMechanicId = mechanic => mechanic?.id || mechanic?._id;
const resolveMechanicName = mechanic => normalizeMechanicName(mechanic);

const findMechanicById = (mechanics, mechanicId) => {
  if (!mechanicId) {
    return null;
  }

  return mechanics.find(mechanic => resolveMechanicId(mechanic) === mechanicId) || null;
};

// Genera un placeholder contextual basado en el nombre del contexto del mazo
const getContextualPlaceholder = (contextName = '') => {
  const name = contextName.toLowerCase();
  if (name.includes('color')) return 'Ej: Busca la tarjeta del color rojo';
  if (name.includes('animal')) return 'Ej: Encuentra la tarjeta que representa un mamífero';
  if (name.includes('bandera') || name.includes('país') || name.includes('europa')) return 'Ej: Busca la bandera de Francia';
  if (name.includes('número') || name.includes('matemát')) return 'Ej: Busca el resultado de 3 + 4';
  if (name.includes('forma')) return 'Ej: Encuentra la forma con 3 lados';
  return 'Ej: Describe el reto que el estudiante debe resolver';
};

const toDeckCardMappings = deck =>
  Array.isArray(deck?.cardMappings)
    ? deck.cardMappings.map(mapping => ({
        uid: mapping.uid,
        assignedValue: mapping.assignedValue,
        displayData: mapping.displayData || {}
      }))
    : [];

const buildAssociationPlanByRounds = ({ currentPlan, cards, numberOfRounds }) => {
  const safeCards = Array.isArray(cards) ? cards : [];
  const rounds = Number(numberOfRounds);

  if (safeCards.length === 0 || !Number.isFinite(rounds) || rounds < 1) {
    return [];
  }

  const cardByUid = new Map(safeCards.map(card => [card.uid, card]));
  const previousByRound = new Map(
    (Array.isArray(currentPlan) ? currentPlan : []).map(item => [Number(item.roundNumber), item])
  );

  return Array.from({ length: rounds }, (_, index) => {
    const roundNumber = index + 1;
    const previousItem = previousByRound.get(roundNumber);
    const preservedCard = previousItem?.uid ? cardByUid.get(previousItem.uid) : null;
    const card = preservedCard || safeCards[index % safeCards.length];

    return {
      roundNumber,
      uid: card.uid,
      assignedValue: card.assignedValue,
      displayData: card.displayData || {},
      promptText: previousItem?.promptText || ''
    };
  });
};

/**
 * Página de creación de sesiones
 */
export default function CreateSession() {
  const navigate = useNavigate();
  const { shouldReduceMotion } = useReducedMotion();
  
  // Estado del wizard
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Datos cargados
  const [decks, setDecks] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [loadingMechanics, setLoadingMechanics] = useState(true);
  
  // Configuración de la sesión
  const [sessionConfig, setSessionConfig] = useState({
    name: '',
    deckId: null,
    mechanicId: null,
    difficulty: 'medium',
    config: {
      numberOfRounds: 5,
      timeLimit: 15,
      pointsPerCorrect: 10,
      penaltyPerError: -2
    },
    linkSensor: false
  });
  
  // Objetos seleccionados (para mostrar detalles)
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [selectedMechanic, setSelectedMechanic] = useState(null);
  const [currentSensorId, setCurrentSensorId] = useState(null);
  const [associationChallengePlan, setAssociationChallengePlan] = useState([]);

  // Dirty detection: user has started configuring the session
  const isDirty = currentStep > 0 || selectedDeck !== null;
  const { blocker, isBlocked } = useUnsavedChanges(isDirty);

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
        const orderedMechanics = [...mechsData].sort((a, b) => {
          const aSelectable = isMechanicSelectable(a) ? 1 : 0;
          const bSelectable = isMechanicSelectable(b) ? 1 : 0;
          return bSelectable - aSelectable;
        });
        
        setDecks(decksData);
        setMechanics(orderedMechanics);

        setSelectedMechanic(prev => {
          if (prev && !isMechanicSelectable(prev)) {
            return null;
          }
          return prev;
        });

        setSessionConfig(prev => {
          if (!prev.mechanicId) {
            return prev;
          }

          const currentMechanic = findMechanicById(orderedMechanics, prev.mechanicId);

          if (currentMechanic && isMechanicSelectable(currentMechanic)) {
            return prev;
          }

          return {
            ...prev,
            mechanicId: null
          };
        });
      } catch (err) {
        if (isAbortError(err)) {
          return;
        }
        toast.error('Error al cargar datos', {
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

  const selectedMechanicName = resolveMechanicName(selectedMechanic);
  const isMemorySelected = selectedMechanicName === 'memory';
  const isAssociationSelected = selectedMechanicName === 'association';

  const deckCards = useMemo(() => toDeckCardMappings(selectedDeck), [selectedDeck]);

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
      const details = invalidPairs.map(([v, c]) => `${v} (${c}×)`).join(', ');
      return {
        valid: false,
        message: `El mazo no tiene parejas correctas para memoria. Cada concepto debe tener exactamente 2 tarjetas: ${details}`
      };
    }
    return { valid: true, message: `${valueCounts.size} parejas detectadas` };
  }, [isMemorySelected, selectedDeck]);

  // Cargar mazos y mecánicas
  useEffect(() => {
    // Escuchar el sensor ID actual
    setCurrentSensorId(webSerialService.sensorId);
    
    // Update sessionConfig.linkSensor based on currentSensorId
    setSessionConfig(prev => ({
      ...prev,
      linkSensor: !!webSerialService.sensorId // Set to true if sensorId exists, false otherwise
    }));

    loadData();
    return () => dataAbortRef.current?.abort();
  }, [loadData]);

  useRefetchOnFocus({
    refetch: loadData,
    isLoading: loadingDecks || loadingMechanics,
    hasData: decks.length > 0 || mechanics.length > 0
  });

  // Handlers
  const handleSelectDeck = useCallback(async (deck) => {
    const deckId = deck.id || deck._id;
    // Actualización inmediata con datos de lista para feedback visual
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

  const handleSelectMechanic = (mechanic) => {
    if (!isMechanicSelectable(mechanic)) {
      toast.info('Mecánica no habilitada', {
        description: 'Esta mecánica no está disponible para creación de sesiones en el entorno actual.'
      });
      return;
    }

    const mechanicId = mechanic.id || mechanic._id;
    const mechanicName = resolveMechanicName(mechanic);
    setSelectedMechanic(mechanic);
    setSessionConfig(prev => {
      let newConfig = { ...prev.config };

      // Ajustar timeLimit por defecto según la mecánica seleccionada
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
  };

  // Auto-seleccionar la primera mecánica disponible al entrar en el paso 2
  useEffect(() => {
    if (currentStep !== 1 || selectedMechanic !== null || mechanics.length === 0) {
      return;
    }

    const firstSelectable = mechanics.find(isMechanicSelectable);
    if (firstSelectable) {
      handleSelectMechanic(firstSelectable);
    }
  }, [currentStep, selectedMechanic, mechanics]);

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

  const handleDifficultyChange = (difficulty) => {
    const presets = isMemorySelected ? MEMORY_DIFFICULTY_PRESETS : DIFFICULTY_PRESETS;
    setSessionConfig(prev => ({
      ...prev,
      difficulty,
      config: presets[difficulty]
    }));
  };

  const handleConfigChange = (key, value) => {
    setSessionConfig(prev => ({
      ...prev,
      difficulty: 'custom',
      config: {
        ...prev.config,
        [key]: value
      }
    }));
  };

  // Validaciones
  const canProceed = () => {
    switch (currentStep) {
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
  };

  // Navegación
  const goNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1 && canProceed()) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  // Crear sesión
  const handleCreateSession = async () => {
    if (!canProceed()) return;
    
    setIsSubmitting(true);
    
    try {
      const payload = {
        name: sessionConfig.name,
        deckId: sessionConfig.deckId,
        mechanicId: sessionConfig.mechanicId,
        difficulty: sessionConfig.difficulty,
        config: {
          ...sessionConfig.config,
          numberOfCards:
            selectedDeck?.cardMappings?.length ||
            selectedDeck?.cardsCount ||
            selectedDeck?.cards?.length ||
            0
        },
        associationChallengePlan: isAssociationSelected
          ? associationChallengePlan.map(item => ({
              roundNumber: item.roundNumber,
              uid: item.uid,
              assignedValue: item.assignedValue,
              displayData: item.displayData || {},
              promptText: item.promptText || undefined
            }))
          : undefined,
        sensorId: sessionConfig.linkSensor ? currentSensorId : undefined
      };
      
      const response = await sessionsAPI.createSession(payload);
      const newSession = extractData(response);
      
      // Celebración
      // TOKEN-EXCEPTION: canvas-confetti requires raw hex colors
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#6366f1', '#10b981', '#22c55e'],
        disableForReducedMotion: shouldReduceMotion,
      });
      
      toast.success('¡Sesión creada!', {
        description: isMemorySelected
          ? 'Redirigiendo a la configuración del tablero...'
          : 'Redirigiendo al detalle de la sesión...'
      });
      
      // Memoria → BoardSetup para configurar tablero, Asociación → Detalle de sesión
      const targetRoute = isMemorySelected
        ? ROUTES.BOARD_SETUP_WITH_ID(newSession._id || newSession.id)
        : ROUTES.SESSION_DETAIL(newSession._id || newSession.id);

      setTimeout(() => {
        navigate(targetRoute);
      }, shouldReduceMotion ? 100 : 600);
      
    } catch (err) {
      toast.error('Error al crear sesión', {
        description: extractErrorMessage(err)
      });
      setIsSubmitting(false);
    }
  };

  // Renderizar paso actual
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <StepDeck
            decks={decks}
            loading={loadingDecks}
            selectedDeckId={sessionConfig.deckId}
            onSelect={handleSelectDeck}
          />
        );
      case 1:
        return (
          <StepMechanic
            mechanics={mechanics}
            loading={loadingMechanics}
            selectedMechanicId={sessionConfig.mechanicId}
            onSelect={handleSelectMechanic}
            memoryPairWarning={isMemorySelected && !memoryPairValidation.valid ? memoryPairValidation.message : null}
          />
        );
      case 2:
        return isMemorySelected ? (
          <StepMemoryRules
            config={sessionConfig.config}
            difficulty={sessionConfig.difficulty}
            onDifficultyChange={handleDifficultyChange}
            onConfigChange={handleConfigChange}
            linkSensor={sessionConfig.linkSensor}
            onLinkSensorChange={(val) => setSessionConfig(prev => ({ ...prev, linkSensor: val }))}
            currentSensorId={currentSensorId}
          />
        ) : (
          <StepRules
            config={sessionConfig.config}
            difficulty={sessionConfig.difficulty}
            onDifficultyChange={handleDifficultyChange}
            onConfigChange={handleConfigChange}
            linkSensor={sessionConfig.linkSensor}
            onLinkSensorChange={(val) => setSessionConfig(prev => ({ ...prev, linkSensor: val }))}
            currentSensorId={currentSensorId}
            isAssociationSelected={isAssociationSelected}
            associationCards={deckCards}
            associationChallengePlan={associationChallengePlan}
            onAssociationChallengePlanChange={setAssociationChallengePlan}
            contextName={selectedDeck?.context?.name || selectedDeck?.contextId?.name || ''}
          />
        );
      case 3:
        return (
          <StepReview
            sessionConfig={sessionConfig}
            setSessionConfig={setSessionConfig}
            selectedDeck={selectedDeck}
            selectedMechanic={selectedMechanic}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background-deep p-4 lg:p-8">
      {/* Header */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto mb-4"
      >
        <h1 className="text-3xl font-bold text-text-primary font-display mb-2">
          Crear Nueva Sesión
        </h1>
        <p className="text-text-muted">
          {WIZARD_STEPS[currentStep].description}
        </p>
      </motion.div>

      {/* Stepper */}
      <div className="max-w-5xl mx-auto mb-6">
        <WizardStepper
          steps={WIZARD_STEPS}
          currentStep={currentStep}
          reducedMotion={shouldReduceMotion}
          onStepClick={(index) => {
            if (index < currentStep) {
              setCurrentStep(index);
            }
          }}
        />
      </div>

      {/* Contenido */}
      <div className="max-w-5xl mx-auto mb-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={shouldReduceMotion ? false : { opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
            transition={{ duration: shouldReduceMotion ? 0.15 : 0.3 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer navegación */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
        className="max-w-5xl mx-auto"
      >
        <GlassCard className="p-4">
          <div className="flex items-center justify-between">
            <ButtonPremium
              variant="ghost"
              onClick={goBack}
              disabled={currentStep === 0}
              icon={<ChevronLeft size={18} />}
            >
              Anterior
            </ButtonPremium>

            <div className="flex items-center gap-2 text-sm text-text-muted">
              Paso {currentStep + 1} de {WIZARD_STEPS.length}
            </div>

            {currentStep === WIZARD_STEPS.length - 1 ? (
              <ButtonPremium
                onClick={handleCreateSession}
                disabled={!canProceed() || isSubmitting}
                loading={isSubmitting}
                icon={<Sparkles size={18} />}
              >
                Crear Sesión
              </ButtonPremium>
            ) : (
              <ButtonPremium
                onClick={goNext}
                disabled={!canProceed()}
                icon={<ChevronRight size={18} />}
                iconPosition="right"
              >
                Siguiente
              </ButtonPremium>
            )}
          </div>
        </GlassCard>
      </motion.div>

      <ConfirmationModal
        open={isBlocked}
        onConfirm={() => blocker.proceed()}
        onClose={() => blocker.reset()}
        title="Cambios sin guardar"
        description="Tienes cambios sin guardar. Si sales ahora, perderás los cambios realizados."
        variant="warning"
        confirmText="Salir sin guardar"
        cancelText="Seguir editando"
      />
    </div>
  );
}


// ============================================
// COMPONENTES DE PASOS
// ============================================

/**
 * Paso 1: Seleccionar Mazo
 */
function StepDeck({ decks, loading, selectedDeckId, onSelect }) {
  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {['deck-skeleton-1', 'deck-skeleton-2', 'deck-skeleton-3', 'deck-skeleton-4', 'deck-skeleton-5', 'deck-skeleton-6'].map((skeletonKey) => (
            <SkeletonCard key={skeletonKey} className="h-48" />
          ))}
        </div>
      </GlassCard>
    );
  }

  if (decks.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <div className="size-16 mx-auto mb-4 rounded-full bg-warning-base/20 flex items-center justify-center">
          <AlertTriangle className="text-warning-base" size={32} />
        </div>
        <h3 className="text-xl font-semibold text-text-primary mb-2">
          No tienes mazos creados
        </h3>
        <p className="text-text-muted mb-6">
          Necesitas crear al menos un mazo de cartas antes de crear una sesión.
        </p>
        <Link to={ROUTES.CARD_DECKS_NEW}>
          <ButtonPremium icon={<Plus size={18} />}>
            Crear mi primer mazo
          </ButtonPremium>
        </Link>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Selecciona un Mazo
        </h2>
        <p className="text-text-muted text-sm">
          El mazo determina las tarjetas RFID y los assets que se usarán en el juego
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {decks.map((deck) => {
          const deckId = deck.id || deck._id;
          const cardsPreview = deck.cardMappings || [];
          const cardsCount = deck.cardsCount || deck.cardMappings?.length || 0;
          const contextName = deck.context?.name || deck.contextId?.name || 'Contexto';

          return (
          <motion.button
            key={deckId}
            onClick={() => onSelect(deck)}
            className={cn(
              'relative p-4 rounded-xl border-2 text-left transition-[border-color,background-color]',
              'hover:border-accent-indigo/50 hover:bg-accent-indigo/5',
              selectedDeckId === deckId
                ? 'border-accent-indigo bg-accent-indigo/10'
                : 'border-border-default bg-background-elevated/30'
            )}
            aria-pressed={selectedDeckId === deckId}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {selectedDeckId === deckId && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 right-2 size-7 rounded-full bg-accent-indigo flex items-center justify-center shadow-lg shadow-accent-indigo/40"
              >
                <Check size={14} className="text-text-primary" />
              </motion.div>
            )}

            {/* Preview de assets */}
            <div className="flex gap-1.5 mb-3 h-8 overflow-hidden">
              {cardsPreview.slice(0, 6).map((mapping) => (
                <CardAssetPreview
                  key={mapping.uid || mapping.id || mapping._id}
                  asset={mapping.displayData}
                  className="size-8 rounded-md flex-shrink-0"
                  fallbackLabel={mapping.displayData?.display || mapping.displayData?.emoji || '\uD83C\uDFB3'}
                />
              ))}
            </div>

            <h3 className="font-medium text-text-primary mb-1">{deck.name}</h3>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <CreditCard size={12} />
                {cardsCount} cartas
              </span>
              <span className="flex items-center gap-1">
                <Palette size={12} />
                {contextName}
              </span>
            </div>
          </motion.button>
          );
        })}
      </div>

      {!selectedDeckId && (
        <p className="mt-4 text-center text-sm text-text-muted">
          Selecciona un mazo para continuar
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-border-subtle flex justify-center">
        <Link to={ROUTES.CARD_DECKS_NEW}>
          <ButtonPremium variant="ghost" icon={<Plus size={16} />}>
            Crear nuevo mazo
          </ButtonPremium>
        </Link>
      </div>
    </GlassCard>
  );
}

/**
 * Paso 2: Seleccionar Mecánica
 */
function StepMechanic({ mechanics, loading, selectedMechanicId, onSelect, memoryPairWarning }) {
  // Iconos para mecánicas
  const mechanicIcons = {
    association: '🔗',
    sequence: '📊',
    memory: '🧠',
    default: '🎮'
  };

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {['mechanic-skeleton-1', 'mechanic-skeleton-2', 'mechanic-skeleton-3'].map((skeletonKey) => (
            <SkeletonCard key={skeletonKey} className="h-48" />
          ))}
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Selecciona la Mecánica de Juego
        </h2>
        <p className="text-text-muted text-sm">
          La mecánica define cómo interactuarán los estudiantes con las tarjetas
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {mechanics.map((mechanic) => {
          const icon = mechanicIcons[mechanic.name?.toLowerCase()] || mechanicIcons.default;
          const mechanicId = mechanic.id || mechanic._id;
          const selectable = isMechanicSelectable(mechanic);
          const selected = selectable && selectedMechanicId === mechanicId;

          return (
            <motion.button
              key={mechanicId}
              onClick={() => onSelect(mechanic)}
              disabled={!selectable}
              className={cn(
                'relative p-6 rounded-xl border-2 text-left transition-[border-color,background-color]',
                selectable
                  ? 'hover:border-brand-base/50 hover:bg-brand-base/5'
                  : 'opacity-70 cursor-not-allowed border-border-default bg-background-base/40',
                selected
                  ? 'border-brand-base bg-brand-base/10'
                  : 'border-border-default bg-background-elevated/30'
              )}
              aria-pressed={selected}
              whileHover={selectable ? { scale: 1.03, y: -4 } : undefined}
              whileTap={selectable ? { scale: 0.98 } : undefined}
            >
              {!selectable && (
                <span className="absolute top-3 right-3 rounded-full border border-warning-base/40 bg-warning-base/10 px-2 py-0.5 text-[11px] font-medium text-warning-base">
                  Próximamente
                </span>
              )}

              {selected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-3 right-3 size-7 rounded-full bg-brand-base flex items-center justify-center shadow-lg shadow-brand-glow"
                >
                  <Check size={14} className="text-text-primary" />
                </motion.div>
              )}

              <div className="text-4xl mb-4">{mechanic.icon || icon}</div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {mechanic.displayName || mechanic.name}
              </h3>
              <p className="text-sm text-text-muted line-clamp-3">
                {mechanic.description || 'Mecánica de juego interactiva'}
              </p>

              {!selectable && (
                <p className="mt-3 text-xs text-warning-base/90">
                  Esta mecánica no está habilitada para creación de sesiones en este entorno.
                </p>
              )}
            </motion.button>
          );
        })}
      </div>

      {memoryPairWarning && (
        <div className="mt-4 p-4 rounded-xl border border-warning-base/30 bg-warning-base/10 text-warning-base text-sm">
          <p className="font-medium mb-1">Mazo no compatible con memoria</p>
          <p className="text-warning-base/80">{memoryPairWarning}</p>
        </div>
      )}
    </GlassCard>
  );
}

function StepMemoryRules({
  config,
  difficulty,
  onDifficultyChange,
  onConfigChange,
  linkSensor,
  onLinkSensorChange,
  currentSensorId
}) {
  const difficulties = [
    { id: 'easy', label: 'Fácil', description: 'Más tiempo, sin penalización' },
    { id: 'medium', label: 'Normal', description: 'Configuración equilibrada' },
    { id: 'hard', label: 'Difícil', description: 'Menos tiempo, más penalización' }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Presets de dificultad para memoria */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Dificultad Predefinida
        </h2>

        <div className="space-y-3">
          {difficulties.map((d) => {
            const style = DIFFICULTY_VARIANT_STYLES[d.id] || DIFFICULTY_VARIANT_STYLES.medium;
            const isSelected = difficulty === d.id;

            return (
              <motion.button
                key={d.id}
                onClick={() => onDifficultyChange(d.id)}
                className={cn(
                  'w-full p-4 rounded-xl border-2 text-left transition-colors',
                  isSelected
                    ? style.selectedCard
                    : 'border-border-default bg-background-elevated/30 hover:border-border-strong'
                )}
                whileHover={{ x: 4 }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={cn(
                      'font-medium',
                      isSelected ? style.selectedText : 'text-text-primary'
                    )}>
                      {d.label}
                    </h3>
                    <p className="text-xs text-text-muted">{d.description}</p>
                  </div>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={cn(
                        'size-6 rounded-full flex items-center justify-center',
                        style.selectedIndicator
                      )}
                    >
                      <Check size={14} className="text-text-primary" />
                    </motion.div>
                  )}
                </div>
              </motion.button>
            );
          })}

          {difficulty === 'custom' && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full p-4 rounded-xl border-2 border-dashed border-brand-light/50 bg-brand-light/5"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-brand-light" />
                <h3 className="font-medium text-brand-light">Personalizado</h3>
              </div>
              <p className="text-xs text-text-muted mt-1">
                Has ajustado las reglas manualmente
              </p>
            </motion.div>
          )}
        </div>
      </GlassCard>

      {/* Configuración manual de reglas de memoria */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Reglas de Memoria</h2>

        <div className="space-y-5">
          <div>
            <label htmlFor="memory-time-limit" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Clock size={14} className="text-brand-light" />
              Tiempo total de partida (segundos)
            </label>
            <div className="flex items-center gap-4">
              <input
                id="memory-time-limit"
                type="range"
                min={10}
                max={300}
                step={5}
                value={config.timeLimit}
                onChange={(e) => onConfigChange('timeLimit', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-brand-base"
              />
              <span className="w-16 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.timeLimit}s
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="memory-points-correct" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Zap size={14} className="text-success-base" />
              Puntos por pareja correcta
            </label>
            <div className="flex items-center gap-4">
              <input
                id="memory-points-correct"
                type="range"
                min={5}
                max={30}
                step={5}
                value={config.pointsPerCorrect}
                onChange={(e) => onConfigChange('pointsPerCorrect', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-success-base"
              />
              <span className="w-16 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                +{config.pointsPerCorrect}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="memory-penalty-error" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <AlertTriangle size={14} className="text-error-base" />
              Penalización por pareja incorrecta
            </label>
            <div className="flex items-center gap-4">
              <input
                id="memory-penalty-error"
                type="range"
                min={-15}
                max={0}
                step={1}
                value={config.penaltyPerError}
                onChange={(e) => onConfigChange('penaltyPerError', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-error-base"
              />
              <span className="w-16 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.penaltyPerError}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Vincular sensor RFID */}
      <GlassCard className="p-6 lg:col-span-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
              <Wifi size={20} className="text-accent-indigo" />
              Vincular Sensor RFID
            </h2>
            <p className="text-sm text-text-muted">
              Solo se aceptarán lecturas del sensor activo cuando la sesión lo requiera.
            </p>
          </div>

          <div className="flex items-center gap-4">
            {currentSensorId ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-background-elevated/50 border border-border-default">
                <span className="text-xs font-mono text-text-muted max-w-[150px] truncate">
                  ID: {currentSensorId}
                </span>
                <button
                  type="button"
                  onClick={() => onLinkSensorChange(!linkSensor)}
                  className="flex items-center h-6 w-12 rounded-full bg-background-surface relative p-1"
                >
                  <motion.div
                    className={cn(
                      'h-4 w-4 rounded-full shadow-sm',
                      linkSensor ? 'bg-accent-indigo' : 'bg-text-muted'
                    )}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    animate={{ x: linkSensor ? 24 : 0 }}
                  />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-warning-base bg-warning-base/10 p-3 rounded-xl border border-warning-base/20">
                <AlertTriangle size={16} />
                <span className="text-sm">Sensor no detectado</span>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

/**
 * Paso 3: Configurar Reglas
 */
function StepRules({
  config,
  difficulty,
  onDifficultyChange,
  onConfigChange,
  linkSensor,
  onLinkSensorChange,
  currentSensorId,
  isAssociationSelected,
  associationCards,
  associationChallengePlan,
  onAssociationChallengePlanChange,
  contextName
}) {
  const difficulties = [
    { id: 'easy', label: 'Fácil', description: 'Más tiempo, sin penalización' },
    { id: 'medium', label: 'Normal', description: 'Configuración equilibrada' },
    { id: 'hard', label: 'Difícil', description: 'Menos tiempo, más penalización' }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Presets de dificultad */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Dificultad Predefinida
        </h2>
        
        <div className="space-y-3">
          {difficulties.map((d) => {
            const style = DIFFICULTY_VARIANT_STYLES[d.id] || DIFFICULTY_VARIANT_STYLES.medium;
            const isSelected = difficulty === d.id;

            return (
            <motion.button
              key={d.id}
              onClick={() => onDifficultyChange(d.id)}
              className={cn(
                'w-full p-4 rounded-xl border-2 text-left transition-colors',
                isSelected
                  ? style.selectedCard
                  : 'border-border-default bg-background-elevated/30 hover:border-border-strong'
              )}
              whileHover={{ x: 4 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={cn(
                    'font-medium',
                    isSelected ? style.selectedText : 'text-text-primary'
                  )}>
                    {d.label}
                  </h3>
                  <p className="text-xs text-text-muted">{d.description}</p>
                </div>
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={cn(
                      'size-6 rounded-full flex items-center justify-center',
                      style.selectedIndicator
                    )}
                  >
                    <Check size={14} className="text-text-primary" />
                  </motion.div>
                )}
              </div>
            </motion.button>
            );
          })}

          {difficulty === 'custom' && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full p-4 rounded-xl border-2 border-dashed border-brand-light/50 bg-brand-light/5"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-brand-light" />
                <h3 className="font-medium text-brand-light">Personalizado</h3>
              </div>
              <p className="text-xs text-text-muted mt-1">
                Has ajustado las reglas manualmente
              </p>
            </motion.div>
          )}
        </div>
      </GlassCard>

      {/* Configuración manual */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Configuración Detallada
        </h2>
        
        <div className="space-y-5">
          {/* Número de rondas */}
          <div>
            <label htmlFor="assoc-num-rounds" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Target size={14} className="text-accent-indigo" />
              Número de rondas
            </label>
            <div className="flex items-center gap-4">
              <input
                id="assoc-num-rounds"
                type="range"
                min={1}
                max={15}
                value={config.numberOfRounds}
                onChange={(e) => onConfigChange('numberOfRounds', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-accent-indigo"
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.numberOfRounds}
              </span>
            </div>
          </div>

          {/* Tiempo por ronda */}
          <div>
            <label htmlFor="assoc-time-limit" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Clock size={14} className="text-brand-light" />
              Tiempo por ronda (segundos)
            </label>
            <div className="flex items-center gap-4">
              <input
                id="assoc-time-limit"
                type="range"
                min={5}
                max={60}
                step={5}
                value={config.timeLimit}
                onChange={(e) => onConfigChange('timeLimit', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-brand-base"
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.timeLimit}s
              </span>
            </div>
          </div>

          {/* Puntos por acierto */}
          <div>
            <label htmlFor="assoc-points-correct" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Zap size={14} className="text-success-base" />
              Puntos por acierto
            </label>
            <div className="flex items-center gap-4">
              <input
                id="assoc-points-correct"
                type="range"
                min={5}
                max={25}
                step={5}
                value={config.pointsPerCorrect}
                onChange={(e) => onConfigChange('pointsPerCorrect', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-success-base"
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                +{config.pointsPerCorrect}
              </span>
            </div>
          </div>

          {/* Penalización por error */}
          <div>
            <label htmlFor="assoc-penalty-error" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <AlertTriangle size={14} className="text-error-base" />
              Penalización por error
            </label>
            <div className="flex items-center gap-4">
              <input
                id="assoc-penalty-error"
                type="range"
                min={-10}
                max={0}
                value={config.penaltyPerError}
                onChange={(e) => onConfigChange('penaltyPerError', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-error-base"
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.penaltyPerError}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* T-009: Vincular Sensor RFID */}
      <GlassCard className="p-6 lg:col-span-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
              <Wifi size={20} className="text-accent-indigo" />
              Vincular Sensor RFID (T-009)
            </h2>
            <p className="text-sm text-text-muted">
              Si activas esta opción, solo las lecturas provenientes de tu sensor actual 
              serán válidas para esta sesión. Útil en entornos con múltiples sensores simultáneos.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {currentSensorId ? (
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-background-elevated/50 border border-border-default">
                  <span className="text-xs font-mono text-text-muted max-w-[150px] truncate">
                    ID: {currentSensorId}
                  </span>
                  <button
                    type="button"
                    className="flex items-center h-6 w-12 rounded-full bg-background-surface relative p-1"
                    onClick={() => onLinkSensorChange(!linkSensor)}
                  >
                    <motion.div
                      className={cn("h-4 w-4 rounded-full shadow-sm", linkSensor ? "bg-accent-indigo" : "bg-text-muted")}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      animate={{ x: linkSensor ? 24 : 0 }}
                    />
                  </button>
                </div>
                <span className={cn("text-xs font-medium", linkSensor ? "text-accent-indigo" : "text-text-muted")}>
                  {linkSensor ? "Sensor vinculado" : "Sin vincular"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-warning-base bg-warning-base/10 p-3 rounded-xl border border-warning-base/20">
                <AlertTriangle size={16} />
                <span className="text-sm">Sensor no detectado</span>
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {isAssociationSelected && (
        <AssociationChallengeComposer
          cards={associationCards}
          challengePlan={associationChallengePlan}
          onPlanChange={onAssociationChallengePlanChange}
          contextName={contextName}
        />
      )}
    </div>
  );
}

function AssociationChallengeComposer({ cards, challengePlan, onPlanChange, disabled = false, contextName = '' }) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const safePlan = Array.isArray(challengePlan) ? challengePlan : [];

  // Construir opciones sin exponer UIDs al docente; desambiguar valores duplicados con indice
  const valueCounts = new Map();
  for (const card of safeCards) {
    const val = card.assignedValue || '';
    valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
  }
  const valueSeenCount = new Map();
  const cardOptions = safeCards.map(card => {
    const val = card.assignedValue || '';
    const total = valueCounts.get(val) || 1;
    let label = val;
    if (total > 1) {
      const seen = (valueSeenCount.get(val) || 0) + 1;
      valueSeenCount.set(val, seen);
      label = `${val} (#${seen})`;
    }
    return { value: card.uid, label };
  });

  const cardByUid = new Map(safeCards.map(card => [card.uid, card]));

  const handleCardChange = (roundNumber, selectedUid) => {
    const selectedCard = cardByUid.get(selectedUid);
    if (!selectedCard) {
      return;
    }

    onPlanChange(prev =>
      (Array.isArray(prev) ? prev : []).map(item =>
        item.roundNumber === roundNumber
          ? {
              ...item,
              uid: selectedCard.uid,
              assignedValue: selectedCard.assignedValue,
              displayData: selectedCard.displayData || {}
            }
          : item
      )
    );
  };

  const handlePromptChange = (roundNumber, promptText) => {
    onPlanChange(prev =>
      (Array.isArray(prev) ? prev : []).map(item =>
        item.roundNumber === roundNumber
          ? {
              ...item,
              promptText
            }
          : item
      )
    );
  };

  if (safePlan.length === 0) {
    return (
      <GlassCard className="p-6 lg:col-span-2 border border-warning-base/40">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Retos de Asociación</h2>
        <p className="text-sm text-warning-base">
          Selecciona un mazo con tarjetas y define el número de rondas para configurar los retos.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6 lg:col-span-2">
      <h2 className="text-lg font-semibold text-text-primary mb-1">Plan de retos (Asociación)</h2>
      <p className="text-sm text-text-muted mb-4">
        Define para cada ronda qué tarjeta será el reto principal y, si quieres, añade una consigna breve.
      </p>

      <div className="space-y-4">
        {safePlan.map(item => (
          <div
            key={`association-round-${item.roundNumber}`}
            className="rounded-xl border border-border-default bg-background-base/40 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4"
          >
            <div className="lg:col-span-1">
              <p className="text-sm font-medium text-text-primary mb-2">Ronda {item.roundNumber}</p>
              <SelectPremium
                label="Tarjeta objetivo"
                value={item.uid || ''}
                onChange={value => handleCardChange(item.roundNumber, value)}
                options={cardOptions}
                disabled={disabled}
                placeholder="Selecciona una tarjeta"
              />
            </div>

            <div className="lg:col-span-2">
              <InputPremium
                label="Consigna opcional"
                value={item.promptText || ''}
                onChange={e => handlePromptChange(item.roundNumber, e.target.value)}
                maxLength={180}
                disabled={disabled}
                placeholder={`Ej: Busca ${item.assignedValue || 'la carta correcta'}`}
                hint="Se muestra en la ronda como guía del reto."
              />
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

/**
 * Paso 4: Revisar y Crear
 */
function StepReview({ sessionConfig, setSessionConfig, selectedDeck, selectedMechanic }) {
  const mechanicName = normalizeMechanicName(selectedMechanic);
  const isMemory = mechanicName === 'memory';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Nombre de la sesión */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Nombre de la Sesión
        </h2>
        <InputPremium
          value={sessionConfig.name}
          onChange={(e) => setSessionConfig(prev => ({ ...prev, name: e.target.value }))}
          placeholder="Ej: Capitales de Europa - Nivel 1"
          maxLength={100}
          helperText="Un nombre descriptivo ayuda a identificar la sesión"
        />
      </GlassCard>

      {/* Resumen de configuración */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Resumen de Configuración
        </h2>
        
        <div className="space-y-4">
          {/* Mazo */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-background-elevated/50">
            <div className="size-10 rounded-lg bg-accent-indigo/20 flex items-center justify-center flex-shrink-0">
              <CreditCard size={18} className="text-accent-indigo" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted">Mazo</p>
              <p className="text-text-primary font-medium">{selectedDeck?.name || 'No seleccionado'}</p>
              <p className="text-xs text-text-muted">
                {selectedDeck?.cards?.length || selectedDeck?.cardMappings?.length || 0} cartas {'\u2022'} {selectedDeck?.contextId?.name}
              </p>
              {/* Mini-galería de assets del mazo */}
              {selectedDeck?.cardMappings?.length > 0 && (
                <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 max-w-full">
                  {selectedDeck.cardMappings.slice(0, 8).map((m) => (
                    <div key={m.uid || m.id || m._id} className="relative flex-shrink-0">
                      <CardAssetPreview
                        asset={m.displayData}
                        className="size-10 rounded-lg"
                        fallbackLabel={m.displayData?.display || m.displayData?.emoji || '\uD83C\uDFB3'}
                      />
                      {m.displayData?.audioUrl && (
                        <AudioPlayBadge
                          audioUrl={m.displayData.audioUrl}
                          size="xs"
                          className="absolute -top-1 -right-1"
                        />
                      )}
                    </div>
                  ))}
                  {selectedDeck.cardMappings.length > 8 && (
                    <div className="size-10 rounded-lg flex-shrink-0 bg-background-surface/60 flex items-center justify-center text-xs text-text-muted">
                      +{selectedDeck.cardMappings.length - 8}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mecánica */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-background-elevated/50">
            <div className="size-10 rounded-lg bg-brand-base/20 flex items-center justify-center flex-shrink-0">
              <Layers size={18} className="text-brand-light" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Mecánica</p>
              <p className="text-text-primary font-medium">
                {selectedMechanic?.displayName || selectedMechanic?.name || 'No seleccionada'}
              </p>
            </div>
          </div>

          {/* Reglas */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-background-elevated/50">
            <div className="size-10 rounded-lg bg-success-base/20 flex items-center justify-center flex-shrink-0">
              <Settings size={18} className="text-success-base" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-text-muted">Configuración</p>
              <div className="grid grid-cols-2 gap-2 mt-1 text-sm">
                {isMemory ? (
                  /* Memoria: tiempo total (sin rondas) */
                  <span className="text-text-secondary">
                    <Clock size={12} className="inline mr-1" />
                    Tiempo total: {sessionConfig.config.timeLimit}s
                  </span>
                ) : (
                  /* Asociación: rondas + tiempo por ronda */
                  <>
                    <span className="text-text-secondary">
                      <Target size={12} className="inline mr-1" />
                      {sessionConfig.config.numberOfRounds} rondas
                    </span>
                    <span className="text-text-secondary">
                      <Clock size={12} className="inline mr-1" />
                      {sessionConfig.config.timeLimit}s por ronda
                    </span>
                  </>
                )}
                <span className="text-success-base">
                  +{sessionConfig.config.pointsPerCorrect} pts
                </span>
                <span className="text-error-base">
                  {sessionConfig.config.penaltyPerError} pts
                </span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

const cardMappingShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  uid: PropTypes.string,
  assignedValue: PropTypes.string,
  displayData: PropTypes.object
});

const deckShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  name: PropTypes.string,
  cardsCount: PropTypes.number,
  cards: PropTypes.array,
  cardMappings: PropTypes.arrayOf(cardMappingShape),
  context: PropTypes.shape({ name: PropTypes.string }),
  contextId: PropTypes.shape({ name: PropTypes.string })
});

const mechanicShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  name: PropTypes.string,
  displayName: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.string
});

const configShape = PropTypes.shape({
  numberOfRounds: PropTypes.number,
  timeLimit: PropTypes.number,
  pointsPerCorrect: PropTypes.number,
  penaltyPerError: PropTypes.number
});

StepDeck.propTypes = {
  decks: PropTypes.arrayOf(deckShape).isRequired,
  loading: PropTypes.bool.isRequired,
  selectedDeckId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelect: PropTypes.func.isRequired
};

StepMechanic.propTypes = {
  mechanics: PropTypes.arrayOf(mechanicShape).isRequired,
  loading: PropTypes.bool.isRequired,
  selectedMechanicId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelect: PropTypes.func.isRequired
};

StepMemoryRules.propTypes = {
  config: configShape.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onDifficultyChange: PropTypes.func.isRequired,
  onConfigChange: PropTypes.func.isRequired,
  linkSensor: PropTypes.bool.isRequired,
  onLinkSensorChange: PropTypes.func.isRequired,
  currentSensorId: PropTypes.string
};

StepRules.propTypes = {
  config: configShape.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onDifficultyChange: PropTypes.func.isRequired,
  onConfigChange: PropTypes.func.isRequired,
  linkSensor: PropTypes.bool.isRequired,
  onLinkSensorChange: PropTypes.func.isRequired,
  currentSensorId: PropTypes.string,
  isAssociationSelected: PropTypes.bool,
  associationCards: PropTypes.arrayOf(cardMappingShape),
  associationChallengePlan: PropTypes.arrayOf(
    PropTypes.shape({
      roundNumber: PropTypes.number,
      uid: PropTypes.string,
      assignedValue: PropTypes.string,
      displayData: PropTypes.object,
      promptText: PropTypes.string
    })
  ),
  onAssociationChallengePlanChange: PropTypes.func,
  contextName: PropTypes.string
};

AssociationChallengeComposer.propTypes = {
  cards: PropTypes.arrayOf(cardMappingShape),
  challengePlan: PropTypes.arrayOf(
    PropTypes.shape({
      roundNumber: PropTypes.number,
      uid: PropTypes.string,
      assignedValue: PropTypes.string,
      displayData: PropTypes.object,
      promptText: PropTypes.string
    })
  ),
  onPlanChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  contextName: PropTypes.string
};

StepReview.propTypes = {
  sessionConfig: PropTypes.shape({
    name: PropTypes.string,
    config: configShape
  }).isRequired,
  setSessionConfig: PropTypes.func.isRequired,
  selectedDeck: deckShape,
  selectedMechanic: mechanicShape
};
