import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Gamepad2, Trophy, AlertTriangle, Calendar, CalendarClock, Layers, ChevronRight, Target, Clock, UserCheck, CheckCircle2, Sparkles } from 'lucide-react';
import ErrorState from '../components/ui/ErrorState';
import { listContainerVariants, listItemVariants, crossfadeVariants, formatDate } from '../lib/utils';
import { formatDelta } from '../lib/formatDelta';
import { formatRelativeTime } from '../lib/dateUtils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHorizontalScroll } from '../hooks/useHorizontalScroll';
import { useAuth } from '../context/AuthContext';
import analyticsService from '../services/analytics';
import { isAbortError, contextsAPI, mechanicsAPI } from '../services/api';
import { captureException } from '../lib/sentry';
import { ROUTES } from '../constants/routes';
// El onboarding se monta a nivel de AppLayout para cubrir teacher y
// super_admin desde cualquier ruta autenticada (T-951 Fase 4).
import StatCard from '../components/dashboard/StatCard';
import StudentProgressChart from '../components/dashboard/StudentProgressChart';
import ClassroomOverview from '../components/dashboard/ClassroomOverview';
import AlertsPanel from '../components/dashboard/AlertsPanel';
import DifficultyHeatmap from '../components/dashboard/DifficultyHeatmap';
import StudentsList from '../components/dashboard/StudentsList';
import ActivityHeatmap from '../components/analytics/ActivityHeatmap';
import SkeletonShimmer, { SkeletonCard, SkeletonStatCard, SkeletonChart } from '../components/ui/SkeletonShimmer';
import SelectPremium from '../components/ui/SelectPremium';
import ButtonPremium from '../components/ui/ButtonPremium';

// eslint-disable-next-line sonarjs/cyclomatic-complexity -- dashboard principal con multiples widgets, filtros y estados de carga
export default function Dashboard() {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle('Dashboard');
  const { shouldReduceMotion } = useReducedMotion();
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedContextId, setSelectedContextId] = useState('');
  const [selectedMechanicId, setSelectedMechanicId] = useState('');
  const [contextOptions, setContextOptions] = useState([]);
  const [mechanicOptions, setMechanicOptions] = useState([]);

  // Cargar opciones de contextos y mecanicas una sola vez
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      contextsAPI.getContexts().catch(() => ({ data: { data: [] } })),
      mechanicsAPI.getMechanics().catch(() => ({ data: { data: [] } }))
    ]).then(([ctxRes, mechRes]) => {
      if (cancelled) return undefined;
      const contexts = ctxRes?.data?.data || [];
      const mechanics = mechRes?.data?.data || [];
      setContextOptions([
        { value: '', label: 'Todos los contextos' },
        ...contexts.map(c => ({ value: c._id, label: c.name }))
      ]);
      setMechanicOptions([
        { value: '', label: 'Todas las mecánicas' },
        ...mechanics.map(m => ({ value: m._id, label: m.displayName || m.name }))
      ]);
      return undefined;
    }).catch(() => { /* errores individuales ya manejados */ });
    return () => { cancelled = true; };
  }, []);

  // Redirigir super_admin a su panel
  useEffect(() => {
    if (isSuperAdmin) {
      navigate(ROUTES.ADMIN_APPROVALS, { replace: true });
    }
  }, [isSuperAdmin, navigate]);

  // State for data
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState(null);
  const [progressData, setProgressData] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
  const [studentsData, setStudentsData] = useState(null);
  const [distributionData, setDistributionData] = useState(null);
  const [alertsData, setAlertsData] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const dataAbortRef = useRef(null);
  // Cache: evita re-fetch si los datos tienen menos de 60s de antiguedad (ej. tab-focus)
  const lastFetchRef = useRef({ at: 0, key: '' });
  const CACHE_TTL_MS = 60_000;

  const fetchData = useCallback((forceRefresh = false) => {
    const cacheKey = `${timeRange}:${selectedContextId}:${selectedMechanicId}`;
    const now = Date.now();
    if (!forceRefresh && lastFetchRef.current.key === cacheKey && now - lastFetchRef.current.at < CACHE_TTL_MS) {
      return; // Datos frescos, no re-fetch
    }

    dataAbortRef.current?.abort();
    const controller = new AbortController();
    dataAbortRef.current = controller;

    const run = async () => {
      try {
        setLoading(true);
        // Summary y Trends son criticos (KPIs principales). El resto son secundarios:
        // si fallan, la pagina sigue funcionando con datos parciales.
        const [summaryData, trendsData, progress, difficultiesData, students, distribution, alerts, heatmap] = await Promise.all([
          analyticsService.getClassroomSummary({ signal: controller.signal }),
          analyticsService.getClassroomTrends(timeRange, { signal: controller.signal }),
          analyticsService.getClassroomComparison(timeRange, { signal: controller.signal }).catch(() => []),
          analyticsService.getClassroomDifficulties({ signal: controller.signal }).catch(() => []),
          analyticsService.getClassroomStudents({
            sort: 'score', order: 'desc',
            ...(selectedContextId && { contextId: selectedContextId }),
            ...(selectedMechanicId && { mechanicId: selectedMechanicId })
          }, { signal: controller.signal }).catch(() => null),
          analyticsService.getClassroomDistribution({}, { signal: controller.signal }).catch(() => null),
          analyticsService.getAlerts({ limit: 5 }, { signal: controller.signal }).catch(() => null),
          analyticsService.getClassroomHeatmap(timeRange, { signal: controller.signal }).catch(() => null)
        ]);

        setSummary(summaryData);
        setTrends(trendsData);
        setProgressData(progress);
        setDifficulties(difficultiesData);
        setStudentsData(students);
        setDistributionData(Array.isArray(distribution) ? distribution : distribution?.distribution || null);
        setAlertsData(alerts);
        setHeatmapData(heatmap);
        setError(null);
        lastFetchRef.current = { at: Date.now(), key: cacheKey };
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
        setError('No se pudieron cargar los datos del dashboard.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    run();
  }, [timeRange, selectedContextId, selectedMechanicId]);

  useEffect(() => {
    fetchData();
    return () => dataAbortRef.current?.abort();
  }, [fetchData]);

  useRefetchOnFocus({
    refetch: fetchData,
    isLoading: loading,
    hasData: Boolean(summary),
    hasError: Boolean(error)
  });

  // Extraer el cambio porcentual de un KPI por nombre.
  // PROP-88: si el KPI no tiene baseline (`previous` ausente, null o 0),
  // devolvemos "—" para que StatCard pinte el pill neutro en lugar de la
  // línea vacía que daba apariencia de bug.
  const getTrend = useCallback((kpiName) => {
    if (!trends?.kpis) return '';
    const kpi = trends.kpis.find(k => k.name === kpiName);
    if (!kpi) return '';

    // Si el backend dice explícitamente que no hay baseline → "—"
    if (kpi.previous === null || kpi.previous === undefined || kpi.previous === 0) {
      return '—';
    }

    // Backend ya entrega `changePercent` redondeado; lo re-derivamos via
    // formatDelta para que la lógica de signo/baseline esté centralizada.
    if (kpi.current !== undefined) {
      return formatDelta(kpi.current, kpi.previous);
    }

    // Fallback al formato legacy si por algún motivo falta `current`.
    if (kpi.changePercent == null) return '';
    if (kpi.changePercent === 0) return '0%';
    const sign = kpi.changePercent > 0 ? '+' : '';
    return `${sign}${kpi.changePercent}%`;
  }, [trends]);

  // Obtener el valor actual de un KPI desde trends
  const getKPIValue = useCallback((kpiName) => {
    if (!trends?.kpis) return null;
    const kpi = trends.kpis.find(k => k.name === kpiName);
    return kpi?.current ?? null;
  }, [trends]);

  const periodLabel = timeRange === '30d' ? 'vs mes anterior' : 'vs semana pasada';

  // Derivar contadores de estudiantes activos
  const activeStudentsCount = useMemo(() => {
    if (!studentsData?.students) return 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return studentsData.students.filter(s => {
      const lastPlayed = s.lastPlayedAt || s.studentMetrics?.lastPlayedAt;
      if (!lastPlayed) return false;
      return new Date(lastPlayed) >= sevenDaysAgo;
    }).length;
  }, [studentsData]);

  const totalStudents = studentsData?.students?.length || 0;

  // Alertas inteligentes del backend (reemplaza la derivacion client-side)
  const backendAlerts = useMemo(() => {
    if (!alertsData?.alerts) return [];
    return alertsData.alerts;
  }, [alertsData]);

  // Prevenir Layout Shifts (CLS) renderizando una estructura idéntica durante la carga
  const skeletonContent = loading && !summary;
  const motionVariants = shouldReduceMotion ? {} : crossfadeVariants;

  return (
    <>
    <AnimatePresence mode="wait">
      {skeletonContent ? (
        <motion.section
          key="skeleton"
          {...motionVariants}
          className="page-container py-[var(--space-fluid-section)] space-y-8"
        >
          {/* Header Skeleton Mimic */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pt-4 lg:pt-0">
            <div className="space-y-3">
              <SkeletonShimmer className="h-8 w-64 rounded-lg" />
              <SkeletonShimmer className="h-4 w-48 rounded-md" />
            </div>
            <div className="flex items-center gap-4">
               <SkeletonShimmer className="h-10 w-28 rounded-xl" />
               <SkeletonShimmer className="h-10 w-32 rounded-xl" />
            </div>
          </div>

          {/* KPIs Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-[var(--space-fluid-gutter)]">
            {Array.from({ length: 8 }, (_, i) => `stat-skeleton-${i}`).map(id => (
              <SkeletonStatCard key={id} />
            ))}
          </div>

          {/* Main Visualizations Skeleton Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-[var(--space-fluid-gutter)]">
            <div className="xl:col-span-2 space-y-6">
              <SkeletonChart height={384} />
              <SkeletonChart height={320} />
            </div>
            <aside className="space-y-6">
              <SkeletonCard className="h-[21rem]" />
              <SkeletonCard className="h-64" />
            </aside>
          </div>
        </motion.section>
      ) : (
        <motion.section
          key="content"
          {...motionVariants}
          className="page-container py-[var(--space-fluid-section)] space-y-8"
          aria-label="Panel principal del dashboard"
        >
          <Header
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            selectedContextId={selectedContextId}
            setSelectedContextId={setSelectedContextId}
            selectedMechanicId={selectedMechanicId}
            setSelectedMechanicId={setSelectedMechanicId}
            contextOptions={contextOptions}
            mechanicOptions={mechanicOptions}
            reducedMotion={shouldReduceMotion}
          />

          <div className="flex flex-col gap-8">
            {loading && summary ? (
              <div className="bg-background-elevated/50 border border-border-default text-text-muted px-4 py-2 rounded-xl text-sm font-medium animate-pulse">
                Actualizando métricas…
              </div>
            ) : null}

            {error ? (
              <ErrorState
                title="Error al cargar datos"
                message={`${error} Pulsa Reintentar o recarga la página.`}
                onRetry={fetchData}
              />
            ) : null}

            {/* BI Principle: Jerarquía Visual - KPIs Arriba */}
            <motion.section
              variants={listContainerVariants(0.03)}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="visible"
              aria-labelledby="stats-heading"
            >
              <h2 id="stats-heading" className="sr-only">KPIs Principales</h2>
              {/* KPIs primarios — metricas clave */}
              <ul
                className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-[var(--space-fluid-gutter)]"
              >
                <motion.li variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StatCard
                    title="Alumnos en Riesgo"
                    value={summary?.studentsInRisk || 0}
                    trend={getTrend('studentsInRisk')}
                    periodLabel={periodLabel}
                    icon={<AlertTriangle className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-error-base to-error-dark"
                    higherIsBetter={false}
                    onClick={() => navigate('/analytics/students')}
                  />
                </motion.li>

                <motion.li variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StatCard
                    title="Puntuación Media"
                    value={`${summary?.averageScore || 0}%`}
                    trend={getTrend('averageScore')}
                    periodLabel={periodLabel}
                    icon={<Trophy className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-success-base to-success-dark"
                    onClick={() => navigate('/analytics/students')}
                  />
                </motion.li>

                <motion.li variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StatCard
                    title="Partidas Hoy"
                    value={summary?.gamesToday || 0}
                    trend={getTrend('gamesToday')}
                    periodLabel={periodLabel}
                    icon={<Gamepad2 className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-brand-base to-accent-indigo"
                    onClick={() => navigate('/sessions')}
                  />
                </motion.li>

                <motion.li variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StatCard
                    title="Partidas Totales"
                    value={summary?.totalGames || 0}
                    trend={getTrend('totalGames')}
                    periodLabel={periodLabel}
                    icon={<Users className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-info-base to-accent-cyan"
                    onClick={() => navigate('/sessions')}
                  />
                </motion.li>
              </ul>

              {/* KPIs secundarios — metricas complementarias */}
              <ul
                className="list-none p-0 m-0 grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4 mt-3 opacity-90"
              >
                <motion.li variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StatCard
                    title="Tasa de Acierto"
                    value={`${getKPIValue('averageAccuracy') ?? summary?.averageAccuracy ?? 0}%`}
                    trend={getTrend('averageAccuracy')}
                    periodLabel={periodLabel}
                    icon={<Target className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-accent-cyan to-info-base"
                    compact
                    onClick={() => navigate('/analytics/insights')}
                  />
                </motion.li>

                <motion.li variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StatCard
                    title="Tiempo Medio"
                    value={`${(getKPIValue('averageResponseTime') ?? summary?.averageResponseTime ?? 0) / 1000}s`}
                    trend={getTrend('averageResponseTime')}
                    periodLabel={periodLabel}
                    icon={<Clock className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-accent-orange to-warning-base"
                    higherIsBetter={false}
                    compact
                    onClick={() => navigate('/analytics/insights')}
                  />
                </motion.li>

                <motion.li variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StatCard
                    title="Alumnos Activos"
                    value={`${activeStudentsCount}/${totalStudents}`}
                    trend=""
                    periodLabel="últimos 7 días"
                    icon={<UserCheck className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-brand-base to-accent-pink"
                    compact
                    onClick={() => navigate('/analytics/students')}
                  />
                </motion.li>

                <motion.li variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StatCard
                    title="Tasa Completado"
                    value={`${100 - (summary?.abandonmentRate || 0)}%`}
                    trend=""
                    periodLabel="partidas completadas"
                    icon={<CheckCircle2 className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-success-dark to-success-base"
                    compact
                    onClick={() => navigate('/sessions')}
                  />
                </motion.li>
              </ul>
            </motion.section>

            {/* Grid Principal: Gráficos y Listas */}
            <motion.section
              variants={listContainerVariants(0.05)}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="visible"
              className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-[var(--space-fluid-gutter)]"
              aria-label="Análisis detallado"
            >
              {/* Columna Principal (2/3 de ancho).
                  RecentActivity se movió aquí (antes era fullwidth bajo la
                  sección) para absorber el hueco vertical que dejaba la
                  columna lateral cuando terminaba antes que la principal —
                  así el grid queda balanceado sin aire muerto (QA 22/04/2026).
                  Convertida a `flex flex-col` con `flex-1` en el último item
                  (RecentActivity) para estirarlo y eliminar definitivamente el
                  hueco bajo la columna principal cuando la lateral es más alta
                  (QA 2026-04-29). */}
              <div className="xl:col-span-2 flex flex-col gap-6 lg:gap-8">
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StudentProgressChart
                    data={progressData}
                    period={timeRange}
                    onPeriodChange={setTimeRange}
                    omitPeriodSelector
                  />
                </motion.div>
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <DifficultyHeatmap data={difficulties} />
                </motion.div>
                {heatmapData && (
                  <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                    <ActivityHeatmap data={heatmapData} />
                  </motion.div>
                )}
                {studentsData?.students?.length > 0 && (
                  <motion.div variants={shouldReduceMotion ? {} : listItemVariants} className="flex-1 flex flex-col">
                    <RecentActivity students={studentsData.students} />
                  </motion.div>
                )}
              </div>

              {/* Columna Lateral (1/3 de ancho) */}
              <aside className="flex flex-col gap-6 lg:gap-8">
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <ClassroomOverview summary={summary} distribution={distributionData} />
                </motion.div>
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <AlertsPanel alerts={backendAlerts} />
                </motion.div>
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StudentsList students={studentsData?.students} />
                </motion.div>
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <QuickLinks navigate={navigate} />
                </motion.div>
              </aside>
            </motion.section>
          </div>
        </motion.section>
      )}
    </AnimatePresence>

    </>
  );
}

function Header({
  timeRange, setTimeRange,
  selectedContextId, setSelectedContextId,
  selectedMechanicId, setSelectedMechanicId,
  contextOptions, mechanicOptions,
  reducedMotion = false,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = (user?.name || '').trim().split(/\s+/)[0] || '';
  const hour = new Date().getHours();
  let greeting = 'Buenas noches';
  if (hour >= 6 && hour < 13) greeting = 'Buenos días';
  else if (hour >= 13 && hour < 20) greeting = 'Buenas tardes';
  const todayRaw = formatDate(new Date(), 'long');
  // Spanish dates should only capitalize the first letter (e.g. "Jueves, 19 de marzo de 2026")
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1).toLowerCase();

  return (
    <motion.header
      initial={reducedMotion ? false : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-5 pt-14 lg:pt-0"
    >
      {/* Fila 1: Hero — saludo + fecha integrada (sin card aislada) */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: reducedMotion ? 0 : 0.08 }}
            className="text-[var(--text-fluid-2xl)] sm:text-[var(--text-fluid-3xl)] font-bold text-text-primary mb-1 font-display tracking-tight flex items-center gap-3"
          >
            <span className="truncate">
              {greeting}
              {firstName ? (
                <>
                  ,{' '}
                  <span className="bg-gradient-to-r from-brand-light via-accent-pink to-accent-orange bg-clip-text text-transparent">
                    {firstName}
                  </span>
                </>
              ) : null}
            </span>
            {!reducedMotion && (
              <motion.span
                aria-hidden="true"
                className="inline-flex items-center justify-center size-9 rounded-xl bg-brand-base/15 text-brand-light"
                animate={{ rotate: [0, 8, -4, 6, 0], scale: [1, 1.05, 1, 1.03, 1] }}
                transition={{ duration: 1.6, times: [0, 0.25, 0.5, 0.75, 1], repeat: Infinity, repeatDelay: 3.5, ease: 'easeInOut' }}
              >
                <Sparkles size={18} aria-hidden="true" />
              </motion.span>
            )}
          </motion.h1>
          <motion.p
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reducedMotion ? 0 : 0.16 }}
            className="text-sm sm:text-base text-text-muted font-medium"
          >
            Resumen de actividad y análisis de rendimiento
          </motion.p>
        </div>

        <motion.time
          dateTime={new Date().toISOString().split('T')[0]}
          initial={reducedMotion ? false : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: reducedMotion ? 0 : 0.16 }}
          className="flex items-center gap-2 text-sm font-medium text-text-muted shrink-0 pb-1"
        >
          <Calendar size={16} className="text-brand-base" aria-hidden="true" />
          <span>{today}</span>
        </motion.time>
      </div>

      {/* Fila 2: Toolbar — filtros a la izquierda, CTAs a la derecha */}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reducedMotion ? 0 : 0.24 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"
      >
        <div className="flex items-center gap-2 flex-wrap">
          {contextOptions.length > 1 && (
            <SelectPremium
              value={selectedContextId}
              onChange={(val) => setSelectedContextId(val)}
              options={contextOptions}
              className="w-full sm:w-52"
              aria-label="Filtrar por contexto tematico"
            />
          )}
          {mechanicOptions.length > 1 && (
            <SelectPremium
              value={selectedMechanicId}
              onChange={(val) => setSelectedMechanicId(val)}
              options={mechanicOptions}
              className="w-full sm:w-52"
              aria-label="Filtrar por mecanica de juego"
            />
          )}
          <SelectPremium
            value={timeRange}
            onChange={(val) => setTimeRange(val)}
            options={[
              { value: '7d', label: 'Últimos 7 días' },
              { value: '30d', label: 'Últimos 30 días' },
              { value: '90d', label: 'Últimos 90 días' },
            ]}
            className="w-full sm:w-52"
            aria-label="Filtrar por rango de tiempo"
          />
        </div>

        <div className="flex items-center gap-2">
          <ButtonPremium
            variant="primary"
            size="sm"
            onClick={() => navigate(ROUTES.CREATE_SESSION)}
          >
            Nueva sesión
          </ButtonPremium>
          <ButtonPremium
            variant="secondary"
            size="sm"
            onClick={() => navigate(ROUTES.CARD_DECKS_NEW)}
          >
            Nuevo mazo
          </ButtonPremium>
        </div>
      </motion.div>
    </motion.header>
  );
}

const QUICK_LINKS = [
  {
    label: 'Ver todas las sesiones',
    route: ROUTES.SESSIONS,
    icon: CalendarClock,
    tintClass: 'text-brand-light',
    tintBgClass: 'bg-brand-base/15 group-hover:bg-brand-base/25'
  },
  {
    label: 'Crear nueva sesión',
    route: ROUTES.CREATE_SESSION,
    icon: Gamepad2,
    tintClass: 'text-accent-cyan',
    tintBgClass: 'bg-accent-cyan/15 group-hover:bg-accent-cyan/25'
  },
  {
    label: 'Ver mazos de cartas',
    route: ROUTES.CARD_DECKS,
    icon: Layers,
    tintClass: 'text-accent-pink',
    tintBgClass: 'bg-accent-pink/15 group-hover:bg-accent-pink/25'
  },
];

function QuickLinks({ navigate }) {
  return (
    <div className="rounded-2xl bg-background-elevated/60 backdrop-blur-sm border border-border-default p-5">
      <h3 className="text-lg font-bold text-text-primary mb-3 px-1 font-display">Accesos rápidos</h3>
      <nav className="space-y-1" aria-label="Accesos rápidos">
        {QUICK_LINKS.map(({ label, route, icon: Icon, tintClass, tintBgClass }) => (
          <button
            key={route}
            onClick={() => navigate(route)}
            className="flex items-center gap-3 w-full px-2 py-2 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-background-surface/40 transition-[color,background-color,transform] duration-200 group hover:translate-x-0.5"
          >
            <span className={`inline-flex items-center justify-center size-9 rounded-lg ${tintBgClass} transition-colors`} aria-hidden="true">
              <Icon size={18} className={`${tintClass} transition-colors`} aria-hidden="true" />
            </span>
            <span className="flex-1 text-left">{label}</span>
            <ChevronRight size={14} className="text-text-muted/50 group-hover:text-text-muted group-hover:translate-x-0.5 transition-[color,transform]" aria-hidden="true" />
          </button>
        ))}
      </nav>
    </div>
  );
}

/**
 * Timeline de actividad reciente — muestra las ultimas partidas de alumnos.
 * Se deriva de los datos de students (ordenados por lastPlayedAt).
 */
function RecentActivity({ students }) {
  const recentStudents = useMemo(() => {
    if (!students?.length) return [];
    return [...students]
      .filter(s => s.lastPlayedAt || s.studentMetrics?.lastPlayedAt)
      .sort((a, b) => new Date(b.lastPlayedAt || b.studentMetrics?.lastPlayedAt) - new Date(a.lastPlayedAt || a.studentMetrics?.lastPlayedAt))
      .slice(0, 6);
  }, [students]);

  // Hooks antes del early-return para respetar reglas de hooks de React.
  const { ref: scrollRef, hasOverflow, canScrollRight, scrollByOne } = useHorizontalScroll();
  const { shouldReduceMotion: reduced } = useReducedMotion();

  if (recentStudents.length === 0) return null;

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // getRelativeTime centralizado en lib/dateUtils.js (P25).

  return (
    <section className="bg-background-elevated/40 backdrop-blur-sm rounded-2xl border border-border-subtle p-5 relative overflow-hidden h-full flex flex-col">
      <h3 className="text-lg font-bold text-text-primary font-display mb-4">Actividad Reciente</h3>
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 custom-scrollbar">
        {recentStudents.map((student, index) => (
          <div
            key={student.studentId || student._id || `recent-${index}`}
            className="flex-shrink-0 flex items-center gap-3 bg-background-surface/40 rounded-xl px-4 py-3 min-w-[200px] border border-border-subtle/50"
          >
            <div className="size-8 rounded-full bg-gradient-to-br from-accent-indigo to-brand-base flex items-center justify-center text-xs font-bold text-white">
              {getInitials(student.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{student.name}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted font-bold tabular-nums">
                  {Math.round(student.studentMetrics?.averageScore || student.averageScore || 0)} pts
                </span>
                <span className="text-[10px] text-text-disabled">
                  {formatRelativeTime(student.lastPlayedAt || student.studentMetrics?.lastPlayedAt)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Fade a la derecha — visible solo si todavia queda contenido por
          scrollear (useHorizontalScroll detecta overflow real, PROP-86). */}
      {canScrollRight && (
        <div
          className="pointer-events-none absolute right-0 top-[3.75rem] bottom-5 w-16 bg-gradient-to-l from-background-elevated via-background-elevated/80 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* Chevron button: scrollea ~80% del viewport al pulsar. Desaparece
          al llegar al final. Respeta reduced-motion. */}
      {hasOverflow && canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByOne(reduced ? 'auto' : 'smooth')}
          aria-label="Ver más actividad"
          className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-background-surface/90 hover:bg-background-surface ring-1 ring-border-default backdrop-blur-sm flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors shadow-lg z-10"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
