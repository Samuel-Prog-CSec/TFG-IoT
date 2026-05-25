/**
 * @fileoverview Dashboard agregado del centro educativo (super_admin).
 *
 * Landing del super_admin tras login: KPIs agregados tenancy-wide (sin
 * filtro `teacherId`) en cuatro filas — magnitud, salud educativa,
 * análisis cruzado y análisis por dimensión. Reemplaza el redirect a
 * /admin/approvals como pantalla inicial (T-942 Fase D, ADR-170).
 *
 * Mantiene la firma visual "DIRECCIÓN" alineada con ApprovalPanel: eyebrow
 * tag warning, icono Shield, orbes decorativos aurora warning/púrpura. Se
 * verifica como UIs separadas en light y dark — tokens `-on-alpha` cubren
 * el contraste AA en ambos temas.
 *
 * @module pages/admin/AdminDashboard
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield,
  Users,
  UserCheck,
  UserPlus,
  Gamepad2,
  Layers,
  TrendingUp,
  AlertTriangle,
  CalendarClock,
  GraduationCap,
  Trophy,
  BookOpen,
  Sparkles
} from 'lucide-react';
import {
  cn,
  DURATION,
  EASING,
  listContainerVariants,
  listItemVariants
} from '../../lib/utils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import analyticsService from '../../services/analytics';
import { isAbortError } from '../../services/api';
import { captureException } from '../../lib/sentry';
import { scoreToRAGWithNull } from '../../constants/analyticsThresholds';
import { formatMechanicName } from '../../lib/mechanicNames';
import { ROUTES } from '../../constants/routes';
import StatCard from '../../components/dashboard/StatCard';
import GlassCard from '../../components/ui/GlassCard';
import SelectPremium from '../../components/ui/SelectPremium';
import ErrorState from '../../components/ui/ErrorState';
import {
  SkeletonStatCard,
  SkeletonChart
} from '../../components/ui/SkeletonShimmer';

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

const TIME_RANGE_OPTIONS = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' }
];

// RAG inline (idéntico al de ContentEffectivenessMatrix) para barras mini.
const RAG_BAR_CLASSES = {
  green: 'bg-success-base/70',
  amber: 'bg-warning-base/70',
  red: 'bg-error-base/70',
  gray: 'bg-background-surface/40'
};
const RAG_TEXT_CLASSES = {
  green: 'text-success-on-alpha',
  amber: 'text-warning-on-alpha',
  red: 'text-error-on-alpha',
  gray: 'text-text-secondary'
};

// ─────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────

/**
 * Header del Dashboard con eyebrow "DIRECCIÓN", título y selector temporal.
 */
function AdminDashboardHeader({ timeRange, onTimeRangeChange, generatedAt }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between pt-14 lg:pt-0">
      <div className="flex items-start gap-4">
        <div className="size-12 rounded-xl bg-gradient-to-br from-warning-base to-warning-dark flex items-center justify-center shadow-lg shadow-warning-base/20 mt-1">
          <Shield className="size-6 text-text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-warning-on-alpha font-bold mb-0.5">
            Dirección
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold font-display text-text-primary leading-tight">
            Vista del centro
          </h1>
          <p className="text-text-muted mt-1 text-sm max-w-2xl">
            KPIs agregados del centro educativo. Ve el pulso del alumnado, profesorado y contenido en un vistazo.
          </p>
        </div>
      </div>
      <div className="flex flex-col items-stretch sm:items-end gap-2">
        <SelectPremium
          value={timeRange}
          onChange={onTimeRangeChange}
          options={TIME_RANGE_OPTIONS}
          className="w-full sm:w-52"
          aria-label="Periodo de análisis"
        />
        {generatedAt && (
          <p className="text-xs text-text-muted tabular-nums">
            Actualizado {new Date(generatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </header>
  );
}

AdminDashboardHeader.propTypes = {
  timeRange: PropTypes.string.isRequired,
  onTimeRangeChange: PropTypes.func.isRequired,
  generatedAt: PropTypes.string
};

/**
 * Card listado top profesores activos.
 */
function TopTeachersCard({ teachers }) {
  if (!teachers || teachers.length === 0) {
    return (
      <GlassCard variant="default" className="h-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <Trophy size={20} className="text-brand-base" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-text-primary font-display">
            Top profesores activos
          </h2>
        </div>
        <div className="h-40 flex items-center justify-center">
          <p className="text-sm text-text-muted text-center">
            Aún no hay actividad suficiente para destacar profesores.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" className="h-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-brand-base/10">
          <Trophy size={20} className="text-brand-base" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-text-primary font-display">
          Top profesores activos
        </h2>
      </div>
      <ul className="space-y-2.5">
        {teachers.map((t) => {
          const initials = (t.teacherName || '?')
            .split(' ')
            .map((s) => s.charAt(0))
            .join('')
            .slice(0, 2)
            .toUpperCase();
          return (
            <li
              key={t.teacherId || t.teacherName}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border-subtle bg-background-elevated/30 hover:border-border-default transition-colors"
            >
              <div className="size-10 rounded-lg bg-gradient-to-br from-brand-base/80 to-brand-dark flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {initials || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">
                  {t.teacherName}
                </p>
                <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
                  <span className="tabular-nums">
                    {t.totalPlays} {t.totalPlays === 1 ? 'partida' : 'partidas'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{t.activeStudents} alumnos</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold tabular-nums text-brand-on-alpha">
                  {Math.round(t.avgScore || 0)}%
                </p>
                <p className="text-[10px] text-text-muted uppercase tracking-wider">media</p>
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}

TopTeachersCard.propTypes = {
  teachers: PropTypes.arrayOf(
    PropTypes.shape({
      teacherId: PropTypes.string,
      teacherName: PropTypes.string.isRequired,
      totalPlays: PropTypes.number.isRequired,
      avgScore: PropTypes.number.isRequired,
      activeStudents: PropTypes.number.isRequired
    })
  )
};

/**
 * Card distribución de alertas críticas y warning por profesor.
 * Click → no-op de momento (tooltip "Próximamente").
 */
function AlertsByTeacherCard({ byTeacher }) {
  // Para barras horizontales necesitamos el máximo agregado para escalar.
  const maxAlerts = useMemo(() => {
    if (!byTeacher || byTeacher.length === 0) return 0;
    return Math.max(...byTeacher.map((t) => t.criticalCount + t.warningCount));
  }, [byTeacher]);

  if (!byTeacher || byTeacher.length === 0) {
    return (
      <GlassCard variant="default" className="h-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-error-base/10">
            <AlertTriangle size={20} className="text-error-base" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-text-primary font-display">
            Alertas por profesor
          </h2>
        </div>
        <div className="h-40 flex flex-col items-center justify-center gap-2 text-center px-4">
          <Sparkles size={28} className="text-success-base/70" aria-hidden="true" />
          <p className="text-sm text-text-muted">
            Sin alertas activas en el centro. Buen indicador.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" className="h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-error-base/10">
            <AlertTriangle size={20} className="text-error-base" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-text-primary font-display">
            Alertas por profesor
          </h2>
        </div>
        <span className="text-xs text-text-muted">Activas</span>
      </div>
      <ul className="space-y-2.5">
        {byTeacher.map((t) => {
          const total = t.criticalCount + t.warningCount;
          const criticalPct = maxAlerts > 0 ? (t.criticalCount / maxAlerts) * 100 : 0;
          const warningPct = maxAlerts > 0 ? (t.warningCount / maxAlerts) * 100 : 0;
          return (
            <li key={t.teacherId || t.teacherName} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span
                  className="text-sm text-text-primary truncate cursor-help"
                  title="Próximamente: filtrar alertas por profesor"
                >
                  {t.teacherName}
                </span>
                <span className="text-xs font-bold tabular-nums text-text-secondary flex-shrink-0">
                  {total}
                </span>
              </div>
              <div
                className="relative h-2 w-full overflow-hidden rounded-full bg-background-surface/40"
                role="img"
                aria-label={`${t.criticalCount} alertas críticas y ${t.warningCount} en aviso para ${t.teacherName}`}
              >
                {/* Críticas (rojo) primero. `aria-hidden` para no duplicar
                    información: el role=img del contenedor lleva el aria-label
                    completo. Antes cada banda usaba `aria-label` directamente
                    sobre un `<div>` sin role, lo que viola aria-prohibited-attr
                    (auditoría 24/05/2026). */}
                <div
                  className="absolute inset-y-0 left-0 bg-error-base/80 rounded-full"
                  style={{ width: `${criticalPct}%` }}
                  aria-hidden="true"
                />
                {/* Warning a continuación */}
                <div
                  className="absolute inset-y-0 bg-warning-base/70 rounded-r-full"
                  style={{
                    left: `${criticalPct}%`,
                    width: `${warningPct}%`
                  }}
                  aria-hidden="true"
                />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-error-base" aria-hidden="true" />
                  {t.criticalCount} crítica{t.criticalCount === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full bg-warning-base" aria-hidden="true" />
                  {t.warningCount} aviso{t.warningCount === 1 ? '' : 's'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}

AlertsByTeacherCard.propTypes = {
  byTeacher: PropTypes.arrayOf(
    PropTypes.shape({
      teacherId: PropTypes.string,
      teacherName: PropTypes.string.isRequired,
      criticalCount: PropTypes.number.isRequired,
      warningCount: PropTypes.number.isRequired
    })
  )
};

/**
 * Card genérica para listar top mecánicas o top contextos con barra RAG.
 */
function DimensionRankingCard({ title, icon: Icon, items, dimension }) {
  const maxPlays = useMemo(() => {
    if (!items || items.length === 0) return 0;
    return Math.max(...items.map((i) => i.totalPlays || 0));
  }, [items]);

  if (!items || items.length === 0) {
    return (
      <GlassCard variant="default" className="h-full">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <Icon size={20} className="text-brand-base" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-text-primary font-display">
            {title}
          </h2>
        </div>
        <div className="h-40 flex items-center justify-center">
          <p className="text-sm text-text-muted text-center">
            Aún no hay partidas suficientes en este periodo.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" className="h-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-brand-base/10">
          <Icon size={20} className="text-brand-base" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-text-primary font-display">
          {title}
        </h2>
      </div>
      <ul className="space-y-2.5">
        {items.map((item) => {
          const name = dimension === 'mechanic'
            ? formatMechanicName(item.mechanicName)
            : item.contextName;
          const id = dimension === 'mechanic' ? item.mechanicId : item.contextId;
          const rag = scoreToRAGWithNull(item.avgScore);
          const playsPct = maxPlays > 0 ? (item.totalPlays / maxPlays) * 100 : 0;
          return (
            <li
              key={id || name}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border-subtle bg-background-elevated/30"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate mb-1">
                  {name}
                </p>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-background-surface/40"
                  role="img"
                  aria-label={`${item.totalPlays} partidas en ${name}`}
                >
                  {/* aria-hidden en la banda interna: el contenedor lleva el
                      aria-label completo. Sin esto, aria-label sobre un <div>
                      sin role viola aria-prohibited-attr. */}
                  <div
                    className={cn('h-full rounded-full', RAG_BAR_CLASSES[rag])}
                    style={{ width: `${playsPct}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <span className={cn('text-sm font-bold tabular-nums', RAG_TEXT_CLASSES[rag])}>
                  {Math.round(item.avgScore || 0)}%
                </span>
                <span className="text-[10px] text-text-muted uppercase tracking-wider tabular-nums">
                  {item.totalPlays} {item.totalPlays === 1 ? 'partida' : 'partidas'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}

DimensionRankingCard.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  items: PropTypes.array,
  dimension: PropTypes.oneOf(['mechanic', 'context']).isRequired
};

/**
 * Loading state con skeleton estructural (4 filas).
 */
function AdminDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Fila 1 — magnitud */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonStatCard key={`sk-magnitude-${i}`} />
        ))}
      </div>
      {/* Fila 2 — salud educativa */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonStatCard key={`sk-health-${i}`} />
        ))}
      </div>
      {/* Fila 3 — análisis cruzado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart height={260} />
        <SkeletonChart height={260} />
      </div>
      {/* Fila 4 — análisis por dimensión */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart height={260} />
        <SkeletonChart height={260} />
      </div>
    </div>
  );
}

/**
 * Empty state para centro recién creado (no actividad alguna).
 */
function CenterEmptyState() {
  return (
    <GlassCard className="p-10 text-center" variant="default">
      <div className="mx-auto mb-5 flex size-20 items-center justify-center rounded-2xl bg-brand-base/10">
        <Sparkles size={36} className="text-brand-base" aria-hidden="true" />
      </div>
      <h2 className="text-text-primary text-lg font-semibold font-display mb-2">
        El centro acaba de empezar
      </h2>
      <p className="text-text-muted max-w-md mx-auto text-sm">
        Aún no hay actividad en el centro. Cuando apruebes a los profesores y los alumnos jueguen sus primeras partidas, verás aquí los KPIs agregados.
      </p>
    </GlassCard>
  );
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

// eslint-disable-next-line sonarjs/cyclomatic-complexity -- dashboard agregado con múltiples estados (loading/error/empty/data) + 4 filas de KPIs con condicionales por dato
export default function AdminDashboard() {
  useDocumentTitle('Vista del centro · Dashboard');
  const navigate = useNavigate();
  const { shouldReduceMotion } = useReducedMotion();

  const [timeRange, setTimeRange] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchData = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await analyticsService.getAdminOverview(
          { timeRange },
          { signal: controller.signal }
        );
        setData(result);
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
        setError('No se pudieron cargar los KPIs del centro.');
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
    return () => abortRef.current?.abort();
  }, [fetchData]);

  useRefetchOnFocus({
    refetch: fetchData,
    isLoading: loading,
    hasData: Boolean(data),
    hasError: Boolean(error)
  });

  // Detecta "centro vacío" cuando todos los contadores principales están a 0
  // y no hay rankings. Evita pintar un dashboard lleno de "0" sin contexto.
  const isEmpty = useMemo(() => {
    if (!data) return false;
    const { users, activity, content } = data;
    const noUsers = (users?.totalStudents || 0) === 0 && (users?.totalTeachers || 0) === 0;
    const noActivity = (activity?.totalPlaysInRange || 0) === 0;
    const noContent = (content?.totalDecks || 0) === 0 && (content?.totalSessions || 0) === 0;
    return noUsers && noActivity && noContent;
  }, [data]);

  return (
    <motion.section
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.entrance, ease: EASING.outExpo }}
      className="relative"
      aria-label="Vista del centro"
    >
      {/* Fondo decorativo — orbes warning + accent-purple aurora, alineado
          con ApprovalPanel para coherencia visual en zona admin. */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        <div
          className="absolute -top-32 -right-32 size-[640px] rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(circle, color-mix(in oklab, var(--color-warning-base) 18%, transparent) 0%, transparent 65%)'
          }}
        />
        <div
          className="absolute -bottom-40 -left-40 size-[520px] rounded-full blur-3xl opacity-60"
          style={{
            background:
              'radial-gradient(circle, color-mix(in oklab, var(--color-accent-purple, var(--color-atmosphere-aurora-3)) 14%, transparent) 0%, transparent 70%)'
          }}
        />
      </div>

      <div className="page-container py-[var(--space-fluid-section)] relative z-10 space-y-6">
        <AdminDashboardHeader
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          generatedAt={data?.generatedAt}
        />

        {error && !data && (
          <ErrorState
            title="Error al cargar la vista del centro"
            message={error}
            onRetry={fetchData}
          />
        )}

        {loading && !data && <AdminDashboardSkeleton />}

        {!loading && !error && isEmpty && <CenterEmptyState />}

        {data && !isEmpty && (
          <motion.div
            variants={shouldReduceMotion ? {} : listContainerVariants(0.08)}
            initial={shouldReduceMotion ? false : 'hidden'}
            animate="visible"
            className="space-y-6"
          >
            {/* Fila 1 — Magnitud del centro */}
            <motion.div
              variants={shouldReduceMotion ? {} : listItemVariants}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <StatCard
                title="Alumnos del centro"
                value={data.users?.totalStudents ?? 0}
                trend=""
                periodLabel="matriculados"
                icon={<Users size={22} aria-hidden="true" />}
                color="bg-brand-base/15 text-brand-on-alpha"
              />
              <StatCard
                title="Profesores activos"
                value={data.users?.activeTeachers ?? 0}
                trend=""
                periodLabel={`de ${data.users?.totalTeachers ?? 0} aprobados`}
                icon={<UserCheck size={22} aria-hidden="true" />}
                color="bg-accent-cyan/15 text-accent-cyan"
              />
              <StatCard
                title="Partidas del periodo"
                value={data.activity?.totalPlaysInRange ?? 0}
                trend=""
                periodLabel={`hoy: ${data.activity?.playsToday ?? 0}`}
                icon={<Gamepad2 size={22} aria-hidden="true" />}
                color="bg-accent-indigo/15 text-accent-indigo"
              />
              <StatCard
                title="Mazos publicados"
                value={data.content?.totalDecks ?? 0}
                trend=""
                periodLabel="en el centro"
                icon={<Layers size={22} aria-hidden="true" />}
                color="bg-accent-pink/15 text-accent-pink"
              />
            </motion.div>

            {/* Fila 2 — Salud educativa */}
            <motion.div
              variants={shouldReduceMotion ? {} : listItemVariants}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <StatCard
                title="Puntuación media"
                value={
                  data.activity?.avgScoreInRange != null
                    ? `${Math.round(data.activity.avgScoreInRange)}%`
                    : '—'
                }
                trend=""
                periodLabel="media del centro"
                icon={<TrendingUp size={22} aria-hidden="true" />}
                color="bg-success-base/15 text-success-on-alpha"
              />
              <StatCard
                title="Solicitudes pendientes"
                value={data.users?.pendingTeachers ?? 0}
                trend=""
                periodLabel="aprobaciones"
                icon={<UserPlus size={22} aria-hidden="true" />}
                color="bg-warning-base/15 text-warning-on-alpha"
                higherIsBetter={false}
                onClick={() => navigate(ROUTES.ADMIN_APPROVALS)}
              />
              <StatCard
                title="Alertas críticas"
                value={data.alerts?.totalCriticalActive ?? 0}
                trend=""
                periodLabel="activas"
                icon={<AlertTriangle size={22} aria-hidden="true" />}
                color={
                  (data.alerts?.totalCriticalActive ?? 0) > 0
                    ? 'bg-error-base/15 text-error-on-alpha'
                    : 'bg-success-base/15 text-success-on-alpha'
                }
                higherIsBetter={false}
                onClick={() => navigate(ROUTES.INSIGHTS)}
              />
              <StatCard
                title="Sesiones activas"
                value={data.content?.activeSessions ?? 0}
                trend=""
                periodLabel={`de ${data.content?.totalSessions ?? 0} totales`}
                icon={<CalendarClock size={22} aria-hidden="true" />}
                color="bg-brand-base/15 text-brand-on-alpha"
              />
            </motion.div>

            {/* Fila 3 — Análisis cruzado del centro */}
            <motion.div
              variants={shouldReduceMotion ? {} : listItemVariants}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              <TopTeachersCard teachers={data.topTeachers} />
              <AlertsByTeacherCard byTeacher={data.alerts?.byTeacher} />
            </motion.div>

            {/* Fila 4 — Análisis por dimensión */}
            <motion.div
              variants={shouldReduceMotion ? {} : listItemVariants}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              <DimensionRankingCard
                title="Top mecánicas del centro"
                icon={GraduationCap}
                items={data.topMechanics}
                dimension="mechanic"
              />
              <DimensionRankingCard
                title="Top contextos del centro"
                icon={BookOpen}
                items={data.topContexts}
                dimension="context"
              />
            </motion.div>
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}
