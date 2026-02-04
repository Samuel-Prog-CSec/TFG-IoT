/**
 * @fileoverview Wizard de creación de mazos de cartas
 * Permite al profesor crear un mazo paso a paso:
 * 1. Capturar cartas (RFID mock + fallback manual)
 * 2. Seleccionar contexto temático
 * 3. Asignar assets a cada carta
 * 4. Confirmar y nombrar el mazo
 * 
 * Incluye persistencia de borrador en localStorage.
 * 
 * @module pages/DeckCreationWizard
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { 
  ArrowLeft,
  ArrowRight,
  Layers,
  CreditCard,
  Palette,
  LinkIcon,
  Check,
  Save,
  X,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  WizardStepper, 
  RFIDScannerPanel, 
  CardSelector,
  AssetSelector,
  ButtonPremium,
  GlassCard,
  InputPremium,
  ConfirmationModal,
  useConfirmationModal
} from '../components/ui';
import { decksAPI, cardsAPI, extractData, extractErrorMessage } from '../services/api';
import { useDeckWizardDraft, formatDraftDate, useContexts } from '../hooks';
import { ROUTES } from '../constants/routes';
import { GAME_CONFIG } from '../constants/gameConfig';
import { toast } from 'sonner';

// Configuración del wizard
const WIZARD_STEPS = [
  {
    id: 'cards',
    title: 'Capturar Cartas',
    subtitle: 'Escanea o selecciona las cartas',
    icon: CreditCard,
    description: 'Define qué tarjetas RFID formarán parte de este mazo'
  },
  {
    id: 'context',
    title: 'Elegir Contexto',
    subtitle: 'Selecciona el tema',
    icon: Palette,
    description: 'El contexto determina los assets disponibles'
  },
  {
    id: 'assign',
    title: 'Asignar Assets',
    subtitle: 'Vincula cartas con contenido',
    icon: LinkIcon,
    description: 'Asocia cada carta con un asset del contexto'
  },
  {
    id: 'confirm',
    title: 'Confirmar',
    subtitle: 'Revisa y guarda',
    icon: Check,
    description: 'Revisa tu mazo y dale un nombre'
  }
];

const {MIN_CARDS} = GAME_CONFIG;
const {MAX_CARDS} = GAME_CONFIG;

/**
 * Componente principal del wizard de creación de mazos
 */
export default function DeckCreationWizard() {
  const navigate = useNavigate();
  
  // Estado del wizard
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Datos del mazo
  const [selectedCards, setSelectedCards] = useState([]);
  const [selectedContext, setSelectedContext] = useState(null);
  const [cardAssignments, setCardAssignments] = useState({});
  const [deckName, setDeckName] = useState('');
  
  // Hook centralizado de contextos
  const { 
    contexts, 
    loading: loadingContexts 
  } = useContexts({ autoLoad: true, onlyActive: true });
  
  // Datos auxiliares de cartas
  const [availableCards, setAvailableCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(true);
  
  // Modo de captura de cartas
  const [captureMode, setCaptureMode] = useState('rfid'); // 'rfid' | 'manual'
  
  // Modal de borrador
  const [showDraftModal, setShowDraftModal] = useState(false);
  
  // Modal de confirmación para salir
  const exitConfirmation = useConfirmationModal();
  
  // Verificar si hay datos sin guardar
  const hasUnsavedData = selectedCards.length > 0 || selectedContext !== null || Object.keys(cardAssignments).length > 0 || deckName.trim() !== '';
  
  // Hook de persistencia de borrador
  const { 
    draft, 
    hasDraft, 
    saveDraft, 
    restoreDraft, 
    discardDraft, 
    clearDraft,
    draftTimestamp 
  } = useDeckWizardDraft();

  // Cargar cartas disponibles
  useEffect(() => {
    const loadCards = async () => {
      try {
        const cardsRes = await cardsAPI.getCards({ limit: 100 });
        setAvailableCards(extractData(cardsRes)?.data || []);
      } catch (err) {
        toast.error('Error al cargar cartas', {
          description: extractErrorMessage(err)
        });
      } finally {
        setLoadingCards(false);
      }
    };
    
    loadCards();
  }, []);

  // Mostrar modal si hay borrador guardado
  useEffect(() => {
    if (hasDraft && !showDraftModal) {
      setShowDraftModal(true);
    }
  }, [hasDraft]);

  // Guardar borrador automáticamente
  useEffect(() => {
    if (selectedCards.length > 0 || selectedContext || Object.keys(cardAssignments).length > 0) {
      saveDraft({
        currentStep,
        selectedCards,
        selectedContext,
        cardAssignments,
        deckName
      });
    }
  }, [currentStep, selectedCards, selectedContext, cardAssignments, deckName, saveDraft]);

  // Restaurar borrador
  const handleRestoreDraft = useCallback(() => {
    if (draft) {
      setCurrentStep(draft.currentStep || 0);
      setSelectedCards(draft.selectedCards || []);
      setSelectedContext(draft.selectedContext || null);
      setCardAssignments(draft.cardAssignments || {});
      setDeckName(draft.deckName || '');
      restoreDraft();
      toast.success('Borrador restaurado');
    }
    setShowDraftModal(false);
  }, [draft, restoreDraft]);

  // Descartar borrador
  const handleDiscardDraft = useCallback(() => {
    discardDraft();
    setShowDraftModal(false);
  }, [discardDraft]);

  // Handler para salir del wizard con confirmación
  const handleExitWizard = useCallback(() => {
    if (hasUnsavedData) {
      exitConfirmation.openModal({
        title: 'Salir sin guardar',
        message: 'Tienes cambios sin guardar. El borrador se mantendrá guardado automáticamente. ¿Seguro que quieres salir?',
        confirmText: 'Salir',
        variant: 'warning',
        onConfirm: () => {
          navigate(ROUTES.CARD_DECKS);
        }
      });
    } else {
      navigate(ROUTES.CARD_DECKS);
    }
  }, [hasUnsavedData, navigate, exitConfirmation]);

  // Handler para escaneo RFID mock
  const handleRFIDScan = useCallback((card) => {
    if (selectedCards.length >= MAX_CARDS) {
      toast.warning('Límite alcanzado', {
        description: `Máximo ${MAX_CARDS} cartas por mazo`
      });
      return;
    }
    
    if (selectedCards.find(c => c._id === card._id)) {
      toast.info('Carta ya añadida');
      return;
    }
    
    setSelectedCards(prev => [...prev, card]);
  }, [selectedCards]);

  // Handler para selección manual
  const handleManualSelection = useCallback((cards) => {
    setSelectedCards(cards);
  }, []);

  // Remover carta
  const handleRemoveCard = useCallback((cardId) => {
    setSelectedCards(prev => prev.filter(c => c._id !== cardId));
    // Remover también su asignación
    setCardAssignments(prev => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
  }, []);

  // Seleccionar contexto
  const handleSelectContext = useCallback((context) => {
    setSelectedContext(context);
    // Limpiar asignaciones al cambiar de contexto
    setCardAssignments({});
  }, []);

  // Asignar asset a carta
  const handleAssignAsset = useCallback((cardId, asset) => {
    setCardAssignments(prev => ({
      ...prev,
      [cardId]: asset
    }));
  }, []);

  // Validaciones por paso
  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 0: // Cards
        return selectedCards.length >= MIN_CARDS && selectedCards.length <= MAX_CARDS;
      case 1: // Context
        return selectedContext !== null;
      case 2: // Assign
        return Object.keys(cardAssignments).length === selectedCards.length;
      case 3: // Confirm
        return deckName.trim().length >= 3;
      default:
        return false;
    }
  }, [currentStep, selectedCards, selectedContext, cardAssignments, deckName]);

  // Navegación
  const goNext = useCallback(() => {
    if (currentStep < WIZARD_STEPS.length - 1 && canProceed()) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, canProceed]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  // Crear mazo
  const handleCreateDeck = async () => {
    if (!canProceed()) return;
    
    setIsSubmitting(true);
    
    try {
      const deckData = {
        name: deckName.trim(),
        contextId: selectedContext._id,
        cards: selectedCards.map(card => ({
          cardId: card._id,
          assignedAsset: cardAssignments[card._id]
        }))
      };
      
      await decksAPI.createDeck(deckData);
      
      // Limpiar borrador
      clearDraft();
      
      // Celebración
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#8b5cf6', '#6366f1', '#a855f7', '#ec4899']
      });
      
      toast.success('¡Mazo creado!', {
        description: `"${deckName}" está listo para usar`
      });
      
      // Redirigir después de un momento para que se vea el confetti
      setTimeout(() => {
        navigate(ROUTES.CARD_DECKS);
      }, 1500);
      
    } catch (err) {
      toast.error('Error al crear mazo', {
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
          <StepCards
            captureMode={captureMode}
            setCaptureMode={setCaptureMode}
            selectedCards={selectedCards}
            availableCards={availableCards}
            loadingCards={loadingCards}
            onRFIDScan={handleRFIDScan}
            onManualSelect={handleManualSelection}
            onRemoveCard={handleRemoveCard}
            minCards={MIN_CARDS}
            maxCards={MAX_CARDS}
          />
        );
      case 1:
        return (
          <StepContext
            contexts={contexts}
            loadingContexts={loadingContexts}
            selectedContext={selectedContext}
            onSelectContext={handleSelectContext}
          />
        );
      case 2:
        return (
          <StepAssign
            selectedCards={selectedCards}
            selectedContext={selectedContext}
            cardAssignments={cardAssignments}
            onAssignAsset={handleAssignAsset}
          />
        );
      case 3:
        return (
          <StepConfirm
            deckName={deckName}
            setDeckName={setDeckName}
            selectedCards={selectedCards}
            selectedContext={selectedContext}
            cardAssignments={cardAssignments}
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
        <button
          onClick={handleExitWizard}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={18} />
          Volver a Mis Mazos
        </button>
        
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Layers size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Crear Nuevo Mazo</h1>
            <p className="text-slate-400 text-sm">
              {WIZARD_STEPS[currentStep].description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Stepper */}
      <div className="max-w-5xl mx-auto mb-8">
        <WizardStepper
          steps={WIZARD_STEPS}
          currentStep={currentStep}
          onStepClick={(index) => {
            // Solo permitir ir a pasos anteriores
            if (index < currentStep) {
              setCurrentStep(index);
            }
          }}
        />
      </div>

      {/* Contenido del paso */}
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

      {/* Footer con navegación */}
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
              icon={<ArrowLeft size={18} />}
            >
              Anterior
            </ButtonPremium>

            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Paso {currentStep + 1} de {WIZARD_STEPS.length}</span>
            </div>

            {currentStep === WIZARD_STEPS.length - 1 ? (
              <ButtonPremium
                onClick={handleCreateDeck}
                disabled={!canProceed() || isSubmitting}
                loading={isSubmitting}
                icon={<Sparkles size={18} />}
              >
                Crear Mazo
              </ButtonPremium>
            ) : (
              <ButtonPremium
                onClick={goNext}
                disabled={!canProceed()}
                icon={<ArrowRight size={18} />}
                iconPosition="right"
              >
                Siguiente
              </ButtonPremium>
            )}
          </div>
        </GlassCard>
      </motion.div>

      {/* Modal de borrador */}
      <AnimatePresence>
        {showDraftModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                  <Save className="text-indigo-400" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Borrador encontrado</h3>
                  <p className="text-sm text-slate-400">
                    {draftTimestamp && formatDraftDate(draftTimestamp)}
                  </p>
                </div>
              </div>

              <p className="text-slate-300 mb-6">
                Tienes un mazo sin terminar guardado. ¿Quieres continuar donde lo dejaste?
              </p>

              <div className="flex gap-3 justify-end">
                <ButtonPremium
                  variant="ghost"
                  onClick={handleDiscardDraft}
                  icon={<X size={16} />}
                >
                  Descartar
                </ButtonPremium>
                <ButtonPremium
                  onClick={handleRestoreDraft}
                  icon={<Check size={16} />}
                >
                  Restaurar
                </ButtonPremium>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de confirmación para salir */}
      <ConfirmationModal {...exitConfirmation.modalProps} />
    </div>
  );
}


// ============================================
// COMPONENTES DE PASOS
// ============================================

/**
 * Paso 1: Capturar cartas (RFID o manual)
 */
function StepCards({
  captureMode,
  setCaptureMode,
  selectedCards,
  availableCards,
  loadingCards,
  onRFIDScan,
  onManualSelect,
  onRemoveCard,
  minCards,
  maxCards
}) {
  const isValidCount = selectedCards.length >= minCards && selectedCards.length <= maxCards;

  return (
    <GlassCard className="p-6">
      {/* Toggle de modo */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white mb-1">Modo de captura</h2>
          <p className="text-sm text-slate-400">
            {selectedCards.length} de {minCards}-{maxCards} cartas
          </p>
        </div>

        <div className="flex bg-slate-800/50 rounded-xl p-1">
          <button
            onClick={() => setCaptureMode('rfid')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              captureMode === 'rfid'
                ? 'bg-indigo-500 text-white'
                : 'text-slate-400 hover:text-white'
            )}
          >
            Escaneo RFID
          </button>
          <button
            onClick={() => setCaptureMode('manual')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              captureMode === 'manual'
                ? 'bg-indigo-500 text-white'
                : 'text-slate-400 hover:text-white'
            )}
          >
            Selección Manual
          </button>
        </div>
      </div>

      {/* Panel de captura */}
      <AnimatePresence mode="wait">
        {captureMode === 'rfid' ? (
          <motion.div
            key="rfid"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <RFIDScannerPanel
              onCardScanned={onRFIDScan}
              scannedCards={selectedCards}
              onRemoveCard={onRemoveCard}
              maxCards={maxCards}
              availableCards={availableCards}
            />
          </motion.div>
        ) : (
          <motion.div
            key="manual"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <CardSelector
              cards={availableCards}
              selectedCards={selectedCards}
              onChange={onManualSelect}
              maxCards={maxCards}
              loading={loadingCards}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mensaje de validación */}
      {selectedCards.length > 0 && !isValidCount && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex items-center gap-2 text-amber-400 text-sm"
        >
          <AlertTriangle size={16} />
          {selectedCards.length < minCards 
            ? `Necesitas al menos ${minCards} cartas` 
            : `Máximo ${maxCards} cartas permitidas`}
        </motion.div>
      )}
    </GlassCard>
  );
}

/**
 * Paso 2: Seleccionar contexto
 */
function StepContext({
  contexts,
  loadingContexts,
  selectedContext,
  onSelectContext
}) {
  if (loadingContexts) {
    return (
      <GlassCard className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i}
              className="h-32 rounded-xl bg-slate-800/50 animate-pulse"
            />
          ))}
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-1">Elige un contexto</h2>
        <p className="text-sm text-slate-400">
          El contexto determina los assets que podrás asignar a las cartas
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {contexts.map((context) => (
          <motion.button
            key={context._id}
            onClick={() => onSelectContext(context)}
            className={cn(
              'relative p-4 rounded-xl border-2 transition-all text-left',
              'hover:border-indigo-500/50 hover:bg-indigo-500/5',
              selectedContext?._id === context._id
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-white/10 bg-slate-800/30'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Check si está seleccionado */}
            {selectedContext?._id === context._id && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center"
              >
                <Check size={14} className="text-white" />
              </motion.div>
            )}

            {/* Preview de assets */}
            <div className="flex flex-wrap gap-1 mb-3 h-10 overflow-hidden">
              {context.assets?.slice(0, 6).map((asset, i) => (
                <span key={i} className="text-2xl">
                  {asset.display || '📦'}
                </span>
              ))}
              {context.assets?.length > 6 && (
                <span className="text-slate-500 text-xs self-end">
                  +{context.assets.length - 6}
                </span>
              )}
            </div>

            <h3 className="font-medium text-white mb-1">{context.name}</h3>
            <p className="text-xs text-slate-400">
              {context.assets?.length || 0} assets disponibles
            </p>
          </motion.button>
        ))}
      </div>

      {contexts.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Palette size={48} className="mx-auto mb-4 opacity-50" />
          <p>No hay contextos disponibles</p>
        </div>
      )}
    </GlassCard>
  );
}

/**
 * Paso 3: Asignar assets a cartas
 */
function StepAssign({
  selectedCards,
  selectedContext,
  cardAssignments,
  onAssignAsset
}) {
  const [activeCardId, setActiveCardId] = useState(selectedCards[0]?._id || null);
  const assignedAssetKeys = Object.values(cardAssignments).map(a => a?.key);
  
  const activeCard = selectedCards.find(c => c._id === activeCardId);
  const currentAssignment = cardAssignments[activeCardId];

  const assignedCount = Object.keys(cardAssignments).length;
  const progress = (assignedCount / selectedCards.length) * 100;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Lista de cartas */}
      <GlassCard className="p-4 lg:col-span-1">
        <div className="mb-4">
          <h3 className="font-medium text-white mb-1">Cartas del mazo</h3>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {assignedCount}/{selectedCards.length} asignadas
          </p>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {selectedCards.map((card) => {
            const isAssigned = !!cardAssignments[card._id];
            const isActive = activeCardId === card._id;
            
            return (
              <motion.button
                key={card._id}
                onClick={() => setActiveCardId(card._id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                  isActive
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-white/10 bg-slate-800/30 hover:border-white/20'
                )}
                whileHover={{ x: 4 }}
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-sm',
                  isAssigned
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-slate-700 text-slate-400'
                )}>
                  {isAssigned 
                    ? cardAssignments[card._id]?.display || <Check size={16} />
                    : <CreditCard size={16} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {card.uid}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {isAssigned 
                      ? cardAssignments[card._id]?.value 
                      : 'Sin asignar'
                    }
                  </p>
                </div>
                {isActive && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-2 h-2 rounded-full bg-indigo-500"
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </GlassCard>

      {/* Selector de assets */}
      <GlassCard className="p-4 lg:col-span-2">
        {activeCard ? (
          <>
            <div className="mb-4">
              <h3 className="font-medium text-white mb-1">
                Asignar asset a <span className="text-indigo-400">{activeCard.uid}</span>
              </h3>
              <p className="text-sm text-slate-400">
                Selecciona un asset del contexto "{selectedContext?.name}"
              </p>
            </div>

            <AssetSelector
              assets={selectedContext?.assets || []}
              selectedAsset={currentAssignment}
              assignedAssetKeys={assignedAssetKeys}
              onSelect={(asset) => onAssignAsset(activeCardId, asset)}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <p>Selecciona una carta para asignar un asset</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

/**
 * Paso 4: Confirmar y nombrar mazo
 */
function StepConfirm({
  deckName,
  setDeckName,
  selectedCards,
  selectedContext,
  cardAssignments
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Nombre del mazo */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Nombre del mazo</h2>
        
        <InputPremium
          label="Nombre"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder="Ej: Capitales de Europa"
          maxLength={50}
          helperText={`${deckName.length}/50 caracteres`}
        />

        <div className="mt-6 p-4 rounded-xl bg-slate-800/50 border border-white/5">
          <h3 className="text-sm font-medium text-white mb-3">Resumen</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2 text-slate-300">
              <CreditCard size={16} className="text-indigo-400" />
              {selectedCards.length} cartas
            </li>
            <li className="flex items-center gap-2 text-slate-300">
              <Palette size={16} className="text-purple-400" />
              Contexto: {selectedContext?.name}
            </li>
            <li className="flex items-center gap-2 text-slate-300">
              <LinkIcon size={16} className="text-pink-400" />
              {Object.keys(cardAssignments).length} asignaciones
            </li>
          </ul>
        </div>
      </GlassCard>

      {/* Preview del mazo */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Vista previa</h2>
        
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {selectedCards.map((card) => {
            const assignment = cardAssignments[card._id];
            return (
              <div
                key={card._id}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-white/5"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-xl">
                  {assignment?.display || '❓'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {assignment?.value || 'Sin asignar'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Carta: {card.uid}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
