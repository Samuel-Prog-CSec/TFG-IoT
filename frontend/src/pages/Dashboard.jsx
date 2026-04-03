import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Gamepad2, Trophy, AlertTriangle, Calendar, CalendarClock, Layers, ChevronRight, Target, Clock, UserCheck, CheckCircle2 } from 'lucide-react';
import ErrorState from '../components/ui/ErrorState';
import { listContainerVariants, listItemVariants, crossfadeVariants, formatDate } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAuth } from '../context/AuthContext';
import analyticsService from '../services/analytics';
import { isAbortError } from '../services/api';
import { captureException } from '../lib/sentry';
import { ROUTES } from '../constants/routes';
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

export default function Dashboard() {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle('Dashboard');
  const { shouldReduceMotion } = useReducedMotion();
  const [timeRange, setTimeRange] = useState('7d');

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

  const fetchData = useCallback(() => {
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
          analyticsService.getClassroomStudents({ sort: 'score', order: 'desc' }, { signal: controller.signal }).catch(() => null),
          analyticsService.getClassroomDistribution({}, { signal: controller.signal }).catch(() => null),
          analyticsService.getAlerts({ limit: 5 }, { signal: controller.signal }).catch(() => null),
          analyticsService.getClassroomHeatmap(timeRange, { signal: controller.signal }).catch(() => null)
        ]);

        setSummary(summaryData);
        setTrends(trendsData);
        setProgressData(progress);
        setDifficulties(difficultiesData);
        setStudentsData(students);
        setDistributionData(distribution);
        setAlertsData(alerts);
        setHeatmapData(heatmap);
        setError(null);
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
  }, [timeRange]);

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

  // Extraer el cambio porcentual de un KPI por nombre
  const getTrend = useCallback((kpiName) => {
    if (!trends?.kpis) return '';
    const kpi = trends.kpis.find(k => k.name === kpiName);
    if (!kpi || kpi.changePercent === 0 || kpi.changePercent == null) return '';
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
      if (!s.lastPlayedAt) return false;
      return new Date(s.lastPlayedAt) >= sevenDaysAgo;
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

  return (
    <AnimatePresence mode="wait">
      {skeletonContent ? (
        <motion.main
          key="skeleton"
          {...(shouldReduceMotion ? {} : crossfadeVariants)}
          className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {[...Array(8)].map((_, index) => (
              <SkeletonStatCard key={`stat-skeleton-${index}`} />
            ))}
          </div>

          {/* Main Visualizations Skeleton Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
            <div className="xl:col-span-2 space-y-6">
              <SkeletonChart height={384} />
              <SkeletonChart height={320} />
            </div>
            <aside className="space-y-6">
              <SkeletonCard className="h-[21rem]" />
              <SkeletonCard className="h-64" />
            </aside>
          </div>
        </motion.main>
      ) : (
        <motion.main
          key="content"
          {...(shouldReduceMotion ? {} : crossfadeVariants)}
          className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8"
          aria-label="Panel principal del dashboard"
        >
          <Header timeRange={timeRange} setTimeRange={setTimeRange} reducedMotion={shouldReduceMotion} />

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
              variants={listContainerVariants(0.08)}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="visible"
              aria-labelledby="stats-heading"
            >
              <h2 id="stats-heading" className="sr-only">KPIs Principales</h2>
              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6"
                role="list"
              >
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Alumnos en Riesgo"
                    value={summary?.studentsInRisk || 0}
                    trend={getTrend('studentsInRisk')}
                    periodLabel={periodLabel}
                    icon={<AlertTriangle className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-error-base to-error-dark"
                  />
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Puntuación Media"
                    value={`${summary?.averageScore || 0}%`}
                    trend={getTrend('averageScore')}
                    periodLabel={periodLabel}
                    icon={<Trophy className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-success-base to-success-dark"
                  />
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Partidas Hoy"
                    value={summary?.gamesToday || 0}
                    trend={getTrend('gamesToday')}
                    periodLabel={periodLabel}
                    icon={<Gamepad2 className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-brand-base to-accent-indigo"
                  />
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Partidas Totales"
                    value={summary?.totalGames || 0}
                    trend={getTrend('totalGames')}
                    periodLabel={periodLabel}
                    icon={<Users className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-info-base to-accent-cyan"
                  />
                </motion.div>

                {/* Fila 2: KPIs secundarios */}
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Tasa de Acierto"
                    value={`${getKPIValue('averageAccuracy') ?? summary?.averageAccuracy ?? 0}%`}
                    trend={getTrend('averageAccuracy')}
                    periodLabel={periodLabel}
                    icon={<Target className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-accent-cyan to-info-base"
                  />
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Tiempo Medio"
                    value={`${(getKPIValue('averageResponseTime') ?? summary?.averageResponseTime ?? 0) / 1000}s`}
                    trend={getTrend('averageResponseTime')}
                    periodLabel={periodLabel}
                    icon={<Clock className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-accent-orange to-warning-base"
                  />
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Alumnos Activos"
                    value={`${activeStudentsCount}/${totalStudents}`}
                    trend=""
                    periodLabel="ultimos 7 dias"
                    icon={<UserCheck className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-brand-base to-accent-pink"
                  />
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Tasa Completado"
                    value={`${100 - (summary?.abandonmentRate || 0)}%`}
                    trend=""
                    periodLabel="partidas completadas"
                    icon={<CheckCircle2 className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-success-dark to-success-base"
                  />
                </motion.div>
              </div>
            </motion.section>

            {/* Grid Principal: Gráficos y Listas */}
            <motion.section
              variants={listContainerVariants(0.12)}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="visible"
              className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8"
              aria-label="Análisis detallado"
            >
              {/* Columna Principal (2/3 de ancho) */}
              <div className="xl:col-span-2 space-y-6 lg:space-y-8">
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <StudentProgressChart
                    data={progressData}
                    period={timeRange}
                    onPeriodChange={setTimeRange}
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
              </div>

              {/* Columna Lateral (1/3 de ancho) */}
              <aside className="space-y-6 lg:space-y-8">
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

            {/* Actividad Reciente (timeline) */}
            {studentsData?.students?.length > 0 && (
              <RecentActivity students={studentsData.students} />
            )}
          </div>
        </motion.main>
      )}
    </AnimatePresence>
  );
}

function Header({ timeRange, setTimeRange, reducedMotion = false }) {
  const navigate = useNavigate();
  const todayRaw = formatDate(new Date(), 'long');
  // Spanish dates should only capitalize the first letter (e.g. "Jueves, 19 de marzo de 2026")
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1).toLowerCase();

  return (
    <motion.header 
      initial={reducedMotion ? false : { opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pt-14 lg:pt-0"
    >
      <div>
        <motion.h1 
          initial={reducedMotion ? false : { opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: reducedMotion ? 0 : 0.1 }}
          className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 font-display whitespace-nowrap"
        >
          <span aria-hidden="true">¡Bienvenido de nuevo! 👋</span>
          <span className="sr-only">¡Bienvenido de nuevo!</span>
        </motion.h1>
        <motion.p 
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reducedMotion ? 0 : 0.2 }}
          className="text-text-muted font-medium"
        >
          Resumen de actividad y análisis de rendimiento
        </motion.p>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden xl:flex items-center gap-2">
          <ButtonPremium
            variant="secondary"
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

        {/* Global Filter */}
        <SelectPremium
          value={timeRange}
          onChange={(val) => setTimeRange(val)}
          options={[
            { value: '7d', label: 'Ultimos 7 dias' },
            { value: '30d', label: 'Ultimos 30 dias' },
            { value: '90d', label: 'Ultimos 90 dias' },
          ]}
          className="w-48"
        />

        <motion.time 
          dateTime={new Date().toISOString().split('T')[0]}
          initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: reducedMotion ? 0 : 0.2 }}
          className="hidden sm:flex items-center gap-2.5 text-sm font-medium text-text-muted bg-background-elevated/50 backdrop-blur-sm px-4 py-2.5 rounded-xl border border-border-subtle"
        >
          <Calendar size={16} className="text-brand-base" aria-hidden="true" />
          <span>{today}</span>
        </motion.time>
      </div>
    </motion.header>
  );
}

const QUICK_LINKS = [
  { label: 'Ver todas las sesiones', route: ROUTES.SESSIONS, icon: CalendarClock },
  { label: 'Crear nueva sesión', route: ROUTES.CREATE_SESSION, icon: Gamepad2 },
  { label: 'Ver mazos de cartas', route: ROUTES.CARD_DECKS, icon: Layers },
];

function QuickLinks({ navigate }) {
  return (
    <div className="rounded-2xl bg-background-elevated/60 backdrop-blur-sm border border-border-default p-5">
      <h3 className="text-lg font-bold text-text-primary mb-3 px-1 font-display">Accesos Rapidos</h3>
      <nav className="space-y-1" aria-label="Accesos rapidos">
        {QUICK_LINKS.map(({ label, route, icon: Icon }) => (
          <button
            key={route}
            onClick={() => navigate(route)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-background-surface/60 transition-colors duration-150 group"
          >
            <Icon size={18} className="text-text-muted group-hover:text-brand-base transition-colors" aria-hidden="true" />
            <span className="flex-1 text-left">{label}</span>
            <ChevronRight size={14} className="text-text-muted/50 group-hover:text-text-muted transition-colors" aria-hidden="true" />
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
      .filter(s => s.lastPlayedAt)
      .sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt))
      .slice(0, 6);
  }, [students]);

  if (recentStudents.length === 0) return null;

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getRelativeTime = (dateStr) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `Hace ${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours}h`;
    return `Hace ${Math.floor(diffHours / 24)}d`;
  };

  return (
    <section className="bg-background-elevated/40 backdrop-blur-sm rounded-2xl border border-border-subtle p-5">
      <h3 className="text-lg font-bold text-text-primary font-display mb-4">Actividad Reciente</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 custom-scrollbar">
        {recentStudents.map((student) => (
          <div
            key={student.studentId || student._id}
            className="flex-shrink-0 flex items-center gap-3 bg-background-surface/40 rounded-xl px-4 py-3 min-w-[200px] border border-border-subtle/50"
          >
            <div className="size-8 rounded-full bg-gradient-to-br from-accent-indigo to-brand-base flex items-center justify-center text-xs font-bold text-white">
              {getInitials(student.name)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{student.name}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted font-bold tabular-nums">
                  {Math.round(student.averageScore || 0)} pts
                </span>
                <span className="text-[10px] text-text-disabled">
                  {getRelativeTime(student.lastPlayedAt)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
