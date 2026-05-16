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
import { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { Link2, XCircle, Clock3, Hourglass, AlarmClock, Sparkles } from 'lucide-react';
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
  const byValueAccuracy = associationDetail?.byValueAccuracy;

  // UX (QA 2026-05-16): `computeCategoryDominance()` del backend devuelve la
  // primera categoría alfabéticamente cuando hay empate. Si el alumno
  // acertó 5 categorías al 100% (caso real durante QA: Vaca/Cerdo/Gallina/
  // Caballo/Pato todos 1/1), la UI muestra "Caballo" y le quita mérito al
  // hecho de que dominó todo. Detectamos el empate aquí y mostramos un
  // mensaje motivador en su lugar.
  const dominanceSummary = useMemo(() => {
    if (!categoryDominance) return null;
    if (!byValueAccuracy || typeof byValueAccuracy !== 'object') {
      return { mode: 'single', label: categoryDominance };
    }
    const ratios = Object.entries(byValueAccuracy)
      .map(([slug, stats]) => {
        const total = Number(stats?.total ?? 0);
        const correct = Number(stats?.correct ?? 0);
        return { slug, total, correct, ratio: total > 0 ? correct / total : null };
      })
      .filter(entry => entry.ratio !== null && entry.correct > 0);
    if (ratios.length === 0) {
      return { mode: 'single', label: categoryDominance };
    }
    const bestRatio = Math.max(...ratios.map(r => r.ratio));
    const tied = ratios.filter(r => r.ratio === bestRatio);
    // Empate perfecto en TODAS las categorías acertadas y todas al 100%
    // → "Dominio total".
    if (
      tied.length === ratios.length &&
      tied.length >= 2 &&
      bestRatio === 1
    ) {
      return { mode: 'all', count: tied.length };
    }
    // Empate entre 2+ categorías pero NO en todas → mostrar las empatadas.
    if (tied.length >= 2) {
      return { mode: 'tied', labels: tied.map(t => t.slug), peakStreak };
    }
    return { mode: 'single', label: categoryDominance };
  }, [byValueAccuracy, categoryDominance, peakStreak]);

  const renderHeroValue = () => {
    if (!dominanceSummary) return null;
    if (dominanceSummary.mode === 'all') {
      return (
        <p className="text-base font-bold font-display text-accent-cyan text-right">
          ¡Dominio total!
        </p>
      );
    }
    if (dominanceSummary.mode === 'tied') {
      return (
        <p
          className="text-sm sm:text-base font-bold font-display text-accent-cyan max-w-[55%] text-right leading-tight"
          title={dominanceSummary.labels.join(', ')}
        >
          {dominanceSummary.labels.slice(0, 2).join(' · ')}
          {dominanceSummary.labels.length > 2 && (
            <span className="text-text-muted font-normal">
              {' '}+{dominanceSummary.labels.length - 2}
            </span>
          )}
        </p>
      );
    }
    return (
      <p
        className="text-base font-bold font-display text-accent-cyan max-w-[40%] truncate"
        title={dominanceSummary.label}
      >
        {dominanceSummary.label}
      </p>
    );
  };

  const heroSubtitle = (() => {
    if (!dominanceSummary) return null;
    if (dominanceSummary.mode === 'all') {
      return 'Acertaste todas las categorías';
    }
    if (dominanceSummary.mode === 'tied') {
      return 'Empate entre tus categorías más fuertes';
    }
    return peakStreak > 0 ? `Mejor racha: ${peakStreak}` : 'Más aciertos en esta serie';
  })();

  const heroLabel =
    dominanceSummary?.mode === 'all'
      ? 'Tus categorías'
      : 'Tu categoría más fuerte';

  const heroIcon = dominanceSummary?.mode === 'all' ? Sparkles : Link2;

  const heroBlock = dominanceSummary ? (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-accent-cyan/10 border border-accent-cyan/30 px-4 py-3 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3">
        <div
          className="size-10 rounded-full bg-accent-cyan/20 flex items-center justify-center shrink-0"
          aria-hidden="true"
        >
          {heroIcon === Sparkles ? (
            <Sparkles size={20} className="text-accent-cyan" />
          ) : (
            <Link2 size={20} className="text-accent-cyan" />
          )}
        </div>
        <div className="text-left">
          <p className="text-xs uppercase tracking-wider text-text-muted">{heroLabel}</p>
          <p className="text-sm text-text-secondary">{heroSubtitle}</p>
        </div>
      </div>
      {renderHeroValue()}
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
            label="Incompletas"
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
