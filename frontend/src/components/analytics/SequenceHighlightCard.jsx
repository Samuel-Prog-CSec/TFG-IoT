/**
 * @fileoverview Card resumen de la mecánica Secuencia para `StudentProfile`.
 * Renderiza al lado del SequenceProgressChart cuando el alumno ha jugado
 * al menos una partida de Secuencia en el rango temporal.
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import { ListOrdered, CheckCircle2, XCircle, Clock3, Sparkles } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

function SequenceHighlightCard({ summary }) {
  if (!summary) return null;

  // `?? 0`: si el backend omite alguna métrica de la fila, mostramos "0" en vez
  // de una celda en blanco (la hero métrica ya lo hacía con `|| 0`).
  const rows = [
    { Icon: CheckCircle2, label: 'Completas', value: summary.sequencesCompleted ?? 0, tone: 'text-success-base' },
    { Icon: XCircle, label: 'Bloqueadas', value: summary.sequencesBlocked ?? 0, tone: 'text-error-base' },
    { Icon: Clock3, label: 'Sin tiempo', value: summary.sequencesTimedOut ?? 0, tone: 'text-accent-amber' },
    { Icon: Sparkles, label: 'Pistas usadas', value: summary.hintsUsed ?? 0, tone: 'text-brand-base' }
  ];

  return (
    <GlassCard className="p-5 flex flex-col transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-[var(--shadow-md)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="size-12 rounded-xl bg-accent-amber/15 flex items-center justify-center" aria-hidden="true">
          <ListOrdered size={22} className="text-accent-amber" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted">Mejor secuencia</p>
          <p className="text-3xl font-bold font-display text-accent-amber tabular-nums">
            {summary.maxSequenceLengthAchieved || 0}
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
            <span className="font-display font-semibold text-text-primary tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

SequenceHighlightCard.propTypes = {
  summary: PropTypes.shape({
    sequencesCompleted: PropTypes.number,
    sequencesBlocked: PropTypes.number,
    sequencesTimedOut: PropTypes.number,
    maxSequenceLengthAchieved: PropTypes.number,
    hintsUsed: PropTypes.number
  })
};

export default memo(SequenceHighlightCard);
