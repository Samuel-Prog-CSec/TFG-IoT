/**
 * @fileoverview Wizard de creación de mazos de cartas
 * Permite al profesor crear un mazo paso a paso:
 * 1. Capturar cartas (RFID + fallback manual)
 * 2. Seleccionar contexto temático
 * 3. Asignar assets a cada carta
 * 4. Confirmar y nombrar el mazo
 * 
 * Incluye persistencia de borrador en localStorage.
 * 
 * @module pages/DeckCreationWizard
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useConfetti } from '../hooks/useConfetti';
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
  Sparkles,
  Hash,
  Wand2,
  Eye
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getId } from '../lib/entityId';
import { buildCardMappingsPayload } from '../lib/cardMapping';
import WizardStepper from '../components/ui/WizardStepper';
import RFIDScannerPanel from '../components/ui/RFIDScannerPanel';
import AssetSelector from '../components/ui/AssetSelector';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import AudioPlayBadge from '../components/ui/AudioPlayBadge';
import ButtonPremium from '../components/ui/ButtonPremium';
import InlineSuccessBadge from '../components/ui/InlineSuccessBadge';
import useInlineSuccess from '../hooks/useInlineSuccess';
import GlassCard from '../components/ui/GlassCard';
import InputPremium from '../components/ui/InputPremium';
import ErrorState from '../components/ui/ErrorState';
import ConfirmationModal, { useConfirmationModal } from '../components/ui/ConfirmationModal';
import { decksAPI, extractErrorMessage } from '../services/api';
import useDeckWizardDraft, { formatDraftDate } from '../hooks/useDeckWizardDraft';
import { useContexts } from '../hooks/useContexts';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
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
    description: 'El contexto determina los recursos disponibles'
  },
  {
    id: 'assign',
    title: 'Vincular Recursos',
    subtitle: 'Une cartas con contenido',
    icon: LinkIcon,
    description: 'Asocia cada carta con un recurso del contexto'
  },
  {
    id: 'confirm',
    title: 'Guardar Mazo',
    subtitle: 'Revisa y guarda',
    icon: Check,
    description: 'Revisa tu mazo y dale un nombre'
  }
];

const {MIN_CARDS} = GAME_CONFIG;
const {MAX_CARDS} = GAME_CONFIG;

/**
 * Genera el siguiente UID secuencial disponible que no exista ya en la lista.
 * Formato: 8 caracteres hex (00000000, 00000001, ...).
 */
function generateNextSequentialUid(existingCards) {
  const existingUids = new Set(existingCards.map(c => c.uid));
  let counter = existingCards.length;
  let candidate = String(counter).padStart(8, '0');
  // Saltar UIDs que ya existan (por si hay huecos o duplicados)
  while (existingUids.has(candidate)) {
    counter++;
    candidate = String(counter).padStart(8, '0');
  }
  return candidate;
}

/**
 * Componente principal del wizard de creación de mazos
 */
export default function DeckCreationWizard() {
  const navigate = useNavigate();
  const { shouldReduceMotion } = useReducedMotion();
  const { fireConfetti } = useConfetti();
  useDocumentTitle('Crear Mazo');
  // T-955: confirmación inline tras crear el mazo, justo antes de navegar
  // de vuelta a "Mis Mazos". Coexiste con el confetti y el toast: el badge
  // es el ancla visual junto al botón "Crear Mazo".
  const saveBadge = useInlineSuccess();

  // Estado del wizard
  const [currentStep, setCurrentStep] = useState(0);
  const [stepDirection, setStepDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Datos del mazo
  const [selectedCards, setSelectedCards] = useState([]);
  const [selectedContext, setSelectedContext] = useState(null);
  const [cardAssignments, setCardAssignments] = useState({});
  const [deckName, setDeckName] = useState('');
  
  // Hook centralizado de contextos
  const { 
    contexts, 
    loading: loadingContexts,
    error: contextsError,
    refetch: refetchContexts
  } = useContexts({ autoLoad: true, onlyActive: true });
  
  // Modo de captura de cartas
  const [captureMode, setCaptureMode] = useState('rfid'); // 'rfid' | 'manual'
  
  // Modal de borrador. `draftDecisionTakenRef` evita que el modal reaparezca
  // tras descartar y empezar a rellenar el wizard de nuevo: el hook
  // `useDeckWizardDraft` vuelve a poner `hasDraft=true` en cuanto se guarda
  // el primer dato significativo, lo que hacía rebrotar el modal en pleno
  // step 2 (QA 26/04/2026).
  const [showDraftModal, setShowDraftModal] = useState(false);
  const draftDecisionTakenRef = useRef(false);
  
  // T-957: confirmación danger antes de descartar el borrador. El click
  // accidental en "Descartar" del modal "Borrador encontrado" perdía
  // 10-15 min de trabajo sin red de seguridad — ahora pedimos una segunda
  // confirmación con el flip 3D de variant 'danger'.
  const discardConfirmation = useConfirmationModal();

  // Verificar si hay datos sin guardar
  const hasUnsavedData = selectedCards.length > 0 || selectedContext !== null || Object.keys(cardAssignments).length > 0 || deckName.trim() !== '';

  // T-957: hook unificado de cambios sin guardar — beforeunload (cierre
  // pestaña/refresh) + confirmExit (botones programáticos de navegación).
  // Reemplaza al `exitConfirmation` anterior, que era el mismo patrón
  // hecho a mano sin protección de refresh.
  const { confirmExit, confirmExitModalProps } = useUnsavedChanges(
    hasUnsavedData,
    'Tienes cambios sin guardar. El borrador se mantendrá guardado automáticamente. ¿Seguro que quieres salir?'
  );
  
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

  useRefetchOnFocus({
    refetch: () => refetchContexts(),
    isLoading: loadingContexts,
    hasData: contexts.length > 0,
    hasError: Boolean(contextsError)
  });

  // Mostrar modal si hay borrador guardado, solo si el usuario aún no ha
  // tomado decisión sobre él en esta sesión del wizard.
  useEffect(() => {
    if (hasDraft && !showDraftModal && !draftDecisionTakenRef.current) {
      setShowDraftModal(true);
    }
  }, [hasDraft, showDraftModal]);

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
    draftDecisionTakenRef.current = true;
    setShowDraftModal(false);
  }, [draft, restoreDraft]);

  // Descartar borrador (T-957: requiere confirmación danger explícita
  // — el borrador puede contener 10-15 min de captura RFID + asignaciones).
  const handleDiscardDraft = useCallback(() => {
    discardConfirmation.openModal({
      title: 'Descartar borrador',
      description: 'Se perderá el progreso guardado del wizard (cartas escaneadas, contexto y asignaciones). Esta acción no se puede deshacer.',
      variant: 'danger',
      confirmText: 'Descartar borrador',
      cancelText: 'Conservar',
      onConfirm: () => {
        discardDraft();
        draftDecisionTakenRef.current = true;
        setShowDraftModal(false);
      },
    });
  }, [discardDraft, discardConfirmation]);

  // Handler para salir del wizard con confirmación (T-957: usa confirmExit
  // del hook useUnsavedChanges, que añade además protección beforeunload).
  const handleExitWizard = useCallback(() => {
    confirmExit(
      () => navigate(ROUTES.CARD_DECKS),
      {
        title: 'Salir sin guardar',
        description: 'Tienes cambios sin guardar. El borrador se mantendrá guardado automáticamente. ¿Seguro que quieres salir?',
        confirmText: 'Salir',
      }
    );
  }, [navigate, confirmExit]);

  // Handler para escaneo RFID
  const handleRFIDScan = useCallback((card) => {
    if (selectedCards.length >= MAX_CARDS) {
      toast.warning('Límite alcanzado', {
        description: `Máximo ${MAX_CARDS} cartas por mazo`
      });
      return;
    }

    if (selectedCards.find(c => c.uid === card.uid)) {
      toast.info('Carta ya añadida');
      return;
    }

    setSelectedCards(prev => [...prev, card]);

    // Check cross-deck: verificar si la tarjeta está en otro mazo activo (ADR-022)
    decksAPI.checkCard(card.uid).then(res => {
      const result = res.data?.data;
      if (result?.found) {
        toast.warning('Tarjeta en otro mazo', {
          description: `La tarjeta ${card.uid} está en el mazo "${result.deck.name}". Se moverá automáticamente al crear este mazo.`
        });
      }
      return undefined;
    }).catch(() => {
      // Silencioso: el check es informativo, no crítico
    });
  }, [selectedCards]);


  // Remover carta
  const handleRemoveCard = useCallback((uid) => {
    setSelectedCards(prev => prev.filter(c => c.uid !== uid));
    // Remover también su asignación
    setCardAssignments(prev => {
      const next = { ...prev };
      delete next[uid];
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
  const handleAssignAsset = useCallback((uid, asset) => {
    setCardAssignments(prev => ({
      ...prev,
      [uid]: asset
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
      setStepDirection(1);
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, canProceed]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setStepDirection(-1);
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
        // El DTO del backend (toGameContextDTOV1) devuelve `id`, pero por
        // resiliencia ante futuros cambios de contrato aceptamos también `_id`.
        contextId: getId(selectedContext),
        cardMappings: buildCardMappingsPayload(selectedCards, cardAssignments)
      };
      
      const response = await decksAPI.createDeck(deckData);
      const responseData = response.data?.data;

      // Limpiar borrador
      clearDraft();

      // Celebración + micro-confirmación inline.
      fireConfetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
      });
      saveBadge.trigger();

      toast.success('¡Mazo creado!', {
        description: `"${deckName}" está listo para usar`
      });

      // Resumen de tarjetas movidas cross-deck (ADR-022)
      if (responseData?.affectedDecks?.movedCards?.length > 0) {
        const { movedCards, archivedDecks } = responseData.affectedDecks;
        let description = `${movedCards.length} tarjeta(s) movida(s) desde otros mazos.`;
        if (archivedDecks?.length > 0) {
          description += ` ${archivedDecks.length} mazo(s) archivado(s) por quedar con pocas cartas.`;
        }
        toast.info('Tarjetas reorganizadas', { description, duration: 6000 });
      }
      
      // Redirigir después de un momento para que se vea el confetti
      setTimeout(() => {
        navigate(ROUTES.CARD_DECKS);
      }, shouldReduceMotion ? 400 : 1500);
      
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
            onRFIDScan={handleRFIDScan}
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
            contextsError={contextsError}
            onRetryContexts={refetchContexts}
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
    <div className="min-h-full bg-background-deep p-4 lg:p-8">
      {/* Header */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto mb-8"
      >
        <button
          onClick={handleExitWizard}
          className="flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors mb-4"
        >
          <ArrowLeft size={18} />
          Volver a Mis Mazos
        </button>
        
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-xl bg-gradient-to-br from-accent-indigo to-brand-base flex items-center justify-center">
            <Layers size={24} className="text-text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Crear Nuevo Mazo</h1>
            <p className="text-text-muted text-sm">
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
          reducedMotion={shouldReduceMotion}
          onStepClick={(index) => {
            // Solo permitir ir a pasos anteriores
            if (index < currentStep) {
              setStepDirection(index < currentStep ? -1 : 1);
              setCurrentStep(index);
            }
          }}
        />
      </div>

      {/* Contenido del paso */}
      <div className="max-w-5xl mx-auto mb-8">
        <AnimatePresence mode="wait" custom={stepDirection}>
          <motion.div
            key={currentStep}
            custom={stepDirection}
            initial={shouldReduceMotion ? false : (d) => ({ opacity: 0, x: d * 30 })}
            animate={{ opacity: 1, x: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : (d) => ({ opacity: 0, x: d * -30 })}
            transition={{ duration: shouldReduceMotion ? 0.15 : 0.3 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer con navegación */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
        className="max-w-5xl mx-auto"
      >
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ButtonPremium
              variant="ghost"
              onClick={goBack}
              disabled={currentStep === 0}
              icon={<ArrowLeft size={18} />}
            >
              Anterior
            </ButtonPremium>

            <div className="flex items-center gap-2 text-sm text-text-muted order-last sm:order-none w-full sm:w-auto justify-center">
              <span>Paso {currentStep + 1} de {WIZARD_STEPS.length}</span>
            </div>

            {currentStep === WIZARD_STEPS.length - 1 ? (
              <div className="relative">
                <ButtonPremium
                  onClick={handleCreateDeck}
                  disabled={!canProceed() || isSubmitting}
                  loading={isSubmitting}
                  icon={<Sparkles size={18} />}
                >
                  Crear Mazo
                </ButtonPremium>
                <InlineSuccessBadge visible={saveBadge.visible} label="Mazo creado" placement="left" />
              </div>
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-backdrop backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-background-base border border-border-default rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="size-12 rounded-xl bg-accent-indigo/20 flex items-center justify-center">
                  <Save className="text-accent-indigo" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">Borrador encontrado</h3>
                  <p className="text-sm text-text-muted">
                    {draftTimestamp && formatDraftDate(draftTimestamp)}
                  </p>
                </div>
              </div>

              <p className="text-text-secondary mb-6">
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

      {/* T-957: modal "cambios sin guardar" (sustituye al antiguo
          exitConfirmation; ahora gestionado por useUnsavedChanges). */}
      <ConfirmationModal {...confirmExitModalProps} />

      {/* T-957: modal de confirmación al descartar borrador. */}
      <ConfirmationModal {...discardConfirmation.modalProps} />
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
  onRFIDScan,
  onRemoveCard,
  minCards,
  maxCards
}) {
  const isValidCount = selectedCards.length >= minCards && selectedCards.length <= maxCards;
  const [manualUid, setManualUid] = useState('');

  const nextSuggestedUid = useMemo(
    () => generateNextSequentialUid(selectedCards),
    [selectedCards]
  );

  const handleManualAdd = useCallback(() => {
    const uid = manualUid.trim().toUpperCase();
    if (!uid) return;
    if (uid.length < 4) {
      toast.warning('UID muy corto', { description: 'El UID debe tener al menos 4 caracteres' });
      return;
    }
    onRFIDScan({
      _id: `manual-${uid}`,
      uid,
      type: 'MANUAL',
      scannedAt: new Date()
    });
    setManualUid('');
  }, [manualUid, onRFIDScan]);

  // "Generar UID" rellena el input con el siguiente UID secuencial sugerido.
  // El usuario revisa y luego pulsa "Agregar". Antes anadia la carta directamente,
  // lo que dejaba el boton "Agregar" disabled y rompia la expectativa del flujo
  // (QA 2026-05-21 BUG-QA-8: el placeholder cambiaba pero el value seguia vacio).
  const handleGenerateUid = useCallback(() => {
    setManualUid(nextSuggestedUid);
  }, [nextSuggestedUid]);

  return (
    <GlassCard className="p-6">
      {/* Toggle de modo */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-1">Modo de captura</h2>
          <p className="text-sm text-text-muted">
            {selectedCards.length} de {minCards}-{maxCards} cartas
          </p>
        </div>

        <div className="flex bg-background-elevated/50 rounded-xl p-1">
          <button
            onClick={() => setCaptureMode('rfid')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              captureMode === 'rfid'
                ? 'bg-accent-indigo text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            )}
          >
            Escaneo RFID
          </button>
          <button
            onClick={() => setCaptureMode('manual')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              captureMode === 'manual'
                ? 'bg-accent-indigo text-text-primary'
                : 'text-text-muted hover:text-text-primary'
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
              showMockButton={import.meta.env.MODE === 'development'}
            />
          </motion.div>
        ) : (
          <motion.div
            key="manual"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Manual UID entry with auto-suggest */}
            <div className="p-4 rounded-xl bg-background-elevated/40 border border-border-default">
              <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
                <Hash size={16} className="text-accent-indigo" />
                Entrada manual de UID
              </h3>
              <div className="flex gap-2">
                <div className="flex-1">
                  <InputPremium
                    value={manualUid}
                    onChange={(e) => setManualUid(e.target.value.toUpperCase())}
                    placeholder={nextSuggestedUid}
                    maxLength={16}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleManualAdd();
                    }}
                    helperText="Introduce un UID o genera uno secuencial"
                  />
                </div>
                <ButtonPremium
                  variant="ghost"
                  onClick={handleGenerateUid}
                  disabled={selectedCards.length >= maxCards}
                  icon={<Wand2 size={16} />}
                  title="Generar UID secuencial"
                >
                  Generar UID
                </ButtonPremium>
                <ButtonPremium
                  onClick={handleManualAdd}
                  disabled={!manualUid.trim() || selectedCards.length >= maxCards}
                  icon={<Check size={16} />}
                >
                  Agregar
                </ButtonPremium>
              </div>
            </div>

            {/* Card list for manual mode */}
            <RFIDScannerPanel
              onCardScanned={onRFIDScan}
              scannedCards={selectedCards}
              onRemoveCard={onRemoveCard}
              maxCards={maxCards}
              showMockButton={import.meta.env.MODE === 'development'}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mensaje de validación */}
      {selectedCards.length > 0 && !isValidCount && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex items-center gap-2 text-warning-base text-sm"
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
  contextsError,
  onRetryContexts,
  selectedContext,
  onSelectContext
}) {
  if (loadingContexts) {
    return (
      <GlassCard className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-[var(--space-fluid-gutter)]">
          {Array.from({ length: 6 }, (_, i) => `ctx-wizard-skeleton-${i}`).map(id => (
            <div
              key={id}
              className="h-32 rounded-xl bg-background-elevated/50 animate-pulse"
            />
          ))}
        </div>
      </GlassCard>
    );
  }

  // Estado de error: si la carga de contextos falló no debemos mostrar el
  // empty-state (que sugeriría que no hay contextos), sino un error con
  // reintento — así el profesor entiende que es un fallo de red, no falta de datos.
  if (contextsError) {
    return (
      <ErrorState
        title="No se pudieron cargar los contextos"
        message={contextsError}
        onRetry={onRetryContexts}
      />
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Elige un contexto</h2>
        <p className="text-sm text-text-muted">
          El contexto determina los recursos que podrás asignar a las cartas
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-[var(--space-fluid-gutter)]">
        {contexts.map((context) => {
          // El DTO toGameContextDTOV1 expone `id`; mantenemos compat con `_id`
          // por si en algun consumidor el documento Mongoose llega crudo.
          const contextKey = getId(context);
          const selectedKey = getId(selectedContext);
          const isSelected = Boolean(selectedKey) && selectedKey === contextKey;
          return (
          <motion.button
            key={contextKey}
            onClick={() => onSelectContext(context)}
            className={cn(
              'relative p-4 rounded-xl border-2 transition-[border-color,background-color] text-left',
              'hover:border-accent-indigo/50 hover:bg-accent-indigo/5',
              isSelected
                ? 'border-accent-indigo bg-accent-indigo/10'
                : 'border-border-default bg-background-elevated/30'
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Check si está seleccionado */}
            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 right-2 size-6 rounded-full bg-accent-indigo flex items-center justify-center"
              >
                <Check size={14} className="text-text-primary" />
              </motion.div>
            )}

            {/* Preview de assets */}
            <div className="flex flex-wrap gap-1.5 mb-3 h-10 overflow-hidden">
              {context.assets?.slice(0, 6).map((asset, i) => (
                <span key={asset.key || `${asset.display || 'asset'}-${i}`} className="text-2xl">
                  {asset.display || '📦'}
                </span>
              ))}
              {context.assets?.length > 6 && (
                <span className="text-text-muted text-xs self-end">
                  +{context.assets.length - 6}
                </span>
              )}
            </div>

            <h3 className="font-medium text-text-primary mb-1">{context.name}</h3>
            <p className="text-xs text-text-muted">
              {context.assets?.length || 0} recursos disponibles
            </p>
          </motion.button>
          );
        })}
      </div>

      {contexts.length === 0 && (
        <div className="text-center py-12 text-text-muted">
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
  const [activeCardId, setActiveCardId] = useState(selectedCards[0]?.uid || null);
  const assetUsageCounts = useMemo(() => {
    return Object.values(cardAssignments).reduce((acc, asset) => {
      if (asset?.key) acc.set(asset.key, (acc.get(asset.key) || 0) + 1);
      return acc;
    }, new Map());
  }, [cardAssignments]);

  const activeCard = selectedCards.find(c => c.uid === activeCardId);
  const currentAssignment = cardAssignments[activeCardId];

  const assignedCount = Object.keys(cardAssignments).length;
  const progress = (assignedCount / selectedCards.length) * 100;

  // Compute unassigned cards and assets for auto-assign
  const unassignedCards = useMemo(
    () => selectedCards.filter(c => !cardAssignments[c.uid]),
    [selectedCards, cardAssignments]
  );

  const assignedAssetKeys = useMemo(
    () => new Set(Object.values(cardAssignments).flatMap(a => a?.key ? [a.key] : [])),
    [cardAssignments]
  );

  const unassignedAssets = useMemo(
    () => (selectedContext?.assets || []).filter(a => !assignedAssetKeys.has(a.key)),
    [selectedContext?.assets, assignedAssetKeys]
  );

  const canAutoAssign = unassignedCards.length > 0 && unassignedAssets.length > 0;

  const handleAutoAssign = useCallback(() => {
    const count = Math.min(unassignedCards.length, unassignedAssets.length);
    for (let i = 0; i < count; i++) {
      onAssignAsset(unassignedCards[i].uid, unassignedAssets[i]);
    }
    toast.success('Auto-asignación completada', {
      description: `${count} carta(s) asignada(s) automáticamente`
    });
  }, [unassignedCards, unassignedAssets, onAssignAsset]);

  return (
    <div className="space-y-4">
      {/* Auto-assign button */}
      {canAutoAssign && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <Wand2 size={16} className="text-accent-indigo" />
              <span>
                {unassignedCards.length} carta(s) y {unassignedAssets.length} recurso(s) sin asignar
              </span>
            </div>
            <ButtonPremium
              variant="ghost"
              size="sm"
              onClick={handleAutoAssign}
              icon={<Wand2 size={14} />}
            >
              Auto-asignar restantes
            </ButtonPremium>
          </GlassCard>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[var(--space-fluid-gutter)]">
        {/* Lista de cartas */}
        <GlassCard className="p-4 lg:col-span-1">
          <div className="mb-4">
            <h3 className="font-medium text-text-primary mb-1">Cartas del mazo</h3>
            <div className="h-1.5 bg-background-elevated rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-accent-indigo to-brand-base"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="text-xs text-text-muted mt-1">
              {assignedCount}/{selectedCards.length} asignadas
            </p>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {selectedCards.map((card) => {
              const isAssigned = !!cardAssignments[card.uid];
              const isActive = activeCardId === card.uid;

              return (
                <motion.button
                  key={card.uid}
                  onClick={() => setActiveCardId(card.uid)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left',
                    isActive
                      ? 'border-accent-indigo bg-accent-indigo/10'
                      : 'border-border-default bg-background-elevated/30 hover:border-border-strong'
                  )}
                  whileHover={{ x: 4 }}
                >
                  <div className={cn(
                    'size-8 rounded-lg flex items-center justify-center text-sm overflow-hidden',
                    isAssigned
                      ? 'bg-success-base/20 text-success-base'
                      : 'bg-background-surface text-text-muted'
                  )}>
                    {isAssigned ? (
                      <CardAssetPreview
                        asset={cardAssignments[card.uid]}
                        alt={`Asset asignado a ${card.uid}`}
                        className="w-full h-full rounded-lg"
                        fit="cover"
                        fallbackIcon={<Check size={16} className="text-success-base" />}
                      />
                    ) : (
                      <CreditCard size={16} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {card.uid}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {isAssigned
                        ? <>
                            {cardAssignments[card.uid]?.value}
                            {(assetUsageCounts.get(cardAssignments[card.uid]?.key) || 0) >= 2 && (
                              <span className="ml-1 text-success-base font-medium">
                                {`(×${assetUsageCounts.get(cardAssignments[card.uid]?.key)})`}
                              </span>
                            )}
                          </>
                        : 'Sin asignar'
                      }
                    </p>
                  </div>
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="size-2 rounded-full bg-accent-indigo"
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
                <h3 className="font-medium text-text-primary mb-1">
                  Asignar recurso a <span className="text-accent-indigo">{activeCard.uid}</span>
                </h3>
                <p className="text-sm text-text-muted">
                  Selecciona un recurso del contexto &quot;{selectedContext?.name}&quot;
                </p>
              </div>

              <AssetSelector
                assets={selectedContext?.assets || []}
                selectedAssetKey={currentAssignment?.key}
                assignedAssets={[]}
                assetUsageCounts={assetUsageCounts}
                onSelect={(asset) => onAssignAsset(activeCardId, asset)}
              />

              {/* Live preview of assigned card */}
              <AnimatePresence>
                {currentAssignment && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mt-4"
                  >
                    <div className="flex items-center gap-2 mb-2 text-xs text-text-muted">
                      <Eye size={14} />
                      <span>Vista previa del juego</span>
                    </div>
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-background-elevated/50 border border-border-subtle">
                      <CardAssetPreview
                        asset={currentAssignment}
                        alt={`Preview de ${currentAssignment.value}`}
                        className="size-16 rounded-xl flex-shrink-0"
                        fit="cover"
                        fallbackClassName="bg-gradient-to-br from-accent-indigo/20 to-brand-base/20 text-2xl"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {currentAssignment.value || currentAssignment.display}
                        </p>
                        <p className="text-xs font-mono text-text-muted mt-0.5">
                          UID: {activeCard.uid}
                        </p>
                        {currentAssignment.audioUrl && (
                          <div className="mt-1.5">
                            <AudioPlayBadge
                              audioUrl={currentAssignment.audioUrl}
                              size="xs"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-text-muted">
              <p>Selecciona una carta para asignar un recurso</p>
            </div>
          )}
        </GlassCard>
      </div>
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-fluid-gutter)]">
      {/* Nombre del mazo */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Nombre del mazo</h2>
        
        <InputPremium
          label="Nombre"
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder="Ej: Capitales de Europa"
          maxLength={50}
          helperText={`${deckName.length}/50 caracteres`}
        />

        <div className="mt-6 p-4 rounded-xl bg-background-elevated/50 border border-border-subtle">
          <h3 className="text-sm font-medium text-text-primary mb-3">Resumen</h3>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2 text-text-secondary">
              <CreditCard size={16} className="text-accent-indigo" />
              {selectedCards.length} cartas
            </li>
            <li className="flex items-center gap-2 text-text-secondary">
              <Palette size={16} className="text-brand-light" />
              Contexto: {selectedContext?.name}
            </li>
            <li className="flex items-center gap-2 text-text-secondary">
              <LinkIcon size={16} className="text-accent-pink" />
              {Object.keys(cardAssignments).length} asignaciones
            </li>
          </ul>
        </div>
      </GlassCard>

      {/* Preview del mazo */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Vista previa</h2>
        
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {selectedCards.map((card) => {
            const assignment = cardAssignments[card.uid];
            return (
              <div
                key={card.uid}
                className="flex items-center gap-3 p-3 rounded-xl bg-background-elevated/50 border border-border-subtle"
              >
                <div className="relative flex-shrink-0">
                  <CardAssetPreview
                    asset={assignment}
                    alt={`Recurso de carta ${card.uid}`}
                    className="size-10 rounded-lg"
                    fit="cover"
                    fallbackClassName="bg-gradient-to-br from-accent-indigo/20 to-brand-base/20 text-xl"
                    fallbackLabel="❓"
                  />
                  {assignment?.audioUrl && (
                    <AudioPlayBadge
                      audioUrl={assignment.audioUrl}
                      size="xs"
                      className="absolute -top-1 -right-1"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {assignment?.value || 'Sin asignar'}
                  </p>
                  <p className="text-xs text-text-muted">
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

StepCards.propTypes = {
  captureMode: PropTypes.oneOf(['rfid', 'manual']).isRequired,
  setCaptureMode: PropTypes.func.isRequired,
  selectedCards: PropTypes.arrayOf(PropTypes.object).isRequired,
  onRFIDScan: PropTypes.func.isRequired,
  onRemoveCard: PropTypes.func.isRequired,
  minCards: PropTypes.number.isRequired,
  maxCards: PropTypes.number.isRequired
};

StepContext.propTypes = {
  contexts: PropTypes.arrayOf(PropTypes.object).isRequired,
  loadingContexts: PropTypes.bool.isRequired,
  contextsError: PropTypes.string,
  onRetryContexts: PropTypes.func,
  selectedContext: PropTypes.object,
  onSelectContext: PropTypes.func.isRequired
};

StepAssign.propTypes = {
  selectedCards: PropTypes.arrayOf(PropTypes.object).isRequired,
  selectedContext: PropTypes.object,
  cardAssignments: PropTypes.object.isRequired,
  onAssignAsset: PropTypes.func.isRequired
};

StepConfirm.propTypes = {
  deckName: PropTypes.string.isRequired,
  setDeckName: PropTypes.func.isRequired,
  selectedCards: PropTypes.arrayOf(PropTypes.object).isRequired,
  selectedContext: PropTypes.object,
  cardAssignments: PropTypes.object.isRequired
};
