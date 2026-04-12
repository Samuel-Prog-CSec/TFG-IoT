import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import ButtonPremium from '../ui/ButtonPremium';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @fileoverview Overlay de onboarding para profesores nuevos.
 * Muestra 4 pasos guiados explicando como funciona la plataforma EduPlay.
 * Se puede omitir en cualquier momento.
 */

const STEPS = [
  {
    emoji: '\uD83C\uDF93',
    title: '\u00A1Bienvenido a EduPlay!',
    description:
      'EduPlay es tu plataforma de juegos educativos con tecnolog\u00EDa RFID. Crea experiencias de aprendizaje interactivas para tus alumnos de forma sencilla y divertida.',
  },
  {
    emoji: '\uD83C\uDFA8',
    title: 'Explora los Contextos',
    description:
      'Los contextos son los temas de tus juegos: animales, colores, n\u00FAmeros, geograf\u00EDa\u2026 Cada contexto tiene im\u00E1genes y audios que tus alumnos ver\u00E1n durante el juego.',
  },
  {
    emoji: '\uD83C\uDCCF',
    title: 'Crea tu primer Mazo',
    description:
      'Los mazos son colecciones de tarjetas RFID vinculadas a un contexto. Cada tarjeta se asocia a un contenido educativo. Escanea las tarjetas f\u00EDsicas o cr\u00E9alas manualmente.',
  },
  {
    emoji: '\uD83D\uDE80',
    title: '\u00A1Lanza una Sesi\u00F3n!',
    description:
      'Configura una sesi\u00F3n de juego eligiendo un mazo, una mec\u00E1nica (asociaci\u00F3n o memoria) y las reglas. Tus alumnos jugar\u00E1n pasando tarjetas RFID por el lector. \u00A1As\u00ED de f\u00E1cil!',
  },
];

// --- Variantes de animacion ---

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
};

const panelVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 24 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 16,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },
};

const stepVariants = {
  enter: (direction) => ({
    opacity: 0,
    x: direction > 0 ? 60 : -60,
    scale: 0.96,
  }),
  center: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
  exit: (direction) => ({
    opacity: 0,
    x: direction > 0 ? -60 : 60,
    scale: 0.96,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  }),
};

// Variantes sin movimiento para accesibilidad
const reducedBackdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const reducedPanelVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const reducedStepVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * Overlay de onboarding a pantalla completa con 4 pasos guiados.
 *
 * @param {Object} props
 * @param {boolean} props.isVisible - Si se muestra el overlay
 * @param {number} props.currentStep - Paso actual (0-indexed)
 * @param {number} props.totalSteps - Total de pasos
 * @param {Function} props.onNext - Avanzar al siguiente paso
 * @param {Function} props.onPrev - Retroceder al paso anterior
 * @param {Function} props.onComplete - Completar el onboarding
 * @param {Function} props.onSkip - Omitir el onboarding
 */
export default function OnboardingOverlay({
  isVisible,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onComplete,
  onSkip,
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const isLastStep = currentStep >= totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const step = STEPS[currentStep] || STEPS[0];

  // Direccion de la transicion: 1 = adelante, -1 = atras
  // Se usa como custom prop para AnimatePresence
  const direction = 1;

  const bVariants = shouldReduceMotion ? reducedBackdropVariants : backdropVariants;
  const pVariants = shouldReduceMotion ? reducedPanelVariants : panelVariants;
  const sVariants = shouldReduceMotion ? reducedStepVariants : stepVariants;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="onboarding-backdrop"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md"
          variants={bVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          aria-hidden="true"
        >
          {/* Panel central */}
          <motion.div
            className="relative w-full max-w-lg mx-4"
            variants={pVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-label="Tutorial de bienvenida a EduPlay"
          >
            <GlassCard variant="solid" padding="lg" className="relative overflow-visible">
              {/* Boton de omitir (esquina superior derecha) */}
              <button
                onClick={onSkip}
                className={cn(
                  'absolute top-4 right-4 z-20',
                  'p-2 rounded-xl',
                  'text-text-muted hover:text-text-primary',
                  'bg-background-elevated/40 hover:bg-background-elevated/70',
                  'border border-border-subtle hover:border-border-default',
                  'transition-colors duration-200',
                  'focus-ring'
                )}
                aria-label="Omitir tutorial"
              >
                <X size={18} aria-hidden="true" />
              </button>

              {/* Contenido del paso */}
              <div className="min-h-[280px] flex flex-col items-center justify-center text-center pt-2">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={`step-${currentStep}`}
                    custom={direction}
                    variants={sVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="flex flex-col items-center gap-5 px-2"
                  >
                    {/* Emoji decorativo */}
                    <div
                      className={cn(
                        'flex items-center justify-center',
                        'size-20 rounded-2xl',
                        'bg-gradient-to-br from-brand-base/20 to-accent-indigo/20',
                        'border border-brand-base/30',
                        'shadow-[0_0_30px_var(--color-brand-glow)]',
                        'text-4xl select-none'
                      )}
                      aria-hidden="true"
                    >
                      {step.emoji}
                    </div>

                    {/* Titulo */}
                    <h2 className="text-2xl font-bold text-text-primary font-display leading-tight">
                      {step.title}
                    </h2>

                    {/* Descripcion */}
                    <p className="text-text-secondary text-base leading-relaxed max-w-md">
                      {step.description}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Indicador de pasos (dots) */}
              <div
                className="flex items-center justify-center gap-2 mt-6 mb-6"
                role="tablist"
                aria-label="Pasos del tutorial"
              >
                {Array.from({ length: totalSteps }, (_, i) => (
                  <div
                    key={`dot-${i}`}
                    role="tab"
                    aria-selected={i === currentStep}
                    aria-label={`Paso ${i + 1} de ${totalSteps}`}
                    className={cn(
                      'rounded-full transition-[width,background-color,box-shadow] duration-300',
                      i === currentStep
                        ? 'w-8 h-2.5 bg-gradient-to-r from-brand-base to-accent-indigo shadow-[0_0_12px_var(--color-brand-glow)]'
                        : 'w-2.5 h-2.5 bg-text-disabled/40 hover:bg-text-muted/50'
                    )}
                  />
                ))}
              </div>

              {/* Botones de navegacion */}
              <div className="flex items-center justify-between gap-3">
                {/* Boton Atras */}
                <div className="w-28">
                  {!isFirstStep && (
                    <ButtonPremium
                      variant="ghost"
                      size="sm"
                      onClick={onPrev}
                      icon={<ChevronLeft size={18} aria-hidden="true" />}
                      aria-label="Paso anterior"
                    >
                      Atr\u00E1s
                    </ButtonPremium>
                  )}
                </div>

                {/* Boton Siguiente / Empezar */}
                <div className="flex-1 flex justify-end">
                  {isLastStep ? (
                    <ButtonPremium
                      variant="primary"
                      size="md"
                      onClick={onComplete}
                      icon={<ArrowRight size={18} aria-hidden="true" />}
                      iconPosition="right"
                    >
                      Empezar a usar EduPlay
                    </ButtonPremium>
                  ) : (
                    <ButtonPremium
                      variant="primary"
                      size="sm"
                      onClick={onNext}
                      icon={<ChevronRight size={18} aria-hidden="true" />}
                      iconPosition="right"
                      aria-label="Siguiente paso"
                    >
                      Siguiente
                    </ButtonPremium>
                  )}
                </div>
              </div>

              {/* Texto de omitir debajo */}
              <p className="text-center mt-4 text-xs text-text-disabled">
                Puedes volver a ver este tutorial desde la configuraci\u00F3n
              </p>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

OnboardingOverlay.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  currentStep: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
  onNext: PropTypes.func.isRequired,
  onPrev: PropTypes.func.isRequired,
  onComplete: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
};
