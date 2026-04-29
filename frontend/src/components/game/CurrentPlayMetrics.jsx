/**
 * @fileoverview Métricas de la partida actual mostradas en el footer del juego.
 * Incluye puntos, aciertos y métrica contextual según el modo (memory/asociación).
 */

import { memo } from 'react';
import PropTypes from 'prop-types';
import { Star, CheckCircle2, Brain, Target } from 'lucide-react';

/** Celda individual de una métrica */
function MetricPill({ icon: Icon, iconClass, label, value }) {
  return (
    <div className="rounded-md bg-background-elevated/60 border border-border-subtle px-2 py-1">
      <div className="flex items-center gap-1 text-[11px] tracking-wide text-text-secondary">
        <Icon size={12} className={iconClass} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="text-text-primary text-sm font-semibold">{value}</div>
    </div>
  );
}

MetricPill.propTypes = {
  icon: PropTypes.elementType.isRequired,
  iconClass: PropTypes.string,
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

const CurrentPlayMetrics = memo(function CurrentPlayMetrics({ mode, score, correctAnswers, totalRounds }) {
  const isMemory = mode === 'memory';
  return (
    <div className="mb-1.5 max-w-4xl mx-auto rounded-lg border border-border-default bg-background-base/30 px-3 py-1.5">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <MetricPill icon={Star} iconClass="text-warning-base" label="Puntos" value={score} />
        <MetricPill icon={CheckCircle2} iconClass="text-success-base" label="Aciertos" value={correctAnswers} />
        <MetricPill
          icon={isMemory ? Brain : Target}
          iconClass={isMemory ? 'text-brand-base' : 'text-accent-indigo'}
          label={isMemory ? 'Parejas' : 'Progreso'}
          value={`${correctAnswers} de ${totalRounds}`}
        />
      </div>
    </div>
  );
});

CurrentPlayMetrics.displayName = 'CurrentPlayMetrics';

CurrentPlayMetrics.propTypes = {
  mode: PropTypes.string,
  score: PropTypes.number,
  correctAnswers: PropTypes.number,
  totalRounds: PropTypes.number
};

export default CurrentPlayMetrics;
