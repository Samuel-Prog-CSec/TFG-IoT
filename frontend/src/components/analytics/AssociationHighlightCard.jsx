/**
 * @fileoverview Card resumen de la mecánica Asociación para
 * `StudentProfile` (ADR-F, sesión 04/05/2026).
 *
 * Hero metric: peakStreak (mejor racha de aciertos consecutivos). Tres
 * filas de detalle: partidas jugadas, mejor tiempo de acierto, peor
 * tiempo de acierto. La "categoría dominante" no se expone aquí porque
 * el endpoint summary no la agrega cross-partidas (vive en cada
 * GameOver). Si el frontend la necesitara como lifetime, habría que
 * añadirla a la pipeline analíticaaggregada.
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import { Link2, Layers, Zap, TimerReset } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

const formatMs = ms => {
  if (!ms || ms <= 0) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
};

function AssociationHighlightCard({ summary }) {
  if (!summary) return null;
  const peakStreak = Number(summary.peakStreak || 0);
  const totalGames = Number(summary.totalGames || 0);
  const quickestCorrectMs = summary.quickestCorrectMs ?? null;
  const slowestCorrectMs = summary.slowestCorrectMs ?? null;

  const rows = [
    {
      Icon: Layers,
      label: 'Partidas jugadas',
      value: totalGames,
      tone: 'text-text-secondary'
    },
    {
      Icon: Zap,
      label: 'Acierto más rápido',
      value: formatMs(quickestCorrectMs),
      tone: 'text-accent-cyan'
    },
    {
      Icon: TimerReset,
      label: 'Acierto más lento',
      value: formatMs(slowestCorrectMs),
      tone: 'text-text-secondary'
    }
  ];

  return (
    <GlassCard className="p-5 flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="size-12 rounded-xl bg-accent-cyan/15 flex items-center justify-center"
          aria-hidden="true"
        >
          <Link2 size={22} className="text-accent-cyan" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">Mejor racha</p>
          <p className="text-3xl font-bold font-display text-accent-cyan tabular-nums">
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

AssociationHighlightCard.propTypes = {
  summary: PropTypes.shape({
    peakStreak: PropTypes.number,
    totalGames: PropTypes.number,
    quickestCorrectMs: PropTypes.number,
    slowestCorrectMs: PropTypes.number
  })
};

export default memo(AssociationHighlightCard);
