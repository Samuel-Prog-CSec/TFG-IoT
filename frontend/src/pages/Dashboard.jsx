import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Gamepad2, Trophy, AlertTriangle, Calendar } from 'lucide-react';
import ErrorState from '../components/ui/ErrorState';
import { listContainerVariants, listItemVariants, crossfadeVariants, formatDate } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import analyticsService from '../services/analytics';
import { isAbortError } from '../services/api';
import { captureException } from '../lib/sentry';
import { ROUTES } from '../constants/routes';
import StatCard from '../components/dashboard/StatCard';
import StudentProgressChart from '../components/dashboard/StudentProgressChart';
import ClassroomOverview from '../components/dashboard/ClassroomOverview';
import AlertsPanel from '../components/dashboard/AlertsPanel';
import DifficultyHeatmap from '../components/dashboard/DifficultyHeatmap';
import SkeletonShimmer, { SkeletonCard, SkeletonStatCard, SkeletonChart } from '../components/ui/SkeletonShimmer';
import SelectPremium from '../components/ui/SelectPremium';
import ButtonPremium from '../components/ui/ButtonPremium';

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { shouldReduceMotion } = useReducedMotion();
  const [timeRange, setTimeRange] = useState('7d'); // '7d' or '30d'
  
  // State for data
  const [summary, setSummary] = useState(null);
  const [progressData, setProgressData] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
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
        const [summaryData, progress, difficultiesData] = await Promise.all([
          analyticsService.getClassroomSummary({ signal: controller.signal }),
          analyticsService.getClassroomComparison(timeRange, { signal: controller.signal }),
          analyticsService.getClassroomDifficulties({ signal: controller.signal })
        ]);

        setSummary(summaryData);
        setProgressData(progress);
        setDifficulties(difficultiesData);
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

  // Derivar alertas de los datos - Memoized to prevent recalculation on unrelated re-renders
  const alerts = useMemo(() => {
    const arr = [];
    if (summary?.studentsInRisk > 0) {
        arr.push({
            type: 'risk',
            title: 'Alumnos en Riesgo',
            message: `${summary.studentsInRisk} alumnos tienen un promedio bajo (<50) en sus últimas partidas.`
        });
    }
    if (summary?.gamesToday > 5) {
        arr.push({
            type: 'milestone',
            title: 'Alta Actividad',
            message: `Hoy ha sido un día muy activo con ${summary.gamesToday} partidas jugadas.`
        });
    }
    return arr;
  }, [summary]);

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
            {[...Array(4)].map((_, index) => (
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
          className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 flex flex-col"
          aria-label="Panel principal del dashboard"
        >
          <Header timeRange={timeRange} setTimeRange={setTimeRange} reducedMotion={shouldReduceMotion} />

          <div className="flex flex-col gap-8 flex-1">
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
                    trend={summary?.studentsInRisk > 0 ? "+1" : "0"}
                    icon={<AlertTriangle className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-error-base to-error-dark"
                  />
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Puntuación Media"
                    value={`${summary?.averageScore || 0}%`}
                    trend="+2.4%"
                    icon={<Trophy className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-success-base to-success-dark"
                  />
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Partidas Hoy"
                    value={summary?.gamesToday || 0}
                    trend="+5%"
                    icon={<Gamepad2 className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-brand-base to-accent-indigo"
                  />
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <StatCard
                    title="Partidas Totales"
                    value={summary?.totalGames || 0}
                    trend="+12%"
                    icon={<Users className="text-white drop-shadow-sm" size={24} aria-hidden="true" />}
                    color="bg-gradient-to-br from-info-base to-accent-cyan"
                  />
                </motion.div>
              </div>
            </motion.section>

            {/* Grid Principal: Gráficos y Listas */}
            <motion.section
              variants={listContainerVariants(0.12)}
              initial={shouldReduceMotion ? false : "hidden"}
              animate="visible"
              className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8 flex-1"
              aria-label="Análisis detallado"
            >
              {/* Columna Principal (2/3 de ancho) */}
              <div className="xl:col-span-2 space-y-6 lg:space-y-8 flex flex-col h-full">
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
              </div>

              {/* Columna Lateral (1/3 de ancho) */}
              <aside className="space-y-6 lg:space-y-8 h-full flex flex-col">
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <ClassroomOverview summary={summary} distribution={null} />
                </motion.div>
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
                  <AlertsPanel alerts={alerts} />
                </motion.div>
              </aside>
            </motion.section>
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
            { value: '7d', label: 'Últimos 7 días' },
            { value: '30d', label: 'Últimos 30 días' },
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
          <span className="capitalize">{today}</span>
        </motion.time>
      </div>
    </motion.header>
  );
}
