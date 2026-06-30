import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { m as motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Trophy,
  AlertTriangle,
  UserCheck,
  Download,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  GraduationCap,
  ListOrdered,
  ShieldCheck,
  History,
} from "lucide-react";
import { getMechanicTheme, MECHANIC_KEYS } from "../lib/mechanicTheme";
import {
  cn,
  listContainerVariants,
  listItemVariants,
  crossfadeVariants,
  exportToCSV,
} from "../lib/utils";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useRefetchOnFocus } from "../hooks/useRefetchOnFocus";
import { useReducedMotion } from "../hooks/useReducedMotion";
import analyticsService from "../services/analytics";
import { isAbortError } from "../services/api";
import { captureException } from "../lib/sentry";
import { getId } from "../lib/entityId";
import { ROUTES } from "../constants/routes";
import ChartErrorBoundary from "../components/common/ChartErrorBoundary";
import GlassCard from "../components/ui/GlassCard";
import ButtonPremium from "../components/ui/ButtonPremium";
import SelectPremium from "../components/ui/SelectPremium";
import ErrorState from "../components/ui/ErrorState";
import DistributionChart from "../components/dashboard/DistributionChart";
import SkeletonShimmer, {
  SkeletonStatCard,
  SkeletonChart,
} from "../components/ui/SkeletonShimmer";

// ─── Helper functions ───────────────────────────────────────────────

/**
 * Obtiene las iniciales de un nombre (max 2 caracteres).
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Mini-chip por mecánica con tier desglosado (ADR-E). Muestra el icono
 * Lucide signature de la mecánica + un dot del color del tier (verde,
 * azul, amarillo, rojo). Tooltip con score y partidas para que el
 * profesor entienda el chip de un vistazo. Si el alumno no ha jugado
 * esa mecánica, devuelve `null` para no ocupar espacio innecesario.
 */
function MechanicTierChip({ mechanicKey, data }) {
  if (!data || data.gamesPlayed === 0) return null;
  const theme = getMechanicTheme(mechanicKey);
  const Icon = theme.icon;
  const tier = data.tier || "risk";
  const tierBadge = getTierBadge(tier);
  const score = Number.isFinite(Number(data.averageScore))
    ? Math.round(Number(data.averageScore) * 10) / 10
    : null;
  const tooltip =
    `${theme.label}: ${tierBadge.label}${ 
    score !== null ? ` · ${score}%` : "" 
    } · ${data.gamesPlayed} ${data.gamesPlayed === 1 ? "partida" : "partidas"}`;
  return (
    // BUG-A11Y-SPAN-LABEL-A (QA Sprint 0 post-v0.5.0): span con aria-label sin
    // role provoca aria-prohibited-attr (axe serious). Añadir role="img" para
    // que el chip de mecánica (icono + dot tier + texto sr-only) tenga nombre
    // accesible válido.
    <span
      role="img"
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider border ${theme.accentBgSoftClass} ${theme.accentBorderClass}`}
      title={tooltip}
      aria-label={tooltip}
    >
      <Icon size={10} className={theme.accentClass} aria-hidden="true" />
      <span
        className={`size-1.5 rounded-full ${
          tierBadge.className
            .split(" ")
            .find((c) => c.startsWith("text-"))
            ?.replace("text-", "bg-") || "bg-text-muted"
        }`}
        aria-hidden="true"
      />
    </span>
  );
}

/**
 * Devuelve label y className para un tier de rendimiento.
 * @param {string} tier - risk | average | good | excellent
 * @returns {{label: string, className: string}}
 */
function getTierBadge(tier) {
  switch (tier) {
    case "excellent":
      return {
        label: "Excelente",
        className:
          "bg-success-dark/15 text-success-base border-success-dark/25",
      };
    case "good":
      return {
        label: "Bueno",
        className: "bg-info-dark/15 text-info-base border-info-dark/25",
      };
    case "average":
      return {
        label: "Promedio",
        // BUG-A11Y-CONTRAST-AVG-A (QA Sprint 0 post-v0.5.0): text-warning-base
        // sobre bg-warning-dark/15 daba 3.11 light / 3.6 dark. Igual que en
        // StudentsList: dark usa warning-base luminoso, light usa warning-dark.
        className:
          "bg-warning-dark/15 text-warning-on-alpha border-warning-dark/25",
      };
    case "risk":
      return {
        label: "En Riesgo",
        // BUG-A11Y-RISK-BADGE-A (QA Sprint 0 post-v0.5.0): para alcanzar AA
        // 4.5:1 en dark theme usamos text-red-300 (oklch ~80% — más luminoso
        // que error-base 65%) sobre bg-background-surface sólido + borde
        // rojo. light:text-error-base mantiene legibilidad en tema claro.
        className: "bg-background-surface text-error-on-alpha border-error-base/60",
      };
    default:
      return {
        label: "Sin datos",
        className:
          "bg-text-disabled/10 text-text-muted border-text-disabled/20",
      };
  }
}

/**
 * Devuelve la clase tailwind para el indicador de actividad reciente.
 * @param {string} dateStr - Fecha ISO
 * @returns {string} Clase de color tailwind
 */
function getActivityColor(dateStr) {
  if (!dateStr) return "bg-text-disabled";
  // Clamp a 0 para que fechas en el futuro (fixtures/seeders) no den valores negativos.
  const diff = Math.max(
    0,
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 3) return "bg-success-base";
  if (diff <= 7) return "bg-warning-base";
  return "bg-error-base";
}

/**
 * Genera un texto relativo a partir de una fecha.
 * Las fechas en el futuro (por seeders) se muestran como "Hoy" en vez de "Hace -X dias".
 * @param {string} dateStr - Fecha ISO
 * @returns {string} Texto "Hace X dias"
 */
function getRelativeTime(dateStr) {
  if (!dateStr) return "Sin actividad";
  const diff = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Hace 1 dia";
  return `Hace ${diff} dias`;
}

/**
 * Formatea tiempo de respuesta en milisegundos a formato legible.
 * @param {number} ms - Milisegundos
 * @returns {string} Formato "X.Xs"
 */
function formatResponseTime(ms) {
  if (ms == null || Number.isNaN(ms)) return "-";
  return `${(ms / 1000).toFixed(1)}s`;
}

const STUDENTS_KPI_SKELETON_KEYS = ["kpi-a", "kpi-b", "kpi-c", "kpi-d"];
const STUDENTS_ROW_SKELETON_KEYS = [
  "row-a",
  "row-b",
  "row-c",
  "row-d",
  "row-e",
  "row-f",
  "row-g",
  "row-h",
];

/**
 * Formatea un porcentaje (0-100) eliminando decimales sobrantes.
 * `1` decimal cuando el valor no es entero, sin decimales si lo es.
 * Evita rendering tipo "42.7222222222222%" cuando el backend devuelve floats
 * sin redondear (QA 26/04/2026).
 * @param {number|string|null|undefined} v
 * @returns {string}
 */
function formatPercent(v) {
  if (v == null || v === "") return "0";
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// ─── CSV column definitions ─────────────────────────────────────────

const CSV_COLUMNS = [
  { key: "name", label: "Nombre" },
  { key: "classroom", label: "Aula" },
  { key: "totalGames", label: "Partidas" },
  { key: "averageScore", label: "Puntuación" },
  { key: "accuracyRate", label: "Tasa de acierto" },
  { key: "avgResponseTime", label: "Tiempo Respuesta" },
  { key: "maxSequenceLengthAchieved", label: "Mejor Secuencia" },
  { key: "lastPlayedAt", label: "Última Actividad" },
  { key: "tier", label: "Nivel" },
];

// ─── Tier filter options ────────────────────────────────────────────

const TIER_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "excellent", label: "Excelente" },
  { value: "good", label: "Bueno" },
  { value: "average", label: "Promedio" },
  { value: "risk", label: "En Riesgo" },
];

// ─── Table column config ────────────────────────────────────────────

const TABLE_COLUMNS = [
  { key: "name", label: "Alumno", sortable: true },
  { key: "classroom", label: "Aula", sortable: true },
  { key: "totalGames", label: "Partidas", sortable: true },
  { key: "averageScore", label: "Puntuación", sortable: true },
  { key: "accuracyRate", label: "Acierto", sortable: true },
  { key: "avgResponseTime", label: "Tiempo Resp", sortable: true },
  // T-922 criterio 7: vista comparativa con la mejor secuencia. El tooltip de
  // cada celda explica que es la longitud máxima reproducida correctamente; la
  // cabecera se acorta a "Secuencia" para que la tabla quepa sin recortes a 1366.
  { key: "maxSequenceLengthAchieved", label: "Secuencia", sortable: true },
  { key: "lastPlayedAt", label: "Actividad", sortable: true },
  { key: "tier", label: "Nivel", sortable: true },
];

// ─── Main Component ─────────────────────────────────────────────────

// eslint-disable-next-line sonarjs/cyclomatic-complexity -- pagina de analytics con tabla, filtros, distribucion y multiples estados
export default function StudentsAnalytics() {
  const navigate = useNavigate();
  useDocumentTitle("Mis Alumnos");
  const { shouldReduceMotion } = useReducedMotion();

  // Data state
  const [students, setStudents] = useState(null);
  const [summary, setSummary] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const dataAbortRef = useRef(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("");

  // Sort state
  const [sortField, setSortField] = useState("averageScore");
  const [sortOrder, setSortOrder] = useState("desc");

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
        const [studentsData, summaryData, distributionData] = await Promise.all(
          [
            analyticsService.getClassroomStudents(
              { sort: "score", order: "desc" },
              { signal: controller.signal },
            ),
            analyticsService.getClassroomSummary({}, { signal: controller.signal }),
            analyticsService.getClassroomDistribution(
              {},
              { signal: controller.signal },
            ),
          ],
        );

        setStudents(studentsData);
        setSummary(summaryData);
        // El endpoint /classroom/distribution devuelve { distribution: [...], totalStudents }.
        // Hay que desempaquetar el array (igual que Dashboard.jsx); guardar el objeto
        // crudo dejaba el gate `distribution?.length > 0` siempre en falso → la card
        // de distribución no se renderizaba nunca.
        setDistribution(
          Array.isArray(distributionData) ? distributionData : distributionData?.distribution ?? null,
        );
        setError(null);
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
        const status = err.response?.status;
        const message = (() => {
          if (status === 403) return "No tienes permisos para ver estos datos.";
          if (status >= 500)
            return "El servidor no responde ahora mismo. Inténtalo de nuevo más tarde.";
          return "No pudimos conectar. Comprueba tu red e inténtalo de nuevo.";
        })();
        setError(message);
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

    // Normalizar: extraer campos de studentMetrics al nivel raíz si no existen
    let filtered = students.students.map((s) => ({
      ...s,
      totalGames: s.totalGames ?? s.studentMetrics?.totalGamesPlayed ?? 0,
      averageScore: s.averageScore ?? s.studentMetrics?.averageScore ?? 0,
      lastPlayedAt: s.lastPlayedAt ?? s.studentMetrics?.lastPlayedAt ?? null,
      avgResponseTime:
        s.avgResponseTime ?? s.studentMetrics?.averageResponseTime ?? null,
      maxSequenceLengthAchieved:
        s.maxSequenceLengthAchieved ??
        s.studentMetrics?.maxSequenceLengthAchieved ??
        0,
    }));

    // Apply search filter
    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter((s) => s.name?.toLowerCase().includes(query));
    }

    // Apply tier filter
    if (tierFilter) {
      filtered = filtered.filter((s) => s.tier === tierFilter);
    }

    // Apply sorting
    return filtered.toSorted((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle date comparison
      if (sortField === "lastPlayedAt") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      // Handle string comparison
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal, "es")
          : bVal.localeCompare(aVal, "es");
      }

      // Numeric comparison (nulls to bottom)
      aVal = aVal ?? -Infinity;
      bVal = bVal ?? -Infinity;
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [students, debouncedSearch, tierFilter, sortField, sortOrder]);

  // Derived KPIs
  const totalStudents = students?.students?.length ?? 0;
  const classAverage = summary?.averageScore ?? 0;
  const studentsInRisk = summary?.studentsInRisk ?? 0;

  // Contador de alumnos activos: cualquier alumno con lastPlayedAt en los ultimos 7 dias.
  // El backend lo devuelve dentro de studentMetrics, pero el procesador del listado
  // lo eleva a la raiz, asi que aqui aceptamos ambas rutas.
  const activeStudentsCount = useMemo(() => {
    if (!students?.students) return 0;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return students.students.filter((s) => {
      const last = s.lastPlayedAt ?? s.studentMetrics?.lastPlayedAt ?? null;
      if (!last) return false;
      return new Date(last) >= sevenDaysAgo;
    }).length;
  }, [students]);

  // Sort handler
  const handleSort = useCallback((field) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
        return field;
      }
      setSortOrder("desc");
      return field;
    });
  }, []);

  // CSV Export
  const handleExport = useCallback(() => {
    if (!processedStudents.length) return;

    const exportData = processedStudents.map((s) => ({
      name: s.name || "",
      classroom: s.classroom || "",
      totalGames: s.totalGames ?? 0,
      averageScore: s.averageScore ?? 0,
      accuracyRate: s.accuracyRate != null ? `${s.accuracyRate}%` : "-",
      avgResponseTime: formatResponseTime(s.avgResponseTime),
      // BUG-CSV-SEQUENCE-A (QA Sprint 0 post-v0.5.0): CSV_COLUMNS declara
      // `maxSequenceLengthAchieved` pero el mapeo lo omitía → columna "Mejor
      // Secuencia" siempre vacía en el CSV exportado.
      maxSequenceLengthAchieved: s.maxSequenceLengthAchieved ?? "-",
      lastPlayedAt: s.lastPlayedAt
        ? new Date(s.lastPlayedAt).toLocaleDateString("es-ES")
        : "Sin actividad",
      tier: getTierBadge(s.tier).label,
    }));

    const today = new Date().toISOString().split("T")[0];
    exportToCSV(exportData, `alumnos_${today}`, CSV_COLUMNS);
  }, [processedStudents]);

  // ─── Skeleton state ─────────────────────────────────────────────
  const skeletonContent = loading && !students;
  const motionVariants = shouldReduceMotion ? {} : crossfadeVariants;

  return (
    <AnimatePresence mode="wait">
      {skeletonContent ? (
        <motion.section
          key="skeleton"
          {...motionVariants}
          className="page-container py-[var(--space-fluid-section)] space-y-8"
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
            {STUDENTS_KPI_SKELETON_KEYS.map((key) => (
              <SkeletonStatCard key={key} />
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
              {STUDENTS_ROW_SKELETON_KEYS.map((key) => (
                <SkeletonShimmer key={key} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </GlassCard>
        </motion.section>
      ) : (
        <motion.section
          key="content"
          {...motionVariants}
          className="page-container py-[var(--space-fluid-section)] space-y-8"
          aria-label="Página de análisis de alumnos"
        >
          <ChartErrorBoundary>
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
                  Vista comparativa de rendimiento y actividad de tus
                  estudiantes
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
              <div
                role="status"
                aria-live="polite"
                className={cn(
                  'bg-background-elevated/50 border border-border-default text-text-muted px-4 py-2 rounded-xl text-sm font-medium',
                  !shouldReduceMotion && 'animate-pulse'
                )}
              >
                Actualizando datos…
              </div>
            ) : null}

            {/* ─── Error state ────────────────────────────────────── */}
            {error ? (
              <ErrorState
                title="No pudimos cargar tus alumnos"
                message={`${error} Pulsa Reintentar o recarga la página.`}
                onRetry={fetchData}
              />
            ) : null}

            {/* ─── Summary KPIs ───────────────────────────────────── */}
            {!error && (
              <motion.section
                variants={listContainerVariants(0.03)}
                initial={shouldReduceMotion ? false : "hidden"}
                animate="visible"
                aria-labelledby="kpis-heading"
              >
                <h2 id="kpis-heading" className="sr-only">
                  Indicadores clave
                </h2>
                {/* items-stretch evita que un KPI con valor más largo (p.ej.
                    "23/45") tire del alto del grid y deje desalineados los
                    otros 3 cards en el mismo row. */}
                <ul className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 items-stretch">
                  <motion.li
                    variants={shouldReduceMotion ? {} : listItemVariants}
                  >
                    <GlassCard padding="sm">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-brand-base to-accent-indigo shadow-[0_2px_8px_var(--color-brand-glow)]">
                          <Users
                            size={20}
                            className="text-white"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-muted truncate">
                            Total Alumnos
                          </p>
                          <p className="text-xl font-bold text-text-primary">
                            {totalStudents}
                          </p>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.li>

                  <motion.li
                    variants={shouldReduceMotion ? {} : listItemVariants}
                  >
                    <GlassCard padding="sm">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-success-base to-success-dark shadow-[0_2px_8px_var(--color-success-glow)]">
                          <Trophy
                            size={20}
                            className="text-white"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-muted truncate">
                            Promedio Clase
                          </p>
                          <p className="text-xl font-bold text-text-primary">
                            {classAverage}%
                          </p>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.li>

                  <motion.li
                    variants={shouldReduceMotion ? {} : listItemVariants}
                  >
                    <GlassCard padding="sm">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-error-base to-error-dark shadow-[0_2px_8px_var(--color-error-glow)]">
                          <AlertTriangle
                            size={20}
                            className="text-white"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-muted truncate">
                            Alumnos en Riesgo
                          </p>
                          <p className="text-xl font-bold text-text-primary">
                            {studentsInRisk}
                          </p>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.li>

                  <motion.li
                    variants={shouldReduceMotion ? {} : listItemVariants}
                  >
                    <GlassCard padding="sm">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-brand-base to-accent-pink shadow-[0_2px_8px_var(--color-brand-glow)]">
                          <UserCheck
                            size={20}
                            className="text-white"
                            aria-hidden="true"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-text-muted truncate">
                            Alumnos Activos
                          </p>
                          <p className="text-xl font-bold text-text-primary">
                            {activeStudentsCount}/{totalStudents}
                          </p>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.li>
                </ul>
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
                  <h3 className="text-lg font-semibold text-text-primary font-display mb-4">
                    Distribución de Rendimiento
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
                aria-label="Filtros de búsqueda"
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
                    data-global-search="true"
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
            {/* Supresión por k-anonimidad (RGPD): el backend devuelve
                `aggregatedOnly` cuando el grupo es demasiado pequeño para
                mostrar alumnos individuales sin riesgo de reidentificación.
                No es ausencia de datos, así que mostramos un mensaje de
                privacidad en lugar del empty-state genérico. */}
            {!error && !loading && students?.aggregatedOnly && (
              <PrivacyAggregatedState shouldReduceMotion={shouldReduceMotion} />
            )}

            {!error && !loading && !students?.aggregatedOnly && totalStudents === 0 && (
              <EmptyState shouldReduceMotion={shouldReduceMotion} />
            )}

            {!error && processedStudents.length > 0 && (
              <motion.section
                initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : 0.3 }}
                aria-label="Tabla de alumnos"
              >
                {/* OBS-8: declarar la ventana temporal. La tabla muestra
                    métricas ACUMULADAS del historial completo (User.studentMetrics);
                    el perfil individual usa los últimos 30 días. Etiquetarlo evita
                    la confusión al comparar cifras entre ambas pantallas. */}
                <p className="mb-3 flex items-start gap-2 text-xs text-text-muted">
                  <History size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Métricas{" "}
                    <strong className="font-semibold text-text-secondary">
                      acumuladas de todo el historial
                    </strong>{" "}
                    del alumno. El perfil individual muestra los{" "}
                    <strong className="font-semibold text-text-secondary">
                      últimos 30 días
                    </strong>
                    .
                  </span>
                </p>
                <GlassCard padding="none" className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-subtle">
                          {TABLE_COLUMNS.map((col) => (
                            // BUG-A11Y-CONTRAST-TH (QA Sprint 0 post-v0.5.0):
                            // text-text-muted en th sobre gradient header
                            // daba 2.58-3.92:1. text-text-secondary (más
                            // luminoso) pasa AA en ambos temas.
                            <th
                              key={col.key}
                              scope="col"
                              className="px-3 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap"
                              aria-sort={(() => {
                                if (col.sortable && sortField === col.key)
                                  return sortOrder === "asc"
                                    ? "ascending"
                                    : "descending";
                                return undefined;
                              })()}
                            >
                              {col.sortable ? (
                                <button
                                  type="button"
                                  onClick={() => handleSort(col.key)}
                                  className="inline-flex items-center gap-1.5 hover:text-text-primary transition-colors duration-150 group"
                                  aria-label={`Ordenar por ${col.label}`}
                                >
                                  {col.label}
                                  <SortIcon
                                    field={col.key}
                                    sortField={sortField}
                                    sortOrder={sortOrder}
                                  />
                                </button>
                              ) : (
                                col.label
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <motion.tbody {...motionVariants}>
                        {processedStudents.map((student, index) => (
                          <StudentRow
                            key={
                              student._id ||
                              student.studentId ||
                              `student-${index}`
                            }
                            student={student}
                            navigate={navigate}
                          />
                        ))}
                      </motion.tbody>
                    </table>
                  </div>

                  {/* Result count footer */}
                  <div className="px-3 py-3 border-t border-border-subtle text-xs text-text-muted">
                    Mostrando {processedStudents.length} de {totalStudents}{" "}
                    alumnos
                    {debouncedSearch || tierFilter ? " (filtrado)" : ""}
                  </div>
                </GlassCard>
              </motion.section>
            )}

            {/* No results from filter */}
            {!error &&
              !loading &&
              totalStudents > 0 &&
              processedStudents.length === 0 && (
                <GlassCard className="text-center py-12">
                  <Search
                    size={40}
                    className="mx-auto text-text-muted/40 mb-4"
                    aria-hidden="true"
                  />
                  <p className="text-text-primary font-semibold">
                    Sin resultados
                  </p>
                  <p className="text-text-muted text-sm mt-1">
                    Ningun alumno coincide con los filtros aplicados
                  </p>
                </GlassCard>
              )}
          </ChartErrorBoundary>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function SortIcon({ field, sortField, sortOrder }) {
  if (field !== sortField) {
    // Atenuación mayor para que solo la columna activa destaque; el arrow
    // inactivo solo se hace visible al hover como affordance (QA 22/04/2026).
    return (
      <ArrowUpDown
        size={14}
        className="text-text-muted/20 group-hover:text-text-muted transition-colors"
        aria-hidden="true"
      />
    );
  }
  return sortOrder === "asc" ? (
    <ArrowUp size={14} className="text-brand-base" aria-hidden="true" />
  ) : (
    <ArrowDown size={14} className="text-brand-base" aria-hidden="true" />
  );
}

// Color de la barra de puntuación por nivel. Clases completas (Tailwind purga
// las construidas por interpolación). Barra RAG escaneable en la columna
// Puntuación: de un vistazo se ve quién va alto/bajo (elevación 2026-06-04).
const TIER_BAR_CLASS = {
  excellent: "bg-success-base",
  good: "bg-success-base",
  average: "bg-warning-base",
  risk: "bg-error-base",
};

function StudentRow({ student, navigate }) {
  const tier = getTierBadge(student.tier);
  const studentId = getId(student) || student.studentId;
  const scorePct = Math.min(100, Math.max(0, Number(student.averageScore) || 0));
  const scoreBarClass = TIER_BAR_CLASS[student.tier] || "bg-text-muted";

  return (
    <tr
      onClick={() => navigate(ROUTES.STUDENT_PROFILE(studentId))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(ROUTES.STUDENT_PROFILE(studentId));
        }
      }}
      tabIndex={0}
      className="border-b border-border-subtle/50 last:border-b-0 hover:bg-background-surface/40 cursor-pointer transition-colors duration-150 focus:outline-none focus:bg-background-surface/40 focus:ring-1 focus:ring-brand-base/30 focus:ring-inset"
    >
      {/* Avatar + Name */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-3 min-w-[180px]">
          <div
            className="flex items-center justify-center size-9 rounded-full bg-gradient-to-br from-brand-base/30 to-accent-indigo/30 text-text-primary text-xs font-bold shrink-0 border border-border-subtle"
            aria-hidden="true"
          >
            {getInitials(student.name)}
          </div>
          <span className="font-medium text-text-primary truncate">
            {student.name}
          </span>
        </div>
      </td>

      {/* Classroom */}
      <td className="px-3 py-3 text-text-secondary whitespace-nowrap">
        {student.classroom || "-"}
      </td>

      {/* Total games */}
      <td className="px-3 py-3 text-text-secondary text-center whitespace-nowrap">
        {student.totalGames ?? 0}
      </td>

      {/* Average score — barra RAG escaneable + valor (elevación 2026-06-04) */}
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="flex items-center justify-center gap-2">
          <span
            className="hidden sm:block h-1.5 w-12 overflow-hidden rounded-full bg-background-surface ring-1 ring-inset ring-border-subtle"
            aria-hidden="true"
          >
            <span
              className={`block h-full rounded-full ${scoreBarClass}`}
              style={{ width: `${scorePct}%` }}
            />
          </span>
          <span className="font-semibold text-text-primary tabular-nums">
            {formatPercent(student.averageScore)}%
          </span>
        </div>
      </td>

      {/* Accuracy rate */}
      <td className="px-3 py-3 text-text-secondary text-center whitespace-nowrap">
        {student.accuracyRate != null
          ? `${formatPercent(student.accuracyRate)}%`
          : "-"}
      </td>

      {/* Response time */}
      <td className="px-3 py-3 text-text-secondary text-center whitespace-nowrap">
        {formatResponseTime(student.avgResponseTime)}
      </td>

      {/* Mejor Secuencia (T-922 criterio 7) — longitud máxima reproducida */}
      <td
        className="px-3 py-3 text-center whitespace-nowrap"
        title={
          student.maxSequenceLengthAchieved > 0
            ? `Longitud máxima reproducida: ${student.maxSequenceLengthAchieved} cartas`
            : "Sin partidas de Secuencia"
        }
      >
        {student.maxSequenceLengthAchieved > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-accent-amber font-semibold">
            <ListOrdered size={14} aria-hidden="true" />
            {student.maxSequenceLengthAchieved}
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>

      {/* Last activity */}
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block size-2 rounded-full shrink-0 ${getActivityColor(student.lastPlayedAt)}`}
            aria-hidden="true"
          />
          <span className="text-text-secondary text-xs">
            {getRelativeTime(student.lastPlayedAt)}
          </span>
        </div>
      </td>

      {/* Tier badge — global + chips por mecánica (ADR-E) */}
      <td className="px-3 py-3 whitespace-nowrap">
        <div className="flex flex-col items-start gap-1">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-micro font-semibold uppercase tracking-[0.08em] border ${tier.className}`}
          >
            <span
              className="size-1.5 rounded-full bg-current"
              aria-hidden="true"
            />
            {tier.label}
          </span>
          {student.tiersByMechanic &&
          Object.keys(student.tiersByMechanic).length > 0 ? (
            <div
              className="flex flex-wrap items-center gap-1"
              aria-label="Niveles por mecánica"
            >
              {MECHANIC_KEYS.map((key) => (
                <MechanicTierChip
                  key={key}
                  mechanicKey={key}
                  data={student.tiersByMechanic[key]}
                />
              ))}
            </div>
          ) : null}
        </div>
      </td>
    </tr>
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
        Aún no tienes alumnos registrados
      </motion.p>
      <motion.p
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-text-muted mt-2 max-w-md mx-auto"
      >
        Cuando tus alumnos jueguen sus primeras partidas, aquí podrás ver su
        rendimiento y progreso.
      </motion.p>
    </GlassCard>
  );
}

/**
 * Estado de privacidad por k-anonimidad (RGPD). Se muestra cuando el backend
 * suprime el detalle individual porque el grupo es demasiado pequeño para
 * exponer alumnos sin riesgo de reidentificación. No es ausencia de datos:
 * lo aclaramos con un mensaje propio en lugar del empty-state genérico.
 */
function PrivacyAggregatedState({ shouldReduceMotion }) {
  return (
    <GlassCard className="text-center py-16">
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl bg-brand-base/10 text-brand-base"
      >
        <ShieldCheck size={40} aria-hidden="true" />
      </motion.div>
      <motion.p
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-text-primary text-lg font-semibold"
      >
        Datos agregados por privacidad
      </motion.p>
      <motion.p
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-text-muted mt-2 max-w-md mx-auto"
      >
        El grupo es demasiado pequeño para mostrar alumnos individuales sin
        riesgo de reidentificación (RGPD). Cuando haya más alumnos con partidas,
        verás aquí el detalle individual.
      </motion.p>
    </GlassCard>
  );
}
