import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
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
import AlertsPanel from '../components/dashboard/AlertsPanel';
import StudentsList from '../components/dashboard/StudentsList';
import SkeletonShimmer, { SkeletonCard, SkeletonStatCard, SkeletonChart } from '../components/ui/SkeletonShimmer';
import SelectPremium from '../components/ui/SelectPremium';
import ButtonPremium from '../components/ui/ButtonPremium';

// T-907 Fase B: charts y heatmaps pesados (Recharts/canvas) se cargan via lazy
// con Suspense para que KPIs, alertas y header del Dashboard se rendericen
// antes de que el chunk `charts` esté disponible. El SkeletonChart cubre el
// hueco hasta que el chart se monta. Solo aplica al Dashboard porque es la
// primera página post-login y se beneficia más del FCP rápido.
const StudentProgressChart = lazy(() => import('../components/dashboard/StudentProgressChart'));
const ClassroomOverview = lazy(() => import('../components/dashboard/ClassroomOverview'));
const DifficultyHeatmap = lazy(() => import('../components/dashboard/DifficultyHeatmap'));
const ActivityHeatmap = lazy(() => import('../components/analytics/ActivityHeatmap'));

/**
 * T-942 Fase E.1: traduce cohort_mode → timeRange aceptado por backend.
 *
 * El backend solo soporta '7d' | '30d' | '90d' como `timeRange` para los
 * endpoints de analytics de aula. Las opciones nuevas "Mes actual" y
 * "Trimestre actual" del Dashboard teacher se mapean al rango aproximado
 * más cercano (`30d` y `90d` respectivamente), evitando trabajo backend
 * en esta sesion (T-942 Fase E). Para el docente la pérdida de precisión
 * es despreciable: en el peor caso, "Mes actual" un 31 de un mes incluye
 * 1 día anterior al periodo nominal; suficiente para la lectura
 * pedagógica que el widget pretende. El label visible al usuario
 * sigue siendo "Mes actual" / "Trimestre actual".
 *
 * @param {'7d'|'30d'|'90d'|'currentMonth'|'currentQuarter'} cohortMode
 * @returns {'7d'|'30d'|'90d'}
 */
function cohortToTimeRange(cohortMode) {
  if (cohortMode === 'currentMonth') return '30d';
  if (cohortMode === 'currentQuarter') return '90d';
  return cohortMode;
}

// eslint-disable-next-line sonarjs/cyclomatic-complexity -- dashboard principal con multiples widgets, filtros y estados de carga
export default function Dashboard() {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle('Dashboard');
  const { shouldReduceMotion } = useReducedMotion();
  // T-942 Fase E.1: cohortMode incluye opciones nuevas "mes actual" y
  // "trimestre actual" además de los rangos rolling clásicos. timeRange
  // (derivado vía cohortToTimeRange) sigue siendo lo que pasa al backend.
  const [cohortMode, setCohortMode] = useState('7d');
  const timeRange = cohortToTimeRange(cohortMode);
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
        // El DTO de contexto expone `id` (no `_id`); usar `_id` dejaba el value
        // en undefined → el SelectPremium seleccionaba siempre la 1ª opción y no
        // se enviaba el filtro al backend.
        ...contexts.map(c => ({ value: c.id, label: c.name }))
      ]);
      setMechanicOptions([
        { value: '', label: 'Todas las mecánicas' },
        ...mechanics.map(m => ({ value: m.id, label: m.displayName || m.name }))
      ]);
      return undefined;
    }).catch(() => { /* errores individuales ya manejados */ });
    return () => { cancelled = true; };
  }, []);

  // Redirigir super_admin a su panel.
  // T-942 Fase D: aterriza en /admin/dashboard (vista del centro con KPIs
  // agregados) en lugar de /admin/approvals — el director del centro
  // necesita primero la foto global, las aprobaciones siguen a un click.
  useEffect(() => {
    if (isSuperAdmin) {
      navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
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
        // Filtros de contenido activos del Dashboard (contexto/mecánica). Se
        // reparten a los endpoints de aula para que KPIs, tendencia y
        // distribución respondan al mismo subconjunto que el listado de
        // alumnos (T-942 Fase E).
        const filterParams = {
          ...(selectedContextId && { contextId: selectedContextId }),
          ...(selectedMechanicId && { mechanicId: selectedMechanicId })
        };
        const hasContentFilter = Boolean(selectedContextId || selectedMechanicId);

        // Resumen y distribución solo reciben timeRange cuando hay un filtro de
        // contenido activo: en la vista por defecto (sin contexto ni mecánica)
        // estos KPIs y la distribución siguen siendo lifetime, idénticos a su
        // comportamiento previo. La tendencia siempre usó timeRange, así que se
        // mantiene tal cual.
        const summaryParams = hasContentFilter ? { timeRange, ...filterParams } : {};
        const distributionParams = hasContentFilter ? { timeRange, ...filterParams } : {};

        const [summaryData, trendsData, progress, difficultiesData, students, distribution, alerts, heatmap] = await Promise.all([
          analyticsService.getClassroomSummary(summaryParams, { signal: controller.signal }),
          analyticsService.getClassroomTrends(timeRange, filterParams, { signal: controller.signal }),
          analyticsService.getClassroomComparison(timeRange, filterParams, { signal: controller.signal }).catch(() => []),
          analyticsService.getClassroomDifficulties({ signal: controller.signal }).catch(() => []),
          analyticsService.getClassroomStudents({
            sort: 'score', order: 'desc',
            ...filterParams
          }, { signal: controller.signal }).catch(() => null),
          analyticsService.getClassroomDistribution(distributionParams, { signal: controller.signal }).catch(() => null),
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

  // T-941: refrescar alertas en tiempo real cuando llega una nueva critical.
  // El evento lo dispara `useNotifications` al recibir `notification:created`
  // con type='student_at_risk'.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = () => {
      analyticsService
        .getAlerts({ limit: 5 })
        .then(setAlertsData)
        .catch(() => null);
    };
    window.addEventListener('smartalert:created', handler);
    return () => window.removeEventListener('smartalert:created', handler);
  }, []);

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

  // Alertas inteligentes del backend (T-941: shape `{ items, nextCursor }`).
  const backendAlerts = useMemo(() => {
    if (!alertsData) return [];
    // Compat: alertsData.items (T-941) | alertsData.alerts (legacy snapshot).
    return alertsData.items || alertsData.alerts || [];
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
            cohortMode={cohortMode}
            setCohortMode={setCohortMode}
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

              {/* KPIs secundarios — metricas complementarias. Sin opacity:
                  los cards siguen siendo interactivos y la atenuación previa
                  no tenía función real (UI-B audit). La jerarquía respecto
                  a los KPIs primarios la da el tamaño compacto (prop
                  `compact`) y la altura menor, no la opacidad. */}
              <ul
                className="list-none p-0 m-0 grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4 mt-3"
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

            {/* T-942 Fase E.4: jerarquía revisada del Dashboard teacher.
                Nueva secuencia: KPIs → Acción inmediata (alertas + actividad
                reciente, primer foco docente) → Análisis profundo
                (charts y heatmaps) → Información complementaria
                (ClassroomOverview + StudentsList + QuickLinks). Prioriza lo
                accionable arriba para que la primera lectura del Dashboard
                apunte a "qué necesita mi atención ahora". */}

            {/* Acción inmediata — alertas + actividad reciente.
                T-942 fix Issue #2: stack vertical en lugar de grid 2 cols.
                RecentActivity es un carrousel horizontal de tarjetas de
                alumno y full-width le aprovecha la dimensión natural; con
                grid 2 cols dejaba mucho aire vertical debajo a la derecha
                mientras AlertsPanel (alto con varias alertas) marcaba el
                ritmo del row. */}
            <motion.section
              variants={listContainerVariants(0.05)}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="visible"
              aria-labelledby="action-heading"
              className="space-y-4"
            >
              <h2 id="action-heading" className="text-sm font-display font-medium text-text-secondary uppercase tracking-wider px-1">
                Acción inmediata
              </h2>
              <div className="space-y-[var(--space-fluid-gutter)]">
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <AlertsPanel alerts={backendAlerts} />
                </motion.div>
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <RecentActivity students={studentsData?.students || []} />
                </motion.div>
              </div>
            </motion.section>

            {/* Análisis profundo — tendencias y patrones a medio plazo */}
            <motion.section
              variants={listContainerVariants(0.05)}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="visible"
              aria-labelledby="analysis-heading"
              className="space-y-4"
            >
              <div className="flex flex-col gap-1 px-1">
                <h2 id="analysis-heading" className="text-sm font-display font-medium text-text-secondary uppercase tracking-wider">
                  Análisis profundo
                </h2>
                <p className="text-xs text-text-muted">
                  Tendencias y patrones de la clase a medio plazo
                </p>
              </div>
              {/* T-942 fix Issue #2: ClassroomOverview (distribución por
                  tier) sube a la columna principal — es analítica y casa con
                  los otros charts. La aside queda con StudentsList +
                  QuickLinks, alturas más equilibradas con la columna
                  principal cuando los heatmaps están vacíos. */}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-[var(--space-fluid-gutter)]">
                <div className="xl:col-span-2 flex flex-col gap-6 lg:gap-8">
                  <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                    <Suspense fallback={<SkeletonChart height={320} />}>
                      <StudentProgressChart
                        data={progressData}
                        period={timeRange}
                        onPeriodChange={(val) => setCohortMode(val)}
                        omitPeriodSelector
                      />
                    </Suspense>
                  </motion.div>
                  <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                    <Suspense fallback={<SkeletonChart height={280} />}>
                      <ClassroomOverview summary={summary} distribution={distributionData} />
                    </Suspense>
                  </motion.div>
                  <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                    {/* QA 2026-05-30: el mapa de dificultad es una comparación
                        cruzada Contexto×Mecánica, así que se mantiene global
                        aunque haya un filtro de contenido activo. Lo etiquetamos
                        para ser honestos (no es que el filtro no funcione). */}
                    {(selectedContextId || selectedMechanicId) && (
                      <p className="text-xs text-text-muted mb-2 px-1">
                        Vista global · no se ajusta al filtro de contenido
                      </p>
                    )}
                    <Suspense fallback={<SkeletonChart height={260} />}>
                      <DifficultyHeatmap data={difficulties} />
                    </Suspense>
                  </motion.div>
                  {heatmapData && (
                    <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                      {(selectedContextId || selectedMechanicId) && (
                        <p className="text-xs text-text-muted mb-2 px-1">
                          Vista global · no se ajusta al filtro de contenido
                        </p>
                      )}
                      <Suspense fallback={<SkeletonChart height={220} />}>
                        <ActivityHeatmap data={heatmapData} />
                      </Suspense>
                    </motion.div>
                  )}
                </div>

                {/* Columna Lateral (1/3 de ancho) — listado de alumnos +
                    accesos rápidos. */}
                <aside className="flex flex-col gap-6 lg:gap-8">
                  <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                    <StudentsList students={studentsData?.students} />
                  </motion.div>
                  <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                    <QuickLinks navigate={navigate} />
                  </motion.div>
                </aside>
              </div>
            </motion.section>
          </div>
        </motion.section>
      )}
    </AnimatePresence>

    </>
  );
}

function Header({
  cohortMode, setCohortMode,
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
                className="inline-flex items-center justify-center size-9 rounded-xl bg-brand-base/15 text-brand-on-alpha"
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
              aria-label="Filtrar por contexto temático"
            />
          )}
          {mechanicOptions.length > 1 && (
            <SelectPremium
              value={selectedMechanicId}
              onChange={(val) => setSelectedMechanicId(val)}
              options={mechanicOptions}
              className="w-full sm:w-52"
              aria-label="Filtrar por mecánica de juego"
            />
          )}
          <SelectPremium
            value={cohortMode}
            onChange={(val) => setCohortMode(val)}
            options={[
              { value: '7d', label: 'Últimos 7 días' },
              { value: '30d', label: 'Últimos 30 días' },
              { value: '90d', label: 'Últimos 90 días' },
              { value: 'currentMonth', label: 'Mes actual' },
              { value: 'currentQuarter', label: 'Trimestre actual' },
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
    tintClass: 'text-brand-on-alpha',
    tintBgClass: 'bg-brand-base/15 group-hover:bg-brand-base/25'
  },
  {
    label: 'Crear nueva sesión',
    route: ROUTES.CREATE_SESSION,
    icon: Gamepad2,
    tintClass: 'text-accent-cyan-on-alpha',
    tintBgClass: 'bg-accent-cyan/15 group-hover:bg-accent-cyan/25'
  },
  {
    label: 'Ver mazos de cartas',
    route: ROUTES.CARD_DECKS,
    icon: Layers,
    tintClass: 'text-accent-pink-on-alpha',
    tintBgClass: 'bg-accent-pink/15 group-hover:bg-accent-pink/25'
  },
];

function QuickLinks({ navigate }) {
  return (
    <div className="rounded-2xl bg-background-elevated/60 backdrop-blur-sm border border-border-default p-5">
      <h3 className="text-lg font-semibold text-text-primary mb-3 px-1 font-display">Accesos rápidos</h3>
      <nav className="space-y-1" aria-label="Accesos rápidos">
        {QUICK_LINKS.map(({ label, route, icon: Icon, tintClass, tintBgClass }) => (
          <button
            key={route}
            onClick={() => navigate(route)}
            className="flex items-center gap-3 w-full p-2 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-background-surface/40 transition-[color,background-color,transform] duration-200 group hover:translate-x-0.5"
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

  // Empty state integrado: el slot queda visible aunque no haya datos, así
  // se mantiene la simetría del grid del dashboard (antes desaparecía y la
  // columna lateral quedaba con un hueco vertical irregular).
  if (recentStudents.length === 0) {
    return (
      <section className="bg-background-elevated/40 backdrop-blur-sm rounded-2xl border border-border-subtle p-5 h-full flex flex-col">
        <h3 className="text-lg font-semibold text-text-primary font-display mb-4">Actividad Reciente</h3>
        <div className="flex-1 flex items-center justify-center text-center py-6">
          <p className="text-sm text-text-muted max-w-[20rem]">
            Aún no hay partidas. Cuando tus alumnos jueguen, aparecerán aquí sus últimas sesiones.
          </p>
        </div>
      </section>
    );
  }

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // getRelativeTime centralizado en lib/dateUtils.js (P25).

  return (
    <section className="bg-background-elevated/40 backdrop-blur-sm rounded-2xl border border-border-subtle p-5 relative overflow-hidden h-full flex flex-col">
      <h3 className="text-lg font-semibold text-text-primary font-display mb-4">Actividad Reciente</h3>
      {/* BUG-A11Y-SCROLL-A (QA Sprint 0 post-v0.5.0): scrollable region
          necesita keyboard focus para que el usuario pueda navegarla con
          flechas (WCAG 2.1.1). Añadido tabIndex+role+aria-label.
          eslint-disable: el rule jsx-a11y/no-noninteractive-tabindex no
          contempla scrollable regions, pero axe y WCAG lo exigen. */}
      <div
        ref={scrollRef}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label="Actividad reciente de alumnos"
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 custom-scrollbar focus-ring rounded-md"
      >
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
                {/* BUG-A11Y-CONTRAST-A: text-text-disabled (oklch 0.6 sobre
                    bg-background-surface/40) no llega a 4.5:1. Subir a
                    text-text-muted que sí pasa AA. */}
                <span className="text-nano text-text-muted">
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
