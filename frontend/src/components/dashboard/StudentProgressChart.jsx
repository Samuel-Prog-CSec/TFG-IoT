import { memo, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LineChart, Eye, EyeOff } from 'lucide-react';
import ChartSection from './ChartSection';
import EmptyState from '../ui/EmptyState';
import ButtonPremium from '../ui/ButtonPremium';
import SelectPremium from '../ui/SelectPremium';
import { formatDate, cn } from '../../lib/utils';
import { useChartMotion } from '../analytics/ChartsTheme';
import ThemedChartContainer, {
  buildTrendSummary,
  buildTrendDataTable,
} from '../analytics/ThemedChartContainer';

const PERIOD_OPTIONS = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
];

const VIEW_MODE_OPTIONS = [
  { value: 'byStudent', label: 'Por alumno' },
  { value: 'byMechanic', label: 'Por mecánica' },
];

const hasValue = v => v !== null && v !== undefined;

/**
 * StudentProgressChart — tendencia diaria del rendimiento de aula.
 *
 * T-942 Fase E.2: prop `showClassroomMean` (default true) habilita una
 * línea con la media del aula (`classAverage`) que el endpoint ya
 * devuelve por fecha. El toggle "Mostrar media" en el header del
 * chart la oculta sin re-fetch.
 *
 * T-942 Fase E.3: prop `viewMode` (default 'byStudent') prepara la
 * variante "Por mecánica" — superpondría 3 líneas (Asociación / Memoria
 * / Secuencia). Hoy, el endpoint `/analytics/classroom/comparison` solo
 * devuelve una agregación por fecha sin desglose de mecánica, por lo
 * que la opción se muestra deshabilitada con un empty state
 * explicativo (no inventamos datos). Cuando el backend exponga la
 * serie temporal por mecánica, se elimina la rama empty y se renderiza
 * el chart con 3 `<Area>` adicionales.
 *
 * @param {object} props
 * @param {Array<{_id: string, score: number|null, classAverage: number|null}>} props.data
 * @param {'7d'|'30d'|'90d'} [props.period]
 * @param {(period: string) => void} [props.onPeriodChange]
 * @param {boolean} [props.omitPeriodSelector=false]
 * @param {boolean} [props.showClassroomMean=true] Toggle E.2.
 * @param {'byStudent'|'byMechanic'} [props.viewMode='byStudent'] Toggle E.3.
 */
function StudentProgressChart({
  data,
  period = '7d',
  onPeriodChange,
  omitPeriodSelector = false,
  showClassroomMean: initialShowMean = true,
  viewMode: initialViewMode = 'byStudent',
}) {
  // Cuando el rango ya esta controlado por un toolbar global (Dashboard),
  // omitimos el selector interno para evitar duplicar el control
  // ("Ultimos 7 dias" mostrado dos veces — bug PROP-37 / fix PROP-43).
  const sectionPeriodChange = omitPeriodSelector ? undefined : onPeriodChange;
  const motion = useChartMotion();

  // T-942 Fase E.2/E.3: estado local de los toggles. Por defecto media
  // visible y vista "Por alumno" — coincide con la UX previa cuando los
  // toggles no existían.
  const [showMean, setShowMean] = useState(initialShowMean);
  const [viewMode, setViewMode] = useState(initialViewMode);

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
          description="No hay datos de rendimiento para el período seleccionado."
          className="shadow-none border-none bg-transparent"
        />
      </ChartSection>
    );
  }

  const accessibleSummary = buildTrendSummary(trimmedData, {
    subject: 'La clase',
    metric: 'rendimiento medio',
  });
  const accessibleDataTable = buildTrendDataTable(trimmedData, {
    dateKey: '_id',
    valueKey: 'score',
    valueSuffix: '%',
  });

  return (
    <ChartSection title="Rendimiento de Clase (Tendencia)" period={period} onPeriodChange={sectionPeriodChange} periodOptions={PERIOD_OPTIONS}>
      <ThemedChartContainer
        title={null}
        summary={accessibleSummary}
        dataTable={accessibleDataTable}
        dataTableCaption="Rendimiento medio diario de la clase"
      >
      {/* T-942 Fase E.2/E.3: toolbar de toggles para vista y media del aula.
          Posicionada justo antes del chart para no requerir cambios en
          ChartSection. Usa SelectPremium y ButtonPremium para coherencia
          con el resto del Dashboard. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <SelectPremium
            value={viewMode}
            onChange={(val) => setViewMode(val)}
            options={VIEW_MODE_OPTIONS}
            className="w-40"
            aria-label="Tipo de vista de la tendencia"
          />
        </div>
        <ButtonPremium
          variant="ghost"
          size="sm"
          onClick={() => setShowMean(prev => !prev)}
          aria-pressed={showMean}
          aria-label={showMean ? 'Ocultar media del aula' : 'Mostrar media del aula'}
          className={cn('gap-1.5', !showMean && 'opacity-70')}
        >
          {showMean ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
          <span>Media del aula</span>
        </ButtonPremium>
      </div>

      {viewMode === 'byMechanic' ? (
        // T-942 Fase E.3: el endpoint actual no entrega serie temporal por
        // mecánica. Mostramos empty state explicativo con icono y microcopy
        // accionable, dejando el toggle visible para que el docente sepa
        // que la vista está prevista (acepta volver a "Por alumno").
        <div className="flex flex-col items-center justify-center text-center py-12 px-4 min-h-[220px]">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-background-elevated/80 border border-border-default mb-4 text-text-muted">
            <LineChart size={28} aria-hidden="true" />
          </div>
          <h4 className="text-base font-semibold text-text-primary font-display mb-2">
            Vista por mecánica próximamente
          </h4>
          <p className="text-sm text-text-muted max-w-md">
            Esta vista superpondrá una línea por mecánica (Asociación, Memoria, Secuencia)
            con la media del aula. Aún no disponemos del desglose por fecha en el
            servidor; mientras tanto usa la pestaña Informes para ver el desglose por
            mecánica en formato tabla.
          </p>
        </div>
      ) : (
        <>
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
                {showMean && (
                  <Area
                    type="monotone"
                    dataKey="classAverage"
                    name="Media del aula"
                    stroke="var(--color-text-muted)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    fill="url(#colorClass)"
                    activeDot={false}
                    dot={false}
                    connectNulls={false}
                    {...motion(0)}
                  />
                )}
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
                  {...motion(1)}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-text-muted mt-6 text-center font-medium">
            Promedio diario de puntuación basado en las últimas sesiones jugadas.
            {showMean ? ' Línea discontinua: media del aula.' : ''}
          </p>
        </>
      )}
      </ThemedChartContainer>
    </ChartSection>
  );
}

// P0-6 plan auditoría Sprint 6: el chart es pesado (AreaChart Recharts) y el
// padre (Dashboard) re-renderiza por filtros y otros cambios no relacionados.
// memo evita repintar cuando data/period/onPeriodChange no han cambiado.
export default memo(StudentProgressChart);
