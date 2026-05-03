/**
 * @fileoverview Bloque de estadísticas finales para la mecánica Memoria.
 *
 * 3 columnas (Errores / T. medio / Tiempo). Reetiquetamos "Total" como
 * "Parejas" en la pill superior — los intentos fallidos en Memoria no son
 * rondas discretas sino taps de cartas que no emparejaron, semántica
 * distinta de Asociación (QA 2026-04-24 PROP-104, QA 2026-04-29 BUG-MEM-1).
 */
import { memo } from 'react';
import PropTypes from 'prop-types';

function GameOverStatsMemory({ summary }) {
  const errors = Number.isFinite(summary?.errors) ? summary.errors : 0;
  const avgTimeLabel = summary?.averageResponseTimeMs > 0
    ? `${(summary.averageResponseTimeMs / 1000).toFixed(1)}s`
    : 'N/A';
  const totalTimeLabel = summary?.totalTimePlayed > 0
    ? `${(summary.totalTimePlayed / (1000 * 60)).toFixed(1)} min`
    : '—';

  return (
    <div className="grid grid-cols-3 gap-2 mb-8 text-xs">
      <div className="rounded-lg bg-error-base/10 border border-error-base/20 px-3 py-2 text-center" title="Intentos fallidos (parejas mal emparejadas)">
        <div className="text-text-muted">Errores</div>
        <div className="text-error-base font-display font-semibold">{errors}</div>
      </div>
      <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
        <div className="text-text-muted">T. medio</div>
        <div className="text-white font-display font-semibold">{avgTimeLabel}</div>
      </div>
      <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
        <div className="text-text-muted">Tiempo</div>
        <div className="text-white font-display font-semibold">{totalTimeLabel}</div>
      </div>
    </div>
  );
}

GameOverStatsMemory.propTypes = {
  summary: PropTypes.object
};

export default memo(GameOverStatsMemory);
