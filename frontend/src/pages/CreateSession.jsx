/**
 * @fileoverview Pagina de creacion de sesiones de juego
 * Wizard simplificado de 4 pasos que usa mazos predefinidos.
 *
 * Pasos:
 * 1. Seleccionar Mazo (ya tiene cartas + contexto + asignaciones)
 * 2. Seleccionar Mecanica de juego
 * 3. Configurar Reglas (rondas, tiempo, puntos)
 * 4. Revisar y Crear
 *
 * @module pages/CreateSession
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useConfetti } from '../hooks/useConfetti';
import {
  ChevronRight,
  ChevronLeft,
  CreditCard,
  Gamepad2,
  Settings,
  Save,
  Sparkles
} from 'lucide-react';
import { sessionsAPI, extractData, extractErrorMessage } from '../services/api';
import { getId } from '../lib/entityId';
import WizardStepper from '../components/ui/WizardStepper';
import ButtonPremium from '../components/ui/ButtonPremium';
import InlineSuccessBadge from '../components/ui/InlineSuccessBadge';
import useInlineSuccess from '../hooks/useInlineSuccess';
import GlassCard from '../components/ui/GlassCard';
import { ROUTES } from '../constants/routes';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useSessionWizardData } from '../hooks/useSessionWizardData';
import { useWizardConfig } from '../hooks/useWizardConfig';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import { toast } from 'sonner';

// Componentes de pasos
import StepDeck from '../components/session/StepDeck';
import StepMechanic from '../components/session/StepMechanic';
import StepMemoryRules from '../components/session/StepMemoryRules';
import StepRules from '../components/session/StepRules';
import StepSequenceRules from '../components/session/StepSequenceRules';
import StepReview from '../components/session/StepReview';
import { getStepDescription } from '../components/session/sessionHelpers';

// Configuracion del wizard (iconos resueltos en tiempo de renderizado)
const WIZARD_STEPS = [
  {
    id: 'deck',
    title: 'Seleccionar Mazo',
    subtitle: 'Elige las cartas',
    icon: CreditCard,
    description: 'El mazo define las tarjetas y los recursos que usarán los estudiantes'
  },
  {
    id: 'mechanic',
    // Paso 2: ícono Gamepad2 en vez del Layers que ya usa el paso 1
    // (QA 04/05 — ambos iconos eran iguales y no diferenciaban visualmente
    // los pasos del stepper).
    title: 'Elegir Mecánica',
    subtitle: 'Tipo de juego',
    icon: Gamepad2,
    description: 'Elige cómo interactuarán los estudiantes con las tarjetas'
  },
  {
    id: 'rules',
    title: 'Definir Reglas',
    subtitle: 'Configura parámetros',
    icon: Settings,
    // Descripción genérica — Memoria no tiene "número de rondas", el plan de
    // retos lo aporta cada mecánica con sus propios sliders.
    description: 'Configura las reglas del juego'
  },
  {
    id: 'review',
    title: 'Crear Sesión',
    subtitle: 'Revisa y lanza',
    icon: Save,
    description: 'Revisa la configuración antes de crear la sesión'
  }
];

/**
 * Pagina de creacion de sesiones
 */
export default function CreateSession() {
  const navigate = useNavigate();
  const { shouldReduceMotion } = useReducedMotion();
  const { fireConfetti } = useConfetti();
  useDocumentTitle('Nueva Sesión');
  // T-955: badge inline tras crear la sesión, antes de navegar al destino
  // (BoardSetup en Memoria o SessionDetail en Asociación/Secuencia).
  const saveBadge = useInlineSuccess();

  // Estado del wizard
  const [currentStep, setCurrentStep] = useState(0);
  const [stepDirection, setStepDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Datos cargados (mazos, mecanicas, sensor)
  const {
    decks,
    mechanics,
    loadingDecks,
    loadingMechanics,
    currentSensorId,
    error: wizardDataError,
    loadData
  } = useSessionWizardData();

  // Configuracion del wizard (selecciones, validaciones, handlers)
  const {
    sessionConfig,
    setSessionConfig,
    selectedDeck,
    selectedMechanic,
    associationChallengePlan,
    setAssociationChallengePlan,
    sequencePlan,
    setSequencePlan,
    sequenceConfig,
    setSequenceConfig,
    deckCards,
    isMemorySelected,
    isAssociationSelected,
    isSequenceSelected,
    memoryPairValidation,
    handleSelectDeck,
    handleSelectMechanic,
    handleDifficultyChange,
    handleConfigChange,
    handleLinkSensorChange,
    canProceed
  } = useWizardConfig({ mechanics });

  // Dirty detection: el usuario ha empezado a configurar la sesion
  const isDirty = currentStep > 0 || selectedDeck !== null;
  // T-957: el hook protege contra cierre de pestaña / refresh vía
  // beforeunload mientras isDirty sea true. El wizard de CreateSession no
  // tiene actualmente puntos de salida programáticos (solo "Anterior",
  // "Siguiente", "Crear"), por lo que no usamos `confirmExit` aquí — el
  // modal del hook queda montado pero inerte salvo que el usuario añada
  // un nuevo botón "Cancelar wizard" que lo invoque.
  const { confirmExitModalProps } = useUnsavedChanges(isDirty);

  // Navegacion
  const goNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1 && canProceed(currentStep)) {
      setStepDirection(1);
      setCurrentStep(prev => prev + 1);
    }
  };

  const goBack = () => {
    if (currentStep > 0) {
      setStepDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  };

  // Crear sesion
  const handleCreateSession = async () => {
    if (!canProceed(currentStep)) return;

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
        sequencePlan: isSequenceSelected
          ? sequencePlan.map(round => ({
              roundNumber: round.roundNumber,
              length: round.length,
              sequence: round.sequence.map(item => ({
                uid: item.uid,
                assignedValue: item.assignedValue,
                displayData: item.displayData || {}
              }))
            }))
          : undefined,
        sequenceConfig: isSequenceSelected ? sequenceConfig : undefined,
        sensorId: sessionConfig.linkSensor ? currentSensorId : undefined
      };

      const response = await sessionsAPI.createSession(payload);
      const newSession = extractData(response);

      // Celebracion + micro-confirmación inline.
      fireConfetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
      });
      saveBadge.trigger();

      toast.success('Sesión creada', {
        description: isMemorySelected
          ? 'Redirigiendo a la configuración del tablero…'
          : 'Redirigiendo al detalle de la sesión…'
      });

      // Memoria -> BoardSetup para configurar tablero, Asociacion -> Detalle de sesion
      const targetRoute = isMemorySelected
        ? ROUTES.BOARD_SETUP_WITH_ID(getId(newSession))
        : ROUTES.SESSION_DETAIL(getId(newSession));

      setTimeout(() => {
        navigate(targetRoute);
      }, shouldReduceMotion ? 100 : 600);

    } catch (err) {
      toast.error('No pudimos crear la sesión', {
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
            error={wizardDataError}
            onRetry={loadData}
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
        if (isMemorySelected) {
          return (
            <StepMemoryRules
              config={sessionConfig.config}
              difficulty={sessionConfig.difficulty}
              onDifficultyChange={handleDifficultyChange}
              onConfigChange={handleConfigChange}
              linkSensor={sessionConfig.linkSensor}
              onLinkSensorChange={handleLinkSensorChange}
              currentSensorId={currentSensorId}
            />
          );
        }
        if (isSequenceSelected) {
          return (
            <StepSequenceRules
              config={sessionConfig.config}
              difficulty={sessionConfig.difficulty}
              onDifficultyChange={handleDifficultyChange}
              onConfigChange={handleConfigChange}
              sequenceConfig={sequenceConfig}
              onSequenceConfigChange={setSequenceConfig}
              onSequencePlanChange={setSequencePlan}
              cards={deckCards}
            />
          );
        }
        return (
          <StepRules
            config={sessionConfig.config}
            difficulty={sessionConfig.difficulty}
            onDifficultyChange={handleDifficultyChange}
            onConfigChange={handleConfigChange}
            linkSensor={sessionConfig.linkSensor}
            onLinkSensorChange={handleLinkSensorChange}
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
    // El fondo de la app lo pinta SIEMPRE el layout (AppLayout: `bg-background-base`
    // + aurora), garantizado a altura completa por el contenedor raíz `min-h-screen`.
    // Las páginas embebidas en AppLayout NO deben pintar su propio fondo a sangre
    // completa: `min-h-full` (min-height:100%) no resuelve contra el scroll del body
    // —el `motion.div` con `key={pathname}` que envuelve el <Outlet> tiene altura
    // automática—, así que el color colapsaba a la altura del contenido y por debajo
    // asomaba el `background-base` del layout, creando un escalón de color visible.
    // Página transparente = un único fondo continuo en toda la ventana (ADR-205).
    <div className="p-4 lg:p-8">
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
          {getStepDescription(WIZARD_STEPS[currentStep].id, selectedMechanic?.name?.toLowerCase())}
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
              setStepDirection(index < currentStep ? -1 : 1);
              setCurrentStep(index);
            }
          }}
        />
      </div>

      {/* Contenido */}
      <div className="max-w-5xl mx-auto mb-8">
        {/* mode="popLayout" permite que el paso entrante comience su enter
            mientras el saliente aún completa su exit — elimina el flash vacío
            de ~300ms que se veía con mode="wait" en QA 22/04/2026. La duración
            total se acorta a 0.22s: combinada con popLayout produce una
            transición horizontal limpia sin doble tiempo muerto. */}
        <AnimatePresence mode="popLayout" custom={stepDirection}>
          <motion.div
            key={currentStep}
            custom={stepDirection}
            initial={shouldReduceMotion ? false : (d) => ({ opacity: 0, x: d * 24 })}
            animate={{ opacity: 1, x: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : (d) => ({ opacity: 0, x: d * -18 })}
            transition={{ duration: shouldReduceMotion ? 0.12 : 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer navegacion */}
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
              icon={<ChevronLeft size={18} />}
            >
              Anterior
            </ButtonPremium>

            <div className="flex items-center gap-2 text-sm text-text-muted order-last sm:order-none w-full sm:w-auto justify-center">
              Paso {currentStep + 1} de {WIZARD_STEPS.length}
            </div>

            {currentStep === WIZARD_STEPS.length - 1 ? (
              <div className="relative">
                <ButtonPremium
                  onClick={handleCreateSession}
                  disabled={!canProceed(currentStep) || isSubmitting}
                  loading={isSubmitting}
                  icon={<Sparkles size={18} />}
                >
                  Crear Sesión
                </ButtonPremium>
                <InlineSuccessBadge visible={saveBadge.visible} label="Sesión creada" placement="left" />
              </div>
            ) : (
              <ButtonPremium
                onClick={goNext}
                disabled={!canProceed(currentStep)}
                icon={<ChevronRight size={18} />}
                iconPosition="right"
              >
                Siguiente
              </ButtonPremium>
            )}
          </div>
        </GlassCard>
      </motion.div>

      {/* T-957: modal de confirmación al salir con cambios sin guardar.
          Hoy solo se renderiza inerte (no hay botón que invoque
          confirmExit), pero queda preparado para nuevos puntos de salida
          programáticos sin tener que volver a cablearlo. */}
      <ConfirmationModal {...confirmExitModalProps} />
    </div>
  );
}
