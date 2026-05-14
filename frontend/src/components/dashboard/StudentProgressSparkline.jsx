/**
 * @fileoverview Sparkline compacta de evolución de score de un alumno
 * (T-953 Fase A). Pensado para incrustarse en cards densas del dashboard
 * o en filas de la tabla "Mis Alumnos" — ~80px de alto, sin ejes ni
 * tooltip, sin labels. La idea es comunicar la TENDENCIA de un vistazo,
 * no leer valores exactos.
 *
 * Si quieres valores exactos, usa `<TrajectoryChart />` que tiene
 * tooltip + ejes + indicador de tendencia.
 *
 * @module components/dashboard/StudentProgressSparkline
 */

import { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import { LineChart, Line, ResponsiveContainer, YAxis, Area } from 'recharts';
import { ChartsThemeDefs, chartColors } from '../analytics/ChartsTheme';

/**
 * @param {Object} props
 * @param {Array<{date?: string, score?: number}>} props.data - Puntos en
 *   orden cronológico ascendente (más antiguo primero).
 * @param {number} [props.height=48] - Alto en px. Recomendado 36-80.
 * @param {string} [props.tone='brand'] - Paleta: `'brand'` (default),
 *   `'memory'`, `'association'`, `'sequence'`, `'success'`, `'warning'`,
 *   `'error'`. Resuelve via `chartColors`.
 * @param {boolean} [props.showArea=true] - Si renderiza el área debajo
 *   de la línea (más visible) o solo la línea.
 * @param {string} [props.ariaLabel] - Etiqueta accesible para screen
 *   readers ("Evolución de Isabella: 12 puntos en 7 partidas").
 */
function StudentProgressSparkline({
  data = [],
  height = 48,
  tone = 'brand',
  showArea = true,
  ariaLabel,
}) {
  const chartData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    return data
      .filter((d) => d && d.score != null && Number.isFinite(Number(d.score)))
      .map((d, i) => ({
        x: i,
        score: Math.max(0, Math.min(100, Number(d.score))),
      }));
  }, [data]);

  if (chartData.length < 2) {
    // Con menos de 2 puntos no hay "evolución" que comunicar — placeholder
    // sutil mejor que un line chart vacío que se vería roto.
    return (
      <div
        className="flex items-center justify-center text-text-disabled text-xs"
        style={{ height }}
        aria-label={ariaLabel || 'Sin datos suficientes para sparkline'}
      >
        —
      </div>
    );
  }

  const palette =
    chartColors.byMechanic[tone] || chartColors.bySemantic[tone] || chartColors.bySemantic.brand;
  const gradientId = palette.gradientId || chartColors.bySemantic.brand.gradientId;

  return (
    <div
      role="img"
      aria-label={
        ariaLabel ||
        `Evolución del alumno: de ${Math.round(chartData[0].score)} a ${Math.round(
          chartData[chartData.length - 1].score,
        )} puntos en ${chartData.length} muestras`
      }
      style={{ height }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height="100%" debounce={50}>
        <LineChart
          data={chartData}
          margin={{ top: 4, right: 2, left: 2, bottom: 4 }}
        >
          <ChartsThemeDefs />
          {/* YAxis hidden: domain fijo 0-100 evita que sparklines de
              alumnos con menor variabilidad se vean comprimidos
              (efecto "sin progreso" cuando solo hay 5 puntos en rango
              corto). El visual real lo da el gradient + monotone. */}
          <YAxis hide domain={[0, 100]} />
          {showArea && (
            <Area
              type="monotone"
              dataKey="score"
              stroke="none"
              fill="url(#chart-area-brand)"
              isAnimationActive={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="score"
            stroke={`url(#${gradientId})`}
            strokeWidth={1.75}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

StudentProgressSparkline.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      date: PropTypes.string,
      score: PropTypes.number,
    }),
  ),
  height: PropTypes.number,
  tone: PropTypes.oneOf(['brand', 'memory', 'association', 'sequence', 'success', 'warning', 'error']),
  showArea: PropTypes.bool,
  ariaLabel: PropTypes.string,
};

export default memo(StudentProgressSparkline);
