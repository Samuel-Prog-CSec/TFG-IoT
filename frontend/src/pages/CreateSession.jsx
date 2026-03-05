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

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { 
  WizardStepper,
  ButtonPremium,
  CardAssetPreview,
  GlassCard,
  InputPremium,
  SelectPremium,
  SkeletonCard
} from '../components/ui';
import { ROUTES } from '../constants/routes';
import { useRefetchOnFocus, useReducedMotion } from '../hooks';
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

const DIFFICULTY_VARIANT_STYLES = {
  easy: {
    selectedCard: 'border-emerald-500 bg-emerald-500/10',
    selectedText: 'text-emerald-400',
    selectedIndicator: 'bg-emerald-500'
  },
  medium: {
    selectedCard: 'border-amber-500 bg-amber-500/10',
    selectedText: 'text-amber-400',
    selectedIndicator: 'bg-amber-500'
  },
  hard: {
    selectedCard: 'border-rose-500 bg-rose-500/10',
    selectedText: 'text-rose-400',
    selectedIndicator: 'bg-rose-500'
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

const toDeckCardMappings = deck =>
  Array.isArray(deck?.cardMappings)
    ? deck.cardMappings.map(mapping => ({
        cardId: mapping.cardId || mapping.id,
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
      cardId: card.cardId,
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
  const [memoryBoardSlots, setMemoryBoardSlots] = useState([]);
  const [selectedMemoryCardUid, setSelectedMemoryCardUid] = useState(null);
  const [associationChallengePlan, setAssociationChallengePlan] = useState([]);

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

  const deckCards = toDeckCardMappings(selectedDeck);
  const memoryDeckCards = deckCards;

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
  const handleSelectDeck = (deck) => {
    const deckId = deck.id || deck._id;
    setSelectedDeck(deck);
    setSessionConfig(prev => ({
      ...prev,
      deckId,
      // Auto-generar nombre basado en el mazo
      name: prev.name || `Sesión - ${deck.name}`
    }));
  };

  const handleSelectMechanic = (mechanic) => {
    if (!isMechanicSelectable(mechanic)) {
      toast.info('Mecánica no habilitada', {
        description: 'Esta mecánica no está disponible para creación de sesiones en el entorno actual.'
      });
      return;
    }

    const mechanicId = mechanic.id || mechanic._id;
    setSelectedMechanic(mechanic);
    setSessionConfig(prev => ({
      ...prev,
      mechanicId
    }));
  };

  useEffect(() => {
    if (!isMemorySelected) {
      setMemoryBoardSlots([]);
      setSelectedMemoryCardUid(null);
      return;
    }

    const cards = Array.isArray(selectedDeck?.cardMappings) ? selectedDeck.cardMappings : [];
    if (cards.length === 0) {
      setMemoryBoardSlots([]);
      setSelectedMemoryCardUid(null);
      return;
    }

    setMemoryBoardSlots(prev => {
      if (Array.isArray(prev) && prev.length === cards.length && prev.every(Boolean)) {
        return prev;
      }

      return new Array(cards.length).fill(null);
    });
  }, [isMemorySelected, selectedDeck]);

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
    setSessionConfig(prev => ({
      ...prev,
      difficulty,
      config: DIFFICULTY_PRESETS[difficulty]
    }));
  };

  const handleConfigChange = (key, value) => {
    setSessionConfig(prev => ({
      ...prev,
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
      case 1: return sessionConfig.mechanicId !== null;
      case 2:
        if (isMemorySelected) {
          return (
            Array.isArray(memoryBoardSlots) &&
            memoryBoardSlots.length > 0 &&
            memoryBoardSlots.every(Boolean)
          );
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
        deckId: sessionConfig.deckId,
        mechanicId: sessionConfig.mechanicId,
        config: {
          ...sessionConfig.config,
          numberOfCards:
            selectedDeck?.cardMappings?.length ||
            selectedDeck?.cardsCount ||
            selectedDeck?.cards?.length ||
            0
        },
        boardLayout: isMemorySelected
          ? memoryBoardSlots
              .map((slotCard, slotIndex) => {
                if (!slotCard) {
                  return null;
                }

                return {
                  slotIndex,
                  cardId: slotCard.cardId || slotCard.id,
                  uid: slotCard.uid,
                  assignedValue: slotCard.assignedValue,
                  displayData: slotCard.displayData || {}
                };
              })
              .filter(Boolean)
          : undefined,
        associationChallengePlan: isAssociationSelected
          ? associationChallengePlan.map(item => ({
              roundNumber: item.roundNumber,
              cardId: item.cardId,
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
      }, shouldReduceMotion ? 400 : 1500);
      
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
          />
        );
      case 2:
        return isMemorySelected ? (
          <StepMemoryRules
            config={sessionConfig.config}
            onConfigChange={handleConfigChange}
            linkSensor={sessionConfig.linkSensor}
            onLinkSensorChange={(val) => setSessionConfig(prev => ({ ...prev, linkSensor: val }))}
            currentSensorId={currentSensorId}
            cards={memoryDeckCards}
            slots={memoryBoardSlots}
            onSlotsChange={setMemoryBoardSlots}
            selectedCardUid={selectedMemoryCardUid}
            onSelectedCardUidChange={setSelectedMemoryCardUid}
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
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8">
      {/* Header */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto mb-8"
      >
        <h1 className="text-3xl font-bold text-white font-display mb-2">
          Crear Nueva Sesión
        </h1>
        <p className="text-slate-400">
          {WIZARD_STEPS[currentStep].description}
        </p>
      </motion.div>

      {/* Stepper */}
      <div className="max-w-5xl mx-auto mb-8">
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

            <div className="flex items-center gap-2 text-sm text-slate-500">
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
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
          <AlertTriangle className="text-amber-400" size={32} />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          No tienes mazos creados
        </h3>
        <p className="text-slate-400 mb-6">
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
        <h2 className="text-xl font-semibold text-white mb-1">
          Selecciona un Mazo
        </h2>
        <p className="text-slate-400 text-sm">
          El mazo determina las tarjetas RFID y los assets que se usarán en el juego
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {decks.map((deck) => {
          const deckId = deck.id || deck._id;
          const cardsPreview = deck.cardMappings || [];
          const cardsCount = deck.cardMappings?.length || deck.cardsCount || 0;
          const contextName = deck.context?.name || deck.contextId?.name || 'Contexto';

          return (
          <motion.button
            key={deckId}
            onClick={() => onSelect(deck)}
            className={cn(
              'relative p-4 rounded-xl border-2 text-left transition-all',
              'hover:border-indigo-500/50 hover:bg-indigo-500/5',
              selectedDeckId === deckId
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-white/10 bg-slate-800/30'
            )}
            aria-pressed={selectedDeckId === deckId}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {selectedDeckId === deckId && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/40"
              >
                <Check size={14} className="text-white" />
              </motion.div>
            )}

            {/* Preview de assets */}
            <div className="flex gap-1 mb-3 h-8 overflow-hidden">
              {cardsPreview.slice(0, 6).map((mapping) => (
                <CardAssetPreview
                  key={mapping.id || mapping.uid || mapping.cardId || mapping._id}
                  asset={mapping.displayData}
                  className="w-8 h-8 rounded-md flex-shrink-0"
                  fallbackLabel={mapping.displayData?.display || mapping.displayData?.emoji || '\uD83C\uDFB3'}
                />
              ))}
            </div>

            <h3 className="font-medium text-white mb-1">{deck.name}</h3>
            <div className="flex items-center gap-3 text-xs text-slate-400">
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

      <div className="mt-6 pt-4 border-t border-white/5 flex justify-center">
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
function StepMechanic({ mechanics, loading, selectedMechanicId, onSelect }) {
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
        <h2 className="text-xl font-semibold text-white mb-1">
          Selecciona la Mecánica de Juego
        </h2>
        <p className="text-slate-400 text-sm">
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
                'relative p-6 rounded-xl border-2 text-left transition-all',
                selectable
                  ? 'hover:border-purple-500/50 hover:bg-purple-500/5'
                  : 'opacity-70 cursor-not-allowed border-white/10 bg-slate-900/40',
                selected
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-white/10 bg-slate-800/30'
              )}
              aria-pressed={selected}
              whileHover={selectable ? { scale: 1.03, y: -4 } : undefined}
              whileTap={selectable ? { scale: 0.98 } : undefined}
            >
              {!selectable && (
                <span className="absolute top-3 right-3 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  Próximamente
                </span>
              )}

              {selected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-3 right-3 w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/40"
                >
                  <Check size={14} className="text-white" />
                </motion.div>
              )}

              <div className="text-4xl mb-4">{mechanic.icon || icon}</div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {mechanic.displayName || mechanic.name}
              </h3>
              <p className="text-sm text-slate-400 line-clamp-3">
                {mechanic.description || 'Mecánica de juego interactiva'}
              </p>

              {!selectable && (
                <p className="mt-3 text-xs text-amber-300/90">
                  Esta mecánica no está habilitada para creación de sesiones en este entorno.
                </p>
              )}
            </motion.button>
          );
        })}
      </div>
    </GlassCard>
  );
}

function StepMemoryRules({
  config,
  onConfigChange,
  linkSensor,
  onLinkSensorChange,
  currentSensorId,
  cards,
  slots,
  onSlotsChange,
  selectedCardUid,
  onSelectedCardUidChange
}) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const safeSlots = Array.isArray(slots) ? slots : [];
  const cardsInBoard = new Set((slots || []).filter(Boolean).map(slot => slot.uid));
  const selectedCard = safeCards.find(card => card.uid === selectedCardUid) || null;
  const slotEntries = safeSlots.map((slotCard, slotIndex) => ({
    slotCard,
    slotIndex,
    slotKey: slotCard?.uid || `slot-${slotIndex + 1}`
  }));

  const handleAssignToSlot = slotIndex => {
    if (!selectedCard) {
      return;
    }

    onSlotsChange(prev => {
      const next = Array.isArray(prev) ? [...prev] : new Array(safeCards.length).fill(null);

      const previousIndex = next.findIndex(slot => slot?.uid === selectedCard.uid);
      if (previousIndex >= 0) {
        next[previousIndex] = null;
      }

      next[slotIndex] = selectedCard;
      return next;
    });
  };

  const handleClearSlot = slotIndex => {
    onSlotsChange(prev => {
      const next = Array.isArray(prev) ? [...prev] : [];
      next[slotIndex] = null;
      return next;
    });
  };

  const boardComplete = safeSlots.length > 0 && safeSlots.every(Boolean);

  return (
    <div className="space-y-6">
      <GlassCard className="p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Tablero de Memoria</h2>
        <p className="text-slate-400 text-sm mb-4">
          Selecciona una carta y colócala en una posición para que la mesa real coincida con el tablero.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {safeCards.map(card => {
            const isSelected = selectedCardUid === card.uid;
            const alreadyPlaced = cardsInBoard.has(card.uid);

            return (
              <button
                key={`memory-card-${card.uid}`}
                type="button"
                onClick={() => onSelectedCardUidChange(card.uid)}
                className={cn(
                  'rounded-xl border p-2 text-left transition-all',
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/20'
                    : 'border-white/10 bg-slate-800/40 hover:border-white/30',
                  alreadyPlaced && !isSelected ? 'opacity-70' : ''
                )}
              >
                <div className="h-16 mb-2">
                  <CardAssetPreview
                    asset={card.displayData}
                    className="w-full h-full rounded-lg"
                    fallbackLabel={card.displayData?.display || card.assignedValue || '🎴'}
                  />
                </div>
                <p className="text-xs text-slate-300 truncate">{card.assignedValue || card.uid}</p>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
          {slotEntries.map(({ slotCard, slotIndex, slotKey }) => (
            <button
              key={`memory-slot-${slotKey}`}
              type="button"
              onClick={() => handleAssignToSlot(slotIndex)}
              className={cn(
                'aspect-square rounded-xl border-2 border-dashed p-2 transition-all',
                slotCard ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-slate-700 bg-slate-900/40',
                selectedCard ? 'hover:border-indigo-400' : ''
              )}
            >
              {slotCard ? (
                <div className="h-full w-full relative">
                  <CardAssetPreview
                    asset={slotCard.displayData}
                    className="w-full h-full rounded-lg"
                    fallbackLabel={slotCard.displayData?.display || slotCard.assignedValue || '🎴'}
                  />
                  <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-950/70 text-slate-200">
                    #{slotIndex + 1}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleClearSlot(slotIndex);
                    }}
                    className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/80 text-white"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <div className="h-full w-full flex items-center justify-center text-slate-500 text-sm">
                  Slot #{slotIndex + 1}
                </div>
              )}
            </button>
          ))}
        </div>

        <p className={cn('mt-4 text-sm', boardComplete ? 'text-emerald-400' : 'text-amber-400')}>
          {boardComplete
            ? 'Tablero completo. Puedes continuar.'
            : 'Debes colocar todas las cartas en el tablero para continuar.'}
        </p>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Reglas de Memoria</h2>

        <div className="space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
              <Clock size={14} className="text-purple-400" />
              Tiempo total de partida (segundos)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={10}
                max={300}
                step={10}
                value={config.timeLimit}
                onChange={(e) => onConfigChange('timeLimit', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-purple-500"
              />
              <span className="w-16 text-center text-white font-medium bg-slate-800 rounded-lg py-1">
                {config.timeLimit}s
              </span>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
              <Zap size={14} className="text-emerald-400" />
              Puntos por pareja correcta
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={5}
                max={30}
                step={5}
                value={config.pointsPerCorrect}
                onChange={(e) => onConfigChange('pointsPerCorrect', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-emerald-500"
              />
              <span className="w-16 text-center text-white font-medium bg-slate-800 rounded-lg py-1">
                +{config.pointsPerCorrect}
              </span>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
              <AlertTriangle size={14} className="text-rose-400" />
              Penalización por pareja incorrecta
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={-15}
                max={0}
                step={1}
                value={config.penaltyPerError}
                onChange={(e) => onConfigChange('penaltyPerError', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-rose-500"
              />
              <span className="w-16 text-center text-white font-medium bg-slate-800 rounded-lg py-1">
                {config.penaltyPerError}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Wifi size={20} className="text-indigo-400" />
              Vincular Sensor RFID
            </h2>
            <p className="text-sm text-slate-400">
              Solo se aceptarán lecturas del sensor activo cuando la sesión lo requiera.
            </p>
          </div>

          <div className="flex items-center gap-4">
            {currentSensorId ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-white/10">
                <span className="text-xs font-mono text-slate-500 max-w-[150px] truncate">
                  ID: {currentSensorId}
                </span>
                <button
                  type="button"
                  onClick={() => onLinkSensorChange(!linkSensor)}
                  className="flex items-center h-6 w-12 rounded-full bg-slate-700 relative p-1"
                >
                  <motion.div
                    className={cn(
                      'h-4 w-4 rounded-full shadow-sm',
                      linkSensor ? 'bg-indigo-500' : 'bg-slate-500'
                    )}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    animate={{ x: linkSensor ? 24 : 0 }}
                  />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
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
  onAssociationChallengePlanChange
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
        <h2 className="text-lg font-semibold text-white mb-4">
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
                'w-full p-4 rounded-xl border-2 text-left transition-all',
                isSelected
                  ? style.selectedCard
                  : 'border-white/10 bg-slate-800/30 hover:border-white/20'
              )}
              whileHover={{ x: 4 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={cn(
                    'font-medium',
                    isSelected ? style.selectedText : 'text-white'
                  )}>
                    {d.label}
                  </h3>
                  <p className="text-xs text-slate-400">{d.description}</p>
                </div>
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center',
                      style.selectedIndicator
                    )}
                  >
                    <Check size={14} className="text-white" />
                  </motion.div>
                )}
              </div>
            </motion.button>
            );
          })}
        </div>
      </GlassCard>

      {/* Configuración manual */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Configuración Detallada
        </h2>
        
        <div className="space-y-5">
          {/* Número de rondas */}
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
              <Target size={14} className="text-indigo-400" />
              Número de rondas
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={15}
                value={config.numberOfRounds}
                onChange={(e) => onConfigChange('numberOfRounds', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-indigo-500"
              />
              <span className="w-12 text-center text-white font-medium bg-slate-800 rounded-lg py-1">
                {config.numberOfRounds}
              </span>
            </div>
          </div>

          {/* Tiempo por ronda */}
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
              <Clock size={14} className="text-purple-400" />
              Tiempo por ronda (segundos)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={config.timeLimit}
                onChange={(e) => onConfigChange('timeLimit', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-purple-500"
              />
              <span className="w-12 text-center text-white font-medium bg-slate-800 rounded-lg py-1">
                {config.timeLimit}s
              </span>
            </div>
          </div>

          {/* Puntos por acierto */}
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
              <Zap size={14} className="text-emerald-400" />
              Puntos por acierto
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={5}
                max={25}
                step={5}
                value={config.pointsPerCorrect}
                onChange={(e) => onConfigChange('pointsPerCorrect', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-emerald-500"
              />
              <span className="w-12 text-center text-white font-medium bg-slate-800 rounded-lg py-1">
                +{config.pointsPerCorrect}
              </span>
            </div>
          </div>

          {/* Penalización por error */}
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
              <AlertTriangle size={14} className="text-rose-400" />
              Penalización por error
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={-10}
                max={0}
                value={config.penaltyPerError}
                onChange={(e) => onConfigChange('penaltyPerError', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-rose-500"
              />
              <span className="w-12 text-center text-white font-medium bg-slate-800 rounded-lg py-1">
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
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Wifi size={20} className="text-indigo-400" />
              Vincular Sensor RFID (T-009)
            </h2>
            <p className="text-sm text-slate-400">
              Si activas esta opción, solo las lecturas provenientes de tu sensor actual 
              serán válidas para esta sesión. Útil en entornos con múltiples sensores simultáneos.
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {currentSensorId ? (
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-white/10">
                  <span className="text-xs font-mono text-slate-500 max-w-[150px] truncate">
                    ID: {currentSensorId}
                  </span>
                  <button
                    type="button"
                    className="flex items-center h-6 w-12 rounded-full bg-slate-700 relative p-1"
                    onClick={() => onLinkSensorChange(!linkSensor)}
                  >
                    <motion.div 
                      className={cn("h-4 w-4 rounded-full shadow-sm", linkSensor ? "bg-indigo-500" : "bg-slate-500")}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      animate={{ x: linkSensor ? 24 : 0 }}
                    />
                  </button>
                </div>
                <span className={cn("text-xs font-medium", linkSensor ? "text-indigo-400" : "text-slate-500")}>
                  {linkSensor ? "Sensor vinculado" : "Sin vincular"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-500 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
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
        />
      )}
    </div>
  );
}

function AssociationChallengeComposer({ cards, challengePlan, onPlanChange, disabled = false }) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const safePlan = Array.isArray(challengePlan) ? challengePlan : [];

  const cardOptions = safeCards.map(card => ({
    value: card.uid,
    label: `${card.assignedValue || card.uid} · ${card.uid}`
  }));

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
              cardId: selectedCard.cardId,
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
      <GlassCard className="p-6 lg:col-span-2 border border-amber-500/30">
        <h2 className="text-lg font-semibold text-white mb-2">Retos de Association</h2>
        <p className="text-sm text-amber-300">
          Selecciona un mazo con tarjetas y define el número de rondas para configurar los retos.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6 lg:col-span-2">
      <h2 className="text-lg font-semibold text-white mb-1">Plan de retos (Association)</h2>
      <p className="text-sm text-slate-400 mb-4">
        Define para cada ronda qué tarjeta será el reto principal y, si quieres, añade una consigna breve.
      </p>

      <div className="space-y-4">
        {safePlan.map(item => (
          <div
            key={`association-round-${item.roundNumber}`}
            className="rounded-xl border border-white/10 bg-slate-900/40 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4"
          >
            <div className="lg:col-span-1">
              <p className="text-sm font-medium text-white mb-2">Ronda {item.roundNumber}</p>
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
                placeholder="Ej: Encuentra la tarjeta que representa un mamífero"
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
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Nombre de la sesión */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
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
        <h2 className="text-lg font-semibold text-white mb-4">
          Resumen de Configuración
        </h2>
        
        <div className="space-y-4">
          {/* Mazo */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <CreditCard size={18} className="text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400">Mazo</p>
              <p className="text-white font-medium">{selectedDeck?.name || 'No seleccionado'}</p>
              <p className="text-xs text-slate-500">
                {selectedDeck?.cards?.length || selectedDeck?.cardMappings?.length || 0} cartas \u2022 {selectedDeck?.contextId?.name}
              </p>
              {/* Mini-galería de assets del mazo */}
              {selectedDeck?.cardMappings?.length > 0 && (
                <div className="flex gap-1 mt-2 overflow-x-auto pb-1 max-w-full">
                  {selectedDeck.cardMappings.slice(0, 8).map((m) => (
                    <CardAssetPreview
                      key={m.id || m.uid || m.cardId || m._id}
                      asset={m.displayData}
                      className="w-9 h-9 rounded-lg flex-shrink-0"
                      fallbackLabel={m.displayData?.display || m.displayData?.emoji || '\uD83C\uDFB3'}
                    />
                  ))}
                  {selectedDeck.cardMappings.length > 8 && (
                    <div className="w-9 h-9 rounded-lg flex-shrink-0 bg-slate-700/60 flex items-center justify-center text-xs text-slate-400">
                      +{selectedDeck.cardMappings.length - 8}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mecánica */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Layers size={18} className="text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Mecánica</p>
              <p className="text-white font-medium">
                {selectedMechanic?.displayName || selectedMechanic?.name || 'No seleccionada'}
              </p>
            </div>
          </div>

          {/* Reglas */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Settings size={18} className="text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-slate-400">Configuración</p>
              <div className="grid grid-cols-2 gap-2 mt-1 text-sm">
                <span className="text-slate-300">
                  <Target size={12} className="inline mr-1" />
                  {sessionConfig.config.numberOfRounds} rondas
                </span>
                <span className="text-slate-300">
                  <Clock size={12} className="inline mr-1" />
                  {sessionConfig.config.timeLimit}s
                </span>
                <span className="text-emerald-400">
                  +{sessionConfig.config.pointsPerCorrect} pts
                </span>
                <span className="text-rose-400">
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
  cardId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
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
  onConfigChange: PropTypes.func.isRequired,
  linkSensor: PropTypes.bool.isRequired,
  onLinkSensorChange: PropTypes.func.isRequired,
  currentSensorId: PropTypes.string,
  cards: PropTypes.arrayOf(cardMappingShape).isRequired,
  slots: PropTypes.arrayOf(PropTypes.oneOfType([cardMappingShape, PropTypes.oneOf([null])])).isRequired,
  onSlotsChange: PropTypes.func.isRequired,
  selectedCardUid: PropTypes.string,
  onSelectedCardUidChange: PropTypes.func.isRequired
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
      cardId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      uid: PropTypes.string,
      assignedValue: PropTypes.string,
      displayData: PropTypes.object,
      promptText: PropTypes.string
    })
  ),
  onAssociationChallengePlanChange: PropTypes.func
};

AssociationChallengeComposer.propTypes = {
  cards: PropTypes.arrayOf(cardMappingShape),
  challengePlan: PropTypes.arrayOf(
    PropTypes.shape({
      roundNumber: PropTypes.number,
      cardId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      uid: PropTypes.string,
      assignedValue: PropTypes.string,
      displayData: PropTypes.object,
      promptText: PropTypes.string
    })
  ),
  onPlanChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool
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
