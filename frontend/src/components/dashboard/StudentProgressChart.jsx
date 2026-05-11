import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ChartSection from './ChartSection';
import EmptyState from '../ui/EmptyState';
import { formatDate } from '../../lib/utils';

const PERIOD_OPTIONS = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
];

const hasValue = v => v !== null && v !== undefined;

export default function StudentProgressChart({ data, period = '7d', onPeriodChange, omitPeriodSelector = false }) {
  // Cuando el rango ya esta controlado por un toolbar global (Dashboard),
  // omitimos el selector interno para evitar duplicar el control
  // ("Ultimos 7 dias" mostrado dos veces — bug PROP-37 / fix PROP-43).
  const sectionPeriodChange = omitPeriodSelector ? undefined : onPeriodChange;

  // PROP-83: el backend devuelve N días aunque solo los últimos tengan partidas.
  // Antes, `connectNulls={false}` dejaba la línea "flotando al final" como si
  // el sistema estuviera roto. Recortamos al sub-rango con datos reales para
  // que el eje X arranque en la primera medición. Si los huecos quedan en
  // medio, siguen apareciendo como gaps (intencional, ver PROP-26).
  const trimmedData = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    let firstIdx = -1;
    let lastIdx = -1;
    for (let i = 0; i < data.length; i++) {
      const point = data[i];
      if (hasValue(point?.score) || hasValue(point?.classAverage)) {
        if (firstIdx === -1) firstIdx = i;
        lastIdx = i;
      }
    }
    if (firstIdx === -1) return [];
    return data.slice(firstIdx, lastIdx + 1);
  }, [data]);

  if (trimmedData.length === 0) {
    return (
      <ChartSection title="Rendimiento de Clase (Tendencia)" period={period} onPeriodChange={sectionPeriodChange} periodOptions={PERIOD_OPTIONS}>
        <EmptyState
          title="Sin datos disponibles"
          description="No hay datos de rendimiento para el periodo seleccionado."
          className="shadow-none border-none bg-transparent"
        />
      </ChartSection>
    );
  }

  return (
    <ChartSection title="Rendimiento de Clase (Tendencia)" period={period} onPeriodChange={sectionPeriodChange} periodOptions={PERIOD_OPTIONS}>
      <div className="h-[clamp(220px,30vh,360px)] w-full -ml-4 sm:ml-0 min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <AreaChart data={trimmedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {/* Fill area: en light el papel marfil "absorbe" mucha
                  saturación, así que subimos el offset de inicio a 0.55
                  para que el área se sienta tangible (el dark sigue bien
                  porque el fondo elevado deja respirar el morado). */}
              <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand-base)" stopOpacity={0.55} />
                <stop offset="55%" stopColor="var(--color-brand-base)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--color-brand-base)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorClass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-text-muted)" stopOpacity={0.18} />
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
              wrapperStyle={{ maxWidth: '90vw' }}
              itemStyle={{ color: 'var(--color-text-primary)' }}
              labelStyle={{ color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '8px' }}
              // Cuando el dia no tiene datos (PROP-26), score y classAverage
              // son null. Mostrar "Sin partidas" en lugar de "NaN%".
              formatter={(value, name) => {
                if (value === null || value === undefined) return ['Sin partidas', name];
                return [`${Math.round(value)}%`, name];
              }}
              labelFormatter={(label) => formatDate(label, 'weekday')}
            />
            <Area
              type="monotone"
              dataKey="classAverage"
              name="Promedio Clase"
              stroke="var(--color-text-muted)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              fill="url(#colorClass)"
              activeDot={false}
              dot={false}
              connectNulls={false}
            />
            <Area
              type="monotone"
              dataKey="score"
              name="Puntuación"
              stroke="var(--color-brand-base)"
              strokeWidth={2.5}
              fill="url(#colorScore)"
              dot={{ r: 3, fill: 'var(--color-brand-base)', stroke: 'var(--color-background-elevated)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: 'var(--color-brand-light)', stroke: 'var(--color-background-elevated)', strokeWidth: 2 }}
              connectNulls={false}
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
