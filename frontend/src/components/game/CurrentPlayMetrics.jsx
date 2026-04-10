/**
 * @fileoverview Métricas de la partida actual mostradas en el footer del juego.
 * Incluye puntos, aciertos y métrica contextual según el modo (memory/asociación).
 */

import { memo } from 'react';
import PropTypes from 'prop-types';

/** Celda individual de una métrica */
function MetricPill({ label, value }) {
  return (
    <div className="rounded-md bg-background-elevated/60 border border-border-subtle px-2 py-1">
      <div className="text-[11px] tracking-wide text-text-secondary">{label}</div>
      <div className="text-text-primary text-sm font-semibold">{value}</div>
    </div>
  );
}

MetricPill.propTypes = {
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

const CurrentPlayMetrics = memo(function CurrentPlayMetrics({ mode, score, correctAnswers, totalRounds }) {
  return (
    <div className="mb-1.5 max-w-4xl mx-auto rounded-lg border border-border-default bg-background-base/30 px-3 py-1.5">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <MetricPill label="⭐ Puntos" value={score} />
        <MetricPill label="✅ Aciertos" value={correctAnswers} />
        <MetricPill
          label={mode === 'memory' ? '🧠 Parejas' : '🎯 Aciertos'}
          value={mode === 'memory' ? `${correctAnswers}` : `${correctAnswers} de ${totalRounds}`}
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
