/**
 * @fileoverview Bloque de estadísticas finales para la mecánica Memoria.
 *
 * Diseño (ADR-F, sesión 04/05/2026):
 *  - Hero metric: "Mejor racha" con `peakStreak` (parejas seguidas sin
 *    error). Cuando no hay datos, oculta la fila.
 *  - 3 columnas: Errores / T. medio / Tiempo total. Usa el primitivo
 *    `MetricPill` para que el estilo no diverja entre mecánicas.
 *  - Si la sesión usaba grupos > 2 (tríos), la etiqueta "Errores" se
 *    mantiene pero el tooltip anuncia "intentos de tríos fallidos".
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { Brain, Hourglass, Clock3, XCircle } from 'lucide-react';
import MetricPill from '../../ui/MetricPill';

function GameOverStatsMemory({ summary }) {
  const errors = Number.isFinite(summary?.errors) ? summary.errors : 0;
  const memoryDetail = summary?.memory && typeof summary.memory === 'object'
    ? summary.memory
    : null;
  const peakStreak = Number(memoryDetail?.peakStreak || 0);
  const groupSize = Number(memoryDetail?.groupSize || 2);
  const isTrios = groupSize >= 3;

  // BUG-GAMEOVER-KPIS-1: "T. medio" leía `averageResponseTimeMs`, que en
  // Memoria el backend deja en 0 — el tiempo medio real entre cartas de un
  // grupo se persiste en `memory.averageMatchTimeMs` (coincide con el tooltip).
  // Priorizamos esa métrica específica de Memoria y caemos al genérico solo
  // si no existe (auditoría 24/05/2026).
  const avgMatchMs = Number(memoryDetail?.averageMatchTimeMs || 0);
  const avgTimeMs = avgMatchMs > 0 ? avgMatchMs : Number(summary?.averageResponseTimeMs || 0);
  const avgTimeLabel = avgTimeMs > 0
    ? `${(avgTimeMs / 1000).toFixed(1)}s`
    : '—';
  const totalTimeLabel = summary?.totalTimePlayed > 0
    ? `${(summary.totalTimePlayed / (1000 * 60)).toFixed(1)} min`
    : '—';
  const errorTooltip = isTrios
    ? 'Intentos fallidos (tríos mal emparejados)'
    : 'Intentos fallidos (parejas mal emparejadas)';
  const heroLabel = isTrios ? 'Mejor racha de tríos' : 'Mejor racha de parejas';

  return (
    <div className="space-y-[clamp(0.35rem,1.4vh,0.75rem)] mb-[clamp(0.5rem,2vh,2rem)]">
      {peakStreak > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-accent-indigo/10 border border-accent-indigo/30 px-4 py-[clamp(0.45rem,1.5vh,0.75rem)] flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-accent-indigo/20 flex items-center justify-center" aria-hidden="true">
              <Brain size={20} className="text-accent-indigo" />
            </div>
            <div className="text-left">
              <p className="text-xs uppercase tracking-wider text-text-muted">Mejor racha</p>
              <p className="text-sm text-text-secondary">{heroLabel}</p>
            </div>
          </div>
          <p className="text-3xl font-bold font-display text-accent-indigo tabular-nums">{peakStreak}</p>
        </motion.div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <MetricPill icon={XCircle} tone="error" label="Errores" value={errors} tooltip={errorTooltip} />
        <MetricPill icon={Hourglass} tone="neutral" label="T. medio" value={avgTimeLabel} tooltip="Tiempo medio entre cartas de un mismo grupo" />
        <MetricPill icon={Clock3} tone="neutral" label="Tiempo" value={totalTimeLabel} tooltip="Tiempo total de la partida" />
      </div>
    </div>
  );
}

GameOverStatsMemory.propTypes = {
  summary: PropTypes.object
};

export default memo(GameOverStatsMemory);
