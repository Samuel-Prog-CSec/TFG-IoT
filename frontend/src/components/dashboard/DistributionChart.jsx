import { memo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import PropTypes from 'prop-types';

/**
 * Gráfico de distribución de rendimiento (Histograma)
 * Muestra cuántos estudiantes están en cada rango de puntaje.
 * Ayuda a identificar outliers (estudiantes con dificultades o excelencia).
 */
function DistributionChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barSize={40} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
        <XAxis 
          dataKey="range" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500 }} 
          dy={10} 
        />
        <YAxis 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500 }}
          allowDecimals={false}
        />
        <Tooltip 
          cursor={{ fill: 'var(--color-background-surface)', opacity: 0.5 }}
          contentStyle={{ 
            backgroundColor: 'var(--color-background-elevated)', 
            border: '1px solid var(--color-border-default)', 
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(16px)'
          }}
          itemStyle={{ color: 'var(--color-text-primary)', fontWeight: 600 }}
          labelStyle={{ color: 'var(--color-text-muted)', fontWeight: 500, marginBottom: '8px' }}
          formatter={(value) => [`${value} Estudiantes`, 'Cantidad']}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.range === '0-49' ? 'var(--color-error-base)' : entry.range === '90-100' ? 'var(--color-success-base)' : 'var(--color-brand-base)'} 
              fillOpacity={0.9}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

DistributionChart.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({
    range: PropTypes.string.isRequired,
    count: PropTypes.number.isRequired,
  })).isRequired,
};

export default memo(DistributionChart);
