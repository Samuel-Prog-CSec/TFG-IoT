import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Trophy, AlertTriangle, UserCheck, Download,
  Search, ArrowUpDown, ArrowUp, ArrowDown, GraduationCap,
} from 'lucide-react';
import {
  listContainerVariants, listItemVariants, crossfadeVariants,
  exportToCSV,
} from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import analyticsService from '../services/analytics';
import { isAbortError } from '../services/api';
import { captureException } from '../lib/sentry';
import { ROUTES } from '../constants/routes';
import GlassCard from '../components/ui/GlassCard';
import ButtonPremium from '../components/ui/ButtonPremium';
import SelectPremium from '../components/ui/SelectPremium';
import ErrorState from '../components/ui/ErrorState';
import DistributionChart from '../components/dashboard/DistributionChart';
import SkeletonShimmer, { SkeletonStatCard, SkeletonChart } from '../components/ui/SkeletonShimmer';

// ─── Helper functions ───────────────────────────────────────────────

/**
 * Obtiene las iniciales de un nombre (max 2 caracteres).
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Devuelve label y className para un tier de rendimiento.
 * @param {string} tier - risk | average | good | excellent
 * @returns {{label: string, className: string}}
 */
function getTierBadge(tier) {
  switch (tier) {
    case 'excellent':
      return { label: 'Excelente', className: 'bg-success-dark/15 text-success-base border-success-dark/25' };
    case 'good':
      return { label: 'Bueno', className: 'bg-info-dark/15 text-info-base border-info-dark/25' };
    case 'average':
      return { label: 'Promedio', className: 'bg-warning-dark/15 text-warning-base border-warning-dark/25' };
    case 'risk':
      return { label: 'En Riesgo', className: 'bg-error-dark/15 text-error-base border-error-dark/25' };
    default:
      return { label: 'Sin datos', className: 'bg-text-disabled/10 text-text-muted border-text-disabled/20' };
  }
}

/**
 * Devuelve la clase tailwind para el indicador de actividad reciente.
 * @param {string} dateStr - Fecha ISO
 * @returns {string} Clase de color tailwind
 */
function getActivityColor(dateStr) {
  if (!dateStr) return 'bg-text-disabled';
  const diff = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 3) return 'bg-success-base';
  if (diff <= 7) return 'bg-warning-base';
  return 'bg-error-base';
}

/**
 * Genera un texto relativo a partir de una fecha.
 * @param {string} dateStr - Fecha ISO
 * @returns {string} Texto "Hace X dias"
 */
function getRelativeTime(dateStr) {
  if (!dateStr) return 'Sin actividad';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Hace 1 dia';
  return `Hace ${diff} dias`;
}

/**
 * Formatea tiempo de respuesta en milisegundos a formato legible.
 * @param {number} ms - Milisegundos
 * @returns {string} Formato "X.Xs"
 */
function formatResponseTime(ms) {
  if (ms == null || isNaN(ms)) return '-';
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── CSV column definitions ─────────────────────────────────────────

const CSV_COLUMNS = [
  { key: 'name', label: 'Nombre' },
  { key: 'classroom', label: 'Aula' },
  { key: 'totalGames', label: 'Partidas' },
  { key: 'averageScore', label: 'Puntuacion' },
  { key: 'accuracyRate', label: 'Tasa Acierto' },
  { key: 'avgResponseTime', label: 'Tiempo Respuesta' },
  { key: 'lastPlayedAt', label: 'Ultima Actividad' },
  { key: 'tier', label: 'Nivel' },
];

// ─── Tier filter options ────────────────────────────────────────────

const TIER_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'excellent', label: 'Excelente' },
  { value: 'good', label: 'Bueno' },
  { value: 'average', label: 'Promedio' },
  { value: 'risk', label: 'En Riesgo' },
];

// ─── Table column config ────────────────────────────────────────────

const TABLE_COLUMNS = [
  { key: 'name', label: 'Alumno', sortable: true },
  { key: 'classroom', label: 'Aula', sortable: true },
  { key: 'totalGames', label: 'Partidas', sortable: true },
  { key: 'averageScore', label: 'Score', sortable: true },
  { key: 'accuracyRate', label: 'Tasa Acierto', sortable: true },
  { key: 'avgResponseTime', label: 'Tiempo Resp', sortable: true },
  { key: 'lastPlayedAt', label: 'Ultima Actividad', sortable: true },
  { key: 'tier', label: 'Nivel', sortable: true },
];

// ─── Main Component ─────────────────────────────────────────────────

export default function StudentsAnalytics() {
  const navigate = useNavigate();
  useDocumentTitle('Mis Alumnos');
  const { shouldReduceMotion } = useReducedMotion();

  // Data state
  const [students, setStudents] = useState(null);
  const [summary, setSummary] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const dataAbortRef = useRef(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');

  // Sort state
  const [sortField, setSortField] = useState('averageScore');
  const [sortOrder, setSortOrder] = useState('desc');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Data fetching
  const fetchData = useCallback(() => {
    dataAbortRef.current?.abort();
    const controller = new AbortController();
    dataAbortRef.current = controller;

    const run = async () => {
      try {
        setLoading(true);
        const [studentsData, summaryData, distributionData] = await Promise.all([
          analyticsService.getClassroomStudents(
            { sort: 'score', order: 'desc' },
            { signal: controller.signal }
          ),
          analyticsService.getClassroomSummary({ signal: controller.signal }),
          analyticsService.getClassroomDistribution({}, { signal: controller.signal }),
        ]);

        setStudents(studentsData);
        setSummary(summaryData);
        setDistribution(distributionData);
        setError(null);
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
        setError('No se pudieron cargar los datos de los alumnos.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    run();
  }, []);

  useEffect(() => {
    fetchData();
    return () => dataAbortRef.current?.abort();
  }, [fetchData]);

  useRefetchOnFocus({
    refetch: fetchData,
    isLoading: loading,
    hasData: Boolean(students),
    hasError: Boolean(error),
  });

  // Derive filtered and sorted students
  const processedStudents = useMemo(() => {
    if (!students?.students) return [];

    let filtered = students.students;

    // Apply search filter
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(query)
      );
    }

    // Apply tier filter
    if (tierFilter) {
      filtered = filtered.filter(s => s.tier === tierFilter);
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle date comparison
      if (sortField === 'lastPlayedAt') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      // Handle string comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal, 'es')
          : bVal.localeCompare(aVal, 'es');
      }

      // Numeric comparison (nulls to bottom)
      aVal = aVal ?? -Infinity;
      bVal = bVal ?? -Infinity;
      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return sorted;
  }, [students, debouncedSearch, tierFilter, sortField, sortOrder]);

  // Derived KPIs
  const totalStudents = students?.students?.length ?? 0;
  const classAverage = summary?.averageScore ?? 0;
  const studentsInRisk = summary?.studentsInRisk ?? 0;

  const activeStudentsCount = useMemo(() => {
    if (!students?.students) return 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return students.students.filter(s => {
      if (!s.lastPlayedAt) return false;
      return new Date(s.lastPlayedAt) >= sevenDaysAgo;
    }).length;
  }, [students]);

  // Sort handler
  const handleSort = useCallback((field) => {
    setSortField(prev => {
      if (prev === field) {
        setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'));
        return field;
      }
      setSortOrder('desc');
      return field;
    });
  }, []);

  // CSV Export
  const handleExport = useCallback(() => {
    if (!processedStudents.length) return;

    const exportData = processedStudents.map(s => ({
      name: s.name || '',
      classroom: s.classroom || '',
      totalGames: s.totalGames ?? 0,
      averageScore: s.averageScore ?? 0,
      accuracyRate: s.accuracyRate != null ? `${s.accuracyRate}%` : '-',
      avgResponseTime: formatResponseTime(s.avgResponseTime),
      lastPlayedAt: s.lastPlayedAt ? new Date(s.lastPlayedAt).toLocaleDateString('es-ES') : 'Sin actividad',
      tier: getTierBadge(s.tier).label,
    }));

    const today = new Date().toISOString().split('T')[0];
    exportToCSV(exportData, `alumnos_${today}`, CSV_COLUMNS);
  }, [processedStudents]);

  // ─── Skeleton state ─────────────────────────────────────────────
  const skeletonContent = loading && !students;

  return (
    <AnimatePresence mode="wait">
      {skeletonContent ? (
        <motion.main
          key="skeleton"
          {...(shouldReduceMotion ? {} : crossfadeVariants)}
          className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8"
        >
          {/* Header skeleton */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pt-14 lg:pt-0">
            <div className="space-y-3">
              <SkeletonShimmer className="h-8 w-56 rounded-lg" />
              <SkeletonShimmer className="h-4 w-72 rounded-md" />
            </div>
            <SkeletonShimmer className="h-11 w-36 rounded-xl" />
          </div>

          {/* Summary KPIs skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {[...Array(4)].map((_, i) => (
              <SkeletonStatCard key={`stat-sk-${i}`} />
            ))}
          </div>

          {/* Distribution chart skeleton */}
          <SkeletonChart height={200} />

          {/* Filters skeleton */}
          <div className="flex flex-col sm:flex-row gap-4">
            <SkeletonShimmer className="h-11 flex-1 rounded-xl" />
            <SkeletonShimmer className="h-11 w-48 rounded-xl" />
          </div>

          {/* Table skeleton */}
          <GlassCard padding="none">
            <div className="p-4 space-y-3">
              {[...Array(8)].map((_, i) => (
                <SkeletonShimmer key={`row-sk-${i}`} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </GlassCard>
        </motion.main>
      ) : (
        <motion.main
          key="content"
          {...(shouldReduceMotion ? {} : crossfadeVariants)}
          className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8"
          aria-label="Pagina de analisis de alumnos"
        >
          {/* ─── Header ─────────────────────────────────────────── */}
          <motion.header
            initial={shouldReduceMotion ? false : { opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pt-14 lg:pt-0"
          >
            <div>
              <motion.h1
                initial={shouldReduceMotion ? false : { opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : 0.1 }}
                className="text-2xl sm:text-3xl font-bold text-text-primary font-display"
              >
                Mis Alumnos
              </motion.h1>
              <motion.p
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: shouldReduceMotion ? 0 : 0.2 }}
                className="text-text-muted font-medium mt-1"
              >
                Vista comparativa de rendimiento y actividad de tus estudiantes
              </motion.p>
            </div>

            <ButtonPremium
              variant="secondary"
              size="sm"
              icon={<Download size={16} />}
              onClick={handleExport}
              disabled={!processedStudents.length}
            >
              Exportar CSV
            </ButtonPremium>
          </motion.header>

          {/* ─── Refreshing indicator ───────────────────────────── */}
          {loading && students ? (
            <div className="bg-background-elevated/50 border border-border-default text-text-muted px-4 py-2 rounded-xl text-sm font-medium animate-pulse">
              Actualizando datos...
            </div>
          ) : null}

          {/* ─── Error state ────────────────────────────────────── */}
          {error ? (
            <ErrorState
              title="Error al cargar datos"
              message={`${error} Pulsa Reintentar o recarga la pagina.`}
              onRetry={fetchData}
            />
          ) : null}

          {/* ─── Summary KPIs ───────────────────────────────────── */}
          {!error && (
            <motion.section
              variants={listContainerVariants(0.08)}
              initial={shouldReduceMotion ? false : 'hidden'}
              animate="visible"
              aria-labelledby="kpis-heading"
            >
              <h2 id="kpis-heading" className="sr-only">Indicadores clave</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6" role="list">
                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <GlassCard padding="sm">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-brand-base to-accent-indigo shadow-[0_2px_8px_var(--color-brand-glow)]">
                        <Users size={20} className="text-white" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-muted truncate">Total Alumnos</p>
                        <p className="text-xl font-bold text-text-primary">{totalStudents}</p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <GlassCard padding="sm">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-success-base to-success-dark shadow-[0_2px_8px_var(--color-success-glow)]">
                        <Trophy size={20} className="text-white" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-muted truncate">Promedio Clase</p>
                        <p className="text-xl font-bold text-text-primary">{classAverage}%</p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <GlassCard padding="sm">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-error-base to-error-dark shadow-[0_2px_8px_var(--color-error-glow)]">
                        <AlertTriangle size={20} className="text-white" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-muted truncate">Alumnos en Riesgo</p>
                        <p className="text-xl font-bold text-text-primary">{studentsInRisk}</p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>

                <motion.div variants={shouldReduceMotion ? {} : listItemVariants} role="listitem">
                  <GlassCard padding="sm">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-brand-base to-accent-pink shadow-[0_2px_8px_var(--color-brand-glow)]">
                        <UserCheck size={20} className="text-white" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-text-muted truncate">Alumnos Activos</p>
                        <p className="text-xl font-bold text-text-primary">
                          {activeStudentsCount}/{totalStudents}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              </div>
            </motion.section>
          )}

          {/* ─── Distribution Chart ─────────────────────────────── */}
          {!error && distribution?.length > 0 && (
            <motion.section
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : 0.2 }}
            >
              <GlassCard>
                <h3 className="text-lg font-bold text-text-primary font-display mb-4">
                  Distribucion de Rendimiento
                </h3>
                <div className="h-48">
                  <DistributionChart data={distribution} />
                </div>
              </GlassCard>
            </motion.section>
          )}

          {/* ─── Filters ────────────────────────────────────────── */}
          {!error && (
            <motion.section
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : 0.25 }}
              className="flex flex-col sm:flex-row gap-4"
              aria-label="Filtros de busqueda"
            >
              {/* Search input */}
              <div className="relative flex-1">
                <Search
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar alumno por nombre..."
                  aria-label="Buscar alumno por nombre"
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-background-elevated/80 backdrop-blur-sm border border-border-default text-text-primary placeholder:text-text-muted text-sm transition-colors duration-300 focus:outline-none focus:border-brand-base/50 focus:ring-2 focus:ring-brand-base/20 hover:border-border-strong"
                />
              </div>

              {/* Tier filter */}
              <SelectPremium
                value={tierFilter}
                onChange={setTierFilter}
                options={TIER_OPTIONS}
                placeholder="Filtrar por nivel"
                className="w-full sm:w-52"
              />
            </motion.section>
          )}

          {/* ─── Students Table ──────────────────────────────────── */}
          {!error && !loading && totalStudents === 0 && (
            <EmptyState shouldReduceMotion={shouldReduceMotion} />
          )}

          {!error && processedStudents.length > 0 && (
            <motion.section
              initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
              aria-label="Tabla de alumnos"
            >
              <GlassCard padding="none" className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle">
                        {TABLE_COLUMNS.map(col => (
                          <th
                            key={col.key}
                            scope="col"
                            className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap"
                            aria-sort={col.sortable && sortField === col.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                          >
                            {col.sortable ? (
                              <button
                                type="button"
                                onClick={() => handleSort(col.key)}
                                className="inline-flex items-center gap-1.5 hover:text-text-primary transition-colors duration-150 group"
                                aria-label={`Ordenar por ${col.label}`}
                              >
                                {col.label}
                                <SortIcon field={col.key} sortField={sortField} sortOrder={sortOrder} />
                              </button>
                            ) : (
                              col.label
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <motion.tbody
                      variants={shouldReduceMotion ? {} : listContainerVariants(0.04)}
                      initial={shouldReduceMotion ? false : 'hidden'}
                      animate="visible"
                    >
                      {processedStudents.map((student) => (
                        <StudentRow
                          key={student._id || student.studentId}
                          student={student}
                          navigate={navigate}
                          shouldReduceMotion={shouldReduceMotion}
                        />
                      ))}
                    </motion.tbody>
                  </table>
                </div>

                {/* Result count footer */}
                <div className="px-4 py-3 border-t border-border-subtle text-xs text-text-muted">
                  Mostrando {processedStudents.length} de {totalStudents} alumnos
                  {(debouncedSearch || tierFilter) ? ' (filtrado)' : ''}
                </div>
              </GlassCard>
            </motion.section>
          )}

          {/* No results from filter */}
          {!error && !loading && totalStudents > 0 && processedStudents.length === 0 && (
            <GlassCard className="text-center py-12">
              <Search size={40} className="mx-auto text-text-muted/40 mb-4" aria-hidden="true" />
              <p className="text-text-primary font-semibold">Sin resultados</p>
              <p className="text-text-muted text-sm mt-1">
                Ningun alumno coincide con los filtros aplicados
              </p>
            </GlassCard>
          )}
        </motion.main>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function SortIcon({ field, sortField, sortOrder }) {
  if (field !== sortField) {
    return <ArrowUpDown size={14} className="text-text-muted/40 group-hover:text-text-muted transition-colors" aria-hidden="true" />;
  }
  return sortOrder === 'asc'
    ? <ArrowUp size={14} className="text-brand-base" aria-hidden="true" />
    : <ArrowDown size={14} className="text-brand-base" aria-hidden="true" />;
}

function StudentRow({ student, navigate, shouldReduceMotion }) {
  const tier = getTierBadge(student.tier);
  const studentId = student._id || student.studentId;

  return (
    <motion.tr
      variants={shouldReduceMotion ? {} : listItemVariants}
      onClick={() => navigate(ROUTES.STUDENT_PROFILE(studentId))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(ROUTES.STUDENT_PROFILE(studentId));
        }
      }}
      tabIndex={0}
      role="row"
      className="border-b border-border-subtle/50 last:border-b-0 hover:bg-background-surface/40 cursor-pointer transition-colors duration-150 focus:outline-none focus:bg-background-surface/40 focus:ring-1 focus:ring-brand-base/30 focus:ring-inset"
    >
      {/* Avatar + Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 min-w-[180px]">
          <div
            className="flex items-center justify-center size-9 rounded-full bg-gradient-to-br from-brand-base/30 to-accent-indigo/30 text-text-primary text-xs font-bold shrink-0 border border-border-subtle"
            aria-hidden="true"
          >
            {getInitials(student.name)}
          </div>
          <span className="font-medium text-text-primary truncate">{student.name}</span>
        </div>
      </td>

      {/* Classroom */}
      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
        {student.classroom || '-'}
      </td>

      {/* Total games */}
      <td className="px-4 py-3 text-text-secondary text-center whitespace-nowrap">
        {student.totalGames ?? 0}
      </td>

      {/* Average score */}
      <td className="px-4 py-3 font-semibold text-text-primary text-center whitespace-nowrap">
        {student.averageScore ?? 0}%
      </td>

      {/* Accuracy rate */}
      <td className="px-4 py-3 text-text-secondary text-center whitespace-nowrap">
        {student.accuracyRate != null ? `${student.accuracyRate}%` : '-'}
      </td>

      {/* Response time */}
      <td className="px-4 py-3 text-text-secondary text-center whitespace-nowrap">
        {formatResponseTime(student.avgResponseTime)}
      </td>

      {/* Last activity */}
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className={`inline-block size-2 rounded-full shrink-0 ${getActivityColor(student.lastPlayedAt)}`} aria-hidden="true" />
          <span className="text-text-secondary text-xs">
            {getRelativeTime(student.lastPlayedAt)}
          </span>
        </div>
      </td>

      {/* Tier badge */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${tier.className}`}>
          {tier.label}
        </span>
      </td>
    </motion.tr>
  );
}

function EmptyState({ shouldReduceMotion }) {
  return (
    <GlassCard className="text-center py-16">
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-brand-base/10 text-brand-base"
      >
        <GraduationCap size={40} aria-hidden="true" />
      </motion.div>
      <motion.p
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-text-primary text-lg font-semibold"
      >
        Aun no tienes alumnos registrados
      </motion.p>
      <motion.p
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-text-muted mt-2 max-w-md mx-auto"
      >
        Cuando tus alumnos jueguen sus primeras partidas, aqui podras ver su rendimiento y progreso.
      </motion.p>
    </GlassCard>
  );
}
