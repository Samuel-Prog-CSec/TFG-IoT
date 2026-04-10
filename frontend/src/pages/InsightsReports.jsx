import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
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
import AlertsHub from '../components/analytics/AlertsHub';
import ReportGenerator from '../components/analytics/ReportGenerator';

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
  { value: '30d', label: 'Ultimos 30 dias' },
  { value: '90d', label: 'Ultimos 90 dias' },
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
          point[name] = points[i].avgScore ?? points[i].averageScore ?? points[i].score ?? null;
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
          <h3 className="text-base font-bold text-text-primary font-display">
            Curvas de Aprendizaje
          </h3>
        </div>
        <div className="h-[200px] flex items-center justify-center">
          <p className="text-sm text-text-muted text-center">
            Se necesitan mas datos de partidas repetidas para generar las curvas de aprendizaje.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-brand-base/10">
          <TrendingUp size={20} className="text-brand-base" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-bold text-text-primary font-display">
            Curvas de Aprendizaje
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            Mejora del rendimiento con la repeticion
          </p>
        </div>
      </div>

      <div className="h-[280px] w-full -ml-2">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
              label={{ value: 'Intento', position: 'insideBottom', offset: -5, fill: 'var(--color-text-muted)', fontSize: 11 }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={35}
              label={{ value: 'Puntuacion %', angle: -90, position: 'insideLeft', fill: 'var(--color-text-muted)', fontSize: 10 }}
            />
            <Tooltip content={<LearningCurveTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '11px', color: 'var(--color-text-muted)' }}
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
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}

/**
 * Pagina Insights y Reportes con tabs: Efectividad, Alertas, Informes.
 * Cada tab carga sus propios datos al activarse.
 */
export default function InsightsReports() {
  useDocumentTitle('Insights y Reportes');
  const { shouldReduceMotion } = useReducedMotion();

  const [activeTab, setActiveTab] = useState('effectiveness');
  const [timeRange, setTimeRange] = useState('30d');

  // ──────── Effectiveness tab state ────────
  const [effectivenessData, setEffectivenessData] = useState(null);
  const [learningCurvesData, setLearningCurvesData] = useState(null);
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

        const [contextData, mechanicData, curvesData] = await Promise.all([
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
        ]);

        // Merge context and mechanic data for the matrix
        const contextItems = contextData?.items || contextData?.data || contextData || [];
        const mechanicItems = mechanicData?.items || mechanicData?.data || mechanicData || [];
        const mergedData = [
          ...(Array.isArray(contextItems) ? contextItems : []),
          ...(Array.isArray(mechanicItems) ? mechanicItems : []),
        ];

        setEffectivenessData(mergedData);
        setLearningCurvesData(curvesData);
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
        setEffectivenessError('No se pudieron cargar los datos de efectividad.');
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

        const alertList = alerts?.alerts || alerts || [];
        setAlertsData(alertList);

        const total = summary?.total ?? (
          (summary?.critical || 0) + (summary?.warning || 0) + (summary?.info || 0)
        );
        setAlertsCount(Array.isArray(alertList) ? alertList.length : total || 0);
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
        setAlertsError('No se pudieron cargar las alertas.');
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
        const total = summary?.total ?? (
          (summary?.critical || 0) + (summary?.warning || 0) + (summary?.info || 0)
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
      className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6"
      aria-label="Insights y Reportes"
    >
      <ChartErrorBoundary>
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pt-14 lg:pt-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary font-display">
            Insights y Reportes
          </h1>
          <p className="text-text-muted mt-1 text-sm">
            Analisis profundo de efectividad, alertas inteligentes e informes
          </p>
        </div>
        <SelectPremium
          value={timeRange}
          onChange={setTimeRange}
          options={TIME_RANGE_OPTIONS}
          className="w-48"
        />
      </header>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-border-subtle" role="tablist" aria-label="Secciones de insights">
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
              className={cn(
                'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-200',
                'focus-ring rounded-t-lg -mb-px',
                isActive
                  ? 'text-brand-base border-b-2 border-brand-base'
                  : 'text-text-muted hover:text-text-secondary border-b-2 border-transparent'
              )}
            >
              <TabIcon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
              {showBadge && (
                <span className={cn(
                  'ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full tabular-nums',
                  isActive
                    ? 'bg-brand-base/20 text-brand-base'
                    : 'bg-error-base/20 text-error-base'
                )}>
                  {alertsCount}
                </span>
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
              alerts={alertsData}
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
            <ReportGenerator />
          </motion.div>
        )}
      </AnimatePresence>
      </ChartErrorBoundary>
    </motion.section>
  );
}

/**
 * Contenido del tab de Efectividad.
 */
function EffectivenessTabContent({ effectivenessData, learningCurvesData, loading, error, onRetry, shouldReduceMotion }) {
  if (error) {
    return <ErrorState title="Error al cargar datos" message={error} onRetry={onRetry} />;
  }

  if (loading && !effectivenessData) {
    return (
      <div className="space-y-6">
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
      className="space-y-6"
    >
      <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
        <ContentEffectivenessMatrix data={effectivenessData} />
      </motion.div>
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
 * Contenido del tab de Alertas.
 */
function AlertsTabContent({ alerts, loading, error, onRetry }) {
  if (error) {
    return <ErrorState title="Error al cargar alertas" message={error} onRetry={onRetry} />;
  }

  return <AlertsHub alerts={alerts || []} loading={loading} />;
}
