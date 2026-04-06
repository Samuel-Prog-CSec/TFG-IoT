import { memo, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  TrendingDown,
  Clock,
  AlertTriangle,
  Pause,
  TrendingUp,
  Minus,
  XCircle,
  CheckCircle2,
  Filter,
  User,
  Layers,
} from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, listContainerVariants, listItemVariants, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from '../ui/GlassCard';
import SelectPremium from '../ui/SelectPremium';
import SkeletonShimmer from '../ui/SkeletonShimmer';

/**
 * Mapeo de tipo de alerta a icono de Lucide.
 */
const ALERT_TYPE_ICONS = {
  declining_performance: TrendingDown,
  inactivity: Clock,
  sudden_score_drop: AlertTriangle,
  consistent_timeout: Pause,
  improving_fast: TrendingUp,
  plateau_detected: Minus,
  high_abandonment: XCircle,
};

/**
 * Etiquetas en espanol para cada tipo de alerta.
 */
const ALERT_TYPE_LABELS = {
  declining_performance: 'Caida de rendimiento',
  inactivity: 'Inactividad',
  sudden_score_drop: 'Caida brusca',
  consistent_timeout: 'Timeouts frecuentes',
  improving_fast: 'Mejora rapida',
  plateau_detected: 'Estancamiento',
  high_abandonment: 'Alto abandono',
};

/**
 * Estilos por severidad.
 */
const SEVERITY_STYLES = {
  critical: {
    dot: 'bg-error-base',
    glow: 'shadow-[0_0_6px_var(--color-error-glow)]',
    bg: 'bg-error-base/10',
    border: 'border-error-base/30',
    text: 'text-error-base',
    label: 'Criticas',
  },
  warning: {
    dot: 'bg-warning-base',
    glow: 'shadow-[0_0_6px_var(--color-warning-glow)]',
    bg: 'bg-warning-base/10',
    border: 'border-warning-base/30',
    text: 'text-warning-base',
    label: 'Warning',
  },
  info: {
    dot: 'bg-info-base',
    glow: 'shadow-[0_0_6px_var(--color-info-glow)]',
    bg: 'bg-info-base/10',
    border: 'border-info-base/30',
    text: 'text-info-base',
    label: 'Info',
  },
};

/**
 * Formatea una fecha como texto relativo.
 */
function formatRelativeDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Hace un momento';
  if (diffMins < 60) return `Hace ${diffMins}min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/**
 * Tarjeta de contador de severidad.
 */
function SeverityCounter({ severity, count }) {
  const style = SEVERITY_STYLES[severity] || SEVERITY_STYLES.info;

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3 flex items-center gap-3',
      style.bg, style.border
    )}>
      <div className={cn('size-3 rounded-full flex-shrink-0', style.dot, style.glow)} />
      <div>
        <p className={cn('text-xl font-bold tabular-nums font-display', style.text)}>
          {count}
        </p>
        <p className="text-xs text-text-muted font-medium">{style.label}</p>
      </div>
    </div>
  );
}

/**
 * Tarjeta individual de alerta.
 */
function AlertCard({ alert, shouldReduceMotion }) {
  const navigate = useNavigate();
  const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
  const TypeIcon = ALERT_TYPE_ICONS[alert.type] || AlertTriangle;
  const typeLabel = ALERT_TYPE_LABELS[alert.type] || alert.type;
  const isPositive = alert.type === 'improving_fast';

  return (
    <motion.div
      variants={shouldReduceMotion ? {} : listItemVariants}
      className={cn(
        'rounded-xl border p-4 transition-colors duration-200',
        'bg-background-elevated/40 hover:bg-background-elevated/60',
        'border-border-subtle hover:border-border-default',
        'focus-within:ring-1 focus-within:ring-brand-base/40'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Severity dot */}
        <div className={cn('size-2.5 rounded-full mt-1.5 flex-shrink-0', severity.dot, severity.glow)} />

        {/* Icon */}
        <div className={cn(
          'p-1.5 rounded-lg flex-shrink-0',
          isPositive ? 'bg-success-base/10 text-success-base' : `${severity.bg} ${severity.text}`
        )}>
          <TypeIcon size={16} aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-text-primary truncate">
              {alert.studentName || 'Alumno'}
            </span>
            <span className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-md flex-shrink-0',
              isPositive ? 'bg-success-base/10 text-success-base' : `${severity.bg} ${severity.text}`
            )}>
              {typeLabel}
            </span>
          </div>
          <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
            {alert.description || alert.message || typeLabel}
          </p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-text-disabled">
              {formatRelativeDate(alert.createdAt || alert.detectedAt)}
            </span>
            {alert.studentId && (
              <button
                type="button"
                onClick={() => navigate(`/students/${alert.studentId}`)}
                className="text-[10px] font-medium text-brand-base hover:text-brand-light transition-colors"
              >
                Ver perfil
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Hub completo de alertas inteligentes con filtros, contadores y agrupacion.
 *
 * @param {Object} props
 * @param {Array} props.alerts - Array de alertas del API
 * @param {boolean} props.loading - Estado de carga
 */
function AlertsHub({ alerts = [], loading = false }) {
  const { shouldReduceMotion } = useReducedMotion();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('none');

  // Contadores por severidad
  const severityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const alert of alerts) {
      const sev = alert.severity || 'info';
      if (counts[sev] !== undefined) {
        counts[sev]++;
      }
    }
    return counts;
  }, [alerts]);

  // Opciones de filtro
  const severityOptions = useMemo(() => [
    { value: 'all', label: 'Todas' },
    { value: 'critical', label: `Criticas (${severityCounts.critical})` },
    { value: 'warning', label: `Warning (${severityCounts.warning})` },
    { value: 'info', label: `Info (${severityCounts.info})` },
  ], [severityCounts]);

  const typeOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'Todos los tipos' }];
    for (const [value, label] of Object.entries(ALERT_TYPE_LABELS)) {
      opts.push({ value, label });
    }
    return opts;
  }, []);

  // Alertas filtradas
  const filteredAlerts = useMemo(() => {
    let result = alerts;
    if (severityFilter !== 'all') {
      result = result.filter(a => a.severity === severityFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter(a => a.type === typeFilter);
    }
    return result;
  }, [alerts, severityFilter, typeFilter]);

  // Alertas agrupadas
  const groupedAlerts = useMemo(() => {
    if (groupBy === 'none') return null;

    const groups = {};
    for (const alert of filteredAlerts) {
      const key = groupBy === 'student'
        ? (alert.studentName || alert.studentId || 'Sin alumno')
        : (ALERT_TYPE_LABELS[alert.type] || alert.type || 'Otro');
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(alert);
    }
    return groups;
  }, [filteredAlerts, groupBy]);

  const handleGroupChange = useCallback((mode) => {
    setGroupBy(prev => prev === mode ? 'none' : mode);
  }, []);

  // Skeleton loading
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <SkeletonShimmer key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map(i => (
            <SkeletonShimmer key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Severity counters */}
      <div className="grid grid-cols-3 gap-3">
        <SeverityCounter severity="critical" count={severityCounts.critical} />
        <SeverityCounter severity="warning" count={severityCounts.warning} />
        <SeverityCounter severity="info" count={severityCounts.info} />
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-text-muted">
          <Filter size={14} aria-hidden="true" />
          <span className="text-xs font-medium">Filtros:</span>
        </div>
        <SelectPremium
          options={severityOptions}
          value={severityFilter}
          onChange={setSeverityFilter}
          placeholder="Severidad"
          className="w-44"
        />
        <SelectPremium
          options={typeOptions}
          value={typeFilter}
          onChange={setTypeFilter}
          placeholder="Tipo"
          className="w-52"
        />

        {/* Grouping toggle */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => handleGroupChange('student')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
              groupBy === 'student'
                ? 'bg-brand-base/20 text-brand-base border border-brand-base/30'
                : 'bg-background-elevated/50 text-text-muted border border-border-subtle hover:text-text-secondary'
            )}
          >
            <User size={12} aria-hidden="true" />
            Por alumno
          </button>
          <button
            type="button"
            onClick={() => handleGroupChange('type')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
              groupBy === 'type'
                ? 'bg-brand-base/20 text-brand-base border border-brand-base/30'
                : 'bg-background-elevated/50 text-text-muted border border-border-subtle hover:text-text-secondary'
            )}
          >
            <Layers size={12} aria-hidden="true" />
            Por tipo
          </button>
        </div>
      </div>

      {/* Empty state */}
      {filteredAlerts.length === 0 && (
        <GlassCard variant="default" className="text-center py-8">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-success-base/10">
            <CheckCircle2 size={24} className="text-success-base" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-success-base">Sin alertas activas</p>
          <p className="text-xs text-text-muted mt-1">
            Todos los alumnos estan dentro de los parametros esperados.
          </p>
        </GlassCard>
      )}

      {/* Grouped view */}
      {filteredAlerts.length > 0 && groupedAlerts && (
        <div className="space-y-4">
          {Object.entries(groupedAlerts).map(([groupName, groupAlertsList]) => (
            <GlassCard key={groupName} variant="subtle" padding="sm">
              <h4 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
                {groupBy === 'student' ? (
                  <User size={14} className="text-brand-base" aria-hidden="true" />
                ) : (
                  <Layers size={14} className="text-brand-base" aria-hidden="true" />
                )}
                {groupName}
                <span className="text-xs text-text-muted font-normal">
                  ({groupAlertsList.length})
                </span>
              </h4>
              <motion.div
                variants={shouldReduceMotion ? {} : listContainerVariants(0.04)}
                initial={shouldReduceMotion ? false : 'hidden'}
                animate="visible"
                className="space-y-2"
              >
                {groupAlertsList.map((alert, idx) => (
                  <AlertCard
                    key={alert._id || alert.id || idx}
                    alert={alert}
                    shouldReduceMotion={shouldReduceMotion}
                  />
                ))}
              </motion.div>
            </GlassCard>
          ))}
        </div>
      )}

      {/* Flat list */}
      {filteredAlerts.length > 0 && !groupedAlerts && (
        <motion.div
          variants={shouldReduceMotion ? {} : listContainerVariants(0.04)}
          initial={shouldReduceMotion ? false : 'hidden'}
          animate="visible"
          className="space-y-2"
        >
          {filteredAlerts.map((alert, idx) => (
            <AlertCard
              key={alert._id || alert.id || idx}
              alert={alert}
              shouldReduceMotion={shouldReduceMotion}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}

AlertsHub.propTypes = {
  alerts: PropTypes.array,
  loading: PropTypes.bool,
};

export default memo(AlertsHub);
