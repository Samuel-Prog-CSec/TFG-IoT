import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Users, Gamepad2, Trophy, AlertTriangle, Calendar, TrendingUp } from 'lucide-react';
import { staggerContainer, staggerItem } from '../lib/utils';
import { useDocumentTitle, useRefetchOnFocus } from '../hooks';
import analyticsService from '../services/analytics';
import { isAbortError } from '../services/api';
import StatCard from '../components/dashboard/StatCard';
import StudentProgressChart from '../components/dashboard/StudentProgressChart';
import ClassroomOverview from '../components/dashboard/ClassroomOverview';
import AlertsPanel from '../components/dashboard/AlertsPanel';
import DifficultyHeatmap from '../components/dashboard/DifficultyHeatmap';
import { SkeletonCard, SkeletonStatCard } from '../components/ui';

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const [timeRange, setTimeRange] = useState('7d'); // '7d' or '30d'
  
  // State for data
  const [summary, setSummary] = useState(null);
  const [progressData, setProgressData] = useState([]);
  const [difficulties, setDifficulties] = useState([]); // Esto podría ser global o de un alumno específico bajo demanda
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
        if (isAbortError(err)) {
          return;
        }
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

  // Derivar alertas de los datos
  const alerts = [];
  if (summary?.studentsInRisk > 0) {
      alerts.push({
          type: 'risk',
          title: 'Estudiantes en Riesgo',
          message: `${summary.studentsInRisk} estudiantes tienen un promedio bajo (<50) en sus últimas partidas.`
      });
  }
  if (summary?.gamesToday > 5) { // Umbral de ejemplo
      alerts.push({
          type: 'milestone',
          title: 'Alta Actividad',
          message: `Hoy ha sido un día muy activo con ${summary.gamesToday} partidas jugadas.`
      });
  }

  if (loading && !summary) {
      return (
        <main className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <SkeletonCard className="h-20 flex-1" />
            <SkeletonCard className="h-12 w-48" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {[...Array(4)].map((_, index) => (
              <SkeletonStatCard key={`stat-skeleton-${index}`} />
            ))}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
            <div className="xl:col-span-2 space-y-6">
              <SkeletonCard className="h-80" />
              <SkeletonCard className="h-80" />
            </div>
            <div className="space-y-6">
              <SkeletonCard className="h-48" />
              <SkeletonCard className="h-48" />
            </div>
          </div>
        </main>
      );
  }

  return (
    <main 
      className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8"
      aria-label="Panel principal del dashboard"
    >
      <Header timeRange={timeRange} setTimeRange={setTimeRange} />

      {loading && summary && (
        <div className="bg-slate-800/50 border border-white/10 text-slate-300 px-4 py-2 rounded-xl text-sm">
          Actualizando datos del dashboard...
        </div>
      )}
      
      {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl">
              {error}
          </div>
      )}

      {/* BI Principle: Jerarquía Visual - KPIs Arriba */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">KPIs Principales</h2>
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6"
          role="list"
        >
          {/* KPI 1: Alerta / Atención Requerida */}
          <motion.div variants={staggerItem} role="listitem">
            <StatCard 
              title="Estudiantes en Riesgo" 
              value={summary?.studentsInRisk || 0}
              trend={summary?.studentsInRisk > 0 ? "+1" : "0"} 
              icon={<AlertTriangle className="text-white" size={24} aria-hidden="true" />} 
              color="bg-rose-500" 
            />
          </motion.div>

          {/* KPI 2: Rendimiento General */}
          <motion.div variants={staggerItem} role="listitem">
            <StatCard 
              title="Puntaje Promedio" 
              value={`${summary?.averageScore || 0}%`}
              trend="+2.4%" // Calcular real si hay histórico
              icon={<Trophy className="text-white" size={24} aria-hidden="true" />} 
              color="bg-emerald-500" 
            />
          </motion.div>

          {/* KPI 3: Actividad */}
          <motion.div variants={staggerItem} role="listitem">
            <StatCard 
              title="Partidas Hoy" 
              value={summary?.gamesToday || 0}
              trend="+5%" 
              icon={<Gamepad2 className="text-white" size={24} aria-hidden="true" />} 
              color="bg-purple-500" 
            />
          </motion.div>

          {/* KPI 4: Volumen */}
          <motion.div variants={staggerItem} role="listitem">
            <StatCard 
              title="Total Jugadas" 
              value={summary?.totalGames || 0}
              trend="+12%" 
              icon={<Users className="text-white" size={24} aria-hidden="true" />} 
              color="bg-blue-500" 
            />
          </motion.div>
        </motion.div>
      </section>

      {/* Grid Principal: Gráficos y Listas */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8" aria-label="Análisis detallado">
        
        {/* Columna Principal (2/3 de ancho) */}
        <div className="xl:col-span-2 space-y-6">
          
          {/* Gráfico 1: Tendencia Temporal */}
          <StudentProgressChart data={progressData} />

          {/* Gráfico 2: Mapa de Calor de Dificultad (sustituye a distribución simple) */}
          <DifficultyHeatmap data={difficulties} />
          
        </div>

        {/* Columna Lateral (1/3 de ancho) */}
        <aside className="space-y-6 h-full">
           <AlertsPanel alerts={alerts} />
           <ClassroomOverview summary={summary} />
        </aside>
      </section>
    </main>
  );
}

function Header({ timeRange, setTimeRange }) {
  const today = new Date().toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <motion.header 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pt-4 lg:pt-0"
    >
      <div>
        <motion.h1 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="text-2xl sm:text-3xl font-bold text-white mb-2 font-display"
        >
          <span aria-hidden="true">¡Bienvenido de nuevo! 👋</span>
          <span className="sr-only">¡Bienvenido de nuevo!</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-slate-400"
        >
          Resumen de actividad y análisis de rendimiento
        </motion.p>
      </div>

      <div className="flex items-center gap-4">
        {/* Global Filter */}
        <div className="relative">
            <select 
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none bg-slate-800/50 backdrop-blur-sm pl-4 pr-10 py-2 rounded-xl border border-white/10 text-slate-300 text-sm outline-none focus:border-purple-500/50 transition-colors cursor-pointer hover:bg-slate-800"
            >
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
            </select>
            <TrendingUp size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>

        <motion.time 
          dateTime={new Date().toISOString().split('T')[0]}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="hidden sm:flex items-center gap-2 text-sm text-slate-400 bg-slate-800/50 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5"
        >
          <Calendar size={16} className="text-purple-400" aria-hidden="true" />
          <span className="capitalize">{today}</span>
        </motion.time>
      </div>
    </motion.header>
  );
}
