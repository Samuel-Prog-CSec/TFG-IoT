import { memo, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, formatDate } from '../../lib/utils';
import { scoreToRAG } from '../../constants/analyticsThresholds';
import GlassCard from '../ui/GlassCard';

/**
 * Colores CSS del indicador RAG para el tooltip
 */
const RAG_DOT_COLORS = {
  green: 'bg-success-base',
  amber: 'bg-warning-base',
  red: 'bg-error-base',
};

/**
 * Estilos del indicador de tendencia
 */
const TREND_STYLES = {
  improving: { icon: TrendingUp, label: 'Mejorando', color: 'text-success-base', bg: 'bg-success-base/10' },
  declining: { icon: TrendingDown, label: 'Declinando', color: 'text-error-base', bg: 'bg-error-base/10' },
  stable: { icon: Minus, label: 'Estable', color: 'text-text-muted', bg: 'bg-background-surface/50' },
};

/**
 * Tooltip personalizado del chart
 */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.[0]) return null;

  const studentScore = payload.find(p => p.dataKey === 'score');
  const classScore = payload.find(p => p.dataKey === 'classAverage');

  return (
    <div className="bg-background-elevated border border-border-default rounded-lg p-3 shadow-xl text-sm">
      <p className="text-text-muted text-xs mb-2">{label}</p>
      {studentScore && (
        <p className="text-text-primary flex items-center gap-1.5">
          Alumno:
          <span className={cn('inline-block w-2 h-2 rounded-full', RAG_DOT_COLORS[scoreToRAG(studentScore.value)])} />
          <span className="font-bold tabular-nums">{Math.round(studentScore.value)}</span>
        </p>
      )}
      {classScore && (
        <p className="text-text-muted">
          Clase: <span className="font-bold tabular-nums">{Math.round(classScore.value)}</span>
        </p>
      )}
      {studentScore && classScore && (
        <p className={cn(
          "text-xs mt-1 font-medium",
          studentScore.value >= classScore.value ? 'text-success-base' : 'text-error-base'
        )}>
          {studentScore.value >= classScore.value ? '+' : ''}
          {Math.round(studentScore.value - classScore.value)} vs clase
        </p>
      )}
    </div>
  );
}

/**
 * Grafico de trayectoria de aprendizaje con linea del alumno + overlay de promedio de clase.
 * Muestra indicador de tendencia (mejorando/estable/declinando).
 *
 * @param {Object} props
 * @param {Object} props.trajectoryData - Datos del endpoint /student/:id/trajectory
 * @param {Array} [props.classComparison] - Datos de promedio de clase para overlay
 * @param {string} [props.title] - Titulo personalizado
 */
function TrajectoryChart({ trajectoryData, classComparison, title = 'Trayectoria de Aprendizaje' }) {
  const chartData = useMemo(() => {
    if (!trajectoryData?.dataPoints) return [];

    return trajectoryData.dataPoints.map((point, index) => {
      const classPoint = classComparison?.[index];
      return {
        date: (point.date || point.period) ? formatDate(new Date(point.date || point.period), 'short') : `Punto ${index + 1}`,
        score: point.avgScore ?? point.averageScore ?? point.score ?? 0,
        classAverage: classPoint?.avgScore ?? classPoint?.averageScore ?? classPoint?.score ?? null,
      };
    });
  }, [trajectoryData, classComparison]);

  const trendDirection = trajectoryData?.trend?.direction || 'stable';
  const trendStyle = TREND_STYLES[trendDirection] || TREND_STYLES.stable;
  const TrendIcon = trendStyle.icon;

  if (chartData.length === 0) {
    return (
      <GlassCard variant="default" padding="none" className="p-5">
        <h3 className="text-base font-bold text-text-primary font-display mb-4">{title}</h3>
        <div className="h-[250px] flex items-center justify-center px-6">
          <p className="text-text-muted text-sm text-center">
            No hay partidas en este periodo. Cambia el rango de tiempo o espera a nuevas partidas.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-text-primary font-display">{title}</h3>
        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold", trendStyle.bg, trendStyle.color)} aria-label={`Tendencia: ${trendStyle.label}`}>
          <TrendIcon size={14} aria-hidden="true" />
          {trendStyle.label}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-brand-base rounded-full" />
          <span className="text-xs text-text-muted">Alumno</span>
        </div>
        {classComparison && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 border-t border-dashed border-text-muted" />
            <span className="text-xs text-text-muted">Promedio clase</span>
          </div>
        )}
      </div>

      <div className="h-[250px] w-full -ml-2">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid
              stroke="var(--color-border-subtle)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={35}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Class average (dashed line) */}
            {classComparison && (
              <Line
                type="monotone"
                dataKey="classAverage"
                stroke="var(--color-text-muted)"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}

            {/* Student score (solid line) */}
            <Line
              type="monotone"
              dataKey="score"
              stroke="var(--color-brand-base)"
              strokeWidth={2.5}
              dot={{ fill: 'var(--color-brand-base)', r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: 'var(--color-brand-glow)', strokeWidth: 2 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Trend confidence info */}
      {trajectoryData?.trend?.confidence && (
        <p className="text-xs text-text-disabled mt-2 text-right">
          Confianza: {trajectoryData.trend.confidence}
          {trajectoryData.trend.dataPoints && ` (${trajectoryData.trend.dataPoints} puntos)`}
        </p>
      )}
    </GlassCard>
  );
}

TrajectoryChart.propTypes = {
  trajectoryData: PropTypes.shape({
    dataPoints: PropTypes.arrayOf(PropTypes.shape({
      date: PropTypes.string,
      period: PropTypes.string,
      avgScore: PropTypes.number,
      averageScore: PropTypes.number,
      score: PropTypes.number,
    })),
    trend: PropTypes.shape({
      direction: PropTypes.oneOf(['improving', 'declining', 'stable']),
      confidence: PropTypes.string,
      dataPoints: PropTypes.number,
    }),
  }),
  classComparison: PropTypes.array,
  title: PropTypes.string,
};

export default memo(TrajectoryChart);
