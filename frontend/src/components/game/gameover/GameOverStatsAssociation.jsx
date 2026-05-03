/**
 * @fileoverview Bloque de estadísticas finales para la mecánica Asociación.
 *
 * Diseño original (4 columnas: Incorrectas / Sin responder / T. medio / Tiempo)
 * extraído de GameOverScreen.jsx para que GameOverStats pueda delegar por
 * mecánica sin que cada implementación contamine al resto.
 */
import { memo } from 'react';
import PropTypes from 'prop-types';

function GameOverStatsAssociation({ summary, totalRounds, correctAnswers }) {
  const errors = Number.isFinite(summary?.errors) ? summary.errors : null;
  const unanswered =
    errors != null ? Math.max(0, totalRounds - correctAnswers - errors) : null;
  const avgTimeLabel = (() => {
    if (summary?.averageResponseTimeMs > 0) {
      return `${(summary.averageResponseTimeMs / 1000).toFixed(1)}s`;
    }
    return '—';
  })();
  const totalTimeLabel = summary?.totalTimePlayed > 0
    ? `${(summary.totalTimePlayed / (1000 * 60)).toFixed(1)} min`
    : '—';

  if (errors == null) {
    return (
      <div className="grid grid-cols-3 gap-2 mb-8 text-xs">
        <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center" title="Rondas no completadas (incorrectas + sin responder)">
          <div className="text-text-muted">Sin completar</div>
          <div className="text-white font-display font-semibold">{Math.max(0, totalRounds - correctAnswers)}</div>
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-8 text-xs">
      <div className="rounded-lg bg-error-base/10 border border-error-base/20 px-3 py-2 text-center" title="Respuestas incorrectas (tarjeta equivocada)">
        <div className="text-text-muted">Incorrectas</div>
        <div className="text-error-base font-display font-semibold">{errors}</div>
      </div>
      <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center" title="Rondas sin respuesta (timeout)">
        <div className="text-text-muted">Sin responder</div>
        <div className="text-white font-display font-semibold">{unanswered}</div>
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

GameOverStatsAssociation.propTypes = {
  summary: PropTypes.object,
  totalRounds: PropTypes.number,
  correctAnswers: PropTypes.number
};

export default memo(GameOverStatsAssociation);
