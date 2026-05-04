/**
 * @fileoverview Chart Recharts para la mecánica Secuencia.
 *
 * Eje X = fecha de partida; eje Y = `maxSequenceLengthAchieved` por partida.
 * Permite al profesor ver la evolución de la "memoria de trabajo" del alumno
 * a lo largo del tiempo. Empty state si no hay partidas Secuencia.
 *
 * Tint ámbar (acento de la mecánica Secuencia) para coherencia visual con
 * `MECHANIC_LABELS.sequence`.
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';
import { ListOrdered } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

const formatShortDate = iso => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  } catch {
    return '';
  }
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg bg-background-elevated/95 border border-border-default px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="font-semibold text-text-primary">{label}</p>
      <p className="text-accent-amber font-display">
        Mejor secuencia: <span className="font-bold">{point.maxLength}</span> cartas
      </p>
      {point.sequencesCompleted != null && (
        <p className="text-text-muted">
          Completadas: <span className="text-text-primary">{point.sequencesCompleted}</span>
        </p>
      )}
    </div>
  );
}

CustomTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  label: PropTypes.string
};

function SequenceProgressChart({ data = [], height = 240, showLegend = true, title = 'Evolución en Secuencia' }) {
  const points = (Array.isArray(data) ? data : []).map(item => ({
    date: formatShortDate(item.date || item.completedAt),
    maxLength: Number(item.maxLength || item.maxSequenceLengthAchieved || 0),
    sequencesCompleted: Number(item.sequencesCompleted || 0)
  }));

  if (points.length === 0) {
    return (
      <GlassCard className="p-6 flex flex-col items-center justify-center text-center" style={{ minHeight: height }}>
        <div className="size-14 rounded-full bg-accent-amber/15 flex items-center justify-center mb-3" aria-hidden="true">
          <ListOrdered size={26} className="text-accent-amber" />
        </div>
        <h3 className="font-semibold text-text-primary mb-1">{title}</h3>
        <p className="text-sm text-text-muted max-w-md">
          Aún no se han jugado partidas de Secuencia. Tras la primera partida verás aquí la evolución
          de la longitud máxima memorizada por el alumno.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <ListOrdered size={16} className="text-accent-amber" aria-hidden="true" />
        <h3 className="font-semibold text-text-primary text-sm">{title}</h3>
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="sequenceLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-accent-amber, #f59e0b)" stopOpacity={0.9} />
                <stop offset="100%" stopColor="var(--color-accent-amber, #f59e0b)" stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border-subtle, rgba(255,255,255,0.08))" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="var(--color-text-muted, #94a3b8)" tick={{ fontSize: 11 }} />
            <YAxis
              stroke="var(--color-text-muted, #94a3b8)"
              tick={{ fontSize: 11 }}
              allowDecimals={false}
              domain={[0, 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend wrapperStyle={{ fontSize: 11, color: 'var(--color-text-muted, #94a3b8)' }} />}
            <Line
              type="monotone"
              dataKey="maxLength"
              name="Longitud máxima"
              stroke="url(#sequenceLine)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--color-accent-amber, #f59e0b)' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

SequenceProgressChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string,
      completedAt: PropTypes.string,
      maxLength: PropTypes.number,
      maxSequenceLengthAchieved: PropTypes.number,
      sequencesCompleted: PropTypes.number
    })
  ),
  height: PropTypes.number,
  showLegend: PropTypes.bool,
  title: PropTypes.string
};

export default memo(SequenceProgressChart);
