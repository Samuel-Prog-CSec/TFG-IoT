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

import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
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
  Eye,
  Wifi
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  decksAPI, 
  mechanicsAPI, 
  sessionsAPI, 
  extractData, 
  extractErrorMessage 
} from '../services/api';
import { 
  WizardStepper,
  ButtonPremium,
  GlassCard,
  DeckCard,
  InputPremium,
  SkeletonCard
} from '../components/ui';
import { ROUTES } from '../constants/routes';
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

/**
 * Página de creación de sesiones
 */
export default function CreateSession() {
  const navigate = useNavigate();
  
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

  // Cargar mazos y mecánicas
  useEffect(() => {
    // Escuchar el sensor ID actual
    setCurrentSensorId(webSerialService.sensorId);
    
    // Update sessionConfig.linkSensor based on currentSensorId
    setSessionConfig(prev => ({
      ...prev,
      linkSensor: !!webSerialService.sensorId // Set to true if sensorId exists, false otherwise
    }));
    
    const loadData = async () => {
      try {
        const [decksRes, mechsRes] = await Promise.all([
          decksAPI.getDecks({ limit: 50, status: 'active' }),
          mechanicsAPI.getMechanics()
        ]);
        
        const decksData = extractData(decksRes) || [];
        const mechsData = extractData(mechsRes) || [];
        
        setDecks(decksData);
        setMechanics(mechsData);
      } catch (err) {
        toast.error('Error al cargar datos', {
          description: extractErrorMessage(err)
        });
      } finally {
        setLoadingDecks(false);
        setLoadingMechanics(false);
      }
    };
    
    loadData();
  }, []);

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
    const mechanicId = mechanic.id || mechanic._id;
    setSelectedMechanic(mechanic);
    setSessionConfig(prev => ({
      ...prev,
      mechanicId
    }));
  };

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
      case 2: return true; // Rules siempre válido con defaults
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
        name: sessionConfig.name.trim(),
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
        sensorId: sessionConfig.linkSensor ? currentSensorId : undefined
      };
      
      const response = await sessionsAPI.createSession(payload);
      const newSession = extractData(response);
      
      // Celebración
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#6366f1', '#10b981', '#22c55e']
      });
      
      toast.success('¡Sesión creada!', {
        description: 'Redirigiendo a la configuración del tablero...'
      });
      
      // Redirigir a Board Setup
      setTimeout(() => {
        navigate(ROUTES.BOARD_SETUP_WITH_ID(newSession._id || newSession.id));
      }, 1500);
      
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
        return (
          <StepRules
            config={sessionConfig.config}
            difficulty={sessionConfig.difficulty}
            onDifficultyChange={handleDifficultyChange}
            onConfigChange={handleConfigChange}
            linkSensor={sessionConfig.linkSensor}
            onLinkSensorChange={(val) => setSessionConfig(prev => ({ ...prev, linkSensor: val }))}
            currentSensorId={currentSensorId}
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
        initial={{ opacity: 0, y: -20 }}
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
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer navegación */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
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
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} className="h-48" />
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
            <div className="flex flex-wrap gap-1 mb-3 h-8 overflow-hidden">
              {cardsPreview.slice(0, 6).map((mapping) => (
                <span key={mapping.id || mapping.uid} className="text-xl">
                  {mapping.displayData?.display || mapping.displayData?.emoji || '🃏'}
                </span>
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
          {[...Array(3)].map((_, i) => (
            <SkeletonCard key={i} className="h-48" />
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
          
          return (
            <motion.button
              key={mechanicId}
              onClick={() => onSelect(mechanic)}
              className={cn(
                'relative p-6 rounded-xl border-2 text-left transition-all',
                'hover:border-purple-500/50 hover:bg-purple-500/5',
                selectedMechanicId === mechanicId
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-white/10 bg-slate-800/30'
              )}
              aria-pressed={selectedMechanicId === mechanicId}
              whileHover={{ scale: 1.03, y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              {selectedMechanicId === mechanicId && (
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
            </motion.button>
          );
        })}
      </div>
    </GlassCard>
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
  currentSensorId
}) {
  const difficulties = [
    { id: 'easy', label: 'Fácil', color: 'emerald', description: 'Más tiempo, sin penalización' },
    { id: 'medium', label: 'Normal', color: 'amber', description: 'Configuración equilibrada' },
    { id: 'hard', label: 'Difícil', color: 'rose', description: 'Menos tiempo, más penalización' }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Presets de dificultad */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Dificultad Predefinida
        </h2>
        
        <div className="space-y-3">
          {difficulties.map((d) => (
            <motion.button
              key={d.id}
              onClick={() => onDifficultyChange(d.id)}
              className={cn(
                'w-full p-4 rounded-xl border-2 text-left transition-all',
                difficulty === d.id
                  ? `border-${d.color}-500 bg-${d.color}-500/10`
                  : 'border-white/10 bg-slate-800/30 hover:border-white/20'
              )}
              whileHover={{ x: 4 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={cn(
                    'font-medium',
                    difficulty === d.id ? `text-${d.color}-400` : 'text-white'
                  )}>
                    {d.label}
                  </h3>
                  <p className="text-xs text-slate-400">{d.description}</p>
                </div>
                {difficulty === d.id && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={`w-6 h-6 rounded-full bg-${d.color}-500 flex items-center justify-center`}
                  >
                    <Check size={14} className="text-white" />
                  </motion.div>
                )}
              </div>
            </motion.button>
          ))}
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
                onChange={(e) => onConfigChange('numberOfRounds', parseInt(e.target.value))}
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
                onChange={(e) => onConfigChange('timeLimit', parseInt(e.target.value))}
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
                onChange={(e) => onConfigChange('pointsPerCorrect', parseInt(e.target.value))}
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
                onChange={(e) => onConfigChange('penaltyPerError', parseInt(e.target.value))}
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
                  <div className="flex items-center h-6 w-12 rounded-full bg-slate-700 relative p-1 cursor-pointer"
                       onClick={() => onLinkSensorChange(!linkSensor)}>
                    <motion.div 
                      className={cn("h-4 w-4 rounded-full shadow-sm", linkSensor ? "bg-indigo-500" : "bg-slate-500")}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      animate={{ x: linkSensor ? 24 : 0 }}
                    />
                  </div>
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
    </div>
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
            <div>
              <p className="text-xs text-slate-400">Mazo</p>
              <p className="text-white font-medium">{selectedDeck?.name || 'No seleccionado'}</p>
              <p className="text-xs text-slate-500">
                {selectedDeck?.cards?.length || 0} cartas • {selectedDeck?.contextId?.name}
              </p>
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
