import { memo, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import PropTypes from 'prop-types';
import ChartSection from '../dashboard/ChartSection';
import {
  ChartsThemeDefs,
  ThemedTooltipCard,
  commonAxisProps,
  commonGridProps,
  useChartMotion,
  getRAGPatternFill,
} from './ChartsTheme';
import ThemedChartContainer from './ThemedChartContainer';

/**
 * Tooltip personalizado para el chart
 */
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;

  return (
    <ThemedTooltipCard>
      <p className="font-semibold text-text-primary mb-1">{data.name}</p>
      <p className="text-text-secondary">
        Score: <span className="font-bold tabular-nums">{Math.round(data.score)}%</span>
      </p>
      {(data.gamesPlayed != null || data.totalGames != null) && (
        <p className="text-text-muted text-xs mt-0.5">
          {data.gamesPlayed ?? data.totalGames} {(data.gamesPlayed ?? data.totalGames) === 1 ? 'partida' : 'partidas'}
        </p>
      )}
    </ThemedTooltipCard>
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
  const motion = useChartMotion();
  const chartData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    return data
      .map(item => ({
        name: item.name || item.context || item.mechanic || item.contextName || item.mechanicName || 'Sin nombre',
        score: item.averageScore ?? item.avgScore ?? item.score ?? 0,
        gamesPlayed: item.gamesPlayed ?? item.totalGames ?? null,
      }))
      // Filtrar items sin partidas — evita mostrar mecánicas inactivas
      // como Secuencia ("Próximamente") con bar vacía. Solo aplica si el
      // item tiene gamesPlayed explicito a 0; null/undefined no se filtra
      // para mantener compatibilidad con backends que no lo envien.
      .filter(item => item.gamesPlayed === null || item.gamesPlayed > 0)
      .sort((a, b) => b.score - a.score);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <ChartSection title={title}>
        <div className="min-h-[160px] flex items-center justify-center py-8 text-center">
          <p className="text-sm text-text-muted">Sin datos disponibles para esta dimension.</p>
        </div>
      </ChartSection>
    );
  }

  const chartHeight = Math.max(160, chartData.length * 44 + 20);

  // Resumen accesible: mejor/peor + total. La tabla sr-only ofrece datos
  // completos para el usuario que use lector de pantalla.
  const dimensionLabel = dimension === 'context' ? 'contexto' : 'mecánica';
  const top = chartData[0];
  const bottom = chartData[chartData.length - 1];
  const accessibleSummary =
    chartData.length === 1
      ? `Único ${dimensionLabel}: ${top.name} con ${Math.round(top.score)}%.`
      : `Mejor ${dimensionLabel}: ${top.name} (${Math.round(top.score)}%). Peor: ${bottom.name} (${Math.round(bottom.score)}%). Total: ${chartData.length} ${dimensionLabel}s.`;
  const accessibleDataTable = chartData.map((item) => ({
    label: item.name,
    value: `${Math.round(item.score)}%`,
  }));

  return (
    <ChartSection title={title}>
      <ThemedChartContainer
        title={null}
        summary={accessibleSummary}
        dataTable={accessibleDataTable}
        dataTableCaption={`Rendimiento por ${dimensionLabel}`}
      >
      <div style={{ height: chartHeight, minHeight: chartHeight }} className="w-full mt-2">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
          >
            <ChartsThemeDefs />
            <CartesianGrid {...commonGridProps} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              {...commonAxisProps}
            />
            {/* width aumentado de 120 a 140 para que etiquetas largas como
                "Números del 1 al 6" o "Animales de Granja" no wrapeen en dos
                líneas y descentren la barra (QA 22/04/2026). */}
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              {...commonAxisProps}
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
              interval={0}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-text-primary)', fillOpacity: 0.04 }} />
            {/* BUG-A11Y-RECHARTS-PATH-LABEL (QA Sprint 0): Recharts forwarda
                aria-label a <path> internos, lo cual viola aria-prohibited-attr.
                El nombre accesible del chart se proporciona ya por
                ThemedChartContainer (region aria-label). */}
            <Bar
              dataKey="score"
              radius={[0, 6, 6, 0]}
              barSize={20}
              {...motion()}
            >
              {/* Cada celda usa pattern RAG (color + textura distintiva)
                  para que daltonismo rojo-verde distinga el estado sin
                  depender solo del color: verde con puntos, ámbar con
                  diagonales, rojo con guiones (T-952 Fase 0.D). */}
              {chartData.map(entry => (
                <Cell key={`cell-${entry.name}`} fill={getRAGPatternFill(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      </ThemedChartContainer>
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
