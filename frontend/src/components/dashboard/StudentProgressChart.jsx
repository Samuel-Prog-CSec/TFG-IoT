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
        <div className="h-[300px] w-full flex items-center justify-center text-text-muted font-medium">
          No hay datos disponibles
        </div>
      </ChartSection>
    );
  }

  return (
    <ChartSection title="Rendimiento de Clase (Tendencia)" period={period} onPeriodChange={onPeriodChange} periodOptions={PERIOD_OPTIONS}>
      <div className="h-[300px] w-full -ml-4 sm:ml-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-brand-base)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-brand-base)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorClass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-text-muted)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="var(--color-text-muted)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
            <XAxis
              dataKey="_id"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500 }}
              dy={10}
              tickFormatter={(value) => {
                 const date = new Date(value);
                 return `${date.getDate()}/${date.getMonth() + 1}`;
              }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500 }}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-background-elevated)',
                border: '1px solid var(--color-border-default)',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                backdropFilter: 'blur(16px)'
              }}
              itemStyle={{ color: 'var(--color-text-primary)' }}
              labelStyle={{ color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '8px' }}
              formatter={(value) => [`${value}%`, 'Promedio']}
              labelFormatter={(label) => new Date(label).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
            />
            <Area
              type="monotone"
              dataKey="classAverage"
              name="Promedio Clase"
              stroke="var(--color-text-secondary)"
              strokeWidth={3}
              fill="url(#colorClass)"
              activeDot={{ r: 6, fill: "var(--color-brand-light)", stroke: "var(--color-background-elevated)", strokeWidth: 2 }}
            />
            <Area
              type="monotone"
              dataKey="score" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-text-muted mt-6 text-center font-medium">
        Promedio diario de puntuación basado en las últimas sesiones jugadas.
      </p>
    </ChartSection>
  );
}
