import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ChartSection from './ChartSection';

const PERIOD_OPTIONS = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
];

export default function StudentProgressChart({ data, period = '7d', onPeriodChange }) {
  if (!data || data.length === 0) {
    return (
      <ChartSection title="Rendimiento de Clase (Tendencia)" period={period} onPeriodChange={onPeriodChange} periodOptions={PERIOD_OPTIONS}>
        <div className="h-[300px] w-full flex items-center justify-center text-slate-500">
          No hay datos disponibles
        </div>
      </ChartSection>
    );
  }

  return (
    <ChartSection title="Rendimiento de Clase (Tendencia)" period={period} onPeriodChange={onPeriodChange} periodOptions={PERIOD_OPTIONS}>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorClass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
            <XAxis
              dataKey="_id"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              dy={10}
              tickFormatter={(value) => {
                 const date = new Date(value);
                 return `${date.getDate()}/${date.getMonth() + 1}`;
              }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                backdropFilter: 'blur(10px)'
              }}
              labelStyle={{ color: '#94a3b8', fontWeight: 500 }}
              formater={(value) => [value, 'Puntuación']}
              labelFormatter={(label) => new Date(label).toLocaleDateString()}
            />
            <Area
              type="monotone"
              dataKey="classAverage"
              name="Promedio Clase"
              stroke="#475569"
              strokeWidth={2}
              strokeDasharray="4 4"
              fill="url(#colorClass)"
            />
            <Area
              type="monotone"
              dataKey="score" 
              // Nota: 'score' vendría si estuviéramos viendo un alumno concreto
              // Para la vista general de dashboard, usamos 'classAverage' como principal
              // Si 'getClassroomComparison' devuelve solo classAverage, ajustamos.
              // En este caso, el endpoint devuelve [{_id: date, classAverage: num}]
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500 mt-4 text-center">
        Promedio diario de puntuación de todos los alumnos en los últimos 7 días.
      </p>
    </ChartSection>
  );
}
