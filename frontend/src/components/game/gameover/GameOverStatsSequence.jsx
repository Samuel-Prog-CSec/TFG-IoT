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
import { motion } from 'framer-motion';
import { ListOrdered, CheckCircle2, XCircle, Clock3, Sparkles, Hourglass } from 'lucide-react';

function GameOverStatsSequence({ summary }) {
  const sequencesCompleted = Number(summary?.sequencesCompleted || 0);
  const sequencesBlocked = Number(summary?.sequencesBlocked || 0);
  const sequencesTimedOut = Number(summary?.sequencesTimedOut || 0);
  const maxLength = Number(summary?.maxSequenceLengthAchieved || 0);
  const partialReproductions = Number(summary?.partialReproductions || 0);
  const hintsUsed = Number(summary?.hintsUsed || 0);
  const avgReprodMs = Number(summary?.averageReproductionTimeMs || 0);
  const totalTimeMs = Number(summary?.totalTimePlayed || 0);

  const avgTimeLabel = avgReprodMs > 0 ? `${(avgReprodMs / 1000).toFixed(1)}s` : '—';
  const totalTimeLabel = totalTimeMs > 0 ? `${(totalTimeMs / (1000 * 60)).toFixed(1)} min` : '—';

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
            <p className="text-xs uppercase tracking-wider text-text-muted">Mejor secuencia</p>
            <p className="text-sm text-text-secondary">Cartas memorizadas en orden de un tirón</p>
          </div>
        </div>
        <p className="text-3xl font-bold font-display text-accent-amber tabular-nums">{maxLength}</p>
      </motion.div>

      {/* 4 columnas con desglose por estado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <StatPill
          icon={CheckCircle2}
          tone="success"
          label="Completas"
          value={sequencesCompleted}
          tooltip="Secuencias reproducidas correctamente al completo"
        />
        <StatPill
          icon={XCircle}
          tone="error"
          label="Bloqueadas"
          value={sequencesBlocked}
          tooltip="Secuencias con al menos una carta bloqueada por fallos"
        />
        <StatPill
          icon={Clock3}
          tone="amber"
          label="Sin tiempo"
          value={sequencesTimedOut}
          tooltip="Secuencias que no se acabaron a tiempo"
        />
        <StatPill
          icon={Sparkles}
          tone="brand"
          label="Pistas usadas"
          value={hintsUsed}
          tooltip="Pistas entregadas tras un fallo en dificultad fácil"
        />
      </div>

      {/* Banda inferior con métricas continuas */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center" title="Cartas correctas antes de cualquier fallo">
          <div className="text-text-muted">Aciertos parciales</div>
          <div className="text-white font-display font-semibold">{partialReproductions}</div>
        </div>
        <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
          <div className="text-text-muted flex items-center justify-center gap-1">
            <Hourglass size={11} aria-hidden="true" />
            T. medio
          </div>
          <div className="text-white font-display font-semibold">{avgTimeLabel}</div>
        </div>
        <div className="rounded-lg bg-background-elevated/60 border border-border-subtle px-3 py-2 text-center">
          <div className="text-text-muted">Tiempo total</div>
          <div className="text-white font-display font-semibold">{totalTimeLabel}</div>
        </div>
      </div>
    </div>
  );
}

const TONE_CLASSES = {
  success: 'bg-success-base/10 border-success-base/20 text-success-base',
  error: 'bg-error-base/10 border-error-base/20 text-error-base',
  amber: 'bg-accent-amber/10 border-accent-amber/20 text-accent-amber',
  brand: 'bg-brand-base/10 border-brand-base/20 text-brand-base'
};

function StatPill({ icon: IconComponent, tone, label, value, tooltip }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${TONE_CLASSES[tone]}`} title={tooltip}>
      <div className="text-text-muted flex items-center justify-center gap-1">
        <IconComponent size={11} aria-hidden="true" />
        {label}
      </div>
      <div className="font-display font-semibold tabular-nums">{value}</div>
    </div>
  );
}

StatPill.propTypes = {
  icon: PropTypes.elementType.isRequired,
  tone: PropTypes.oneOf(['success', 'error', 'amber', 'brand']).isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  tooltip: PropTypes.string
};

GameOverStatsSequence.propTypes = {
  summary: PropTypes.object
};

export default memo(GameOverStatsSequence);
