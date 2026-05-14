import { memo, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { PartyPopper, Flame, Brain, Link2, ListOrdered, Sparkles, Star } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useConfetti } from '../../hooks/useConfetti';
import { getMechanicTheme } from '../../lib/mechanicTheme';

/**
 * Configuración por mecánica × tipo (T-953 Fase 3). Cada combinación
 * decide el icono Lucide hero, el copy corto y la clase de color del
 * texto. La paleta de partículas se calcula aparte vía
 * `getMechanicTheme(...).accentHexFallback`.
 */
const MECHANIC_FEEDBACK = Object.freeze({
  memory: Object.freeze({
    success: { Icon: Brain, label: '¡Pareja!', textClass: 'text-accent-indigo', glow: 'drop-shadow-[0_0_24px_rgba(124,124,240,0.55)]' },
    error: { Icon: Flame, label: 'Otra vez', textClass: 'text-error-base', glow: 'drop-shadow-[0_0_18px_rgba(239,68,68,0.45)]' },
  }),
  association: Object.freeze({
    success: { Icon: Link2, label: '¡Conexión!', textClass: 'text-accent-cyan', glow: 'drop-shadow-[0_0_22px_rgba(95,203,232,0.55)]' },
    error: { Icon: Flame, label: 'Mira de nuevo', textClass: 'text-error-base', glow: 'drop-shadow-[0_0_18px_rgba(239,68,68,0.45)]' },
  }),
  sequence: Object.freeze({
    success: { Icon: ListOrdered, label: '¡Ritmo!', textClass: 'text-accent-amber', glow: 'drop-shadow-[0_0_22px_rgba(244,178,106,0.55)]' },
    error: { Icon: Flame, label: 'Otra ronda', textClass: 'text-error-base', glow: 'drop-shadow-[0_0_18px_rgba(239,68,68,0.45)]' },
  }),
});

const FALLBACK_FEEDBACK = Object.freeze({
  success: { Icon: PartyPopper, label: '¡Genial!', textClass: 'text-success-base', glow: 'drop-shadow-[0_0_24px_rgba(34,197,94,0.55)]' },
  error: { Icon: Flame, label: '¡Sigue intentando!', textClass: 'text-error-base', glow: 'drop-shadow-[0_0_18px_rgba(239,68,68,0.45)]' },
});

function getFeedbackConfig(type, mechanicType) {
  const dictionary = MECHANIC_FEEDBACK[mechanicType] || FALLBACK_FEEDBACK;
  return dictionary[type] || FALLBACK_FEEDBACK[type];
}

/**
 * Overlay de feedback tras cada respuesta
 * Muestra celebración (confeti) para aciertos o mensaje de ánimo para errores
 *
 * @param {Object} props
 * @param {'success' | 'error' | null} props.type - Tipo de feedback
 * @param {number} props.points - Puntos ganados/perdidos
 * @param {string} [props.mechanicType] - 'memory' | 'association' | 'sequence' (T-953 Fase 3).
 *   Cuando se pasa, el copy + icono + tinte de partículas se eligen
 *   por mecánica. Si no, fallback genérico (PartyPopper/Flame).
 * @param {Function} props.onComplete - Callback cuando termina la animación
 */
function FeedbackOverlay({ type, points = 0, mechanicType = null, onComplete }) {
  const { shouldReduceMotion } = useReducedMotion();
  const { fireBurst } = useConfetti();

  // Color de partículas tintado por mecánica (T-953 Fase 3).
  const burstColors = useMemo(() => {
    if (!mechanicType) return undefined;
    const hex = getMechanicTheme(mechanicType).accentHexFallback;
    return hex ? [hex, '#ffffff'] : undefined;
  }, [mechanicType]);

  // Disparar confetti via canvas-confetti para éxito
  useEffect(() => {
    if (type === 'success') {
      fireBurst({ colors: burstColors });
    }
  }, [type, fireBurst, burstColors]);

  // Permitir cerrar con Escape
  useEffect(() => {
    if (!type) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onComplete) {
        onComplete();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [type, onComplete]);

  // T-953 Fase 3: emojis flotantes reemplazados por iconos Lucide
  // (Sparkles, Star) con tint del accent de la mecánica. Mantiene el
  // efecto visual sin depender de fuentes del SO ni saturar de emojis
  // que rompen el design system.
  const floatingSeeds = useMemo(() => {
    const Components = [Sparkles, Star, Sparkles, Star, Sparkles];
    return Components.map((Component, index) => ({
      id: index,
      Component,
      x: 10 + index * 18,
      rotation: 30 + index * 40,
      delay: index * 0.1,
    }));
  }, []);

  if (!type) return null;

  const isSuccess = type === 'success';
  const config = getFeedbackConfig(type, mechanicType);
  const { Icon: HeroIcon, label: feedbackMessage, textClass, glow } = config;

  return (
    <AnimatePresence onExitComplete={onComplete}>
      <motion.div
        role="status"
        aria-live="assertive"
        aria-label={`Resultado: ${feedbackMessage}. ${isSuccess ? 'Ganaste' : ''} ${points} puntos`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
      >
        {/* Background overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden="true"
          className={cn(
            "absolute inset-0",
            isSuccess
              ? "bg-success-base/10"
              : "bg-error-base/10"
          )}
        />

        {/* Central feedback */}
        <motion.div
          initial={shouldReduceMotion ? false : { scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 20 }}
          className="relative z-10 text-center"
        >
          {/* Icono hero per mecánica (T-953 Fase 3) — Brain/Link2/
              ListOrdered en success según mecánica; Flame en error.
              Sin emojis, todo Lucide para consistencia design system. */}
          <motion.div
            animate={shouldReduceMotion ? { scale: 1, rotate: 0 } : {
              scale: [1, 1.2, 1],
              rotate: [0, 10, -10, 0]
            }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5 }}
            className="mb-4 flex items-center justify-center"
            aria-hidden="true"
          >
            <HeroIcon size={112} className={cn(textClass, glow)} />
          </motion.div>

          {/* Message — copy contextual a la mecánica (T-953 Fase 3). */}
          <motion.h2
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.1 }}
            className={cn(
              "text-3xl sm:text-4xl font-bold font-display mb-2",
              textClass
            )}
          >
            {feedbackMessage}
          </motion.h2>

          {/* Points */}
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: 0.2 }}
            className={cn(
              "text-2xl font-bold px-6 py-2 rounded-full inline-block",
              isSuccess
                ? "bg-success-base/20 text-success-base shadow-lg shadow-success-base/20"
                : "bg-error-base/20 text-error-base"
            )}
            aria-label={`Puntos: ${isSuccess ? '+' : ''}${points}`}
          >
            {isSuccess ? `+${points}` : points}
          </motion.div>
        </motion.div>

        {/* Confetti ahora se dispara via useConfetti hook (useEffect arriba) */}

        {/* Floating Lucide icons (T-953 Fase 3 — antes emojis Unicode).
            Tintados con el accent de la mecánica activa para que
            visualmente refuerce la identidad mecánica. */}
        {isSuccess && !shouldReduceMotion && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
            {floatingSeeds.map(seed => {
              const SeedIcon = seed.Component;
              return (
                <motion.div
                  key={`floating-icon-${seed.id}`}
                  initial={{
                    x: `${seed.x}%`,
                    y: typeof window !== 'undefined' ? window.innerHeight : 500,
                    scale: 0
                  }}
                  animate={{
                    y: -100,
                    scale: [0, 1, 0],
                    rotate: seed.rotation
                  }}
                  transition={{
                    duration: 1.5,
                    delay: seed.delay,
                    ease: 'easeOut'
                  }}
                  className={cn('absolute', textClass)}
                >
                  <SeedIcon size={28} />
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

FeedbackOverlay.propTypes = {
  type: PropTypes.oneOf(['success', 'error']),
  points: PropTypes.number,
  mechanicType: PropTypes.oneOf(['memory', 'association', 'sequence', null]),
  onComplete: PropTypes.func,
};

export default memo(FeedbackOverlay);
