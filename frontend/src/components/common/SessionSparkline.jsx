/**
 * @fileoverview Sparkline minimalista para mostrar la tendencia de las últimas
 * partidas en la SessionCard (PROP-5).
 *
 * - 48px de alto, sin ejes ni tooltip (fondo decorativo).
 * - Gradient `--color-brand-base` → `--color-accent-indigo` para coherencia.
 * - `aria-hidden="true"`: la información numérica accesible va aparte
 *   ("Tendencia: X puntos de media") en el componente padre.
 * - Si hay menos de 2 puntos no se renderiza nada (el padre debe enseñar el
 *   fallback "Aún sin datos históricos").
 *
 * @module components/common/SessionSparkline
 */

import { useId, memo } from 'react';
import PropTypes from 'prop-types';
import { ResponsiveContainer, LineChart, Line, YAxis } from 'recharts';

const SessionSparkline = memo(function SessionSparkline({ data, height = 48 }) {
  const gradientId = useId();

  if (!Array.isArray(data) || data.length < 2) {
    return null;
  }

  // Recharts necesita keys consistentes; solo nos interesa el score como serie.
  const series = data.map((point, idx) => ({
    idx,
    score: point.score
  }));

  return (
    <div className="w-full" style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-brand-base)" stopOpacity={0.6} />
              <stop offset="100%" stopColor="var(--color-accent-indigo)" stopOpacity={0.95} />
            </linearGradient>
          </defs>
          {/* YAxis oculto pero define el dominio para que la línea no quede plana
              cuando todos los scores son iguales. */}
          <YAxis hide domain={[0, 100]} />
          <Line
            type="monotone"
            dataKey="score"
            stroke={`url(#${gradientId})`}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

SessionSparkline.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      score: PropTypes.number.isRequired,
      completedAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)])
    })
  ).isRequired,
  height: PropTypes.number
};

export default SessionSparkline;
