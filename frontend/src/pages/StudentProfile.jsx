import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { m as motion } from 'framer-motion';
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
import SequenceProgressChart from '../components/analytics/SequenceProgressChart';
import SequenceHighlightCard from '../components/analytics/SequenceHighlightCard';
import MemoryHighlightCard from '../components/analytics/MemoryHighlightCard';
import AssociationHighlightCard from '../components/analytics/AssociationHighlightCard';
import StrengthsWeaknesses from '../components/analytics/StrengthsWeaknesses';
import EngagementRadar from '../components/analytics/EngagementRadar';
import ScrollRevealSection from '../components/ui/ScrollRevealSection';
import { TIER_CONFIG, scoreToRAG, scoreToTier } from '../constants/analyticsThresholds';
import { formatRelativeTime } from '../lib/dateUtils';

// Calcula dias transcurridos desde una fecha; nunca devuelve negativo (las fechas
// futuras de fixtures/seeders se tratan como "hoy" para evitar etiquetas como "Hace -1 dias").
const daysSince = (dateStr) => {
  if (!dateStr) return null;
  const diff = (new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.floor(diff));
};

// getRelativeTime usa el helper centralizado en lib/dateUtils.js (P25)
// y degrada a "Sin actividad" cuando no hay fecha.
const getRelativeTime = (dateStr) => {
  if (!dateStr) return 'Sin actividad';
  return formatRelativeTime(dateStr);
};

const getActivityColor = (dateStr) => {
  const diffDays = daysSince(dateStr);
  if (diffDays === null) return 'bg-text-muted';
  if (diffDays <= 3) return 'bg-success-base';
  if (diffDays <= 7) return 'bg-warning-base';
  return 'bg-error-base';
};

const STUDENT_PROFILE_STAT_KEYS = ['stat-a', 'stat-b', 'stat-c', 'stat-d', 'stat-e', 'stat-f'];

// Tamaño de página del historial completo de partidas (endpoint paginado).
const GAMES_PAGE_SIZE = 20;

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

  // Historial COMPLETO de partidas, paginado e independiente del timeRange
  // (a diferencia de summary.lastGames, cap 10 y filtrado por rango).
  const [games, setGames] = useState([]);
  const [gamesPagination, setGamesPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [gamesLoadingMore, setGamesLoadingMore] = useState(false);
  const gamesAbortRef = useRef(null);

  const fetchData = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      try {
        setLoading(true);

        // (E4) summary, trayectoria y engagement dependen de las MISMAS entradas
        // (studentId, timeRange): se lanzan en PARALELO en vez de esperar al summary.
        // Los secundarios degradan a null si fallan (reportando a Sentry, no
        // tragándolos: antes `.catch(()=>null)` hacía indistinguible un 500 de un
        // alumno sin datos). Un fallo del summary (fetch primario) SÍ rechaza el
        // Promise.all → estado de error.
        const swallowSecondary = e => {
          if (!isAbortError(e)) captureException(e);
          return null;
        };
        const [summaryData, trajectoryData, engagementData] = await Promise.all([
          analyticsService.getStudentSummary(
            studentId, { timeRange }, { signal: controller.signal }
          ),
          analyticsService.getStudentTrajectory(
            studentId, { timeRange, granularity: 'daily' }, { signal: controller.signal }
          ).catch(swallowSecondary),
          analyticsService.getStudentEngagement(
            studentId, { timeRange }, { signal: controller.signal }
          ).catch(swallowSecondary),
        ]);

        if (controller.signal.aborted) return;
        setSummary(summaryData);
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

  // Primera página del historial completo. Atada a `studentId` (no a `timeRange`):
  // el historial no se filtra por rango, así que cambiar el selector no lo reinicia.
  useEffect(() => {
    if (!studentId) return undefined;
    gamesAbortRef.current?.abort();
    const controller = new AbortController();
    gamesAbortRef.current = controller;
    (async () => {
      try {
        const data = await analyticsService.getStudentGames(
          studentId, { page: 1, limit: GAMES_PAGE_SIZE }, { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        setGames(Array.isArray(data?.games) ? data.games : []);
        setGamesPagination(data?.pagination || { page: 1, total: 0, totalPages: 1 });
      } catch (err) {
        if (isAbortError(err)) return;
        // Silencioso: el historial es secundario; summary.lastGames sirve de fallback.
      }
    })();
    return () => controller.abort();
  }, [studentId]);

  const loadMoreGames = useCallback(async () => {
    if (gamesLoadingMore || gamesPagination.page >= gamesPagination.totalPages) return;
    const nextPage = gamesPagination.page + 1;
    setGamesLoadingMore(true);
    try {
      const data = await analyticsService.getStudentGames(studentId, {
        page: nextPage,
        limit: GAMES_PAGE_SIZE
      });
      const more = Array.isArray(data?.games) ? data.games : [];
      // Dedupe defensivo por gameplayId/_id (un borrado entre páginas podría solapar).
      setGames((prev) => {
        const seen = new Set(prev.map((g) => g.gameplayId || g._id || `${g.completedAt}-${g.score}`));
        return [...prev, ...more.filter((g) => !seen.has(g.gameplayId || g._id || `${g.completedAt}-${g.score}`))];
      });
      setGamesPagination(data?.pagination || { ...gamesPagination, page: nextPage });
    } catch (err) {
      captureException(err);
    } finally {
      setGamesLoadingMore(false);
    }
  }, [studentId, gamesLoadingMore, gamesPagination]);

  const student = summary?.student;
  const metrics = student?.studentMetrics || {};
  const classComparison = summary?.classComparison || {};
  const tier = scoreToTier(metrics.averageScore || 0);
  const tierConfig = TIER_CONFIG[tier];

  // Skeleton loading
  if (loading && !summary) {
    return (
      <main className="page-container py-[var(--space-fluid-section)] space-y-6">
        <div className="flex items-center gap-4 pt-14 lg:pt-0">
          <SkeletonShimmer className="size-14 rounded-full" />
          <div className="space-y-2">
            <SkeletonShimmer className="h-7 w-52 rounded-md" />
            <SkeletonShimmer className="h-4 w-36 rounded-md" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-[var(--space-fluid-gutter)]">
          {STUDENT_PROFILE_STAT_KEYS.map(key => <SkeletonStatCard key={key} />)}
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
      <main className="page-container py-[var(--space-fluid-section)]">
        <ErrorState title="No pudimos cargar el perfil" message={error} onRetry={fetchData} />
      </main>
    );
  }

  // Art. 21 RGPD — el tutor ha ejercido su derecho de oposición a analytics
  if (analyticsDisabled) {
    return (
      <main className="page-container py-[var(--space-fluid-section)]">
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
      <main className="page-container py-20 text-center">
        <User size={48} className="text-text-muted mx-auto mb-4" />
        <h1 className="text-xl font-bold text-text-primary">Estudiante no encontrado</h1>
        <p className="text-text-muted mt-2">No se encontraron datos para este estudiante.</p>
        <ButtonPremium variant="secondary" className="mt-4" onClick={() => navigate(-1)}>Volver</ButtonPremium>
      </main>
    );
  }

  // KPIs reactivas al rango temporal: el backend devuelve `overallStats`
  // (avgScore/avgAccuracy/avgResponseTime/totalGames DEL RANGO). Antes las 6 KPIs
  // leían `studentMetrics` (lifetime) y no cambiaban al mover el selector mientras
  // los gráficos sí (disonancia). Caen a lifetime si no hay `overallStats`.
  const ranged = summary?.overallStats || {};
  const rangedScore = Number.isFinite(ranged.avgScore) ? ranged.avgScore : (metrics.averageScore || 0);
  const rangedResponseTime = Number.isFinite(ranged.avgResponseTime)
    ? ranged.avgResponseTime
    : (metrics.averageResponseTime || 0);
  const rangedTotalGames = Number.isFinite(ranged.totalGames)
    ? ranged.totalGames
    : (metrics.totalGamesPlayed || 0);

  const lifetimeAccuracy = metrics.totalCorrectAnswers != null && (metrics.totalCorrectAnswers + metrics.totalErrors) > 0
    ? Math.round((metrics.totalCorrectAnswers / (metrics.totalCorrectAnswers + metrics.totalErrors)) * 100)
    : 0;
  const accuracyRate = Number.isFinite(ranged.avgAccuracy) ? ranged.avgAccuracy : lifetimeAccuracy;

  // Completado: tasa lifetime del alumno (el resumen no expone completado por
  // rango). Se mantiene como histórico; las abandonadas se muestran en la pastilla.
  const completionRate = metrics.totalGamesPlayed > 0
    ? Math.round(((metrics.totalGamesPlayed - (metrics.totalAbandonedGames || 0)) / metrics.totalGamesPlayed) * 100)
    : 0;

  // Sin datos → semáforo NEUTRO (gris), no verde/rojo. Un alumno sin partidas en
  // el rango (o que nunca ha jugado) no debe leerse como "0% rojo" ni como
  // "0.0s verde / tiempo perfecto": eso es AUSENCIA de dato, no rendimiento.
  const hasRangedData = rangedTotalGames > 0;
  const hasLifetimeGames = (metrics.totalGamesPlayed || 0) > 0;

  return (
    <motion.section
      {...(shouldReduceMotion ? {} : crossfadeVariants)}
      className="page-container py-[var(--space-fluid-section)] space-y-6"
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
              ? <img src={student.avatar} alt="" width={56} height={56} loading="lazy" decoding="async" className="size-full rounded-full object-cover" />
              : <span>{getInitials(student.name)}</span>
            }
          </div>

          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-text-primary font-display">{student.name}</h1>
              {hasLifetimeGames ? (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${tierConfig.className}`} aria-label={`Nivel de rendimiento: ${tierConfig.label}`}>
                  {tierConfig.label}
                </span>
              ) : (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-border-subtle text-text-muted bg-background-surface/60" aria-label="Sin partidas registradas">
                  Sin partidas
                </span>
              )}
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
            { value: '7d', label: 'Últimos 7 días' },
            { value: '30d', label: 'Últimos 30 días' },
            { value: '90d', label: 'Últimos 90 días' },
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-[var(--space-fluid-gutter)]">
          <motion.div variants={shouldReduceMotion ? {} : listItemVariants} className="h-full">
            <StudentKPICard
              label="Puntuación Media"
              value={Math.round(rangedScore)}
              suffix="%"
              ragStatus={hasRangedData ? scoreToRAG(rangedScore) : 'gray'}
              comparison={classComparison.averageScore != null ? `vs clase: ${Math.round(classComparison.averageScore)}%` : null}
              comparisonPositive={rangedScore > (classComparison.averageScore || 0)}
            />
          </motion.div>

          <motion.div variants={shouldReduceMotion ? {} : listItemVariants} className="h-full">
            <StudentKPICard
              label="Tasa de Acierto"
              value={accuracyRate}
              suffix="%"
              ragStatus={hasRangedData ? scoreToRAG(accuracyRate) : 'gray'}
              comparison={classComparison.accuracy != null ? `vs clase: ${Math.round(classComparison.accuracy)}%` : null}
              comparisonPositive={accuracyRate > (classComparison.accuracy || 0)}
            />
          </motion.div>

          <motion.div variants={shouldReduceMotion ? {} : listItemVariants} className="h-full">
            <StudentKPICard
              label="Tiempo Respuesta"
              value={(rangedResponseTime / 1000).toFixed(1)}
              suffix="s"
              ragStatus={(() => {
                if (!hasRangedData) return 'gray';
                if (rangedResponseTime <= 4000) return 'green';
                if (rangedResponseTime <= 8000) return 'amber';
                return 'red';
              })()}
              comparison={classComparison.responseTime != null ? `vs clase: ${(classComparison.responseTime / 1000).toFixed(1)}s` : null}
              comparisonPositive={rangedResponseTime < (classComparison.responseTime || Infinity)}
            />
          </motion.div>

          <motion.div variants={shouldReduceMotion ? {} : listItemVariants} className="h-full">
            <StudentKPICard
              label="Implicación"
              value={engagement?.engagementScore != null ? Math.round(engagement.engagementScore) : '—'}
              // suffix "/100" desambigua la escala: el engagement es un score
              // 0-100, pero sin sufijo "61" parecía un conteo (auditoría
              // 24/05/2026). Solo se muestra cuando hay dato real.
              suffix={engagement?.engagementScore != null ? '/100' : undefined}
              ragStatus={(() => {
                if (engagement?.engagementScore >= 60) return 'green';
                if (engagement?.engagementScore >= 35) return 'amber';
                if (engagement) return 'red';
                return 'gray';
              })()}
            />
          </motion.div>

          <motion.div variants={shouldReduceMotion ? {} : listItemVariants} className="h-full">
            {/* Sin "Mejor: X pts": `bestScore` es score CRUDO y varía por mecánica
                (Secuencia 210-420 vs Memoria 90), así que "147 pts" no es
                comparable ni interpretable. La media normalizada (%) ya vive en su
                propio KPI y el historial muestra el % por partida. */}
            <StudentKPICard
              label="Total Partidas"
              value={rangedTotalGames}
              ragStatus="gray"
            />
          </motion.div>

          <motion.div variants={shouldReduceMotion ? {} : listItemVariants} className="h-full">
            <StudentKPICard
              label="Completado"
              value={completionRate}
              suffix="%"
              ragStatus={(() => {
                if (!hasLifetimeGames) return 'gray';
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
      {/* `items-stretch` (default en grid) + `h-full` en cada wrapper iguala
          la altura de los dos paneles. Sin esto el chart de la izquierda
          (~350px alto) y el panel "Resumen del Alumno" (~200px) generaban
          un hueco visual en la fila (QA 2026-04-29). */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 h-full">
          <TrajectoryChart
            trajectoryData={trajectory}
            classComparison={trajectory?.classDataPoints}
          />
        </div>
        <div className="lg:col-span-2 h-full">
          <NarrativeCard interpretation={trajectory?.interpretation || trajectory?.trend?.interpretation || engagement?.interpretation || summary?.interpretation} />
        </div>
      </div>

      {/* ═══════ Rendimiento por Contexto y por Mecánica ═══════ */}
      <ScrollRevealSection>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PerformanceByDimension
            title="Rendimiento por Contexto"
            data={summary?.performanceByContext}
            dimension="context"
          />
          <PerformanceByDimension
            title="Rendimiento por Mecánica"
            data={summary?.performanceByMechanic}
            dimension="mechanic"
          />
        </div>
      </ScrollRevealSection>

      {/* ═══════ Engagement + Fortalezas/Debilidades ═══════ */}
      <ScrollRevealSection delay={0.1}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <EngagementRadar engagement={engagement} />
          <StrengthsWeaknesses
            performanceByContext={summary?.performanceByContext}
            performanceByMechanic={summary?.performanceByMechanic}
          />
        </div>
      </ScrollRevealSection>

      {/* ═══════ Evolución en Secuencia (T-922 fase D) ═══════
          Sólo se renderiza si el alumno ha jugado al menos una partida
          de Secuencia en el rango temporal. El bloque bySequence viene
          de analyticsService.getStudentSummary (T-921 fase F). */}
      {summary?.bySequence?.totalGames > 0 && (
        <ScrollRevealSection delay={0.12}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {/* Serie temporal real por partida (backend `bySequence.progression`).
                  Antes se filtraba `lastGames` (últimas 10, sin el dato por partida)
                  → la evolución salía vacía o como línea plana. */}
              <SequenceProgressChart
                data={summary.bySequence.progression || []}
              />
            </div>
            <SequenceHighlightCard summary={summary.bySequence} />
          </div>
        </ScrollRevealSection>
      )}

      {/* ═══════ Highlights por mecánica (ADR-F, sesión 04/05/2026) ═══════
          Renderiza MemoryHighlightCard y AssociationHighlightCard en paralelo
          al SequenceHighlightCard cuando el alumno ha jugado al menos una
          partida de esa mecánica en el rango temporal. Cada card muestra
          una hero metric (peakStreak) y 3 filas de detalle. Los datos vienen
          de los nuevos campos `byMemory` / `byAssociation` del endpoint
          `/student/:id/summary` (analyticsService A9). */}
      {(summary?.byMemory?.totalGames > 0 || summary?.byAssociation?.totalGames > 0) && (
        <ScrollRevealSection delay={0.13}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {summary?.byMemory?.totalGames > 0 && (
              <MemoryHighlightCard summary={summary.byMemory} />
            )}
            {summary?.byAssociation?.totalGames > 0 && (
              <AssociationHighlightCard summary={summary.byAssociation} />
            )}
          </div>
        </ScrollRevealSection>
      )}

      {/* ═══════ Historial de Partidas ═══════ */}
      <ScrollRevealSection delay={0.15}>
        <GameHistoryTable
          games={games.length > 0 ? games : summary?.lastGames}
          onLoadMore={loadMoreGames}
          hasMore={gamesPagination.page < gamesPagination.totalPages}
          loadingMore={gamesLoadingMore}
          total={gamesPagination.total}
        />
      </ScrollRevealSection>
      </ChartErrorBoundary>
    </motion.section>
  );
}
