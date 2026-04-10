import { memo, useMemo } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';

/**
 * Labels en espanol para los componentes de engagement
 */
const ENGAGEMENT_LABELS = {
  playFrequency: 'Frecuencia',
  regularity: 'Regularidad',
  completionRate: 'Completado',
  avgTimeBetweenSessions: 'Constancia',
  voluntaryReplays: 'Replays',
};

/**
 * Color RAG del score total de engagement
 */
const getEngagementRAG = (score) => {
  if (score >= 60) return { label: 'Alto', color: 'text-success-base', bg: 'bg-success-base/10' };
  if (score >= 35) return { label: 'Medio', color: 'text-warning-base', bg: 'bg-warning-base/10' };
  return { label: 'Bajo', color: 'text-error-base', bg: 'bg-error-base/10' };
};

/**
 * Tooltip personalizado
 */
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-background-elevated border border-border-default rounded-lg p-2.5 shadow-xl text-sm">
      <p className="text-text-primary font-medium">{data.label}</p>
      <p className="text-text-muted tabular-nums">{Math.round(data.value)}%</p>
    </div>
  );
}

/**
 * RadarChart de engagement con 5 ejes que muestra el desglose del
 * score de engagement del estudiante. Visualiza que tan activo y
 * consistente es el alumno en sus partidas.
 *
 * Los 5 componentes (pesos del backend analyticsHelpers.js):
 * - playFrequency (0.25): cuantas partidas juega
 * - regularity (0.25): que tan regular es
 * - completionRate (0.30): que porcentaje completa
 * - timeBetweenSessions (0.10): tiempo entre sesiones
 * - voluntaryReplays (0.10): replays voluntarios
 *
 * @param {Object} props
 * @param {Object} [props.engagement] - Datos del endpoint /student/:id/engagement
 */
function EngagementRadar({ engagement }) {
  const chartData = useMemo(() => {
    if (!engagement?.components) return [];

    return Object.entries(ENGAGEMENT_LABELS).map(([key, label]) => {
      const component = engagement.components[key];
      // El backend devuelve objetos {value, score, ...} — usar score (0-100) directamente
      const rawValue = typeof component === 'object' && component !== null
        ? (component.score ?? 0)
        : (component ?? 0) * 100;
      return { label, value: rawValue, fullMark: 100 };
    });
  }, [engagement]);

  const score = engagement?.engagementScore;
  const rag = score != null ? getEngagementRAG(score) : null;

  // Estado vacio: sin datos de componentes, o engagement nulo/cero
  const isEmpty = chartData.length === 0 || !engagement || (!score && score !== undefined);

  if (isEmpty) {
    return (
      <GlassCard variant="default" padding="none" className="p-5">
        <h3 className="text-base font-bold text-text-primary font-display mb-4">Engagement</h3>
        <div className="py-8 text-center px-6">
          <p className="text-text-muted text-sm text-center">
            Sin datos de engagement aun. Se calculara cuando el alumno acumule mas partidas.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold text-text-primary font-display">Engagement</h3>
        {rag && (
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold", rag.bg, rag.color)}>
            {Math.round(score)} — {rag.label}
          </div>
        )}
      </div>

      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
            <PolarGrid
              stroke="var(--color-border-subtle)"
              gridType="polygon"
            />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Radar
              name="Engagement"
              dataKey="value"
              stroke="var(--color-accent-cyan)"
              fill="var(--color-accent-cyan)"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

EngagementRadar.propTypes = {
  engagement: PropTypes.shape({
    engagementScore: PropTypes.number,
    components: PropTypes.shape({
      playFrequency: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
      regularity: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
      completionRate: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
      avgTimeBetweenSessions: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
      voluntaryReplays: PropTypes.oneOfType([PropTypes.number, PropTypes.object]),
    }),
  }),
};

export default memo(EngagementRadar);
