/**
 * @fileoverview Card resumen de la mecánica Memoria para `StudentProfile`
 * (ADR-F, sesión 04/05/2026). Renderiza al lado de la trayectoria del
 * alumno cuando éste ha jugado al menos una partida de Memoria en el
 * rango temporal seleccionado.
 *
 * Hero metric: peakStreak (parejas seguidas sin error) — la métrica más
 * "narrable" para el profesor en una sola lectura.
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import { Brain, Boxes, Hourglass, Layers } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

function MemoryHighlightCard({ summary }) {
  if (!summary) return null;
  const peakStreak = Number(summary.peakStreak || 0);
  const groupsMatched = Number(summary.groupsMatched || 0);
  const averageMatchTimeMs = Number(summary.averageMatchTimeMs || 0);
  const totalGames = Number(summary.totalGames || 0);
  const groupSize = Number(summary.groupSize || 2);
  const isTrios = groupSize >= 3;

  const avgMatchTimeLabel = averageMatchTimeMs > 0
    ? `${(averageMatchTimeMs / 1000).toFixed(1)}s`
    : '—';

  const rows = [
    {
      Icon: Boxes,
      label: isTrios ? 'Tríos completados' : 'Parejas completadas',
      value: groupsMatched,
      tone: 'text-accent-indigo'
    },
    {
      Icon: Hourglass,
      label: 'Tiempo medio por grupo',
      value: avgMatchTimeLabel,
      tone: 'text-text-secondary'
    },
    {
      Icon: Layers,
      label: 'Partidas jugadas',
      value: totalGames,
      tone: 'text-text-secondary'
    }
  ];

  return (
    <GlassCard className="p-5 flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="size-12 rounded-xl bg-accent-indigo/15 flex items-center justify-center"
          aria-hidden="true"
        >
          <Brain size={22} className="text-accent-indigo" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">Mejor racha</p>
          <p className="text-3xl font-bold font-display text-accent-indigo tabular-nums">
            {peakStreak}
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map(({ Icon, label, value, tone }) => (
          <li key={label} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-text-secondary">
              <Icon size={14} className={tone} aria-hidden="true" />
              {label}
            </span>
            <span className="font-display font-semibold text-text-primary tabular-nums">
              {value}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

MemoryHighlightCard.propTypes = {
  summary: PropTypes.shape({
    peakStreak: PropTypes.number,
    groupsMatched: PropTypes.number,
    averageMatchTimeMs: PropTypes.number,
    totalGames: PropTypes.number,
    groupSize: PropTypes.number
  })
};

export default memo(MemoryHighlightCard);
