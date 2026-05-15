import { memo, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, formatDate } from '../../lib/utils';
import { scoreToRAG } from '../../constants/analyticsThresholds';
import GlassCard from '../ui/GlassCard';
import {
  ChartsThemeDefs,
  ThemedTooltipCard,
  chartColors,
  commonAxisProps,
  commonGridProps,
  useChartMotion,
} from './ChartsTheme';
import ThemedChartContainer, {
  buildTrendSummary,
  buildTrendDataTable,
} from './ThemedChartContainer';

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
    <ThemedTooltipCard>
      <p className="text-text-muted text-xs mb-2">{label}</p>
      {studentScore && (
        <p className="text-text-primary flex items-center gap-1.5">
          <span>Alumno:</span>
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
    </ThemedTooltipCard>
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
// Clamp defensivo a [0, 100] para que la línea no se salga del área del chart
// cuando el backend envía scores crudos (p. ej. maxScore sin normalizar en
// sesiones legadas). YAxis domain=[0,100] solo oculta overflow si ademas
// clampeamos los valores — si no, la curva monotone hace overshoot visible.
const clampScore = value => {
  if (value == null) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.max(0, Math.min(100, n));
};

function TrajectoryChart({ trajectoryData, classComparison, title = 'Trayectoria de Aprendizaje' }) {
  const motion = useChartMotion();

  const chartData = useMemo(() => {
    if (!trajectoryData?.dataPoints) return [];

    return trajectoryData.dataPoints.map((point, index) => {
      const classPoint = classComparison?.[index];
      const rawScore = point.avgScore ?? point.averageScore ?? point.score ?? 0;
      const rawClass = classPoint?.avgScore ?? classPoint?.averageScore ?? classPoint?.score ?? null;
      return {
        date: (point.date || point.period) ? formatDate(new Date(point.date || point.period), 'short') : `Punto ${index + 1}`,
        score: clampScore(rawScore) ?? 0,
        classAverage: clampScore(rawClass),
      };
    });
  }, [trajectoryData, classComparison]);

  const trendDirection = trajectoryData?.trend?.direction || 'stable';
  const trendStyle = TREND_STYLES[trendDirection] || TREND_STYLES.stable;
  const TrendIcon = trendStyle.icon;

  // Resumen accesible (sr-only) y tabla de datos (sr-only). Permiten a un
  // lector de pantalla anunciar el contenido del chart sin tener que
  // interpretar el SVG punto a punto. WCAG 2.2 §1.1.1 + §1.3.1.
  const accessibleSummary = useMemo(
    () => buildTrendSummary(chartData, { subject: 'Alumno', metric: 'puntuación' }),
    [chartData],
  );
  const accessibleDataTable = useMemo(
    () => buildTrendDataTable(chartData, { dateKey: 'date', valueKey: 'score', valueSuffix: ' puntos' }),
    [chartData],
  );

  if (chartData.length === 0) {
    return (
      <GlassCard variant="default" padding="none" className="p-5 h-full">
        <h3 className="text-base font-semibold text-text-primary font-display mb-4">{title}</h3>
        <div className="h-[250px] flex items-center justify-center px-6">
          <p className="text-text-muted text-sm text-center">
            No hay partidas en este periodo. Cambia el rango de tiempo o espera a nuevas partidas.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" padding="none" className="p-5 h-full">
      <ThemedChartContainer
        title={title}
        summary={accessibleSummary}
        dataTable={accessibleDataTable}
        dataTableCaption={`Detalle de la trayectoria del alumno por fecha`}
        headerExtra={
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold", trendStyle.bg, trendStyle.color)} aria-label={`Tendencia: ${trendStyle.label}`}>
            <TrendIcon size={14} aria-hidden="true" />
            {trendStyle.label}
          </div>
        }
      >

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

      <div className="h-[clamp(220px,30vh,320px)] w-full -ml-2 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <ChartsThemeDefs />
            <CartesianGrid {...commonGridProps} vertical={false} />
            <XAxis dataKey="date" {...commonAxisProps} />
            <YAxis
              {...commonAxisProps}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              width={35}
            />
            <Tooltip content={<CustomTooltip />} wrapperStyle={{ maxWidth: '90vw' }} />

            {/* Class average (dashed line) — entra primero (seriesIndex=0)
                para que el ojo establezca el baseline de la clase antes de
                ver la curva del alumno. */}
            {classComparison && (
              <Line
                type="monotone"
                dataKey="classAverage"
                stroke={chartColors.bySemantic.muted.stroke}
                strokeDasharray="6 4"
                strokeWidth={1.5}
                dot={false}
                connectNulls
                {...motion(0)}
              />
            )}

            {/* Student score (solid line) — gradient brand para que el ojo
                lea el progreso de izquierda a derecha en lugar de un color
                plano. Permite también que light/dark resuelva via tokens.
                Entra 80ms después que la línea de clase. */}
            <Line
              type="monotone"
              dataKey="score"
              stroke={`url(#${chartColors.bySemantic.brand.gradientId})`}
              strokeWidth={2.5}
              dot={{ fill: chartColors.bySemantic.brand.fill, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: 'var(--color-brand-glow)', strokeWidth: 2 }}
              connectNulls
              {...motion(1)}
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
      </ThemedChartContainer>
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
