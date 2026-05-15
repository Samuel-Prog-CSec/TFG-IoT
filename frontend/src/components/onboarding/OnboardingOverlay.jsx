import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import ButtonPremium from '../ui/ButtonPremium';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import CharacterMascot from '../game/CharacterMascot';

/**
 * @fileoverview Overlay de onboarding multi-track (T-951 Fase 4).
 *
 * Soporta dos tipos de paso:
 *  - `'modal'`     — panel centrado tradicional (como la versión 0.5.0).
 *  - `'spotlight'` — recorta visualmente un elemento real de la UI
 *                    (referenciado por `data-tour="<key>"`) con un
 *                    "agujero" rectangular sobre el target y un tooltip
 *                    apuntador con la explicación.
 *
 * El usuario puede saltar el tour, navegar entre pasos y volver. La
 * persistencia y la lógica de "qué paso toca ahora" viven en el hook
 * `useOnboarding` — este componente solo renderiza el paso activo.
 */

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_OFFSET = 16;
const TOOLTIP_WIDTH = 360;

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};

const panelVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 24 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 },
  },
  exit: { opacity: 0, scale: 0.95, y: 16, transition: { duration: 0.25 } },
};

const reducedVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

function useTargetRect(dataTour, isVisible) {
  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!isVisible || !dataTour) {
      setRect(null);
      setMissing(false);
      return undefined;
    }

    const findTarget = () =>
      document.querySelector(`[data-tour="${dataTour}"]`);

    const measure = () => {
      const el = findTarget();
      if (!el) {
        setRect(null);
        setMissing(true);
        return;
      }
      const r = el.getBoundingClientRect();
      // Si el target está fuera de viewport, intentamos hacer scrollIntoView
      // antes de mostrar el spotlight.
      if (r.bottom < 0 || r.top > window.innerHeight) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
      setMissing(false);
    };

    measure();
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    // Reintenta tras 200ms por si el elemento se monta tras lazy-load.
    const retryTimer = setTimeout(measure, 200);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      clearTimeout(retryTimer);
    };
  }, [dataTour, isVisible]);

  return { rect, missing };
}

function StepIcon({ Icon, variant }) {
  if (!Icon) return null;
  const tint =
    variant === 'warning'
      ? 'from-warning-base/25 to-accent-orange/20 border-warning-base/40 text-warning-base'
      : 'from-brand-base/20 to-accent-indigo/20 border-brand-base/30 text-brand-base';
  const glow =
    variant === 'warning'
      ? 'shadow-[0_0_30px_var(--color-warning-glow)]'
      : 'shadow-[var(--shadow-glow)]';

  return (
    <div
      className={cn(
        'flex items-center justify-center size-20 rounded-2xl',
        'bg-gradient-to-br border',
        tint,
        glow,
      )}
      aria-hidden="true"
    >
      <Icon size={40} strokeWidth={1.75} />
    </div>
  );
}

StepIcon.propTypes = {
  Icon: PropTypes.elementType,
  variant: PropTypes.string,
};

function StepDots({ track, currentStep }) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="tablist"
      aria-label="Pasos del tutorial"
    >
      {track.map((_, i) => (
        <div
          key={`dot-${i}`}
          role="tab"
          aria-selected={i === currentStep}
          aria-label={`Paso ${i + 1} de ${track.length}`}
          className={cn(
            'rounded-full transition-[width,background-color,box-shadow] duration-300',
            i === currentStep
              ? 'w-8 h-2.5 bg-gradient-to-r from-brand-base to-accent-indigo shadow-[0_0_12px_var(--color-brand-glow)]'
              : 'w-2.5 h-2.5 bg-text-disabled/40 hover:bg-text-muted/50',
          )}
        />
      ))}
    </div>
  );
}

StepDots.propTypes = {
  track: PropTypes.array.isRequired,
  currentStep: PropTypes.number.isRequired,
};

function NavButtons({ isFirstStep, isLastStep, onPrev, onNext, onComplete }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="w-28">
        {!isFirstStep && (
          <ButtonPremium
            variant="ghost"
            size="sm"
            onClick={onPrev}
            icon={<ChevronLeft size={18} aria-hidden="true" />}
            aria-label="Paso anterior"
          >
            Atrás
          </ButtonPremium>
        )}
      </div>
      <div className="flex-1 flex justify-end">
        {isLastStep ? (
          <ButtonPremium
            variant="primary"
            size="md"
            onClick={onComplete}
            icon={<ArrowRight size={18} aria-hidden="true" />}
            iconPosition="right"
          >
            Empezar
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
  );
}

NavButtons.propTypes = {
  isFirstStep: PropTypes.bool.isRequired,
  isLastStep: PropTypes.bool.isRequired,
  onPrev: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  onComplete: PropTypes.func.isRequired,
};

/**
 * Calcula `mood` y `message` de la mascota para un paso del tour.
 * Reglas:
 *  - Step 1 (modal de bienvenida) → `idle` con `isFirstAppearance` y
 *    saludo "¡Bienvenido!".
 *  - Último step → `celebrating` con "¡A jugar!".
 *  - Resto modales narrativos → `pointing` apuntando al texto del step,
 *    con un fragmento corto del título como burbuja.
 */
function mascotForStep(step, currentStep, totalSteps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;
  if (isFirst) {
    return { mood: 'idle', message: '¡Hola!', isFirstAppearance: true };
  }
  if (isLast) {
    return { mood: 'celebrating', message: '¡Vamos!', isFirstAppearance: false };
  }
  // Para steps intermedios usamos un fragmento del título cuando es
  // breve, si no, una frase neutra. Evita que la burbuja recorte
  // títulos largos como "Tres mecánicas, tres asistentes".
  const title = step?.title || '';
  const message = title.length > 0 && title.length <= 22 ? title : 'Mira aquí';
  return { mood: 'pointing', message, isFirstAppearance: false };
}

function ModalStep({ step, currentStep, totalSteps, isFirstStep, isLastStep, onPrev, onNext, onComplete, onSkip, shouldReduceMotion }) {
  const variants = shouldReduceMotion ? reducedVariants : panelVariants;
  const mascotConfig = mascotForStep(step, currentStep, totalSteps);
  return (
    <motion.div
      key="onboarding-backdrop"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-backdrop backdrop-blur-md"
      variants={shouldReduceMotion ? reducedVariants : backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="relative w-full max-w-lg mx-4"
        variants={variants}
        initial="hidden"
        animate="visible"
        exit="exit"
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
      >
        <GlassCard variant="solid" padding="lg" className="relative overflow-visible">
          <button
            onClick={onSkip}
            className={cn(
              'absolute top-4 right-4 z-20 p-2 rounded-xl',
              'text-text-muted hover:text-text-primary',
              'bg-background-elevated/40 hover:bg-background-elevated/70',
              'border border-border-subtle hover:border-border-default',
              'transition-colors duration-200 focus-ring',
            )}
            aria-label="Saltar tutorial"
          >
            <X size={18} aria-hidden="true" />
          </button>

          <div className="min-h-[280px] flex flex-col items-center justify-center text-center pt-2">
            <div className="flex flex-col items-center gap-5 px-2">
              <StepIcon Icon={step.icon} variant={step.variant} />
              <h2 className="text-2xl font-bold text-text-primary font-display leading-tight">
                {step.title}
              </h2>
              <p className="text-text-secondary text-base leading-relaxed max-w-md">
                {step.description}
              </p>
            </div>
          </div>

          <div className="mt-6 mb-6">
            <StepDots track={Array.from({ length: totalSteps })} currentStep={currentStep} />
          </div>

          <NavButtons
            isFirstStep={isFirstStep}
            isLastStep={isLastStep}
            onPrev={onPrev}
            onNext={onNext}
            onComplete={onComplete}
          />

          <p className="text-center mt-4 text-xs text-text-disabled">
            Puedes volver a ver el tutorial desde la barra lateral en cualquier momento.
          </p>

          {/* Mascota guía (T-953 Fase 2.9) — esquina inferior izquierda
              del card. NO compite con el StepIcon hero porque vive
              fuera del flow vertical principal y a tamaño reducido.
              `aria-hidden` para que VoiceOver no anuncie dos veces el
              mismo título (la mascota repite con la burbuja). */}
          <div
            aria-hidden="true"
            className="absolute -left-2 -bottom-4 sm:-left-6 sm:-bottom-8 pointer-events-none"
          >
            <div className="scale-75 sm:scale-90 origin-bottom-left">
              <CharacterMascot
                mood={mascotConfig.mood}
                message={mascotConfig.message}
                position="left"
                isFirstAppearance={mascotConfig.isFirstAppearance}
              />
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </motion.div>
  );
}

ModalStep.propTypes = {
  step: PropTypes.object.isRequired,
  currentStep: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
  isFirstStep: PropTypes.bool.isRequired,
  isLastStep: PropTypes.bool.isRequired,
  onPrev: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  onComplete: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
  shouldReduceMotion: PropTypes.bool.isRequired,
};

function calculateTooltipPosition(rect) {
  if (!rect) return { left: 0, top: 0, side: 'right' };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Por defecto el tooltip va a la derecha del target. Si no cabe, se
  // posiciona a la izquierda; si tampoco cabe, debajo.
  if (rect.left + rect.width + TOOLTIP_OFFSET + TOOLTIP_WIDTH < vw) {
    return {
      left: rect.left + rect.width + TOOLTIP_OFFSET,
      top: Math.min(Math.max(rect.top, 16), vh - 320),
      side: 'right',
    };
  }
  if (rect.left - TOOLTIP_OFFSET - TOOLTIP_WIDTH > 0) {
    return {
      left: rect.left - TOOLTIP_OFFSET - TOOLTIP_WIDTH,
      top: Math.min(Math.max(rect.top, 16), vh - 320),
      side: 'left',
    };
  }
  return {
    left: Math.max(16, Math.min(rect.left, vw - TOOLTIP_WIDTH - 16)),
    top: rect.top + rect.height + TOOLTIP_OFFSET,
    side: 'bottom',
  };
}

function SpotlightStep({ step, currentStep, totalSteps, isFirstStep, isLastStep, onPrev, onNext, onComplete, onSkip, shouldReduceMotion }) {
  const { rect, missing } = useTargetRect(step.dataTour, true);

  // Si no encontramos el target (responsive cambio, lazy-load), caemos
  // de vuelta al modo modal para no romper el flujo del tour.
  if (missing || !rect) {
    return (
      <ModalStep
        step={step}
        currentStep={currentStep}
        totalSteps={totalSteps}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        onPrev={onPrev}
        onNext={onNext}
        onComplete={onComplete}
        onSkip={onSkip}
        shouldReduceMotion={shouldReduceMotion}
      />
    );
  }

  const padded = {
    top: rect.top - SPOTLIGHT_PADDING,
    left: rect.left - SPOTLIGHT_PADDING,
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
  const tooltip = calculateTooltipPosition(padded);

  return (
    <motion.div
      key="onboarding-spotlight"
      className="fixed inset-0 z-[60] pointer-events-none"
      variants={shouldReduceMotion ? reducedVariants : backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* 4 overlays que rodean el target dejándolo visible en su sitio.
          Usan el token --color-backdrop con backdrop-blur para que la
          intensidad del oscurecido se adapte por tema. */}
      <div
        className="absolute bg-backdrop pointer-events-auto"
        style={{ top: 0, left: 0, right: 0, height: padded.top }}
        onClick={onSkip}
        aria-hidden="true"
      />
      <div
        className="absolute bg-backdrop pointer-events-auto"
        style={{ top: padded.top, left: 0, width: padded.left, height: padded.height }}
        onClick={onSkip}
        aria-hidden="true"
      />
      <div
        className="absolute bg-backdrop pointer-events-auto"
        style={{
          top: padded.top,
          left: padded.left + padded.width,
          right: 0,
          height: padded.height,
        }}
        onClick={onSkip}
        aria-hidden="true"
      />
      <div
        className="absolute bg-backdrop pointer-events-auto"
        style={{ top: padded.top + padded.height, left: 0, right: 0, bottom: 0 }}
        onClick={onSkip}
        aria-hidden="true"
      />

      {/* Anillo de resaltado alrededor del target — comunica "esto es lo
          que te estoy contando" sin tapar el contenido. */}
      <div
        className="absolute rounded-2xl ring-2 ring-brand-base shadow-[0_0_30px_var(--color-brand-glow)] pointer-events-none"
        style={{
          top: padded.top,
          left: padded.left,
          width: padded.width,
          height: padded.height,
        }}
        aria-hidden="true"
      />

      {/* Tooltip apuntador — posicionado al lado del target en función
          del espacio disponible (right/left/bottom). */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        className="absolute pointer-events-auto"
        style={{
          top: tooltip.top,
          left: tooltip.left,
          width: TOOLTIP_WIDTH,
        }}
      >
        <GlassCard variant="solid" padding="md" className="relative">
          <button
            onClick={onSkip}
            className={cn(
              'absolute top-3 right-3 p-1.5 rounded-lg',
              'text-text-muted hover:text-text-primary',
              'bg-background-elevated/40 hover:bg-background-elevated/70',
              'border border-border-subtle hover:border-border-default',
              'transition-colors duration-200 focus-ring',
            )}
            aria-label="Saltar tutorial"
          >
            <X size={14} aria-hidden="true" />
          </button>

          <div className="flex flex-col gap-3 pt-1 pr-6">
            <div className="flex items-center gap-3">
              {step.icon && (
                <div
                  className={cn(
                    'flex items-center justify-center size-10 rounded-xl',
                    'bg-brand-base/15 border border-brand-base/30 text-brand-base',
                  )}
                  aria-hidden="true"
                >
                  <step.icon size={20} strokeWidth={1.75} />
                </div>
              )}
              <h3 className="text-base font-semibold text-text-primary font-display leading-tight">
                {step.title}
              </h3>
            </div>
            <p className="text-text-secondary text-sm leading-relaxed">
              {step.description}
            </p>
          </div>

          <div className="mt-4 mb-3">
            <StepDots track={Array.from({ length: totalSteps })} currentStep={currentStep} />
          </div>

          <NavButtons
            isFirstStep={isFirstStep}
            isLastStep={isLastStep}
            onPrev={onPrev}
            onNext={onNext}
            onComplete={onComplete}
          />
        </GlassCard>
      </div>
    </motion.div>
  );
}

SpotlightStep.propTypes = {
  step: PropTypes.object.isRequired,
  currentStep: PropTypes.number.isRequired,
  totalSteps: PropTypes.number.isRequired,
  isFirstStep: PropTypes.bool.isRequired,
  isLastStep: PropTypes.bool.isRequired,
  onPrev: PropTypes.func.isRequired,
  onNext: PropTypes.func.isRequired,
  onComplete: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
  shouldReduceMotion: PropTypes.bool.isRequired,
};

export default function OnboardingOverlay({
  isVisible,
  currentStep,
  track,
  onNext,
  onPrev,
  onComplete,
  onSkip,
}) {
  const { shouldReduceMotion } = useReducedMotion();

  // Esc para saltar el tour — patrón estándar de modales.
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onSkip();
    },
    [onSkip],
  );

  useEffect(() => {
    if (!isVisible) return undefined;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, handleKeyDown]);

  if (!track || track.length === 0) return null;

  const totalSteps = track.length;
  const safeStep = Math.min(Math.max(currentStep, 0), totalSteps - 1);
  const step = track[safeStep];
  const isFirstStep = safeStep === 0;
  const isLastStep = safeStep >= totalSteps - 1;

  const content = (
    <AnimatePresence mode="wait">
      {isVisible && step.type === 'spotlight' && (
        <SpotlightStep
          step={step}
          currentStep={safeStep}
          totalSteps={totalSteps}
          isFirstStep={isFirstStep}
          isLastStep={isLastStep}
          onPrev={onPrev}
          onNext={onNext}
          onComplete={onComplete}
          onSkip={onSkip}
          shouldReduceMotion={shouldReduceMotion}
        />
      )}
      {isVisible && step.type !== 'spotlight' && (
        <ModalStep
          step={step}
          currentStep={safeStep}
          totalSteps={totalSteps}
          isFirstStep={isFirstStep}
          isLastStep={isLastStep}
          onPrev={onPrev}
          onNext={onNext}
          onComplete={onComplete}
          onSkip={onSkip}
          shouldReduceMotion={shouldReduceMotion}
        />
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

OnboardingOverlay.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  currentStep: PropTypes.number.isRequired,
  track: PropTypes.array.isRequired,
  onNext: PropTypes.func.isRequired,
  onPrev: PropTypes.func.isRequired,
  onComplete: PropTypes.func.isRequired,
  onSkip: PropTypes.func.isRequired,
};
