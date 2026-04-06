import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { cn, DURATION, EASING, exportToCSV } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import analyticsService from '../../services/analytics';
import { isAbortError } from '../../services/api';
import { captureException } from '../../lib/sentry';
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
  { value: '7d', label: 'Ultimos 7 dias' },
  { value: '30d', label: 'Ultimos 30 dias' },
  { value: '90d', label: 'Ultimos 90 dias' },
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

/**
 * Vista del reporte de clase.
 */
function ClassroomReportView({ data }) {
  if (!data) return null;

  const kpis = data.kpis || data.summary || {};
  const distribution = data.distribution || [];
  const topStudents = data.topStudents || data.top || [];
  const bottomStudents = data.bottomStudents || data.bottom || [];

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
            label="Puntuacion Media"
            value={kpis.averageScore != null ? Math.round(kpis.averageScore) : kpis.avgScore}
            suffix="%"
            icon={Award}
            ragColor={getScoreRAGColor(kpis.averageScore)}
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
            value={kpis.completionRate != null ? Math.round(kpis.completionRate) : '-'}
            suffix="%"
            icon={TrendingUp}
            ragColor="green"
          />
        </div>
      </div>

      {/* Distribution */}
      {distribution.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-text-primary mb-3">Distribucion de Rendimiento</h4>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {distribution.map((tier) => (
              <div
                key={tier.range || tier.tier || tier.name}
                className="rounded-lg border border-border-subtle bg-background-elevated/20 p-3 text-center"
              >
                <p className="text-lg font-bold text-text-primary tabular-nums">{tier.count ?? 0}</p>
                <p className="text-xs text-text-muted">{tier.range || tier.tier || tier.name}</p>
                {tier.percentage != null && (
                  <p className="text-[10px] text-text-disabled mt-0.5">{Math.round(tier.percentage)}%</p>
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
            <div>
              <h4 className="text-sm font-bold text-success-base mb-2 flex items-center gap-1.5">
                <TrendingUp size={14} aria-hidden="true" />
                Mejores Alumnos
              </h4>
              <div className="space-y-1.5">
                {topStudents.slice(0, 5).map((s, idx) => (
                  <div
                    key={s._id || s.studentId || idx}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-success-base/5 border border-success-base/10"
                  >
                    <span className="text-sm text-text-primary truncate">{s.name || s.studentName || `Alumno ${idx + 1}`}</span>
                    <span className="text-sm font-bold text-success-base tabular-nums">
                      {Math.round(s.averageScore ?? s.score ?? 0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {bottomStudents.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-error-base mb-2 flex items-center gap-1.5">
                <AlertTriangle size={14} aria-hidden="true" />
                Alumnos en Riesgo
              </h4>
              <div className="space-y-1.5">
                {bottomStudents.slice(0, 5).map((s, idx) => (
                  <div
                    key={s._id || s.studentId || idx}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-error-base/5 border border-error-base/10"
                  >
                    <span className="text-sm text-text-primary truncate">{s.name || s.studentName || `Alumno ${idx + 1}`}</span>
                    <span className="text-sm font-bold text-error-base tabular-nums">
                      {Math.round(s.averageScore ?? s.score ?? 0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Vista del reporte individual.
 */
function StudentReportView({ data }) {
  if (!data) return null;

  const kpis = data.kpis || data.summary || {};
  const performance = data.performance || data.performanceSummary || {};
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
            label="Puntuacion Media"
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
            label="Mejor Puntuacion"
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
                {performance.strengths.map((item, idx) => (
                  <li key={idx} className="text-xs text-text-secondary flex items-start gap-1.5">
                    <TrendingUp size={12} className="text-success-base mt-0.5 flex-shrink-0" aria-hidden="true" />
                    {typeof item === 'string' ? item : item.name || item.context || 'N/A'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {performance.weaknesses?.length > 0 && (
            <div className="rounded-xl border border-error-base/20 bg-error-base/5 p-4">
              <h4 className="text-sm font-bold text-error-base mb-2">Areas de Mejora</h4>
              <ul className="space-y-1">
                {performance.weaknesses.map((item, idx) => (
                  <li key={idx} className="text-xs text-text-secondary flex items-start gap-1.5">
                    <AlertTriangle size={12} className="text-error-base mt-0.5 flex-shrink-0" aria-hidden="true" />
                    {typeof item === 'string' ? item : item.name || item.context || 'N/A'}
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
            {recommendations.map((rec, idx) => (
              <li
                key={idx}
                className="text-xs text-text-secondary bg-background-elevated/30 rounded-lg border border-border-subtle px-3 py-2"
              >
                {typeof rec === 'string' ? rec : rec.message || rec.description || 'N/A'}
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
 */
function ReportGenerator() {
  const { shouldReduceMotion } = useReducedMotion();
  const [reportType, setReportType] = useState('classroom');
  const [studentId, setStudentId] = useState('');
  const [period, setPeriod] = useState('30d');
  const [format, setFormat] = useState('summary');

  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);

  const [reportData, setReportData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const studentsAbortRef = useRef(null);

  // Fetch students list when report type changes to individual
  useEffect(() => {
    if (reportType !== 'student') return;

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
    } catch (err) {
      if (isAbortError(err)) return;
      captureException(err);
      setError('Error al generar el informe. Intenta de nuevo.');
    } finally {
      if (!controller.signal.aborted) {
        setGenerating(false);
      }
    }
  }, [reportType, studentId, period, format]);

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

      const rows = data?.rows || data?.students || data || [];
      if (rows.length === 0) return;

      const sampleKeys = Object.keys(rows[0]);
      const columns = sampleKeys.map(key => ({ key, label: key }));
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

  return (
    <div className="space-y-6">
      {/* Form controls */}
      <GlassCard variant="default">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <FileText size={20} className="text-brand-base" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-primary font-display">Generar Informe</h3>
            <p className="text-xs text-text-muted mt-0.5">Configura los parametros del reporte</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SelectPremium
            label="Tipo de reporte"
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
            label="Periodo"
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

        <div className="mt-5 flex items-center gap-3">
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
                <h3 className="text-base font-bold text-text-primary font-display">
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

export default memo(ReportGenerator);
