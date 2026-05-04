/**
 * @fileoverview Bloque de estadísticas finales para la mecánica Asociación.
 *
 * Diseño (ADR-F, sesión 04/05/2026):
 *  - Hero metric opcional: "Categoría más fuerte" con
 *    `summary.association.categoryDominance` cuando el backend lo
 *    expone. Cae a layout simple si no hay datos.
 *  - Pills 4-col cuando hay errores: Incorrectas / Sin responder /
 *    T. medio / Tiempo total. Usa el primitivo `MetricPill` para
 *    consistencia visual con Memory y Sequence.
 *  - Si el backend no devolvió `errors`, fallback a 3 columnas con
 *    "Sin completar" agrupado (compat con plays anteriores).
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Link2, XCircle, Clock3, Hourglass, AlarmClock } from 'lucide-react';
import MetricPill from '../../ui/MetricPill';

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
  const associationDetail =
    summary?.association && typeof summary.association === 'object'
      ? summary.association
      : null;
  const categoryDominance = associationDetail?.categoryDominance;
  const peakStreak = Number(associationDetail?.peakStreak || 0);

  const heroBlock = categoryDominance ? (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-accent-cyan/10 border border-accent-cyan/30 px-4 py-3 flex items-center justify-between"
    >
      <div className="flex items-center gap-3">
        <div
          className="size-10 rounded-full bg-accent-cyan/20 flex items-center justify-center"
          aria-hidden="true"
        >
          <Link2 size={20} className="text-accent-cyan" />
        </div>
        <div className="text-left">
          <p className="text-xs uppercase tracking-wider text-text-muted">Tu categoría más fuerte</p>
          <p className="text-sm text-text-secondary">
            {peakStreak > 0 ? `Mejor racha: ${peakStreak}` : 'Más aciertos en esta serie'}
          </p>
        </div>
      </div>
      <p
        className="text-base font-bold font-display text-accent-cyan max-w-[40%] truncate"
        title={categoryDominance}
      >
        {categoryDominance}
      </p>
    </motion.div>
  ) : null;

  if (errors == null) {
    return (
      <div className="space-y-3 mb-8">
        {heroBlock}
        <div className="grid grid-cols-3 gap-2">
          <MetricPill
            icon={XCircle}
            tone="neutral"
            label="Sin completar"
            value={Math.max(0, totalRounds - correctAnswers)}
            tooltip="Rondas no completadas (incorrectas + sin responder)"
          />
          <MetricPill icon={Hourglass} tone="neutral" label="T. medio" value={avgTimeLabel} />
          <MetricPill icon={Clock3} tone="neutral" label="Tiempo" value={totalTimeLabel} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-8">
      {heroBlock}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricPill
          icon={XCircle}
          tone="error"
          label="Incorrectas"
          value={errors}
          tooltip="Respuestas incorrectas (tarjeta equivocada)"
        />
        <MetricPill
          icon={AlarmClock}
          tone="neutral"
          label="Sin responder"
          value={unanswered}
          tooltip="Rondas sin respuesta (timeout)"
        />
        <MetricPill icon={Hourglass} tone="neutral" label="T. medio" value={avgTimeLabel} />
        <MetricPill icon={Clock3} tone="neutral" label="Tiempo" value={totalTimeLabel} />
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
