import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Download,
  Printer,
  Users,
  User,
  BarChart3,
  TrendingUp,
  Award,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, DURATION, EASING, exportToCSV } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import analyticsService from '../../services/analytics';
import { isAbortError } from '../../services/api';
import { captureException } from '../../lib/sentry';
import { getId } from '../../lib/entityId';
import GlassCard from '../ui/GlassCard';
import SelectPremium from '../ui/SelectPremium';
import ButtonPremium from '../ui/ButtonPremium';
import SkeletonShimmer from '../ui/SkeletonShimmer';
import ErrorState from '../ui/ErrorState';
import { scoreToRAG as getScoreRAGColor } from '../../constants/analyticsThresholds';

/**
 * Opciones de tipo de reporte.
 */
const REPORT_TYPE_OPTIONS = [
  { value: 'classroom', label: 'Clase completa', icon: <Users size={16} /> },
  { value: 'student', label: 'Estudiante individual', icon: <User size={16} /> },
];

/**
 * Opciones de periodo.
 */
const PERIOD_OPTIONS = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
];

/**
 * Opciones de formato.
 */
const FORMAT_OPTIONS = [
  { value: 'summary', label: 'Resumen' },
  { value: 'detailed', label: 'Detallado' },
];

/**
 * Componente de KPI simple para el reporte.
 */
function ReportKPI({ label, value, suffix, icon: Icon, ragColor }) {
  const colorStyles = {
    green: 'text-success-base bg-success-base/10',
    amber: 'text-warning-base bg-warning-base/10',
    red: 'text-error-base bg-error-base/10',
    blue: 'text-info-base bg-info-base/10',
    default: 'text-brand-base bg-brand-base/10',
  };
  const style = colorStyles[ragColor] || colorStyles.default;

  return (
    <div className="rounded-xl border border-border-subtle bg-background-elevated/30 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</span>
        {Icon && (
          <div className={cn('p-1.5 rounded-lg', style)}>
            <Icon size={14} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold text-text-primary font-display tabular-nums">
          {value ?? '-'}
        </span>
        {suffix && <span className="text-sm text-text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

// Adaptadores de KPIs: el backend puede devolver `averageScore`/`completionRate`
// o nombres legacy (`avgScore`/`classEngagementScore`). Extraemos a helpers para
// no anidar ternarios dentro del JSX.
function resolveAverageScoreValue(kpis) {
  if (kpis.averageScore != null) return Math.round(kpis.averageScore);
  if (kpis.avgScore != null) return Math.round(kpis.avgScore);
  return null;
}

function resolveCompletionRateValue(kpis) {
  // Solo `completionRate` real. Antes caía a `classEngagementScore` cuando
  // faltaba, pintando la implicación (engagement) bajo la etiqueta "Tasa
  // Completado" — son magnitudes distintas. Si no hay tasa de completado,
  // devolvemos null → la KPI muestra "—" en vez de un valor de otra métrica.
  if (kpis.completionRate != null) return Math.round(kpis.completionRate);
  return null;
}

// Deriva una key estable para items de fortalezas/debilidades, que pueden
// venir del backend como string o como objeto con name/context.
function getInsightKey(item, prefix) {
  if (typeof item === 'string') return `${prefix}-${item}`;
  return `${prefix}-${item.name || item.context || item.id || JSON.stringify(item)}`;
}

// Deriva una key estable para recomendaciones (string o {message|description}).
function getRecommendationKey(rec) {
  if (typeof rec === 'string') return `rec-${rec}`;
  return `rec-${rec.id || rec.message || rec.description || JSON.stringify(rec)}`;
}

const RANKING_TONE_CLASSES = {
  success: {
    title: 'text-success-base',
    row: 'bg-success-base/5 border border-success-base/10',
    value: 'text-success-base'
  },
  error: {
    title: 'text-error-base',
    row: 'bg-error-base/5 border border-error-base/10',
    value: 'text-error-base'
  }
};

/**
 * Lista compacta de alumnos (top o bottom) con score normalizado.
 * `studentSummaries` del backend expone `averageScore` (alineado con la tabla
 * "Mis Alumnos") con `engagementScore` y `completionRate` como complemento.
 * Mantenemos el fallback a `score`/`engagementScore` para mocks legacy.
 */
function StudentRankingList({ title, icon: Icon, tone, students }) {
  const palette = RANKING_TONE_CLASSES[tone];
  return (
    <div>
      <h4 className={`text-sm font-bold mb-2 flex items-center gap-1.5 ${palette.title}`}>
        <Icon size={14} aria-hidden="true" />
        {title}
      </h4>
      <div className="space-y-1.5">
        {students.slice(0, 5).map((s, idx) => (
          <div
            key={getId(s) || s.studentId || idx}
            className={`flex items-center justify-between px-3 py-2 rounded-lg ${palette.row}`}
          >
            <span className="text-sm text-text-primary truncate">{s.name || s.studentName || `Alumno ${idx + 1}`}</span>
            <span className={`text-sm font-bold tabular-nums ${palette.value}`}>
              {Math.round(s.averageScore ?? s.score ?? s.engagementScore ?? 0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

StudentRankingList.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  tone: PropTypes.oneOf(['success', 'error']).isRequired,
  students: PropTypes.array.isRequired
};

/**
 * Vista del reporte de clase.
 *
 * El backend (`reportDataService.getClassroomReport`) devuelve la jerarquia
 * `{ overview, distribution: { distribution: [] }, studentSummaries, ... }`
 * mientras que iteraciones previas del componente esperaban `{ kpis, topStudents, ... }`.
 * Mapeamos ambas formas para ser resilientes a backends futuros o mocks de tests.
 */
function ClassroomReportView({ data }) {
  if (!data) return null;

  const kpis = data.kpis || data.overview || data.summary || {};

  // `data.distribution` puede ser array (legacy/mocks) u objeto con `.distribution` (backend actual).
  const distributionRaw = data.distribution;
  const distribution = Array.isArray(distributionRaw)
    ? distributionRaw
    : (distributionRaw?.distribution || []);

  // `studentSummaries` ordenado por averageScore descendente (igual que la
  // tabla "Mis Alumnos", para evitar rankings divergentes — QA 2026-04-29).
  // Top 5 primeros, bottom 5 ultimos en orden ascendente para que el peor
  // aparezca primero en "Alumnos en Riesgo".
  const summaries = Array.isArray(data.studentSummaries) ? data.studentSummaries : [];
  const topStudents = data.topStudents || data.top || summaries.slice(0, 5);
  const bottomStudents = data.bottomStudents || data.bottom ||
    (summaries.length > 5 ? summaries.slice(-5).reverse() : []);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div>
        <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
          <BarChart3 size={14} className="text-brand-base" aria-hidden="true" />
          Resumen General
        </h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ReportKPI
            label="Puntuación Media"
            value={resolveAverageScoreValue(kpis)}
            suffix="%"
            icon={Award}
            ragColor={getScoreRAGColor(kpis.averageScore ?? kpis.avgScore)}
          />
          <ReportKPI
            label="Total Partidas"
            value={kpis.totalGames ?? kpis.gamesPlayed ?? 0}
            icon={BarChart3}
            ragColor="blue"
          />
          <ReportKPI
            label="Alumnos Activos"
            value={kpis.activeStudents ?? kpis.totalStudents ?? 0}
            icon={Users}
            ragColor="default"
          />
          <ReportKPI
            label="Tasa Completado"
            value={resolveCompletionRateValue(kpis)}
            suffix="%"
            icon={TrendingUp}
            ragColor="green"
          />
        </div>
      </div>

      {/* Distribution */}
      {distribution.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-text-primary mb-3">Distribución de Rendimiento</h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {distribution.map((tier) => (
              <div
                key={tier.range || tier.tier || tier.name || tier.label}
                className="rounded-lg border border-border-subtle bg-background-elevated/20 p-3 text-center"
              >
                <p className="text-lg font-bold text-text-primary tabular-nums">{tier.count ?? 0}</p>
                <p className="text-xs text-text-muted">{tier.label || tier.range || tier.tier || tier.name}</p>
                {tier.percentage != null && (
                  <p className="text-nano text-text-disabled mt-0.5">{Math.round(tier.percentage)}%</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top / Bottom students */}
      {(topStudents.length > 0 || bottomStudents.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {topStudents.length > 0 && (
            <StudentRankingList
              title="Mejores Alumnos"
              icon={TrendingUp}
              tone="success"
              students={topStudents}
            />
          )}
          {bottomStudents.length > 0 && (
            <StudentRankingList
              title="Alumnos en Riesgo"
              icon={AlertTriangle}
              tone="error"
              students={bottomStudents}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Vista del reporte individual.
 *
 * Adaptador sobre la forma `{ summary: { avgScore: { value }, accuracy: {value}, ... }, details }`
 * que devuelve `reportDataService.getStudentReport`. Los valores vienen anidados con RAG embebido
 * (p.ej. `summary.avgScore.value`), asi que normalizamos a numeros planos para el render.
 */
function StudentReportView({ data }) {
  if (!data) return null;

  const rawKpis = data.kpis || data.summary || {};

  // Normalizar: los campos del backend actual son objetos `{value, rag}`; los legacy/mocks son planos.
  const pickValue = field => {
    const v = rawKpis[field];
    if (v == null) return undefined;
    if (typeof v === 'object' && 'value' in v) return v.value;
    return v;
  };
  const kpis = {
    averageScore: pickValue('averageScore') ?? pickValue('avgScore'),
    totalGames: rawKpis.totalGames ?? rawKpis.gamesPlayed,
    bestScore: rawKpis.bestScore,
    accuracy: pickValue('accuracy'),
  };

  // `data.details` (formato detailed) agrupa strengths/weaknesses; `data.performance` era el legacy.
  const perfSource = data.performance || data.performanceSummary || data.details || {};
  // Score de un item de rendimiento sea cual sea su forma. El informe detallado
  // alimenta `performanceByContext` con la serie de `getStudentEvolution()`, cuyos
  // items NO tienen `average`/`value` sino la puntuación anidada en
  // `dataPoints[].avgScore`. Antes el filtro leía `p.average ?? p.value ?? 0` →
  // siempre 0 → "Fortalezas" vacío y "Áreas de Mejora" listaba TODOS los contextos.
  const itemScore = p => {
    if (Number.isFinite(p?.average)) return p.average;
    if (Number.isFinite(p?.value)) return p.value;
    if (Number.isFinite(p?.avgScore)) return p.avgScore;
    if (Array.isArray(p?.dataPoints) && p.dataPoints.length) {
      const vals = p.dataPoints.map(d => d.avgScore).filter(Number.isFinite);
      if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return 0;
  };
  const withScore = p => ({ ...p, average: Math.round(itemScore(p)) });
  const performance = {
    strengths:
      perfSource.strengths ||
      perfSource.performanceByContext?.filter(p => itemScore(p) >= 70).map(withScore) ||
      [],
    weaknesses:
      perfSource.weaknesses ||
      perfSource.struggles ||
      perfSource.performanceByContext?.filter(p => itemScore(p) < 50).map(withScore) ||
      [],
  };

  const recommendations = data.recommendations || [];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div>
        <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
          <User size={14} className="text-brand-base" aria-hidden="true" />
          Rendimiento Individual
        </h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ReportKPI
            label="Puntuación Media"
            value={kpis.averageScore != null ? Math.round(kpis.averageScore) : '-'}
            suffix="%"
            icon={Award}
            ragColor={getScoreRAGColor(kpis.averageScore)}
          />
          <ReportKPI
            label="Partidas Jugadas"
            value={kpis.totalGames ?? kpis.gamesPlayed ?? 0}
            icon={BarChart3}
            ragColor="blue"
          />
          <ReportKPI
            label="Mejor Puntuación"
            value={kpis.bestScore != null ? Math.round(kpis.bestScore) : '-'}
            suffix="%"
            icon={Award}
            ragColor="green"
          />
          <ReportKPI
            label="Tasa de Acierto"
            value={kpis.accuracy != null ? Math.round(kpis.accuracy) : '-'}
            suffix="%"
            icon={TrendingUp}
          />
        </div>
      </div>

      {/* Performance summary */}
      {(performance.strengths || performance.weaknesses) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {performance.strengths?.length > 0 && (
            <div className="rounded-xl border border-success-base/20 bg-success-base/5 p-4">
              <h4 className="text-sm font-bold text-success-base mb-2">Fortalezas</h4>
              <ul className="space-y-1">
                {performance.strengths.map(item => (
                  <li
                    key={getInsightKey(item, 'strength')}
                    className="text-xs text-text-secondary flex items-start gap-1.5"
                  >
                    <TrendingUp size={12} className="text-success-base mt-0.5 flex-shrink-0" aria-hidden="true" />
                    {typeof item === 'string' ? item : item.name || item.context || '—'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {performance.weaknesses?.length > 0 && (
            <div className="rounded-xl border border-error-base/20 bg-error-base/5 p-4">
              <h4 className="text-sm font-bold text-error-base mb-2">Áreas de Mejora</h4>
              <ul className="space-y-1">
                {performance.weaknesses.map(item => (
                  <li
                    key={getInsightKey(item, 'weakness')}
                    className="text-xs text-text-secondary flex items-start gap-1.5"
                  >
                    <AlertTriangle size={12} className="text-error-base mt-0.5 flex-shrink-0" aria-hidden="true" />
                    {typeof item === 'string' ? item : item.name || item.context || '—'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-text-primary mb-2">Recomendaciones</h4>
          <ul className="space-y-2">
            {recommendations.map(rec => (
              <li
                key={getRecommendationKey(rec)}
                className="text-xs text-text-secondary bg-background-elevated/30 rounded-lg border border-border-subtle px-3 py-2"
              >
                {typeof rec === 'string' ? rec : rec.message || rec.description || '—'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Generador de informes con formulario, vista previa y exportacion.
 * Obtiene sus propios datos de la API.
 *
 * Props (todas opcionales — el componente funciona standalone sin ellas):
 * @param {object} [initialDefaults] - { reportType, period, format } para pre-rellenar
 *   los dropdowns al aplicar una plantilla (T-942 Fase D).
 * @param {function} [onAfterGenerate] - Callback `(payload, meta)` invocado
 *   tras generación exitosa para que el padre persista el informe vía POST.
 * @param {function} [onPreviewMetaChange] - Callback `(meta)` invocado cuando
 *   el usuario cambia reportType/period/format en los dropdowns. Permite que
 *   el padre sincronice un sidebar de preview en tiempo real.
 */
// eslint-disable-next-line sonarjs/cyclomatic-complexity -- generador con múltiples estados (default/loading/error/resultados) × tipos de informe (aula/alumno) y dropdowns sincronizados con la preview
function ReportGenerator({
  initialDefaults,
  onAfterGenerate,
  onPreviewMetaChange,
  preloadedReport = null,
  preloadedMeta = null,
} = {}) {
  const { shouldReduceMotion } = useReducedMotion();
  const [reportType, setReportType] = useState(
    preloadedMeta?.reportType || initialDefaults?.reportType || 'classroom'
  );
  const [studentId, setStudentId] = useState('');
  const [period, setPeriod] = useState(
    preloadedMeta?.period || initialDefaults?.period || '30d'
  );
  const [format, setFormat] = useState(
    preloadedMeta?.format || initialDefaults?.format || 'summary'
  );

  // Cuando llega una nueva plantilla, sincronizamos los dropdowns y limpiamos
  // el informe en pantalla. El effect compara por valores primitivos para no
  // engancharse a la identidad del objeto (cada render del padre crea uno
  // nuevo si construye el literal inline).
   
  useEffect(() => {
    if (!initialDefaults) return;
    if (initialDefaults.reportType) setReportType(initialDefaults.reportType);
    if (initialDefaults.period) setPeriod(initialDefaults.period);
    if (initialDefaults.format) setFormat(initialDefaults.format);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps por campos primitivos a propósito: no re-ejecutar por la identidad del objeto initialDefaults (ver comentario arriba)
  }, [initialDefaults?.reportType, initialDefaults?.period, initialDefaults?.format]);

  // Caso "Reabrir": el padre nos pasa meta + payload del informe persistido.
  // Sincronizamos dropdowns para que el form refleje el informe en vista
  // (sin re-generar). preloadedReport se gestiona en el effect de abajo.
   
  useEffect(() => {
    if (!preloadedMeta) return;
    if (preloadedMeta.reportType) setReportType(preloadedMeta.reportType);
    if (preloadedMeta.period) setPeriod(preloadedMeta.period);
    if (preloadedMeta.format) setFormat(preloadedMeta.format);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps por campos primitivos a propósito: no re-ejecutar por la identidad del objeto preloadedMeta (ver comentario arriba)
  }, [preloadedMeta?.reportType, preloadedMeta?.period, preloadedMeta?.format]);

  // Notificar al padre cuando cambian los meta para que actualice su preview.
  useEffect(() => {
    onPreviewMetaChange?.({ reportType, period, format });
  }, [reportType, period, format, onPreviewMetaChange]);

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Si el padre nos pasa un informe ya generado (caso "Reabrir" desde
  // RecentReports), lo usamos como reportData inicial sin re-pedirlo. Si
  // cambia el preload (otro informe abierto), se reemplaza la vista actual.
  const [reportData, setReportData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (preloadedReport) {
      setReportData(preloadedReport);
      setError(null);
    }
  }, [preloadedReport]);

  const abortRef = useRef(null);
  const studentsAbortRef = useRef(null);

  // Fetch students list when report type changes to individual
  useEffect(() => {
    if (reportType !== 'student') return undefined;

    studentsAbortRef.current?.abort();
    const controller = new AbortController();
    studentsAbortRef.current = controller;

    const fetchStudents = async () => {
      try {
        setStudentsLoading(true);
        const data = await analyticsService.getClassroomStudents(
          { sort: 'name', order: 'asc' },
          { signal: controller.signal }
        );
        const list = data?.students || data || [];
        setStudents(list);
      } catch (err) {
        if (isAbortError(err)) return;
        captureException(err);
      } finally {
        if (!controller.signal.aborted) {
          setStudentsLoading(false);
        }
      }
    };

    fetchStudents();
    return () => controller.abort();
  }, [reportType]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      studentsAbortRef.current?.abort();
    };
  }, []);

  // Student options for the selector
  const studentOptions = useMemo(() => {
    return students.map(s => ({
      value: s._id || s.studentId || s.id,
      label: s.name || s.studentName || `Alumno ${s._id?.slice(-4) || ''}`,
    }));
  }, [students]);

  // Generate report
  const handleGenerate = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setGenerating(true);
      setError(null);
      setReportData(null);

      const params = { timeRange: period, format };
      let data;

      if (reportType === 'student') {
        if (!studentId) {
          setError('Selecciona un estudiante para generar el informe.');
          setGenerating(false);
          return;
        }
        data = await analyticsService.getStudentReport(studentId, params, {
          signal: controller.signal,
        });
      } else {
        data = await analyticsService.getClassroomReport(params, {
          signal: controller.signal,
        });
      }

      setReportData(data);
      // Toast de confirmacion: la preview aparece debajo del form y queda
      // fuera del viewport inicial; el toast asegura feedback inmediato
      // (QA 22/04/2026).
      toast.success('Informe generado', {
        description: 'Revisa la vista previa más abajo o exporta a CSV.'
      });

      // T-942 Fase D: notificar al padre con el payload generado para que
      // persista el informe en BD (POST /api/reports). Solo se invoca en
      // éxito. El padre construye `title` y opcionalmente `templateKey`.
      onAfterGenerate?.(data, {
        reportType,
        period,
        format,
        studentId: reportType === 'student' ? studentId : null,
        templateKey: initialDefaults?.templateKey || null
      });
    } catch (err) {
      if (isAbortError(err)) return;
      captureException(err);
      setError('No pudimos generar el informe. Inténtalo de nuevo.');
    } finally {
      if (!controller.signal.aborted) {
        setGenerating(false);
      }
    }
  }, [reportType, studentId, period, format, onAfterGenerate, initialDefaults?.templateKey]);

  // Export CSV
  const handleExportCSV = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await analyticsService.getClassroomExport(
        { timeRange: period },
        { signal: controller.signal }
      );

      // El backend devuelve `{ headers: ['Nombre', 'Aula', ...], rows: [['Daniel', 'Aula 1', ...], ...] }`
      // — `rows` es array de arrays, no de objetos. Tomamos `headers` del DTO para
      // construir tanto las cabeceras del CSV como las claves de cada fila. Si en el
      // futuro el endpoint devuelve array de objetos (mocks legacy), mantenemos el
      // fallback a `Object.keys(row[0])` (QA 2026-04-29 BUG export informe).
      const rawRows = data?.rows || data?.students || data || [];
      if (rawRows.length === 0) return;

      const headers = Array.isArray(data?.headers) && data.headers.length > 0
        ? data.headers
        : Object.keys(rawRows[0] || {});
      const rows = Array.isArray(rawRows[0])
        ? rawRows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])))
        : rawRows;
      const columns = headers.map(h => ({ key: h, label: h }));

      exportToCSV(rows, `informe-${reportType}-${period}`, columns);
    } catch (err) {
      if (isAbortError(err)) return;
      captureException(err);
    }
  }, [period, reportType]);

  // Print
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const canGenerate = reportType === 'classroom' || (reportType === 'student' && studentId);

  // En estado por defecto (sin informe generado / cargando / error) la card
  // "Generar" rellena su columna para alinearse con la vista previa lateral y no
  // dejar un hueco en blanco (QA 2026-06-04). Cuando hay resultados, la columna
  // crece con ellos y NO forzamos altura (evita romper ese layout).
  const fillColumn = !reportData && !generating && !error;

  return (
    <div className={cn('space-y-6', fillColumn && 'lg:h-full')}>
      {/* Form controls */}
      <GlassCard variant="default" className={cn(fillColumn && 'lg:flex lg:h-full lg:flex-col')}>
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <FileText size={20} className="text-brand-base" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-text-primary font-display">Generar Informe</h3>
            <p className="text-xs text-text-muted mt-0.5">Configura los parámetros del informe</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SelectPremium
            label="Tipo de informe"
            options={REPORT_TYPE_OPTIONS}
            value={reportType}
            onChange={(val) => {
              setReportType(val);
              setStudentId('');
              setReportData(null);
            }}
          />

          {reportType === 'student' && (
            <SelectPremium
              label="Estudiante"
              options={studentOptions}
              value={studentId}
              onChange={setStudentId}
              placeholder={studentsLoading ? 'Cargando...' : 'Seleccionar alumno'}
              disabled={studentsLoading}
            />
          )}

          <SelectPremium
            label="Período"
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
          />

          <SelectPremium
            label="Formato"
            options={FORMAT_OPTIONS}
            value={format}
            onChange={setFormat}
          />
        </div>

        <div className="mt-5 lg:mt-auto lg:pt-5 flex items-center gap-3">
          <ButtonPremium
            variant="primary"
            onClick={handleGenerate}
            loading={generating}
            disabled={!canGenerate}
            icon={<FileText size={18} />}
          >
            Generar Informe
          </ButtonPremium>

          {reportData && (
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: DURATION.stateChange, ease: EASING.outQuart }}
              className="flex items-center gap-2"
            >
              <ButtonPremium
                variant="secondary"
                size="sm"
                onClick={handleExportCSV}
                icon={<Download size={16} />}
              >
                Exportar CSV
              </ButtonPremium>
              <ButtonPremium
                variant="ghost"
                size="sm"
                onClick={handlePrint}
                icon={<Printer size={16} />}
              >
                Imprimir
              </ButtonPremium>
            </motion.div>
          )}
        </div>
      </GlassCard>

      {/* Error state */}
      {error && (
        <ErrorState
          title="Error en el informe"
          message={error}
          onRetry={handleGenerate}
        />
      )}

      {/* Loading state */}
      {generating && (
        <GlassCard variant="default">
          <div className="space-y-4">
            <SkeletonShimmer className="h-6 w-48" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map(i => (
                <SkeletonShimmer key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            <SkeletonShimmer variant="text" lines={4} />
          </div>
        </GlassCard>
      )}

      {/* Report preview */}
      <AnimatePresence mode="wait">
        {reportData && !generating && (
          <motion.div
            key="report-preview"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: DURATION.entrance, ease: EASING.outExpo }}
          >
            <GlassCard variant="solid">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-text-primary font-display">
                  Vista Previa del Informe
                </h3>
                <span className="text-xs text-text-muted px-2 py-1 rounded-lg bg-background-surface/50 border border-border-subtle">
                  {reportType === 'classroom' ? 'Clase completa' : 'Individual'}
                  {' \u2022 '}
                  {PERIOD_OPTIONS.find(p => p.value === period)?.label || period}
                </span>
              </div>

              {reportType === 'classroom' ? (
                <ClassroomReportView data={reportData} />
              ) : (
                <StudentReportView data={reportData} />
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

ReportGenerator.propTypes = {
  initialDefaults: PropTypes.shape({
    reportType: PropTypes.oneOf(['classroom', 'student']),
    period: PropTypes.oneOf(['7d', '30d', '90d']),
    format: PropTypes.oneOf(['summary', 'detailed']),
    templateKey: PropTypes.string,
  }),
  onAfterGenerate: PropTypes.func,
  onPreviewMetaChange: PropTypes.func,
  preloadedReport: PropTypes.object,
  preloadedMeta: PropTypes.shape({
    reportType: PropTypes.oneOf(['classroom', 'student']),
    period: PropTypes.oneOf(['7d', '30d', '90d']),
    format: PropTypes.oneOf(['summary', 'detailed']),
    title: PropTypes.string,
  }),
};

export default memo(ReportGenerator);
