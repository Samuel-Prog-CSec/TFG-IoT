/**
 * @fileoverview Componente WizardStepper - Stepper visual premium para wizards multi-paso
 * Incluye animaciones de progreso fluido, iconos que se transforman al completar,
 * y efectos visuales de celebración.
 * 
 * @module components/ui/WizardStepper
 */

import { m as motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { memo, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';

const PARTICLE_VECTORS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 }
];

const stepShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  title: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  description: PropTypes.string,
});

const getStepState = ({ index, currentStep, allowNavigation }) => {
  const isActive = index === currentStep;
  const isCompleted = index < currentStep;
  return {
    isActive,
    isCompleted,
    isClickable: allowNavigation && isCompleted,
  };
};

const getStepButtonClassName = ({ isActive, isCompleted, isClickable }) =>
  cn(
    'size-10 rounded-full flex items-center justify-center',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-300 border-2 relative z-10',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-background-base',
    isActive && 'bg-accent-indigo border-accent-indigo text-text-primary shadow-lg shadow-accent-indigo/40',
    isCompleted && 'bg-success-base border-success-base text-text-primary',
    !isActive && !isCompleted && 'bg-background-base border-background-surface text-text-disabled',
    isClickable && 'cursor-pointer hover:scale-110 hover:shadow-success-base/30 hover:shadow-lg',
    !isClickable && !isActive && 'cursor-default'
  );

const getStepPulseAnimation = ({ reducedMotion, isActive }) => {
  if (reducedMotion || !isActive) {
    return {};
  }

  return {
    scale: [1, 1.05, 1],
    // TOKEN-EXCEPTION: Framer Motion boxShadow interpolation requires direct color values
    boxShadow: [
      '0 0 0 0 rgba(99, 102, 241, 0)',
      '0 0 20px 4px rgba(99, 102, 241, 0.4)',
      '0 0 0 0 rgba(99, 102, 241, 0)',
    ],
  };
};

const getStepPulseTransition = ({ reducedMotion, isActive }) => {
  if (reducedMotion || !isActive) {
    return {};
  }

  return {
    duration: 2,
    repeat: Infinity,
    ease: 'easeInOut',
  };
};

const getStepLabelClassName = ({ isActive, isCompleted }) =>
  // BUG-A11Y-STEPPER-LABEL (QA Sprint 0 post-v0.5.0): text-text-disabled
  // sobre bg light daba 2.37:1 en pasos futuros. text-text-muted cumple AA.
  cn(
    'text-xs font-medium uppercase tracking-wider transition-colors duration-300',
    isActive && 'text-accent-indigo',
    isCompleted && 'text-success-base',
    !isActive && !isCompleted && 'text-text-muted'
  );

function WizardStepItem({
  step,
  index,
  currentStep,
  allowNavigation,
  onStepClick,
  reducedMotion
}) {
  const { isActive, isCompleted, isClickable } = getStepState({
    index,
    currentStep,
    allowNavigation,
  });

  const handleStepClick = () => {
    if (!isClickable || !onStepClick) {
      return;
    }
    onStepClick(index);
  };

  let stepStateLabel = '';
  if (isCompleted) {
    stepStateLabel = ' (completado)';
  } else if (isActive) {
    stepStateLabel = ' (actual)';
  }

  return (
    <motion.div
      className="flex flex-col items-center gap-2 relative"
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reducedMotion ? 0 : index * 0.1 }}
    >
      <motion.button
        type="button"
        onClick={handleStepClick}
        disabled={!isClickable}
        // BUG-A11Y-STEPPER-BUTTON (QA Sprint 0): el botón sólo tenía icono,
        // sin nombre accesible. Añadir aria-label compuesto desde título +
        // estado.
        aria-label={`Paso ${index + 1}: ${step.title}${stepStateLabel}`}
        aria-current={isActive ? 'step' : undefined}
        className={getStepButtonClassName({ isActive, isCompleted, isClickable })}
        whileHover={isClickable ? { scale: 1.1 } : {}}
        whileTap={isClickable ? { scale: 0.95 } : {}}
        animate={getStepPulseAnimation({ reducedMotion, isActive })}
        transition={getStepPulseTransition({ reducedMotion, isActive })}
      >
        <AnimatePresence mode="wait">
          {isCompleted ? (
            <motion.div
              key="check"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            >
              <Check size={18} strokeWidth={3} />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              <step.icon size={18} />
            </motion.div>
          )}
        </AnimatePresence>

        {isActive && !reducedMotion && (
          <motion.div
            className="absolute inset-0 rounded-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {PARTICLE_VECTORS.map((vector, particleIndex) => (
              <motion.div
                key={`${step.id}-${particleIndex}`}
                className="absolute size-1.5 bg-accent-indigo rounded-full"
                style={{ top: '50%', left: '50%' }}
                animate={{
                  x: [0, vector.x * 20],
                  y: [0, vector.y * 20],
                  opacity: [1, 0],
                  scale: [1, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: particleIndex * 0.2,
                  ease: 'easeOut',
                }}
              />
            ))}
          </motion.div>
        )}
      </motion.button>

      <motion.span
        className={getStepLabelClassName({ isActive, isCompleted })}
        animate={!reducedMotion && isActive ? { scale: [1, 1.05, 1] } : {}}
        transition={!reducedMotion && isActive ? { duration: 2, repeat: Infinity } : {}}
      >
        {step.title}
      </motion.span>

      {step.description && (
        // BUG-A11Y-STEPPER-DESC (QA Sprint 0): text-text-disabled daba 2.37
        // en light. text-text-muted cumple AA y sigue siendo terciario.
        <span className="text-nano text-text-muted max-w-[80px] text-center hidden sm:block">
          {step.description}
        </span>
      )}
    </motion.div>
  );
}

WizardStepItem.propTypes = {
  step: stepShape.isRequired,
  index: PropTypes.number.isRequired,
  currentStep: PropTypes.number.isRequired,
  allowNavigation: PropTypes.bool.isRequired,
  onStepClick: PropTypes.func,
  reducedMotion: PropTypes.bool.isRequired,
};

/**
 * @typedef {Object} Step
 * @property {number} id - ID único del paso (1-indexed)
 * @property {string} title - Título del paso
 * @property {React.ComponentType} icon - Componente icono de Lucide
 * @property {string} [description] - Descripción opcional del paso
 */

/**
 * WizardStepper - Stepper visual con animaciones premium
 * 
 * @param {Object} props
 * @param {Step[]} props.steps - Array de pasos del wizard
 * @param {number} props.currentStep - Paso actual (1-indexed)
 * @param {Function} [props.onStepClick] - Callback al hacer click en un paso completado
 * @param {boolean} [props.allowNavigation=false] - Permitir click en pasos anteriores
 * @param {string} [props.className] - Clases adicionales
 * 
 * @example
 * ```jsx
 * <WizardStepper
 *   steps={[
 *     { id: 1, title: "Tarjetas", icon: CreditCard },
 *     { id: 2, title: "Contexto", icon: Map },
 *     { id: 3, title: "Recursos", icon: Tag },
 *     { id: 4, title: "Confirmar", icon: Check },
 *   ]}
 *   currentStep={2}
 *   onStepClick={(stepId) => setStep(stepId)}
 *   allowNavigation
 * />
 * ```
 */
const WizardStepper = memo(function WizardStepper({
  steps,
  currentStep,
  onStepClick,
  allowNavigation = false,
  reducedMotion = false,
  className,
}) {
  const isLastStep = currentStep >= steps.length - 1;
  const wasLastStep = useRef(false);

  // Track último paso para posible uso futuro (confetti movido al callback de éxito real)
  useEffect(() => {
    if (isLastStep) {
      wasLastStep.current = true;
    }
    if (!isLastStep) {
      wasLastStep.current = false;
    }
  }, [isLastStep]);

  // Calcular progreso
  const totalSteps = Math.max(steps.length - 1, 1);
  const progress = (currentStep / totalSteps) * 100;

  // Cada item ocupa una fracción igual del contenedor (`grid` en lugar de
  // `flex justify-between`). Eso garantiza que los centros de los círculos
  // queden equidistantes y que la línea de fondo + progreso, anclados a los
  // centros del primer y último botón, coincidan exactamente con cada
  // círculo intermedio (QA 26/04/2026: antes la línea se quedaba ~28px corta
  // del segundo círculo porque `left-5/right-5` asumía que los items
  // extremos no tenían labels más anchos que el icono).
  // `halfStepPercent = 50 / N` deja al primer círculo a `50/N %` desde el
  // borde izquierdo del contenedor (centro de su columna), y al último a la
  // misma distancia del borde derecho.
  const halfStepPercent = useMemo(() => 50 / Math.max(steps.length, 1), [steps.length]);
  const lineInset = `${halfStepPercent}%`;
  const stepsGridStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }),
    [steps.length]
  );

  const handleStepClick = (stepIndex) => onStepClick?.(stepIndex);

  return (
    <div className={cn('relative', className)}>
      {/* Línea de fondo. `left/right` se calcula dinámicamente para anclar
          la línea al centro del primer/último círculo (no al borde del
          contenedor), de modo que `width: progress%` aterrice exactamente
          en cada círculo intermedio. */}
      <div
        className="absolute top-5 h-1 bg-background-elevated/60 rounded-full overflow-hidden"
        style={{ left: lineInset, right: lineInset }}
      >
        {/* Línea de progreso con efecto de fluido */}
        <motion.div
          className="h-full rounded-full relative"
          initial={false}
          animate={{ width: `${progress}%` }}
          transition={{
            duration: reducedMotion ? 0.15 : 0.25,
            ease: [0.32, 0.72, 0, 1],
          }}
          style={{
            background: 'linear-gradient(90deg, var(--color-accent-indigo) 0%, var(--color-brand-base) 50%, var(--color-accent-pink) 100%)',
          }}
        >
          {/* Efecto de brillo que se mueve */}
          {!reducedMotion && (
            <motion.div
              className="absolute inset-0 opacity-60"
              animate={{
                background: [
                  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                  'linear-gradient(90deg, transparent 100%, rgba(255,255,255,0.4) 150%, transparent 200%)',
                ],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          )}
        </motion.div>
      </div>

      {/* Steps en grid de columnas iguales para asegurar equidistancia. */}
      <div className="grid relative" style={stepsGridStyle}>
        {steps.map((step, index) => {
          return (
            <WizardStepItem
              key={step.id}
              step={step}
              index={index}
              currentStep={currentStep}
              allowNavigation={allowNavigation}
              onStepClick={handleStepClick}
              reducedMotion={reducedMotion}
            />
          );
        })}
      </div>
    </div>
  );
});

WizardStepper.propTypes = {
  steps: PropTypes.arrayOf(stepShape).isRequired,
  currentStep: PropTypes.number.isRequired,
  onStepClick: PropTypes.func,
  allowNavigation: PropTypes.bool,
  reducedMotion: PropTypes.bool,
  className: PropTypes.string,
};

export default WizardStepper;

/**
 * Variante compacta del WizardStepper para espacios reducidos
 */
export function WizardStepperCompact({ steps, currentStep, className }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = step.id < currentStep;

        return (
          <div key={step.id} className="flex items-center">
            <motion.div
              className={cn(
                'size-8 rounded-full flex items-center justify-center text-xs font-bold',
                'transition-colors duration-300',
                isActive && 'bg-accent-indigo text-text-primary',
                isCompleted && 'bg-success-base text-text-primary',
                !isActive && !isCompleted && 'bg-background-elevated text-text-disabled'
              )}
              animate={isActive ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              {isCompleted ? <Check size={14} /> : step.id}
            </motion.div>
            {index < steps.length - 1 && (
              <div 
                className={cn(
                  'w-8 h-0.5 mx-1',
                  isCompleted ? 'bg-success-base' : 'bg-background-surface'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

WizardStepperCompact.propTypes = {
  steps: PropTypes.arrayOf(stepShape).isRequired,
  currentStep: PropTypes.number.isRequired,
  className: PropTypes.string,
};
