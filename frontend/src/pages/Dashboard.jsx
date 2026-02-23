import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, Gamepad2, Trophy, AlertTriangle, Calendar, TrendingUp } from 'lucide-react';
import { staggerContainer, staggerItem } from '../lib/utils';
import { useDocumentTitle, useRefetchOnFocus, useReducedMotion } from '../hooks';
import analyticsService from '../services/analytics';
import { isAbortError } from '../services/api';
import { ROUTES } from '../constants/routes';
import StatCard from '../components/dashboard/StatCard';
import StudentProgressChart from '../components/dashboard/StudentProgressChart';
import ClassroomOverview from '../components/dashboard/ClassroomOverview';
import AlertsPanel from '../components/dashboard/AlertsPanel';
import DifficultyHeatmap from '../components/dashboard/DifficultyHeatmap';
import { SkeletonCard, SkeletonStatCard, SkeletonShimmer } from '../components/ui';

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
        console.error('Error loading dashboard data:', err);
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
            title: 'Estudiantes en Riesgo',
            message: `${summary.studentsInRisk} estudiantes tienen un promedio bajo (<50) en sus últimas partidas.`
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
  if (loading && !summary) {
      return (
        <main className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in-up">
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
              <SkeletonCard className="h-96" />
              <SkeletonCard className="h-80" />
            </div>
            <aside className="space-y-6">
              <SkeletonCard className="h-[21rem]" />
              <SkeletonCard className="h-64" />
            </aside>
          </div>
        </main>
      );
  }

  return (
    <main 
      className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8 flex flex-col"
      aria-label="Panel principal del dashboard"
    >
      <Header timeRange={timeRange} setTimeRange={setTimeRange} reducedMotion={shouldReduceMotion} />

      <motion.div
        variants={staggerContainer}
        initial={shouldReduceMotion ? false : "hidden"}
        animate="show"
        className="flex flex-col gap-8 flex-1"
      >
        {loading && summary ? (
          <motion.div variants={staggerItem} className="bg-background-elevated/50 border border-border-default text-text-muted px-4 py-2 rounded-xl text-sm font-medium animate-pulse">
            Actualizando métricas...
          </motion.div>
        ) : null}
        
        {error ? (
          <motion.div variants={staggerItem} className="bg-error-base/10 border border-error-base/20 text-error-base p-4 rounded-xl flex items-center gap-3">
              <AlertTriangle className="shrink-0" size={20} />
              <p className="font-medium">{error}</p>
          </motion.div>
        ) : null}

        {/* BI Principle: Jerarquía Visual - KPIs Arriba */}
        <motion.section variants={staggerItem} aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="sr-only">KPIs Principales</h2>
          <div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6"
            role="list"
          >
            {/* KPI 1: Alerta / Atención Requerida */}
            <div role="listitem">
              <StatCard 
                title="Estudiantes en Riesgo" 
                value={summary?.studentsInRisk || 0}
                trend={summary?.studentsInRisk > 0 ? "+1" : "0"} 
                icon={<AlertTriangle className="text-white drop-shadow-sm" size={24} aria-hidden="true" />} 
                color="bg-gradient-to-br from-error-base to-error-dark" 
              />
            </div>

            {/* KPI 2: Rendimiento General */}
            <div role="listitem">
              <StatCard 
                title="Puntaje Promedio" 
                value={`${summary?.averageScore || 0}%`}
                trend="+2.4%"
                icon={<Trophy className="text-white drop-shadow-sm" size={24} aria-hidden="true" />} 
                color="bg-gradient-to-br from-success-base to-success-dark" 
              />
            </div>

            {/* KPI 3: Actividad */}
            <div role="listitem">
              <StatCard 
                title="Partidas Hoy" 
                value={summary?.gamesToday || 0}
                trend="+5%" 
                icon={<Gamepad2 className="text-white drop-shadow-sm" size={24} aria-hidden="true" />} 
                color="bg-gradient-to-br from-brand-base to-accent-indigo" 
              />
            </div>

            {/* KPI 4: Volumen */}
            <div role="listitem">
              <StatCard 
                title="Total Jugadas" 
                value={summary?.totalGames || 0}
                trend="+12%" 
                icon={<Users className="text-white drop-shadow-sm" size={24} aria-hidden="true" />} 
                color="bg-gradient-to-br from-info-base to-accent-cyan" 
              />
            </div>
          </div>
        </motion.section>

        {/* Grid Principal: Gráficos y Listas */}
        <motion.section variants={staggerItem} className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8 flex-1" aria-label="Análisis detallado">
          
          {/* Columna Principal (2/3 de ancho) */}
          <div className="xl:col-span-2 space-y-6 lg:space-y-8 flex flex-col h-full">
            <StudentProgressChart
              data={progressData}
              period={timeRange}
              onPeriodChange={setTimeRange}
            />
            <DifficultyHeatmap data={difficulties} />
          </div>

          {/* Columna Lateral (1/3 de ancho) */}
          <aside className="space-y-6 lg:space-y-8 h-full flex flex-col">
             <ClassroomOverview summary={summary} distribution={null} />
             <AlertsPanel alerts={alerts} />
          </aside>
        </motion.section>
      </motion.div>
    </main>
  );
}

function Header({ timeRange, setTimeRange, reducedMotion = false }) {
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <motion.header 
      initial={reducedMotion ? false : { opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pt-4 lg:pt-0"
    >
      <div>
        <motion.h1 
          initial={reducedMotion ? false : { opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: reducedMotion ? 0 : 0.1 }}
          className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 font-display"
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
          <button
            onClick={() => navigate(ROUTES.CREATE_SESSION)}
            className="px-3 py-2 rounded-xl border border-brand-base/30 bg-brand-base/10 text-brand-light hover:bg-brand-base/20 transition-colors text-sm font-medium"
          >
            Nueva sesión
          </button>
          <button
            onClick={() => navigate(ROUTES.CARD_DECKS_NEW)}
            className="px-3 py-2 rounded-xl border border-accent-indigo/30 bg-accent-indigo/10 text-accent-indigo hover:bg-accent-indigo/20 transition-colors text-sm font-medium"
          >
            Nuevo mazo
          </button>
        </div>

        {/* Global Filter */}
        <div className="relative">
            <select 
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none bg-background-elevated/80 backdrop-blur-sm pl-4 pr-10 py-2.5 rounded-xl border border-border-default text-text-primary text-sm font-medium outline-none focus:border-brand-base transition-colors cursor-pointer hover:bg-background-surface ring-0 shadow-sm"
            >
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
            </select>
            <TrendingUp size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>

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
