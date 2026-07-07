import { memo } from 'react';
import { m as motion } from 'framer-motion';
import { CheckCircle2, Lightbulb, Target, MessageSquare } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from '../ui/GlassCard';

/**
 * Configuracion visual de cada seccion de la narrativa BI
 */
const SECTIONS = [
  {
    key: 'whatHappened',
    label: 'Qué pasó',
    icon: CheckCircle2,
    color: 'text-success-base',
    bg: 'bg-success-base/10',
  },
  {
    key: 'soWhat',
    label: 'Por qué importa',
    icon: Lightbulb,
    color: 'text-warning-base',
    bg: 'bg-warning-base/10',
  },
  {
    key: 'nowWhat',
    label: 'Qué hacer',
    icon: Target,
    color: 'text-brand-on-alpha',
    bg: 'bg-brand-base/10',
  },
];

/**
 * Card de narrativa BI siguiendo el framework "What Happened / So What / Now What".
 * Traduce datos numericos en insights accionables para profesores.
 *
 * Las interpretaciones se generan server-side en analyticsHelpers.js
 * y se entregan via los endpoints de trajectory/summary con enrichMetric().
 *
 * @param {Object} props
 * @param {Object} [props.interpretation] - { whatHappened, soWhat, nowWhat } del backend
 * @param {string} [props.title] - Titulo personalizado
 */
function NarrativeCard({ interpretation, title = 'Resumen del Alumno' }) {
  const { shouldReduceMotion } = useReducedMotion();

  const hasData = interpretation &&
    (interpretation.whatHappened || interpretation.soWhat || interpretation.nowWhat);

  return (
    <GlassCard variant="default" padding="none" className="p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={18} className="text-brand-on-alpha" aria-hidden="true" />
        <h2 className="text-base font-bold text-text-primary font-display">{title}</h2>
      </div>

      {hasData ? (
        <div className="space-y-3">
          {SECTIONS.map((section, index) => {
            const text = interpretation[section.key];
            if (!text) return null;
            const Icon = section.icon;

            return (
              <motion.div
                key={section.key}
                initial={shouldReduceMotion ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : index * 0.1, duration: 0.3 }}
                className="flex items-start gap-3"
              >
                <div className={cn("p-1.5 rounded-lg flex-shrink-0 mt-0.5", section.bg)}>
                  <Icon size={14} className={section.color} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-nano font-semibold uppercase tracking-wider text-text-muted mb-0.5">
                    {section.label}
                  </p>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {text}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="py-4 text-center">
          <p className="text-sm text-text-muted">Se necesitan más partidas para sacar conclusiones.</p>
          <p className="text-xs text-text-muted mt-1">Las conclusiones aparecen automáticamente cuando hay datos suficientes.</p>
        </div>
      )}
    </GlassCard>
  );
}

NarrativeCard.propTypes = {
  interpretation: PropTypes.shape({
    whatHappened: PropTypes.string,
    soWhat: PropTypes.string,
    nowWhat: PropTypes.string,
  }),
  title: PropTypes.string,
};

export default memo(NarrativeCard);
