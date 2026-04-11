import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, User, ShieldX } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { listContainerVariants, listItemVariants, crossfadeVariants } from '../lib/utils';
import analyticsService from '../services/analytics';
import { isAbortError } from '../services/api';
import { captureException } from '../lib/sentry';
import ChartErrorBoundary from '../components/common/ChartErrorBoundary';
import ErrorState from '../components/ui/ErrorState';
import SkeletonShimmer, { SkeletonStatCard, SkeletonChart } from '../components/ui/SkeletonShimmer';
import SelectPremium from '../components/ui/SelectPremium';
import ButtonPremium from '../components/ui/ButtonPremium';
import StudentKPICard from '../components/analytics/StudentKPICard';
import TrajectoryChart from '../components/analytics/TrajectoryChart';
import NarrativeCard from '../components/analytics/NarrativeCard';
import PerformanceByDimension from '../components/analytics/PerformanceByDimension';
import GameHistoryTable from '../components/analytics/GameHistoryTable';
import StrengthsWeaknesses from '../components/analytics/StrengthsWeaknesses';
import EngagementRadar from '../components/analytics/EngagementRadar';
import { TIER_CONFIG, scoreToRAG, scoreToTier } from '../constants/analyticsThresholds';

const getRelativeTime = (dateStr) => {
  if (!dateStr) return 'Sin actividad';
  const diffDays = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} dias`;
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
  return `Hace ${Math.floor(diffDays / 30)} meses`;
};

const getActivityColor = (dateStr) => {
  if (!dateStr) return 'bg-text-muted';
  const diffDays = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (diffDays <= 3) return 'bg-success-base';
  if (diffDays <= 7) return 'bg-warning-base';
  return 'bg-error-base';
};

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Pagina de perfil individual de un estudiante con BI avanzado.
 * Pieza central del TFG: permite al profesor entender fortalezas,
 * debilidades y evolucion de cada alumno.
 */
// eslint-disable-next-line sonarjs/cyclomatic-complexity -- perfil de estudiante con multiples secciones de analytics y estados de carga
export default function StudentProfile() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  useDocumentTitle('Perfil de Estudiante');
  const { shouldReduceMotion } = useReducedMotion();
  const [timeRange, setTimeRange] = useState('30d');

  const [summary, setSummary] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analyticsDisabled, setAnalyticsDisabled] = useState(false);
  const abortRef = useRef(null);

  const fetchData = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      try {
        setLoading(true);

        // Fetch principal: summary contiene datos basicos, partidas, rendimiento, comparativa
        const summaryData = await analyticsService.getStudentSummary(
          studentId, { timeRange }, { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setSummary(summaryData);

        // Fetches secundarios en paralelo (no bloqueantes si fallan)
        const [trajectoryData, engagementData] = await Promise.all([
          analyticsService.getStudentTrajectory(
            studentId, { timeRange, granularity: 'daily' }, { signal: controller.signal }
          ).catch(() => null),
          analyticsService.getStudentEngagement(
            studentId, { timeRange }, { signal: controller.signal }
          ).catch(() => null),
        ]);

        if (controller.signal.aborted) return;
        setTrajectory(trajectoryData);
        setEngagement(engagementData);
        setError(null);
      } catch (err) {
        if (isAbortError(err)) return;
        // Art. 21 RGPD — el tutor ha ejercido su derecho de oposición a analytics
        if (err.response?.status === 403 && err.response?.data?.message?.includes('oposición')) {
          setAnalyticsDisabled(true);
          setError(null);
        } else {
          captureException(err);
          setError('No se pudieron cargar los datos del estudiante.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    run();
  }, [studentId, timeRange]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  useRefetchOnFocus({ refetch: fetchData, isLoading: loading, hasData: Boolean(summary), hasError: Boolean(error) });

  const student = summary?.student;
  const metrics = student?.studentMetrics || {};
  const classComparison = summary?.classComparison || {};
  const tier = scoreToTier(metrics.averageScore || 0);
  const tierConfig = TIER_CONFIG[tier];

  // Skeleton loading
  if (loading && !summary) {
    return (
      <main className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4 pt-14 lg:pt-0">
          <SkeletonShimmer className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <SkeletonShimmer className="h-7 w-52 rounded-md" />
            <SkeletonShimmer className="h-4 w-36 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => <SkeletonStatCard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <SkeletonChart height={310} className="lg:col-span-3" />
          <SkeletonShimmer className="h-[310px] rounded-2xl lg:col-span-2" />
        </div>
      </main>
    );
  }

  if (error && !summary) {
    return (
      <main className="p-6 lg:p-8 max-w-7xl mx-auto">
        <ErrorState title="Error al cargar perfil" message={error} onRetry={fetchData} />
      </main>
    );
  }

  // Art. 21 RGPD — el tutor ha ejercido su derecho de oposición a analytics
  if (analyticsDisabled) {
    return (
      <main className="p-6 lg:p-8 max-w-7xl mx-auto">
        <ButtonPremium
          variant="ghost"
          size="sm"
          icon={<ArrowLeft size={18} />}
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          Volver
        </ButtonPremium>
        <div className="flex flex-col items-center text-center py-16 px-4">
          <div className="size-16 rounded-full bg-warning-base/10 border border-warning-base/20
                          flex items-center justify-center mb-4">
            <ShieldX size={32} className="text-warning-base" />
          </div>
          <h1 className="text-xl font-bold text-text-primary mb-2">
            Analytics no disponibles
          </h1>
          <p className="text-text-secondary max-w-md leading-relaxed">
            El tutor de este estudiante ha ejercido su derecho de oposición al
            tratamiento de datos con fines de analytics de rendimiento
            (Art. 21 RGPD). El alumno puede seguir participando en sesiones
            de juego con normalidad.
          </p>
        </div>
      </main>
    );
  }

  if (!student) {
    return (
      <main className="p-6 lg:p-8 max-w-7xl mx-auto text-center py-20">
        <User size={48} className="text-text-muted mx-auto mb-4" />
        <h1 className="text-xl font-bold text-text-primary">Estudiante no encontrado</h1>
        <p className="text-text-muted mt-2">No se encontraron datos para este estudiante.</p>
        <ButtonPremium variant="secondary" className="mt-4" onClick={() => navigate(-1)}>Volver</ButtonPremium>
      </main>
    );
  }

  const accuracyRate = metrics.totalCorrectAnswers != null && (metrics.totalCorrectAnswers + metrics.totalErrors) > 0
    ? Math.round((metrics.totalCorrectAnswers / (metrics.totalCorrectAnswers + metrics.totalErrors)) * 100)
    : 0;

  const completionRate = metrics.totalGamesPlayed > 0
    ? Math.round(((metrics.totalGamesPlayed - (metrics.totalAbandonedGames || 0)) / metrics.totalGamesPlayed) * 100)
    : 0;

  return (
    <motion.section
      {...(shouldReduceMotion ? {} : crossfadeVariants)}
      className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6"
    >
      <ChartErrorBoundary>
      {/* ═══════ HEADER ═══════ */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-14 lg:pt-0">
        <div className="flex items-center gap-4">
          <ButtonPremium variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Volver">
            <ArrowLeft size={20} />
          </ButtonPremium>

          <div className="size-14 rounded-full bg-gradient-to-br from-accent-indigo to-brand-base flex items-center justify-center text-xl font-bold text-white shadow-lg">
            {student.avatar
              ? <img src={student.avatar} alt="" className="size-full rounded-full object-cover" />
              : <span>{getInitials(student.name)}</span>
            }
          </div>

          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-text-primary font-display">{student.name}</h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${tierConfig.className}`} aria-label={`Nivel de rendimiento: ${tierConfig.label}`}>
                {tierConfig.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              {student.classroom && <span className="text-sm text-text-muted">Aula: {student.classroom}</span>}
              <span className="flex items-center gap-1.5 text-sm text-text-muted">
                <span className={`size-2 rounded-full ${getActivityColor(metrics.lastPlayedAt)}`} aria-hidden="true" />
                {getRelativeTime(metrics.lastPlayedAt)}
              </span>
            </div>
          </div>
        </div>

        <SelectPremium
          value={timeRange}
          onChange={setTimeRange}
          options={[
            { value: '7d', label: 'Ultimos 7 dias' },
            { value: '30d', label: 'Ultimos 30 dias' },
            { value: '90d', label: 'Ultimos 90 dias' },
          ]}
          className="w-48"
        />
      </header>

      {/* ═══════ KPIs — 6 cards con RAG y comparativa clase ═══════ */}
      <motion.section
        variants={listContainerVariants(0.06)}
        initial={shouldReduceMotion ? false : "hidden"}
        animate="visible"
        aria-label="KPIs del estudiante"
      >
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 lg:gap-4">
          <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
            <StudentKPICard
              label="Puntuacion Media"
              value={Math.round(metrics.averageScore || 0)}
              suffix="%"
              ragStatus={scoreToRAG(metrics.averageScore || 0)}
              comparison={classComparison.averageScore != null ? `vs clase: ${Math.round(classComparison.averageScore)}%` : null}
              comparisonPositive={metrics.averageScore > (classComparison.averageScore || 0)}
            />
          </motion.div>

          <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
            <StudentKPICard
              label="Tasa de Acierto"
              value={accuracyRate}
              suffix="%"
              ragStatus={scoreToRAG(accuracyRate)}
              comparison={classComparison.accuracy != null ? `vs clase: ${Math.round(classComparison.accuracy)}%` : null}
              comparisonPositive={accuracyRate > (classComparison.accuracy || 0)}
            />
          </motion.div>

          <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
            <StudentKPICard
              label="Tiempo Respuesta"
              value={((metrics.averageResponseTime || 0) / 1000).toFixed(1)}
              suffix="s"
              ragStatus={(() => {
                if (metrics.averageResponseTime <= 4000) return 'green';
                if (metrics.averageResponseTime <= 8000) return 'amber';
                return 'red';
              })()}
              comparison={classComparison.responseTime != null ? `vs clase: ${(classComparison.responseTime / 1000).toFixed(1)}s` : null}
              comparisonPositive={metrics.averageResponseTime < (classComparison.responseTime || Infinity)}
            />
          </motion.div>

          <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
            <StudentKPICard
              label="Engagement"
              value={engagement?.engagementScore != null ? Math.round(engagement.engagementScore) : '—'}
              ragStatus={(() => {
                if (engagement?.engagementScore >= 60) return 'green';
                if (engagement?.engagementScore >= 35) return 'amber';
                if (engagement) return 'red';
                return 'gray';
              })()}
            />
          </motion.div>

          <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
            <StudentKPICard
              label="Total Partidas"
              value={metrics.totalGamesPlayed || 0}
              ragStatus="gray"
              comparison={`Mejor: ${metrics.bestScore || 0} pts`}
            />
          </motion.div>

          <motion.div variants={shouldReduceMotion ? {} : listItemVariants}>
            <StudentKPICard
              label="Completado"
              value={completionRate}
              suffix="%"
              ragStatus={(() => {
                if (completionRate >= 85) return 'green';
                if (completionRate >= 60) return 'amber';
                return 'red';
              })()}
              comparison={metrics.totalAbandonedGames > 0 ? `${metrics.totalAbandonedGames} abandonadas` : 'Sin abandonos'}
            />
          </motion.div>
        </div>
      </motion.section>

      {/* ═══════ Trayectoria + Narrativa ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <TrajectoryChart
            trajectoryData={trajectory}
            classComparison={summary?.classProgressComparison}
          />
        </div>
        <div className="lg:col-span-2">
          <NarrativeCard interpretation={trajectory?.interpretation || trajectory?.trend?.interpretation || engagement?.interpretation || summary?.interpretation} />
        </div>
      </div>

      {/* ═══════ Rendimiento por Contexto y por Mecanica ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PerformanceByDimension
          title="Rendimiento por Contexto"
          data={summary?.performanceByContext}
          dimension="context"
        />
        <PerformanceByDimension
          title="Rendimiento por Mecanica"
          data={summary?.performanceByMechanic}
          dimension="mechanic"
        />
      </div>

      {/* ═══════ Engagement + Fortalezas/Debilidades ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EngagementRadar engagement={engagement} />
        <StrengthsWeaknesses
          performanceByContext={summary?.performanceByContext}
          performanceByMechanic={summary?.performanceByMechanic}
        />
      </div>

      {/* ═══════ Historial de Partidas ═══════ */}
      <GameHistoryTable games={summary?.lastGames} />
      </ChartErrorBoundary>
    </motion.section>
  );
}
