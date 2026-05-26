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
    // Todas las categorías INTENTADAS (total > 0), incluidas las falladas.
    // QA 2026-05-25: el filtro previo descartaba las categorías con 0
    // aciertos ANTES de decidir "Dominio total". Así, un resultado de 2/5
    // (p.ej. Vaca 1/1, Cerdo 0/1, Gallina 1/1, Pato 0/1) se reducía a las
    // dos acertadas, "todas al 100%", y mostraba "¡Dominio total!"
    // contradiciendo un score del 32% y la mascota "No te rindas".
    const attempted = Object.entries(byValueAccuracy)
      .map(([slug, stats]) => {
        const total = Number(stats?.total ?? 0);
        const correct = Number(stats?.correct ?? 0);
        return { slug, total, correct, ratio: total > 0 ? correct / total : null };
      })
      .filter(entry => entry.ratio !== null);
    if (attempted.length === 0) {
      return { mode: 'single', label: categoryDominance };
    }
    // "Dominio total" requiere DOS condiciones:
    //   1. todas las categorías intentadas están al 100% (filtro ADR-184), y
    //   2. el alumno acertó TODAS las rondas (sin timeouts ni errores).
    // QA 2026-05-26: la condición (1) sola no basta porque las rondas con
    // timeout NO incrementan `byValueAccuracy.total` (el backend solo lo
    // sube en `recordScanResult`, que no se llama en timeouts). Un 2/5 con
    // 4 sin responder pasaba (1) — las 2 contestadas eran 100%. Añadimos
    // (2) comparando contra el conteo real de la partida.
    const allRoundsAnswered = Number(correctAnswers) === Number(totalRounds);
    if (
      attempted.length >= 2 &&
      attempted.every(entry => entry.ratio === 1) &&
      allRoundsAnswered
    ) {
      return { mode: 'all', count: attempted.length };
    }
    // Para destacar la(s) categoría(s) más fuerte(s) consideramos solo las
    // que tienen algún acierto (una categoría fallada no es "fuerte").
    const scored = attempted.filter(entry => entry.correct > 0);
    if (scored.length === 0) {
      return { mode: 'single', label: categoryDominance };
    }
    const bestRatio = Math.max(...scored.map(r => r.ratio));
    const tied = scored.filter(r => r.ratio === bestRatio);
    // Empate entre 2+ categorías más fuertes → mostrar las empatadas.
    if (tied.length >= 2) {
      return { mode: 'tied', labels: tied.map(t => t.slug), peakStreak };
    }
    return { mode: 'single', label: categoryDominance };
  }, [byValueAccuracy, categoryDominance, peakStreak, correctAnswers, totalRounds]);

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
