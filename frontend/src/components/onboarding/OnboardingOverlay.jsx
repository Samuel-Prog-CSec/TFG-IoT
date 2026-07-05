import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, ArrowRight } from 'lucide-react';
import { cn, EASING } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import ButtonPremium from '../ui/ButtonPremium';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import CharacterMascot from '../game/CharacterMascot';
import { mascotForStep } from './mascotForStep';

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
      // El target puede estar recortado dentro de un ancestro con scroll (p.ej.
      // el nav del sidebar en alturas ≤768px): getBoundingClientRect devuelve
      // coordenadas "de layout" aunque el elemento no sea visible, y el anillo
      // acabaría dibujado sobre otro contenido. Comprobamos también los
      // contenedores con overflow, no solo la ventana.
      const isClipped = () => {
        const r0 = el.getBoundingClientRect();
        if (r0.bottom < 0 || r0.top > window.innerHeight) return true;
        let p = el.parentElement;
        while (p && p !== document.body) {
          const st = getComputedStyle(p);
          if (/auto|scroll|hidden/.test(st.overflowY)) {
            const pr = p.getBoundingClientRect();
            if (r0.top < pr.top - 1 || r0.bottom > pr.bottom + 1) return true;
          }
          p = p.parentElement;
        }
        return false;
      };
      // Scroll instantáneo (no smooth): así la medición inmediatamente
      // posterior ya es correcta y no hay bucles de re-medición a mitad
      // de animación. `nearest` minimiza el salto visual.
      if (isClipped()) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
      setMissing(false);
    };

    measure();
    // P1 plan auditoría Sprint 6 (#12): debounce de resize/scroll. Sin esto
    // `measure()` se llama en cada frame de scroll (~50/s) y un Dashboard con
    // ~30 widgets visibles cuesta 3-5ms paint por llamada → jank en mobile y
    // tablets. 120ms es suficiente para que el spotlight reposicione sin
    // sentir desfase y reduce las llamadas a ~8/s durante un scroll continuo.
    // Listeners passive en scroll (capture=true) — solo lectura.
    let rafScheduled = false;
    let debounceTimer = null;
    const DEBOUNCE_MS = 120;
    const onResize = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
          rafScheduled = false;
          measure();
        });
      }, DEBOUNCE_MS);
    };
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onResize, { capture: true, passive: true });
    // Reintenta tras 200ms por si el elemento se monta tras lazy-load.
    const retryTimer = setTimeout(measure, 200);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, { capture: true });
      if (debounceTimer) clearTimeout(debounceTimer);
      clearTimeout(retryTimer);
    };
  }, [dataTour, isVisible]);

  return { rect, missing };
}

function StepProgress({ track, currentStep }) {
  // Indicador de progreso del onboarding: una barra fina que se llena + un
  // contador "Paso X de Y" visible. Para un usuario no técnico, una afordancia
  // de progreso explícita comunica "esto avanza y sé cuánto queda". Antes había
  // además una fila de puntos que duplicaba esta misma información y usaba el
  // patrón ARIA tablist/tab de forma incorrecta (puntos no interactivos, sin
  // panel asociado); se eliminó para dejar un único indicador limpio. La barra
  // usa `width` con transición que el toggle global de reduced-motion neutraliza.
  const total = track.length;
  const current = Math.min(currentStep + 1, total);
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="w-full flex items-center gap-3">
      <div
        className="flex-1 h-1.5 rounded-full bg-text-disabled/20 overflow-hidden"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-label={`Progreso del tutorial: paso ${current} de ${total}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-base to-accent-indigo transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-text-muted tabular-nums whitespace-nowrap">
        Paso {current} de {total}
      </span>
    </div>
  );
}

StepProgress.propTypes = {
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
 * Otto como guía-narrador del tour: la mascota (`size="sm"`) + un bocadillo
 * A SU LADO con la frase del paso. Compartido por los pasos modal y spotlight
 * para que Otto sea consistente. El bocadillo lo dibuja aquí (no el interno de
 * `CharacterMascot`, que ancla ENCIMA y desbordaría la cabecera). `flip`
 * voltea a Otto en horizontal (señalar a la izquierda) sin tocar el bocadillo.
 * `aria-hidden`: el contenido accesible es el título/descripción del paso.
 */
function MascotGuide({ mood, line, flip = false, isFirstAppearance = false, stacked = false }) {
  return (
    <div
      // `flex-col-reverse` en stacked: el bocadillo (que va DESPUÉS de Otto en el
      // DOM) se pinta ENCIMA → la frase queda arriba y Otto debajo, centrado.
      className={cn('pointer-events-none flex gap-2', stacked ? 'flex-col-reverse items-center' : 'items-center')}
      aria-hidden="true"
    >
      <div
        data-otto-flip={flip ? 'true' : 'false'}
        className="shrink-0"
        style={flip ? { transform: 'scaleX(-1)' } : undefined}
      >
        <CharacterMascot
          mood={mood}
          size="sm"
          position="left"
          isFirstAppearance={isFirstAppearance}
          noBubble
        />
      </div>
      {line && (
        <motion.div
          key={line}
          initial={{ opacity: 0, scale: 0.92, ...(stacked ? { y: -6 } : { x: -6 }) }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
          transition={{ duration: 0.25, ease: EASING.outQuart }}
          className={cn(
            'relative bg-glass-bg backdrop-blur-sm border border-glass-border',
            'rounded-2xl px-3 py-1.5 text-sm font-medium text-text-primary max-w-[14rem]',
            stacked && 'text-center',
          )}
        >
          {line}
          {/* Pico del bocadillo apuntando a Otto: hacia ABAJO y a la IZQUIERDA
              (stacked: bocadillo encima; el pico va a la izquierda por convención
              de cómic, no centrado) o a su izquierda (en línea, spotlight). */}
          <span
            className={cn(
              'absolute size-3 bg-glass-bg rotate-45',
              stacked
                ? 'left-5 -bottom-1.5 border-b border-r border-glass-border'
                : 'top-1/2 -left-1.5 -translate-y-1/2 border-l border-b border-glass-border',
            )}
            aria-hidden="true"
          />
        </motion.div>
      )}
    </div>
  );
}

MascotGuide.propTypes = {
  mood: PropTypes.string.isRequired,
  line: PropTypes.string,
  flip: PropTypes.bool,
  isFirstAppearance: PropTypes.bool,
  stacked: PropTypes.bool,
};

export { MascotGuide };

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
          {/* Saltar: esquina superior derecha en ABSOLUTO → no empuja la
              cabecera, que queda centrada con Otto. La cabecera-guía sigue EN
              FLUJO, así que no tapa "Atrás" ni la nota inferior. */}
          <button
            onClick={onSkip}
            className={cn(
              'absolute top-3 right-3 z-10 p-2 rounded-xl text-text-muted hover:text-text-primary',
              'bg-background-elevated/40 hover:bg-background-elevated/70',
              'border border-border-subtle hover:border-border-default',
              'transition-colors duration-200 focus-ring',
            )}
            aria-label="Saltar tutorial"
          >
            <X size={18} aria-hidden="true" />
          </button>

          {/* Cabecera-guía: Otto + bocadillo, CENTRADOS y apilados (Otto arriba,
              su frase debajo) → Otto queda en el centro de la cabecera. */}
          <div className="flex justify-center mb-3">
            <MascotGuide
              mood={mascotConfig.mood}
              line={mascotConfig.line}
              isFirstAppearance={currentStep === 0}
              stacked
            />
          </div>

          <div className="min-h-[220px] flex flex-col items-center justify-center text-center">
            <div className="flex flex-col items-center gap-4 px-2">
              {/* Icono temático PEQUEÑO junto al título (conserva la pista de
                  tema; Otto pasa a ser el ancla visual de la cabecera). */}
              <h2 className="flex items-center gap-2 text-2xl font-bold text-text-primary font-display leading-tight">
                {step.icon && (
                  <span
                    className={cn(
                      'inline-flex items-center justify-center size-8 rounded-lg border shrink-0',
                      step.variant === 'warning'
                        ? 'bg-warning-base/15 border-warning-base/30 text-warning-base'
                        : 'bg-brand-base/15 border-brand-base/30 text-brand-base',
                    )}
                    aria-hidden="true"
                  >
                    <step.icon size={18} strokeWidth={1.75} />
                  </span>
                )}
                {step.title}
              </h2>
              <p className="text-text-secondary text-base leading-relaxed max-w-md">
                {step.description}
              </p>
            </div>
          </div>

          <div className="mt-6 mb-6">
            <StepProgress track={Array.from({ length: totalSteps })} currentStep={currentStep} />
          </div>

          <NavButtons
            isFirstStep={isFirstStep}
            isLastStep={isLastStep}
            onPrev={onPrev}
            onNext={onNext}
            onComplete={onComplete}
          />

          <p className="text-center mt-4 text-xs text-text-muted">
            Puedes volver a ver el tutorial desde la barra lateral en cualquier momento.
          </p>
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

// Altura estimada del tooltip (Otto + título + descripción + progreso +
// botones). Se usa para clamparlo al viewport: en pantallas bajas (720-768px)
// un tooltip sin clamp dejaba el botón "Siguiente" por debajo del fold y el
// tour quedaba inusable con ratón.
const TOOLTIP_EST_HEIGHT = 420;

function clampTooltipTop(top, vh) {
  const maxTop = vh - Math.min(TOOLTIP_EST_HEIGHT, vh - 16) - 8;
  return Math.max(8, Math.min(top, maxTop));
}

function calculateTooltipPosition(rect) {
  if (!rect) return { left: 0, top: 0, side: 'right' };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Por defecto el tooltip va a la derecha del target. Si no cabe, se
  // posiciona a la izquierda; si tampoco cabe, debajo (siempre clampado
  // al viewport para que los controles queden alcanzables).
  if (rect.left + rect.width + TOOLTIP_OFFSET + TOOLTIP_WIDTH < vw) {
    return {
      left: rect.left + rect.width + TOOLTIP_OFFSET,
      top: clampTooltipTop(rect.top, vh),
      side: 'right',
    };
  }
  if (rect.left - TOOLTIP_OFFSET - TOOLTIP_WIDTH > 0) {
    return {
      left: rect.left - TOOLTIP_OFFSET - TOOLTIP_WIDTH,
      top: clampTooltipTop(rect.top, vh),
      side: 'left',
    };
  }
  return {
    left: Math.max(16, Math.min(rect.left, vw - TOOLTIP_WIDTH - 16)),
    top: clampTooltipTop(rect.top + rect.height + TOOLTIP_OFFSET, vh),
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

  // Otto guía también en spotlight, orientado hacia el elemento resaltado:
  //  - tooltip a la DERECHA del target (side 'right') → target a su izquierda → flip.
  //  - tooltip DEBAJO (side 'bottom') → target arriba → mirada pensativa (el brazo
  //    lateral no aplica).
  const mascotConfig = mascotForStep(step, currentStep, totalSteps);
  let mascotMood = mascotConfig.mood;
  let mascotFlip = false;
  if (tooltip.side === 'right') mascotFlip = true;
  else if (tooltip.side === 'bottom') mascotMood = 'thinking';

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

          {/* Cabecera-guía: Otto señalando el elemento real resaltado. */}
          <div className="mb-2 pr-6">
            <MascotGuide mood={mascotMood} line={mascotConfig.line} flip={mascotFlip} />
          </div>

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
            <StepProgress track={Array.from({ length: totalSteps })} currentStep={currentStep} />
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
