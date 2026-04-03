import { memo, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import PropTypes from 'prop-types';
import ChartSection from '../dashboard/ChartSection';

/**
 * Color RAG segun score
 */
const getRAGColor = (score) => {
  if (score >= 90) return 'var(--color-success-base)';
  if (score >= 70) return 'var(--color-success-base)';
  if (score >= 50) return 'var(--color-warning-base)';
  return 'var(--color-error-base)';
};

/**
 * Tooltip personalizado para el chart
 */
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-background-elevated border border-border-default rounded-lg p-3 shadow-xl text-sm">
      <p className="font-semibold text-text-primary mb-1">{data.name}</p>
      <p className="text-text-secondary">
        Score: <span className="font-bold tabular-nums">{Math.round(data.score)}%</span>
      </p>
      {data.gamesPlayed != null && (
        <p className="text-text-muted text-xs mt-0.5">{data.gamesPlayed} partidas</p>
      )}
    </div>
  );
}

/**
 * BarChart horizontal reutilizable que muestra rendimiento por dimension
 * (contexto tematico O mecanica de juego). Barras coloreadas con RAG.
 *
 * @param {Object} props
 * @param {string} props.title - Titulo de la seccion
 * @param {Array} props.data - [{name, score, gamesPlayed}]
 * @param {string} [props.dimension] - 'context' | 'mechanic' (para aria labels)
 */
function PerformanceByDimension({ title, data, dimension = 'context' }) {
  const chartData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    return data
      .map(item => ({
        name: item.name || item.contextName || item.mechanicName || 'Sin nombre',
        score: item.averageScore ?? item.score ?? 0,
        gamesPlayed: item.gamesPlayed ?? item.totalGames ?? null,
      }))
      .sort((a, b) => b.score - a.score);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <ChartSection title={title}>
        <div className="py-8 text-center">
          <p className="text-sm text-text-muted">Sin datos disponibles para esta dimension.</p>
        </div>
      </ChartSection>
    );
  }

  const chartHeight = Math.max(160, chartData.length * 44 + 20);

  return (
    <ChartSection title={title}>
      <div style={{ height: chartHeight }} className="w-full mt-2">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              horizontal={false}
              stroke="var(--color-border-subtle)"
              strokeDasharray="3 3"
            />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar
              dataKey="score"
              radius={[0, 6, 6, 0]}
              barSize={20}
              aria-label={`Rendimiento por ${dimension === 'context' ? 'contexto' : 'mecanica'}`}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getRAGColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}

PerformanceByDimension.propTypes = {
  title: PropTypes.string.isRequired,
  data: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string,
    contextName: PropTypes.string,
    mechanicName: PropTypes.string,
    averageScore: PropTypes.number,
    score: PropTypes.number,
    gamesPlayed: PropTypes.number,
    totalGames: PropTypes.number,
  })),
  dimension: PropTypes.oneOf(['context', 'mechanic']),
};

export default memo(PerformanceByDimension);
