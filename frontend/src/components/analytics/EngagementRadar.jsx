import { memo, useMemo } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import {
  ChartsThemeDefs,
  ThemedTooltipCard,
  chartColors,
  chartTokens,
  useChartMotion,
} from './ChartsTheme';
import ThemedChartContainer from './ThemedChartContainer';

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
    <ThemedTooltipCard className="text-sm p-2.5">
      <p className="text-text-primary font-medium">{data.label}</p>
      <p className="text-text-muted tabular-nums">{Math.round(data.value)}%</p>
    </ThemedTooltipCard>
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
  const motion = useChartMotion();

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

  // Estado vacío: sin datos de componentes o engagement nulo. `score == null`
  // (no `!score`): un engagement de EXACTAMENTE 0 es un dato válido (implicación
  // muy baja), no "sin datos" — antes el 0 se trataba erróneamente como vacío.
  const isEmpty = chartData.length === 0 || !engagement || score == null;

  // Estado "datos insuficientes":
  // (a) al menos 3 de 5 ejes en cero/null, o
  // (b) al menos 4 de 5 ejes con valor despreciable (<=2 ejes con senal real >15).
  // Evita renderizar un radar deformado (pajita apuntando a un eje aislado)
  // cuando solo una o dos metricas tienen senal real (QA 2026-04-24, caso
  // detectado en alumno con 4 partidas donde Completado+Regularidad altas
  // y el resto casi 0 producian el sliver).
  const zeroAxes = chartData.filter(d => !d.value || d.value === 0).length;
  const SIGNAL_THRESHOLD = 15;
  const signalAxes = chartData.filter(d => (d.value ?? 0) > SIGNAL_THRESHOLD).length;
  const hasInsufficientData = !isEmpty && (zeroAxes >= 3 || signalAxes < 3);

  if (isEmpty || hasInsufficientData) {
    return (
      <GlassCard variant="default" padding="none" className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary font-display">Implicación</h2>
          {/* Pintamos el RAG aunque el radar sea degenerado: el profesor
              sigue necesitando saber si el score global es Alto/Medio/Bajo
              aunque el desglose por ejes no sea visualizable. */}
          {rag && hasInsufficientData && (
            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold", rag.bg, rag.color)}>
              {Math.round(score)} · {rag.label}
            </div>
          )}
        </div>
        <div className="py-8 text-center px-6">
          <p className="text-text-muted text-sm text-center">
            {hasInsufficientData
              ? 'Datos insuficientes para visualizar el desglose por ejes. Se necesitan más partidas distribuidas en el tiempo para calcular todas las métricas.'
              : 'Sin datos de implicación aún. Se calculará cuando el alumno acumule más partidas.'}
          </p>
        </div>
      </GlassCard>
    );
  }

  // Resumen accesible: score global + desglose por eje. Sustituye el
  // anuncio pobre del SVG ("group radar polygon").
  const accessibleSummary = (() => {
    const parts = [`Implicación global: ${Math.round(score)} de 100`];
    if (rag) parts.push(`categoría ${rag.label}`);
    if (chartData.length > 0) {
      const desglose = chartData
        .map((d) => `${d.label} ${Math.round(d.value)}%`)
        .join(', ');
      parts.push(`desglose: ${desglose}`);
    }
    return `${parts.join('. ')  }.`;
  })();

  const accessibleDataTable = chartData.map((d) => ({
    label: d.label,
    value: `${Math.round(d.value)}%`,
  }));

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <ThemedChartContainer
        title="Implicación"
        summary={accessibleSummary}
        dataTable={accessibleDataTable}
        dataTableCaption="Desglose de la implicación por componente"
        headerExtra={
          rag ? (
            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold", rag.bg, rag.color)}>
              {Math.round(score)} · {rag.label}
            </div>
          ) : null
        }
      >

      <div className="aspect-square w-full max-h-[360px] min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          {/* outerRadius=80% para aprovechar el alto extra del contenedor;
              el radar se veia demasiado pequeno a 70% en 1920px (QA 22/04/2026). */}
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
            <ChartsThemeDefs />
            <PolarGrid
              stroke={chartTokens.gridStroke}
              gridType="polygon"
            />
            <PolarAngleAxis
              dataKey="label"
              tick={{ fill: chartTokens.axisTickFill, fontSize: chartTokens.axisTickFontSize }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} wrapperStyle={{ maxWidth: '90vw' }} />
            <Radar
              name="Implicación"
              dataKey="value"
              stroke={chartColors.byMechanic.association.stroke}
              fill={chartColors.byMechanic.association.fill}
              fillOpacity={0.2}
              strokeWidth={2}
              {...motion()}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      </ThemedChartContainer>
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
