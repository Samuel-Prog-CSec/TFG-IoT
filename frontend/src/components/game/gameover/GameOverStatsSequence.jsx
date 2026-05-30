/**
 * @fileoverview Bloque de estadísticas finales para la mecánica Secuencia.
 *
 * Diseño dedicado:
 *  - Hero metric: `maxSequenceLengthAchieved` ("Mejor secuencia: 5 cartas").
 *  - Grid 4 columnas: Completas / Bloqueadas / Tiempo agotado / Pistas.
 *  - Banda inferior: `partialReproductions` (cartas correctas pre-fallo) y
 *    tiempo medio de reproducción.
 *
 * Los datos vienen del `final_summary` del backend (mode: 'sequence', T-921).
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { ListOrdered, CheckCircle2, XCircle, Clock3, Sparkles, Hourglass } from 'lucide-react';
import MetricPill from '../../ui/MetricPill';

function GameOverStatsSequence({ summary }) {
  const sequencesCompleted = Number(summary?.sequencesCompleted || 0);
  const sequencesBlocked = Number(summary?.sequencesBlocked || 0);
  const sequencesTimedOut = Number(summary?.sequencesTimedOut || 0);
  const maxLength = Number(summary?.maxSequenceLengthAchieved || 0);
  // `partialRounds` (rondas con aciertos pero sin completar la secuencia)
  // sustituye a `partialReproductions` en el UI desde QA 03/05/2026:
  // el campo anterior duplicaba "Cartas acertadas" del bloque superior.
  const partialRounds = Number(summary?.partialRounds || 0);
  const hintsUsed = Number(summary?.hintsUsed || 0);
  const avgReprodMs = Number(summary?.averageReproductionTimeMs || 0);
  // El backend persiste el tiempo total como `completionTime` (estándar
  // del modelo GamePlay); aceptamos también el alias `totalTimePlayed`
  // por compatibilidad histórica.
  const totalTimeMs = Number(summary?.completionTime || summary?.totalTimePlayed || 0);

  const avgTimeLabel = avgReprodMs > 0 ? `${(avgReprodMs / 1000).toFixed(1)}s` : '—';
  // Por debajo de 60 segundos mostramos en segundos para que no salga
  // "0.5 min" — más legible para un alumno o profesor mirando el resumen.
  const totalTimeLabel = (() => {
    if (!Number.isFinite(totalTimeMs) || totalTimeMs <= 0) return '—';
    if (totalTimeMs < 60_000) return `${Math.round(totalTimeMs / 1000)}s`;
    return `${(totalTimeMs / 60_000).toFixed(1)} min`;
  })();

  return (
    <div className="space-y-3 mb-8">
      {/* Hero metric: mejor longitud alcanzada */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-accent-amber/10 border border-accent-amber/30 px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-accent-amber/20 flex items-center justify-center" aria-hidden="true">
            <ListOrdered size={20} className="text-accent-amber" />
          </div>
          <div className="text-left">
            <p className="text-xs uppercase tracking-wider text-text-muted">Mejor racha</p>
            <p className="text-sm text-text-secondary">Cartas correctas seguidas en una ronda</p>
          </div>
        </div>
        <p className="text-3xl font-bold font-display text-accent-amber tabular-nums">{maxLength}</p>
      </motion.div>

      {/* 4 columnas con desglose por estado — usan MetricPill global
          para mantener consistencia con Memoria y Asociación (ADR-F). */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricPill
          icon={CheckCircle2}
          tone="success"
          label="Completas"
          value={sequencesCompleted}
          tooltip="Secuencias reproducidas correctamente al completo"
        />
        <MetricPill
          icon={XCircle}
          tone="error"
          label="Bloqueadas"
          value={sequencesBlocked}
          tooltip="Secuencias con al menos una carta bloqueada por fallos"
        />
        <MetricPill
          icon={Clock3}
          tone="amber"
          label="Sin tiempo"
          value={sequencesTimedOut}
          tooltip="Secuencias que no se acabaron a tiempo"
        />
        <MetricPill
          icon={Sparkles}
          tone="brand"
          label="Pistas usadas"
          value={hintsUsed}
          tooltip="Pistas entregadas tras un fallo en dificultad fácil"
        />
      </div>

      {/* Banda inferior con métricas continuas */}
      <div className="grid grid-cols-3 gap-2">
        <MetricPill
          tone="neutral"
          label="Incompletas"
          value={partialRounds}
          tooltip="Rondas con al menos un acierto pero sin completar la secuencia"
        />
        <MetricPill icon={Hourglass} tone="neutral" label="T. medio" value={avgTimeLabel} />
        <MetricPill icon={Clock3} tone="neutral" label="Tiempo total" value={totalTimeLabel} />
      </div>
    </div>
  );
}

GameOverStatsSequence.propTypes = {
  summary: PropTypes.object
};

export default memo(GameOverStatsSequence);
