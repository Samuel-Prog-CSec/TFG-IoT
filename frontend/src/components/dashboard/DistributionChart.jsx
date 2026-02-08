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
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} barSize={40}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
        <XAxis 
          dataKey="range" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: '#64748b', fontSize: 12 }} 
          dy={10} 
        />
        <YAxis 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: '#64748b', fontSize: 12 }}
          allowDecimals={false}
        />
        <Tooltip 
          cursor={{ fill: '#ffffff05' }}
          contentStyle={{ 
            backgroundColor: 'rgba(30, 41, 59, 0.95)', 
            border: '1px solid rgba(255,255,255,0.1)', 
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(10px)'
          }}
          itemStyle={{ color: '#fff' }}
          labelStyle={{ color: '#94a3b8', fontWeight: 500 }}
          formatter={(value) => [`${value} Estudiantes`, 'Cantidad']}
        />
        <Bar dataKey="count" radius={[8, 8, 8, 8]}>
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.range === '0-49' ? '#fb7185' : entry.range === '90-100' ? '#4ade80' : '#8b5cf6'} 
              fillOpacity={0.8}
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
