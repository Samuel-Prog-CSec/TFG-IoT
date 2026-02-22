/**
 * @fileoverview Componente WizardStepper - Stepper visual premium para wizards multi-paso
 * Incluye animaciones de progreso fluido, iconos que se transforman al completar,
 * y efectos visuales de celebración.
 * 
 * @module components/ui/WizardStepper
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import confetti from 'canvas-confetti';
import { useEffect, useRef } from 'react';

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
 *     { id: 3, title: "Assets", icon: Tag },
 *     { id: 4, title: "Confirmar", icon: Check },
 *   ]}
 *   currentStep={2}
 *   onStepClick={(stepId) => setStep(stepId)}
 *   allowNavigation
 * />
 * ```
 */
export default function WizardStepper({
  steps,
  currentStep,
  onStepClick,
  allowNavigation = false,
  reducedMotion = false,
  className,
}) {
  const isLastStep = currentStep >= steps.length - 1;
  const wasLastStep = useRef(false);

  // Efecto de confetti al llegar al último paso
  useEffect(() => {
    if (!reducedMotion && isLastStep && !wasLastStep.current) {
      // Mini confetti celebration
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.3 },
        colors: ['#8b5cf6', '#6366f1', '#a855f7', '#c084fc'],
        scalar: 0.8,
        gravity: 1.2,
      });
      wasLastStep.current = true;
    }
    if (!isLastStep) {
      wasLastStep.current = false;
    }
  }, [isLastStep, reducedMotion]);

  // Calcular progreso
  const totalSteps = Math.max(steps.length - 1, 1);
  const progress = (currentStep / totalSteps) * 100;

  const handleStepClick = (stepIndex) => {
    if (allowNavigation && stepIndex < currentStep && onStepClick) {
      onStepClick(stepIndex);
    }
  };

  return (
    <div className={cn('relative', className)}>
      {/* Línea de fondo */}
      <div className="absolute top-5 left-0 w-full h-1 bg-slate-800/60 rounded-full overflow-hidden">
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
            background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
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

      {/* Steps */}
      <div className="flex justify-between relative">
        {steps.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          const isClickable = allowNavigation && isCompleted;

          return (
            <motion.div
              key={step.id}
              className="flex flex-col items-center gap-2 relative"
              initial={reducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reducedMotion ? 0 : index * 0.1 }}
            >
              {/* Botón del paso */}
              <motion.button
                onClick={() => handleStepClick(index)}
                disabled={!isClickable}
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center',
                  'transition-all duration-300 border-2 relative z-10',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
                  isActive && 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/40',
                  isCompleted && 'bg-emerald-500 border-emerald-400 text-white',
                  !isActive && !isCompleted && 'bg-slate-900 border-slate-700 text-slate-500',
                  isClickable && 'cursor-pointer hover:scale-110 hover:shadow-emerald-500/30 hover:shadow-lg',
                  !isClickable && !isActive && 'cursor-default'
                )}
                whileHover={isClickable ? { scale: 1.1 } : {}}
                whileTap={isClickable ? { scale: 0.95 } : {}}
                animate={!reducedMotion && isActive ? {
                  scale: [1, 1.05, 1],
                  boxShadow: [
                    '0 0 0 0 rgba(99, 102, 241, 0)',
                    '0 0 20px 4px rgba(99, 102, 241, 0.4)',
                    '0 0 0 0 rgba(99, 102, 241, 0)',
                  ],
                } : {}}
                transition={!reducedMotion && isActive ? {
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                } : {}}
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

                {/* Efecto de partículas al activarse */}
                {isActive && !reducedMotion && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {[...Array(4)].map((_, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-1.5 h-1.5 bg-indigo-400 rounded-full"
                        style={{
                          top: '50%',
                          left: '50%',
                        }}
                        animate={{
                          x: [0, Math.cos((i * Math.PI) / 2) * 20],
                          y: [0, Math.sin((i * Math.PI) / 2) * 20],
                          opacity: [1, 0],
                          scale: [1, 0.5],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          delay: i * 0.2,
                          ease: 'easeOut',
                        }}
                      />
                    ))}
                  </motion.div>
                )}
              </motion.button>

              {/* Etiqueta del paso */}
              <motion.span
                className={cn(
                  'text-xs font-medium uppercase tracking-wider transition-colors duration-300',
                  isActive && 'text-indigo-400',
                  isCompleted && 'text-emerald-400',
                  !isActive && !isCompleted && 'text-slate-500'
                )}
                animate={!reducedMotion && isActive ? { scale: [1, 1.05, 1] } : {}}
                transition={!reducedMotion && isActive ? { duration: 2, repeat: Infinity } : {}}
              >
                {step.title}
              </motion.span>

              {/* Descripción opcional */}
              {step.description && (
                <span className="text-[10px] text-slate-600 max-w-[80px] text-center hidden sm:block">
                  {step.description}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

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
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                'transition-all duration-300',
                isActive && 'bg-indigo-600 text-white',
                isCompleted && 'bg-emerald-500 text-white',
                !isActive && !isCompleted && 'bg-slate-800 text-slate-500'
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
                  isCompleted ? 'bg-emerald-500' : 'bg-slate-700'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
