import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Activity,
  BarChart3,
  Bell,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { cn, DURATION, EASING, listContainerVariants, listItemVariants } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import analyticsService from '../services/analytics';
import { isAbortError } from '../services/api';
import { captureException } from '../lib/sentry';
import ChartErrorBoundary from '../components/common/ChartErrorBoundary';
import GlassCard from '../components/ui/GlassCard';
import SelectPremium from '../components/ui/SelectPremium';
import SkeletonShimmer, { SkeletonChart } from '../components/ui/SkeletonShimmer';
import ErrorState from '../components/ui/ErrorState';
import ContentEffectivenessMatrix from '../components/analytics/ContentEffectivenessMatrix';
import CrossMatrix from '../components/analytics/CrossMatrix';
import AlertsHub from '../components/analytics/AlertsHub';
import AlertsEffectivenessPanel from '../components/analytics/AlertsEffectivenessPanel';
import ReportGenerator from '../components/analytics/ReportGenerator';
import ReportTemplateCards from '../components/analytics/ReportTemplateCards';
import ReportPreviewSidebar from '../components/analytics/ReportPreviewSidebar';
import RecentReports from '../components/analytics/RecentReports';
import reportsService from '../services/reports';
import { toast } from 'sonner';
import { useChartMotion, legendTextFormatter } from '../components/analytics/ChartsTheme';
import ThemedChartContainer from '../components/analytics/ThemedChartContainer';

/**
 * Definicion de tabs disponibles.
 */
const TABS = [
  { id: 'effectiveness', label: 'Efectividad', icon: BarChart3 },
  { id: 'alerts', label: 'Alertas', icon: Bell },
  { id: 'reports', label: 'Informes', icon: FileText },
];

/**
 * Opciones de rango temporal global.
 */
const TIME_RANGE_OPTIONS = [
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
];

/**
 * Tooltip personalizado para el grafico de curvas de aprendizaje.
 */
function LearningCurveTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-background-elevated border border-border-default rounded-lg p-3 shadow-xl text-sm">
      <p className="text-text-muted text-xs mb-2">Intento #{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }} className="text-xs">
          {entry.name}: <span className="font-bold tabular-nums">{Math.round(entry.value)}%</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Colores de la paleta para lineas del grafico de aprendizaje.
 */
const CURVE_COLORS = [
  'var(--color-brand-base)',
  'var(--color-accent-cyan)',
  'var(--color-accent-pink)',
  'var(--color-accent-orange)',
  'var(--color-success-base)',
  'var(--color-warning-base)',
];

/**
 * Seccion de curvas de aprendizaje con Recharts AreaChart.
 */
function LearningCurvesSection({ data, loading }) {
  const motion = useChartMotion();
  const chartData = useMemo(() => {
    if (!data?.curves && !data?.learningCurves && !Array.isArray(data)) return [];

    const curves = data.curves || data.learningCurves || data;
    if (!Array.isArray(curves) || curves.length === 0) return [];

    // Buscar el maximo de intentos entre todas las curvas
    let maxAttempts = 0;
    for (const curve of curves) {
      const points = curve.dataPoints || curve.points || [];
      if (points.length > maxAttempts) maxAttempts = points.length;
    }

    if (maxAttempts === 0) return [];

    // Construir datos planos para Recharts
    const result = [];
    for (let i = 0; i < maxAttempts; i++) {
      const point = { attempt: i + 1 };
      for (const curve of curves) {
        const name = curve.name || curve.contextName || curve.mechanicName || 'Curva';
        const points = curve.dataPoints || curve.points || [];
        if (points[i]) {
          // Clamp [0,100]: el YAxis ya acota visualmente, pero sin esto el
          // tooltip podría mostrar ">100%" si el backend enviara un score crudo
          // (TrajectoryChart clampa por el mismo motivo).
          const raw = points[i].avgScore ?? points[i].averageScore ?? points[i].score ?? null;
          point[name] = raw == null ? null : Math.max(0, Math.min(100, raw));
        }
      }
      result.push(point);
    }

    return result;
  }, [data]);

  const curveNames = useMemo(() => {
    if (!data?.curves && !data?.learningCurves && !Array.isArray(data)) return [];
    const curves = data.curves || data.learningCurves || data;
    if (!Array.isArray(curves)) return [];
    return curves.map(c => c.name || c.contextName || c.mechanicName || 'Curva');
  }, [data]);

  if (loading) {
    return <SkeletonChart height={280} />;
  }

  if (chartData.length === 0) {
    return (
      <GlassCard variant="default" padding="none" className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <TrendingUp size={20} className="text-brand-base" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold text-text-primary font-display">
            Curvas de Aprendizaje
          </h3>
          {/* Etiqueta de ventana fija: las curvas siempre usan 90 días
              independientemente del selector temporal global de la página. */}
          <span className="text-xs text-text-muted whitespace-nowrap">
            últimos 90 días
          </span>
        </div>
        <div className="h-[200px] flex flex-col items-center justify-center text-center gap-3 px-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-base/10" aria-hidden="true">
            <TrendingUp size={26} className="text-brand-base" />
          </div>
          <div>
            <p className="text-text-primary font-semibold">Aún no hay curvas que trazar</p>
            <p className="text-sm text-text-muted mt-1 max-w-xs mx-auto">
              Las curvas aparecen cuando un alumno repite la misma sesión varias veces. Anima a tu clase a volver a jugar y verás aquí su progreso.
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  // Resumen accesible para lectores de pantalla: anuncia el número de
  // curvas y el rango de intentos visualizados, sin tener que recorrer
  // cada punto del AreaChart.
  const accessibleSummary = (() => {
    if (curveNames.length === 0) return 'Curvas de aprendizaje sin datos.';
    const intentos = chartData.length;
    const curvasLabel = curveNames.length === 1 ? '1 curva' : `${curveNames.length} curvas`;
    return `${curvasLabel} de aprendizaje a lo largo de ${intentos} intento${intentos === 1 ? '' : 's'}. Mejora del rendimiento con la repetición.`;
  })();

  // Tabla sr-only: por cada curva, el valor en el último intento (insight
  // útil para lector de pantalla sin recorrer todos los puntos).
  const dataTable = curveNames.map(name => {
    const ultimoPunto = chartData[chartData.length - 1];
    const valor = ultimoPunto?.[name];
    return {
      label: name,
      value: typeof valor === 'number' ? `${Math.round(valor)}% en intento ${ultimoPunto?.attempt ?? '—'}` : 'Sin datos'
    };
  });

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <ThemedChartContainer
        title="Curvas de Aprendizaje"
        summary={accessibleSummary}
        dataTable={dataTable}
        dataTableCaption="Puntuación final por curva de aprendizaje"
        headerExtra={
          // La curva de aprendizaje necesita un horizonte amplio para captar
          // la mejora con la repetición, por eso siempre usa 90 días y no el
          // selector temporal global de la página. Se etiqueta para ser honestos.
          <span className="text-xs text-text-muted whitespace-nowrap">
            últimos 90 días
          </span>
        }
      >
      {/* Altura y margenes ajustados: el label "Intento" del eje X chocaba
          con la leyenda inferior. Solucion definitiva: leyenda arriba del
          chart (verticalAlign top) y margin top mayor para reservarle espacio.
          El eje X queda libre para su propio label. */}
      <div className="h-[320px] w-full -ml-2 min-h-[320px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
          <AreaChart data={chartData} margin={{ top: 32, right: 10, left: 0, bottom: 28 }}>
            <defs>
              {curveNames.map((name, idx) => (
                <linearGradient key={name} id={`gradient-${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CURVE_COLORS[idx % CURVE_COLORS.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CURVE_COLORS[idx % CURVE_COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              stroke="var(--color-border-subtle)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="attempt"
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Intento', position: 'insideBottom', offset: -18, fill: 'var(--color-text-muted)', fontSize: 11 }}
            />
            <YAxis
              domain={[0, 100]}
              allowDataOverflow
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={35}
              label={{ value: 'Puntuación %', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: 10 }}
            />
            <Tooltip content={<LearningCurveTooltip />} />
            {/* Leyenda centrada arriba — antes estaba `align="right"` y a 1920px
                la fila de 5 mecánicas casi rozaba el borde derecho del card; en
                viewports menores la leyenda solapaba con el área del chart
                (QA 2026-05-07). Centro + flex-wrap habilita wrap multi-línea. */}
            <Legend
              verticalAlign="top"
              align="center"
              iconSize={10}
              formatter={legendTextFormatter}
              wrapperStyle={{
                fontSize: '11px',
                paddingBottom: 12,
                lineHeight: 1.6,
              }}
            />
            {curveNames.map((name, idx) => (
              <Area
                key={name}
                type="monotone"
                dataKey={name}
                stroke={CURVE_COLORS[idx % CURVE_COLORS.length]}
                fill={`url(#gradient-${idx})`}
                strokeWidth={2}
                dot={{ r: 3, strokeWidth: 0, fill: CURVE_COLORS[idx % CURVE_COLORS.length] }}
                activeDot={{ r: 5, stroke: CURVE_COLORS[idx % CURVE_COLORS.length], strokeWidth: 2 }}
                connectNulls
                {...motion(idx)}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      </ThemedChartContainer>
    </GlassCard>
  );
}

/**
 * Pagina Insights y Reportes con tabs: Efectividad, Alertas, Informes.
 * Cada tab carga sus propios datos al activarse.
 */
export default function InsightsReports() {
  useDocumentTitle('Análisis e informes');
  const { shouldReduceMotion } = useReducedMotion();

  const [activeTab, setActiveTab] = useState('effectiveness');
  const [timeRange, setTimeRange] = useState('30d');

  // ──────── Effectiveness tab state ────────
  const [effectivenessData, setEffectivenessData] = useState(null);
  const [learningCurvesData, setLearningCurvesData] = useState(null);
  // T-942 Fase C: matriz cruzada Mecanica × Contexto. Fetch en paralelo
  // con context/mechanic. Si solo cross falla, se gestiona aparte para no
  // romper las dos cards 1D existentes.
  const [crossData, setCrossData] = useState(null);
  const [crossError, setCrossError] = useState(null);
  const [effectivenessLoading, setEffectivenessLoading] = useState(false);
  const [effectivenessError, setEffectivenessError] = useState(null);
  const effectivenessAbortRef = useRef(null);

  // ──────── Alerts tab state ────────
  const [alertsData, setAlertsData] = useState(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState(null);
  const [alertsCount, setAlertsCount] = useState(0);
  const alertsAbortRef = useRef(null);

  // Track which tabs have been loaded at least once for this timeRange
  const loadedTabsRef = useRef({});

  // ──────── Fetch effectiveness data ────────
  const fetchEffectiveness = useCallback(() => {
    effectivenessAbortRef.current?.abort();
    const controller = new AbortController();
    effectivenessAbortRef.current = controller;

    const run = async () => {
      try {
        setEffectivenessLoading(true);
        setEffectivenessError(null);
        setCrossError(null);

        // Las 3 llamadas principales (context, mechanic, curvas) viajan
        // juntas — cualquier fallo aborta la pestaña entera y muestra
        // ErrorState. La cuarta (cross matrix) va en paralelo pero su
        // error se aisla para no tumbar el resto del panel.
        const [contextData, mechanicData, curvesData, crossResult] = await Promise.all([
          analyticsService.getContentEffectiveness(
            { timeRange, groupBy: 'context' },
            { signal: controller.signal }
          ),
          analyticsService.getContentEffectiveness(
            { timeRange, groupBy: 'mechanic' },
            { signal: controller.signal }
          ),
          analyticsService.getLearningCurves(
            { timeRange: '90d' },
            { signal: controller.signal }
          ),
          analyticsService
            .getClassroomContentEffectiveness(
              { timeRange, groupBy: 'cross' },
              { signal: controller.signal }
            )
            .then((res) => ({ ok: true, value: res }))
            .catch((err) => ({ ok: false, error: err })),
        ]);

        // Mantenemos las dos dimensiones por separado (no se mezclan): el componente
        // de efectividad muestra UNA dimension a la vez (barras horizontales con RAG).
        // Antes se mergeaba el conjunto en un solo array y la matriz cruzada acababa con
        // valores repetidos por columna; el rediseno ya no necesita ese workaround.
        const contextItems = contextData?.items || contextData?.data || contextData || [];
        const mechanicItems = mechanicData?.items || mechanicData?.data || mechanicData || [];

        setEffectivenessData({
          context: Array.isArray(contextItems) ? contextItems : [],
          mechanic: Array.isArray(mechanicItems) ? mechanicItems : []
        });
        setLearningCurvesData(curvesData);

        // Gestion aislada del resultado de la matriz cruzada.
        if (crossResult.ok) {
          setCrossData(crossResult.value);
        } else if (!isAbortError(crossResult.error)) {
          captureException(crossResult.error);
          setCrossError('No pudimos cargar el análisis cruzado. Vuelve a intentarlo.');
          setCrossData(null);
        }
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
        setEffectivenessError('No pudimos cargar la efectividad del contenido. Vuelve a intentarlo.');
      } finally {
        if (!controller.signal.aborted) {
          setEffectivenessLoading(false);
        }
      }
    };

    run();
  }, [timeRange]);

  // ──────── Fetch alerts data ────────
  const fetchAlerts = useCallback(() => {
    alertsAbortRef.current?.abort();
    const controller = new AbortController();
    alertsAbortRef.current = controller;

    const run = async () => {
      try {
        setAlertsLoading(true);
        setAlertsError(null);

        const [alerts, summary] = await Promise.all([
          analyticsService.getAlerts({}, { signal: controller.signal }),
          analyticsService.getAlertsSummary({ signal: controller.signal }),
        ]);

        // T-941: shape `{ items, nextCursor }`. Compat con snapshot legacy.
        const alertList = alerts?.items || alerts?.alerts || alerts || [];
        setAlertsData(alertList);

        const total = summary?.activeTotal ?? summary?.total ?? (
          (summary?.bySeverity?.critical || summary?.critical || 0) +
          (summary?.bySeverity?.warning || summary?.warning || 0) +
          (summary?.bySeverity?.info || summary?.info || 0)
        );
        setAlertsCount(Array.isArray(alertList) ? alertList.length : total || 0);
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
        setAlertsError('No pudimos cargar las alertas. Vuelve a intentarlo.');
      } finally {
        if (!controller.signal.aborted) {
          setAlertsLoading(false);
        }
      }
    };

    run();
  }, []);

  // Limpiar cache de tabs cargados cuando cambia el rango temporal
  useEffect(() => {
    loadedTabsRef.current = {};
  }, [timeRange]);

  // ──────── Load data on tab change ────────
  useEffect(() => {
    const tabKey = `${activeTab}-${timeRange}`;
    if (loadedTabsRef.current[tabKey]) return;

    if (activeTab === 'effectiveness') {
      loadedTabsRef.current[tabKey] = true;
      fetchEffectiveness();
    } else if (activeTab === 'alerts') {
      loadedTabsRef.current[tabKey] = true;
      fetchAlerts();
    }
    // 'reports' tab manages its own fetching via ReportGenerator
  }, [activeTab, timeRange, fetchEffectiveness, fetchAlerts]);

  // Fetch alerts count for badge on mount
  useEffect(() => {
    const controller = new AbortController();
    const fetchCount = async () => {
      try {
        const summary = await analyticsService.getAlertsSummary({ signal: controller.signal });
        const total = summary?.activeTotal ?? summary?.total ?? (
          (summary?.bySeverity?.critical || summary?.critical || 0) +
          (summary?.bySeverity?.warning || summary?.warning || 0) +
          (summary?.bySeverity?.info || summary?.info || 0)
        );
        setAlertsCount(total || 0);
      } catch (err) {
        if (!isAbortError(err)) {
          captureException(err);
        }
      }
    };
    fetchCount();
    return () => controller.abort();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      effectivenessAbortRef.current?.abort();
      alertsAbortRef.current?.abort();
    };
  }, []);

  // Refetch on focus
  const currentFetchFn = useMemo(() => {
    if (activeTab === 'effectiveness') return fetchEffectiveness;
    if (activeTab === 'alerts') return fetchAlerts;
    return null;
  }, [activeTab, fetchEffectiveness, fetchAlerts]);

  const currentLoading = activeTab === 'effectiveness' ? effectivenessLoading : alertsLoading;
  const currentHasData = activeTab === 'effectiveness' ? Boolean(effectivenessData) : Boolean(alertsData);
  const currentHasError = activeTab === 'effectiveness' ? Boolean(effectivenessError) : Boolean(alertsError);

  useRefetchOnFocus({
    refetch: currentFetchFn || (() => {}),
    enabled: Boolean(currentFetchFn),
    isLoading: currentLoading,
    hasData: currentHasData,
    hasError: currentHasError,
  });

  return (
    <motion.section
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.entrance, ease: EASING.outExpo }}
      className="page-container py-[var(--space-fluid-section)] space-y-6"
      aria-label="Análisis e informes"
    >
      <ChartErrorBoundary>
      {/* Header — eyebrow + título con icono signature aligned con resto de
          páginas analíticas (Dashboard, StudentsAnalytics). El icono Activity
          en gradient brand→indigo aporta firma sin ruido. */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pt-14 lg:pt-0">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-base to-accent-indigo text-white shadow-lg shadow-brand-base/20 mt-1">
            <Activity size={24} aria-hidden="true" />
          </div>
          <div>
            <p className="text-micro uppercase tracking-[0.18em] text-brand-base font-bold mb-0.5">Análisis</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-display leading-tight">
              Análisis e informes
            </h1>
            <p className="text-text-muted mt-1 text-sm max-w-2xl">
              Detecta patrones, identifica alertas tempranas y genera informes detallados sobre el progreso del aula.
            </p>
          </div>
        </div>
        <SelectPremium
          value={timeRange}
          onChange={setTimeRange}
          options={TIME_RANGE_OPTIONS}
          className="w-full sm:w-48"
        />
      </header>

      {/* Tab navigation — BUG-A11Y-INSIGHTS-TABS-A (QA Sprint 0 post-v0.5.0):
          fondo sólido (background-elevated) para que el texto del tab no caiga
          sobre la aurora púrpura del AppLayout (lo cual rompía contraste). */}
      <div className="flex items-center gap-1 border-b border-border-subtle bg-background-elevated/95 backdrop-blur-sm rounded-t-lg px-2" role="tablist" aria-label="Secciones de análisis">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;
          const showBadge = tab.id === 'alerts' && alertsCount > 0;

          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                const currentIndex = TABS.findIndex(t => t.id === tab.id);
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  const nextTab = TABS[(currentIndex + 1) % TABS.length];
                  setActiveTab(nextTab.id);
                  document.querySelector(`[aria-controls="panel-${nextTab.id}"]`)?.focus();
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const prevTab = TABS[(currentIndex - 1 + TABS.length) % TABS.length];
                  setActiveTab(prevTab.id);
                  document.querySelector(`[aria-controls="panel-${prevTab.id}"]`)?.focus();
                }
              }}
              // BUG-A11Y-INSIGHTS-TABS-A (QA Sprint 0 post-v0.5.0): los tabs
              // se mostraban sobre la aurora púrpura del backdrop y text-muted
              // daba 1.79:1. Cambiar a text-secondary (más luminoso) + bg
              // sutil en el tab inactivo asegura contraste estable.
              className={cn(
                'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-200',
                'focus-ring rounded-t-lg -mb-px border-b-2 border-transparent',
                isActive ? 'text-brand-on-alpha' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              <TabIcon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
              {showBadge && (
                // BUG-A11Y-INSIGHTS-BADGE-A (QA Sprint 0 post-v0.5.0): el badge
                // de alertas tenía 1.32:1 sobre el bg de tab inactivo púrpura.
                // Cambiar a bg sólido + texto blanco/error según estado.
                <span className={cn(
                  'ml-1 inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5 text-nano font-bold rounded-full tabular-nums',
                  isActive
                    ? 'bg-brand-dark text-white'
                    : 'bg-error-dark text-white'
                )}>
                  {alertsCount}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="insights-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-base rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'effectiveness' && (
          <motion.div
            key="effectiveness"
            id="panel-effectiveness"
            role="tabpanel"
            aria-labelledby="tab-effectiveness"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: DURATION.stateChange, ease: EASING.outQuart }}
          >
            <EffectivenessTabContent
              effectivenessData={effectivenessData}
              learningCurvesData={learningCurvesData}
              crossData={crossData}
              crossError={crossError}
              loading={effectivenessLoading}
              error={effectivenessError}
              onRetry={fetchEffectiveness}
              shouldReduceMotion={shouldReduceMotion}
            />
          </motion.div>
        )}

        {activeTab === 'alerts' && (
          <motion.div
            key="alerts"
            id="panel-alerts"
            role="tabpanel"
            aria-labelledby="tab-alerts"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: DURATION.stateChange, ease: EASING.outQuart }}
          >
            <AlertsTabContent
              initialAlerts={alertsData}
              loading={alertsLoading}
              error={alertsError}
              onRetry={fetchAlerts}
            />
          </motion.div>
        )}

        {activeTab === 'reports' && (
          <motion.div
            key="reports"
            id="panel-reports"
            role="tabpanel"
            aria-labelledby="tab-reports"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: DURATION.stateChange, ease: EASING.outQuart }}
          >
            <ReportsTabContent shouldReduceMotion={shouldReduceMotion} />
          </motion.div>
        )}
      </AnimatePresence>
      </ChartErrorBoundary>
    </motion.section>
  );
}

/**
 * Contenido del tab de Efectividad.
 *
 * Estructura (T-942 Fase C):
 *  1. "Vistas por dimension" — 2 cards 1D (contexto / mecanica).
 *  2. "Analisis cruzado" — matriz 2D mecanica × contexto a full width.
 *  3. Curvas de aprendizaje (3 mecanicas con repeticion).
 */
function EffectivenessTabContent({
  effectivenessData,
  learningCurvesData,
  crossData,
  crossError,
  loading,
  error,
  onRetry,
  shouldReduceMotion,
}) {
  if (error) {
    return <ErrorState title="No pudimos cargar el análisis" message={error} onRetry={onRetry} />;
  }

  if (loading && !effectivenessData) {
    return (
      <div className="space-y-6">
        <SkeletonShimmer className="h-[300px] rounded-2xl" />
        <SkeletonShimmer className="h-[300px] rounded-2xl" />
        <SkeletonChart height={280} />
      </div>
    );
  }

  return (
    <motion.div
      variants={shouldReduceMotion ? {} : listContainerVariants(0.12)}
      initial={shouldReduceMotion ? false : 'hidden'}
      animate="visible"
      className="space-y-8"
    >
      {/* Seccion 1: vistas por dimension (cards 1D existentes). */}
      <motion.section
        variants={shouldReduceMotion ? {} : listItemVariants}
        aria-labelledby="effectiveness-1d-title"
        className="space-y-3"
      >
        <h2
          id="effectiveness-1d-title"
          className="text-sm font-bold uppercase tracking-wider text-text-secondary"
        >
          Vistas por dimensión
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ContentEffectivenessMatrix data={effectivenessData?.context || []} groupBy="context" />
          <ContentEffectivenessMatrix data={effectivenessData?.mechanic || []} groupBy="mechanic" />
        </div>
      </motion.section>

      {/* Seccion 2: analisis cruzado (T-942 Fase C). */}
      <motion.section
        variants={shouldReduceMotion ? {} : listItemVariants}
        aria-labelledby="effectiveness-cross-title"
        className="space-y-3"
      >
        <h2
          id="effectiveness-cross-title"
          className="text-sm font-bold uppercase tracking-wider text-text-secondary"
        >
          Análisis cruzado
        </h2>
        <CrossMatrix
          data={crossData}
          loading={loading && !crossData}
          error={crossError}
          onRetry={onRetry}
        />
      </motion.section>

      {/* Seccion 3: curvas de aprendizaje. */}
      <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
        <LearningCurvesSection
          data={learningCurvesData}
          loading={loading}
        />
      </motion.div>
    </motion.div>
  );
}

/**
 * Contenido del tab de Alertas (T-941).
 *
 * Maneja statusFilter local + refetch per estado. Incluye el panel de
 * eficacia del propio sistema de alertas (H.3).
 */
function AlertsTabContent({ initialAlerts, loading: initialLoading, error, onRetry }) {
  const [statusFilter, setStatusFilter] = useState('active');
  const [alerts, setAlerts] = useState(initialAlerts || []);
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(initialLoading);
  // Paginación: el backend capa a 100 por página y devuelve `nextCursor`. Antes
  // no se consumía → con >100 alertas en un estado el resto quedaba INACCESIBLE
  // sin aviso. Ahora se guarda el cursor y se ofrece "Cargar más".
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchForStatus = useCallback(async (status) => {
    setLoading(true);
    try {
      const [data, summary] = await Promise.all([
        analyticsService.getAlerts({ status, limit: 100 }),
        analyticsService.getAlertsSummary()
      ]);
      const list = data?.items || data?.alerts || data || [];
      setAlerts(Array.isArray(list) ? list : []);
      setNextCursor(data?.nextCursor || null);
      setStatusCounts(summary?.byStatus || {});
    } catch {
      // ErrorState arriba ya maneja error inicial
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await analyticsService.getAlerts({
        status: statusFilter,
        limit: 100,
        cursor: nextCursor
      });
      const more = data?.items || data?.alerts || [];
      setAlerts(prev => [...prev, ...(Array.isArray(more) ? more : [])]);
      setNextCursor(data?.nextCursor || null);
    } catch {
      // silencioso: la primera página ya está visible
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, statusFilter]);

  useEffect(() => {
    // Cuando el statusFilter cambia (o se monta con un status distinto del default), refetch
    fetchForStatus(statusFilter);
  }, [statusFilter, fetchForStatus]);

  // Tiempo real: refrescar la lista cuando llega una alerta nueva (mismo evento
  // `smartalert:created` que dispara useNotifications al recibir el push y que ya
  // escucha el Dashboard). Antes el tab de Insights NO se auto-refrescaba: una
  // alerta nueva solo aparecía al recargar o cambiar de filtro.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = () => fetchForStatus(statusFilter);
    window.addEventListener('smartalert:created', handler);
    return () => window.removeEventListener('smartalert:created', handler);
  }, [statusFilter, fetchForStatus]);

  if (error) {
    return <ErrorState title="No pudimos cargar las alertas" message={error} onRetry={onRetry} />;
  }

  return (
    <div className="space-y-6">
      <AlertsHub
        alerts={alerts}
        loading={loading}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        statusCounts={statusCounts}
        onRefetch={() => fetchForStatus(statusFilter)}
      />
      {nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-border-default bg-background-elevated/60 text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base"
          >
            {loadingMore ? 'Cargando…' : 'Cargar más alertas'}
          </button>
        </div>
      )}
      <AlertsEffectivenessPanel days={30} />
    </div>
  );
}

/**
 * Contenido del tab "Informes" (T-942 Fase D).
 *
 * Tres secciones verticales:
 *   1. Plantillas predefinidas — pre-rellenan los dropdowns del generador.
 *   2. Generador + sidebar de preview — formulario y vista previa lateral.
 *   3. Informes recientes — lista con reabrir/eliminar.
 *
 * Persiste cada informe generado vía POST /api/reports y refresca la lista
 * de recientes. "Reabrir" hace GET /reports/:id y pasa el payload al
 * `ReportGenerator` (que lo renderiza sin re-pedir datos al backend).
 */
function ReportsTabContent({ shouldReduceMotion }) {
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  const [recentReports, setRecentReports] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState(null);
  // Paginación de informes recientes. El backend persiste hasta 100 por docente y
  // pagina por página (`{ page, total, totalPages }`); antes solo se pedía la
  // página 1 (≤20) y el resto quedaba INACCESIBLE. Acumulamos páginas con
  // "Cargar más" (mismo patrón que el tab de Alertas).
  const RECENT_PAGE_SIZE = 20;
  const [recentPagination, setRecentPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loadingMoreRecent, setLoadingMoreRecent] = useState(false);

  const [appliedDefaults, setAppliedDefaults] = useState(null);
  const [previewMeta, setPreviewMeta] = useState({
    reportType: 'classroom',
    period: '30d',
    format: 'summary'
  });

  // Estado del informe precargado (cuando el usuario hace "Reabrir").
  const [preloaded, setPreloaded] = useState(null);

  const generatorRef = useRef(null);
  const templatesAbortRef = useRef(null);
  const recentAbortRef = useRef(null);

  // Carga paralela de plantillas + recientes al montar el tab.
  useEffect(() => {
    templatesAbortRef.current?.abort();
    recentAbortRef.current?.abort();
    const tplController = new AbortController();
    const recController = new AbortController();
    templatesAbortRef.current = tplController;
    recentAbortRef.current = recController;

    const loadTemplates = async () => {
      try {
        setTemplatesLoading(true);
        const data = await reportsService.getTemplates({ signal: tplController.signal });
        setTemplates(Array.isArray(data) ? data : []);
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
      } finally {
        if (!tplController.signal.aborted) setTemplatesLoading(false);
      }
    };

    const loadRecent = async () => {
      try {
        setRecentLoading(true);
        setRecentError(null);
        const data = await reportsService.getRecent({ page: 1, limit: RECENT_PAGE_SIZE }, {
          signal: recController.signal
        });
        const items = data?.items || data || [];
        setRecentReports(Array.isArray(items) ? items : []);
        setRecentPagination(data?.pagination || { page: 1, total: items.length, totalPages: 1 });
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
        setRecentError('No pudimos cargar los informes recientes. Vuelve a intentarlo.');
      } finally {
        if (!recController.signal.aborted) setRecentLoading(false);
      }
    };

    loadTemplates();
    loadRecent();

    return () => {
      tplController.abort();
      recController.abort();
    };
  }, []);

  const refetchRecent = useCallback(async () => {
    try {
      setRecentLoading(true);
      const data = await reportsService.getRecent({ page: 1, limit: RECENT_PAGE_SIZE });
      const items = data?.items || data || [];
      setRecentReports(Array.isArray(items) ? items : []);
      setRecentPagination(data?.pagination || { page: 1, total: items.length, totalPages: 1 });
    } catch (err) {
      captureException(err);
      setRecentError('No se pudieron actualizar los informes recientes.');
    } finally {
      setRecentLoading(false);
    }
  }, []);

  // "Cargar más": pide la siguiente página y la añade a la lista (sin re-pedir las
  // ya cargadas). Si el delete deja la página actual incompleta, el total/totalPages
  // de la siguiente respuesta corrige el `hasMore`.
  const loadMoreRecent = useCallback(async () => {
    if (loadingMoreRecent || recentPagination.page >= recentPagination.totalPages) return;
    const nextPage = recentPagination.page + 1;
    setLoadingMoreRecent(true);
    try {
      const data = await reportsService.getRecent({ page: nextPage, limit: RECENT_PAGE_SIZE });
      const items = data?.items || [];
      // Dedupe defensivo por _id: si se borró un informe entre páginas, el skip
      // podría solapar y repetir un item; el Set evita keys duplicadas en React.
      setRecentReports((prev) => {
        const seen = new Set(prev.map((r) => r._id));
        return [...prev, ...items.filter((r) => !seen.has(r._id))];
      });
      setRecentPagination(data?.pagination || { ...recentPagination, page: nextPage });
    } catch (err) {
      captureException(err);
    } finally {
      setLoadingMoreRecent(false);
    }
  }, [loadingMoreRecent, recentPagination]);

  const handleApplyTemplate = useCallback((template) => {
    if (!template) return;
    setAppliedDefaults({
      reportType: template.defaults.reportType,
      period: template.defaults.period,
      format: template.defaults.format,
      templateKey: template.key
    });
    // Limpia cualquier informe precargado (estamos volviendo al modo "generar").
    setPreloaded(null);
    // Scroll suave al formulario para que el docente vea los dropdowns ya
    // rellenados y solo tenga que pulsar "Generar Informe".
    window.requestAnimationFrame(() => {
      generatorRef.current?.scrollIntoView({
        behavior: shouldReduceMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  }, [shouldReduceMotion]);

  const handleAfterGenerate = useCallback(async (payload, meta) => {
    if (!payload) return;
    const periodLabelMap = { '7d': '7 días', '30d': '30 días', '90d': '90 días' };
    const typeLabel = meta.reportType === 'classroom' ? 'Informe del aula' : 'Informe individual';
    const autoTitle = `${typeLabel} · ${periodLabelMap[meta.period] || meta.period}`;
    try {
      await reportsService.save({
        reportType: meta.reportType,
        period: meta.period,
        format: meta.format,
        templateKey: meta.templateKey || undefined,
        title: autoTitle,
        ...(meta.studentId ? { studentId: meta.studentId } : {}),
        payload,
        metadata: {}
      });
      toast.success('Informe guardado', {
        description: 'Lo encontrarás en la sección "Informes recientes".'
      });
      refetchRecent();
    } catch (err) {
      captureException(err);
      toast.error('No se pudo guardar el informe', {
        description: 'Se generó correctamente pero no quedó en tu historial.'
      });
    }
  }, [refetchRecent]);

  const handleOpenReport = useCallback(async (id) => {
    try {
      const full = await reportsService.getById(id);
      // El backend devuelve el documento completo (con payload). Lo pasamos
      // al generator junto con la meta para sincronizar dropdowns y vista.
      setPreloaded({
        payload: full.payload,
        meta: {
          reportType: full.reportType,
          period: full.period,
          format: full.format,
          title: full.title
        }
      });
      window.requestAnimationFrame(() => {
        generatorRef.current?.scrollIntoView({
          behavior: shouldReduceMotion ? 'auto' : 'smooth',
          block: 'start'
        });
      });
    } catch (err) {
      captureException(err);
      toast.error('No se pudo abrir el informe', {
        description: 'Es posible que haya sido eliminado o haya caducado.'
      });
    }
  }, [shouldReduceMotion]);

  const handleDeleteReport = useCallback(async (id) => {
    try {
      await reportsService.remove(id);
      // Optimistic update: quitamos el item de la lista de inmediato.
      setRecentReports((prev) => prev.filter((r) => r._id !== id));
      // Si el informe en pantalla era ese, lo limpiamos.
      setPreloaded((prev) => (prev?.meta && recentReports.find((r) => r._id === id) ? null : prev));
      toast.success('Informe eliminado');
    } catch (err) {
      captureException(err);
      toast.error('No se pudo eliminar el informe');
      refetchRecent();
    }
  }, [recentReports, refetchRecent]);

  return (
    <div className="space-y-6">
      {/* Seccion 1 — Plantillas predefinidas */}
      <section aria-labelledby="reports-templates-heading">
        <div className="flex items-center justify-between mb-3">
          <h2 id="reports-templates-heading" className="text-base font-semibold text-text-primary font-display">
            Plantillas predefinidas
          </h2>
          {!templatesLoading && templates.length > 0 && (
            <span className="text-xs text-text-muted">
              {templates.length} {templates.length === 1 ? 'plantilla' : 'plantillas'}
            </span>
          )}
        </div>
        <ReportTemplateCards
          templates={templates}
          onApply={handleApplyTemplate}
          loading={templatesLoading}
        />
      </section>

      {/* Seccion 2 — Generador + Preview lateral */}
      <section ref={generatorRef} aria-labelledby="reports-generator-heading">
        <h2 id="reports-generator-heading" className="sr-only">Generador de informes</h2>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:items-stretch">
          <div className="min-w-0 h-full">
            <ReportGenerator
              initialDefaults={appliedDefaults}
              onAfterGenerate={handleAfterGenerate}
              onPreviewMetaChange={setPreviewMeta}
              preloadedReport={preloaded?.payload || null}
              preloadedMeta={preloaded?.meta || null}
            />
          </div>
          <aside className="min-w-0 lg:self-start">
            <ReportPreviewSidebar
              reportType={previewMeta.reportType}
              period={previewMeta.period}
              format={previewMeta.format}
            />
          </aside>
        </div>
      </section>

      {/* Seccion 3 — Informes recientes */}
      <section aria-labelledby="reports-recent-heading">
        <h2 id="reports-recent-heading" className="sr-only">Informes recientes</h2>
        <RecentReports
          reports={recentReports}
          loading={recentLoading}
          error={recentError}
          onOpen={handleOpenReport}
          onDelete={handleDeleteReport}
          total={recentPagination.total}
          hasMore={recentPagination.page < recentPagination.totalPages}
          loadingMore={loadingMoreRecent}
          onLoadMore={loadMoreRecent}
        />
      </section>
    </div>
  );
}
