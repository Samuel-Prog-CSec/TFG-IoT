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
import { memo, useState } from 'react';
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
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import {
  ChartsThemeDefs,
  ThemedTooltipCard,
  chartColors,
  chartTokens,
  commonAxisProps,
  commonGridProps,
  useChartMotion,
  legendTextFormatter,
} from './ChartsTheme';
import ThemedChartContainer from './ThemedChartContainer';

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
    <ThemedTooltipCard className="text-xs">
      <p className="font-semibold text-text-primary">{label}</p>
      <p className="text-accent-amber font-display">
        Mejor secuencia: <span className="font-bold">{point.maxLength}</span> cartas
      </p>
      {point.sequencesCompleted != null && (
        <p className="text-text-muted">
          Completadas: <span className="text-text-primary">{point.sequencesCompleted}</span>
        </p>
      )}
    </ThemedTooltipCard>
  );
}

CustomTooltip.propTypes = {
  active: PropTypes.bool,
  payload: PropTypes.array,
  label: PropTypes.string
};

const EMPTY_DATA = [];

// Opciones del selector de ventana temporal. Solo se ofrece cuando el alumno
// acumula bastantes partidas de Secuencia; permite enfocar las últimas N para
// leer mejor la tendencia reciente (el backend ya limita la serie a 50).
const WINDOW_OPTIONS = [
  { key: 'all', label: 'Todas' },
  { key: 25, label: '25' },
  { key: 10, label: '10' }
];
const WINDOW_SELECTOR_THRESHOLD = 12;

function SequenceProgressChart({ data = EMPTY_DATA, height = 240, showLegend = true, title = 'Evolución en Secuencia' }) {
  const motion = useChartMotion();
  const [windowSize, setWindowSize] = useState('all');
  const allPoints = (Array.isArray(data) ? data : []).map(item => ({
    date: formatShortDate(item.date || item.completedAt),
    maxLength: Number(item.maxLength || item.maxSequenceLengthAchieved || 0),
    sequencesCompleted: Number(item.sequencesCompleted || 0)
  }));
  // Vista del chart: todas las partidas o solo las últimas N.
  const points = windowSize === 'all' ? allPoints : allPoints.slice(-windowSize);
  const showWindowSelector = allPoints.length > WINDOW_SELECTOR_THRESHOLD;

  if (allPoints.length === 0) {
    return (
      <GlassCard className="p-6 text-center" contentClassName="flex flex-col items-center justify-center" style={{ minHeight: height }}>
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

  // Resumen accesible: describe TODAS las partidas registradas (no la ventana
  // visual), para que el lector de pantalla tenga el dato completo.
  const maxLengths = allPoints.flatMap((p) => p.maxLength > 0 ? [p.maxLength] : []);
  const bestEver = maxLengths.length ? Math.max(...maxLengths) : 0;
  const lastLength = allPoints[allPoints.length - 1]?.maxLength ?? 0;
  const accessibleSummary =
    allPoints.length > 0
      ? `Mejor longitud histórica: ${bestEver} cartas. Última partida: ${lastLength} cartas en ${allPoints.length} partidas registradas.`
      : 'Sin partidas de Secuencia registradas.';
  const accessibleDataTable = allPoints.map((p) => ({
    label: p.date,
    value: `${p.maxLength} cartas`,
  }));

  return (
    <GlassCard className="p-4">
      <ThemedChartContainer
        title={title}
        summary={accessibleSummary}
        dataTable={accessibleDataTable}
        dataTableCaption="Longitud máxima por partida de Secuencia"
        headerExtra={
          <div className="flex items-center gap-2">
            {showWindowSelector && (
              <div
                className="flex items-center gap-0.5 rounded-lg bg-background-surface/50 p-0.5"
                role="group"
                aria-label="Rango de partidas mostradas"
              >
                {WINDOW_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setWindowSize(opt.key)}
                    aria-pressed={windowSize === opt.key}
                    className={cn(
                      'px-2 py-0.5 text-nano font-medium rounded-md transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber/50',
                      windowSize === opt.key
                        ? 'bg-accent-amber/20 text-accent-amber'
                        : 'text-text-muted hover:text-text-secondary'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            <ListOrdered size={16} className="text-accent-amber" aria-hidden="true" />
          </div>
        }
      >
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <ChartsThemeDefs />
            <CartesianGrid {...commonGridProps} />
            <XAxis dataKey="date" {...commonAxisProps} />
            <YAxis
              {...commonAxisProps}
              allowDecimals={false}
              domain={[0, 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend formatter={legendTextFormatter} wrapperStyle={{ fontSize: chartTokens.axisTickFontSize }} />}
            <Line
              type="monotone"
              dataKey="maxLength"
              name="Longitud máxima"
              stroke={`url(#${chartColors.byMechanic.sequence.gradientId})`}
              strokeWidth={2.5}
              dot={{ r: 3, fill: chartColors.byMechanic.sequence.fill }}
              activeDot={{ r: 5 }}
              {...motion()}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      </ThemedChartContainer>
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
