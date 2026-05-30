/**
 * @fileoverview Centro de alertas inteligentes con lifecycle completo (T-941).
 *
 * Funcionalidad:
 *  - Filtros por estado (Activas / Snoozed / Resueltas / Descartadas) — STATUS_ORDER.
 *  - Filtros adicionales por severidad y tipo.
 *  - Acciones lifecycle (dismiss con undo / resolve / snooze / pin / history).
 *  - Bulk selection con barra flotante.
 *  - Severity escalation visible (badge "Lleva Nd").
 *  - Pinning con borde dorado.
 *  - aria-live="polite" para anunciar cambios a lectores de pantalla.
 *  - DRY: constantes desde `constants/alertTypes.js`.
 */

import { memo, useMemo, useState, useCallback } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { AlertTriangle, ChevronRight, Filter, User, Layers } from 'lucide-react';
import { cn, listContainerVariants, listItemVariants } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { formatRelativeTime } from '../../lib/dateUtils';
import {
  ALERT_TYPE_ICONS,
  ALERT_TYPE_LABELS,
  SEVERITY_STYLES,
  PIN_ICON
} from '../../constants/alertTypes';
import GlassCard from '../ui/GlassCard';
import SelectPremium from '../ui/SelectPremium';
import SkeletonShimmer from '../ui/SkeletonShimmer';
import EmptyState from '../ui/EmptyState';
import { EmptyAlertsIllustration } from '../ui/illustrations';
import AlertStatusFilter from './AlertStatusFilter';
import AlertActionsMenu from './AlertActionsMenu';
import EscalationBadge from './EscalationBadge';
import AlertBulkBar from './AlertBulkBar';
import AlertHistoryModal from './AlertHistoryModal';
import { useAlertActions } from '../../hooks/useAlertActions';

function SeverityCounter({ severity, count }) {
  const style = SEVERITY_STYLES[severity] || SEVERITY_STYLES.info;
  const SeverityIcon = style.Icon;
  return (
    <div
      className={cn(
        'rounded-xl border px-4 py-3 flex items-center gap-3',
        style.bg,
        style.border
      )}
    >
      <div
        className={cn(
          'size-8 rounded-lg flex items-center justify-center flex-shrink-0',
          style.bg,
          style.text
        )}
      >
        <SeverityIcon size={16} aria-hidden="true" />
      </div>
      <div>
        <p className={cn('text-xl font-bold tabular-nums font-display', style.text)}>{count}</p>
        <p className="text-xs text-text-muted font-medium">{style.label}</p>
      </div>
    </div>
  );
}

SeverityCounter.propTypes = {
  severity: PropTypes.string,
  count: PropTypes.number
};

function AlertCard({
  alert,
  shouldReduceMotion,
  selected,
  selectable,
  onToggleSelect,
  actions
}) {
  const navigate = useNavigate();
  const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
  const TypeIcon = ALERT_TYPE_ICONS[alert.type] || AlertTriangle;
  const typeLabel = ALERT_TYPE_LABELS[alert.type] || alert.type;
  const isPositive = alert.severity === 'info';
  const isCritical = alert.severity === 'critical';
  const isInactive = alert.status === 'dismissed' || alert.status === 'resolved';

  const handleOpenProfile = () => {
    if (alert.studentId) navigate(`/students/${alert.studentId}`);
  };
  const handleKeyDown = e => {
    if ((e.key === 'Enter' || e.key === ' ') && alert.studentId) {
      e.preventDefault();
      handleOpenProfile();
    }
  };

  return (
    <motion.div
      variants={shouldReduceMotion ? {} : listItemVariants}
      whileHover={shouldReduceMotion || isInactive ? undefined : { y: -2, scale: 1.005 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      role={alert.studentId ? 'group' : undefined}
      aria-label={`Alerta ${typeLabel} de ${alert.studentName || 'alumno'}`}
      className={cn(
        'group rounded-xl border p-4 transition-[border-color,background-color,box-shadow] duration-200',
        'bg-background-elevated/40 hover:bg-background-elevated/60',
        'border-border-subtle hover:border-border-default',
        'focus-within:ring-1 focus-within:ring-brand-base/40',
        isInactive && 'opacity-60',
        alert.pinned &&
          'ring-1 ring-amber-400/40 shadow-[0_0_10px_rgba(251,191,36,0.18)]',
        isCritical &&
          !isInactive &&
          'animate-pulse-glow shadow-[0_0_18px_var(--color-error-glow)]'
      )}
    >
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Seleccionar alerta de ${alert.studentName || 'alumno'}`}
            className="mt-1 size-4 cursor-pointer accent-brand-base"
            onClick={e => e.stopPropagation()}
          />
        )}

        <div
          className={cn(
            'size-2.5 rounded-full mt-1.5 flex-shrink-0',
            severity.dot,
            isCritical
              ? 'shadow-[0_0_10px_var(--color-error-glow)]'
              : severity.glow
          )}
        />

        <div
          className={cn(
            'p-1.5 rounded-lg flex-shrink-0',
            isPositive
              ? 'bg-success-base/10 text-success-base'
              : `${severity.bg} ${severity.text}`
          )}
        >
          <TypeIcon size={16} aria-hidden="true" />
        </div>

        <div
          className={cn(
            'flex-1 min-w-0',
            alert.studentId && !isInactive && 'cursor-pointer'
          )}
          role={alert.studentId && !isInactive ? 'button' : undefined}
          tabIndex={alert.studentId && !isInactive ? 0 : undefined}
          onClick={alert.studentId && !isInactive ? handleOpenProfile : undefined}
          onKeyDown={alert.studentId && !isInactive ? handleKeyDown : undefined}
        >
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-semibold text-text-primary truncate">
              {alert.studentName || 'Alumno'}
            </span>
            <span
              className={cn(
                'text-nano font-medium px-1.5 py-0.5 rounded-md flex-shrink-0',
                isPositive
                  ? 'bg-success-base/10 text-success-base'
                  : `${severity.bg} ${severity.text}`
              )}
            >
              {typeLabel}
            </span>
            {alert.pinned && (
              <PIN_ICON size={11} className="text-amber-400" aria-label="Fijada" />
            )}
            <EscalationBadge
              daysActive={alert.daysActive}
              isEscalated={alert.isEscalated}
            />
          </div>
          <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
            {alert.description || alert.message || typeLabel}
          </p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-nano text-text-disabled">
              {formatRelativeTime(alert.detectedAt || alert.createdAt)}
              {alert.status === 'snoozed' && alert.snoozedUntil && (
                <span className="ml-2 text-info-base font-medium">
                  · En pausa hasta{' '}
                  {new Date(alert.snoozedUntil).toLocaleDateString('es-ES')}
                </span>
              )}
              {alert.status === 'dismissed' && (
                <span className="ml-2 text-text-muted">
                  · Descartada
                  {alert.dismissedByName ? ` por ${alert.dismissedByName}` : ''}
                </span>
              )}
              {alert.status === 'resolved' && (
                <span className="ml-2 text-success-base font-medium">
                  · Resuelta
                  {alert.resolvedAutomatically ? ' automáticamente' : ' manualmente'}
                </span>
              )}
            </span>
            {alert.studentId && !isInactive && (
              <ChevronRight
                size={14}
                className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        {actions && (
          <div className="flex-shrink-0">
            <AlertActionsMenu alert={alert} {...actions} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

AlertCard.propTypes = {
  alert: PropTypes.object.isRequired,
  shouldReduceMotion: PropTypes.bool,
  selected: PropTypes.bool,
  selectable: PropTypes.bool,
  onToggleSelect: PropTypes.func,
  actions: PropTypes.object
};

const EMPTY_ALERTS = [];

function AlertsHub({
  alerts = EMPTY_ALERTS,
  loading = false,
  statusFilter,
  onStatusChange,
  statusCounts = {},
  onRefetch
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('none');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [historyId, setHistoryId] = useState(null);

  // Estado local (necesario para optimistic updates de useAlertActions)
  const [localAlerts, setLocalAlerts] = useState(alerts);
  // Re-sincronizar con prop cuando cambia desde fuera
  if (localAlerts !== alerts && alerts !== EMPTY_ALERTS) {
     
    setLocalAlerts(alerts);
  }

  const handleListChange = useCallback(updater => {
    setLocalAlerts(prev => updater(prev));
  }, []);

  const actions = useAlertActions({ onListChange: handleListChange, onRefetch });

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 };
    for (const alert of localAlerts) {
      const sev = alert.severity || 'info';
      if (counts[sev] !== undefined) counts[sev] += 1;
    }
    return counts;
  }, [localAlerts]);

  const severityOptions = useMemo(
    () => [
      { value: 'all', label: 'Todas las severidades' },
      { value: 'critical', label: `Críticas (${severityCounts.critical})` },
      { value: 'warning', label: `Advertencia (${severityCounts.warning})` },
      { value: 'info', label: `Info (${severityCounts.info})` }
    ],
    [severityCounts]
  );

  const typeOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'Todos los tipos' }];
    for (const [value, label] of Object.entries(ALERT_TYPE_LABELS)) {
      opts.push({ value, label });
    }
    return opts;
  }, []);

  const filteredAlerts = useMemo(() => {
    let result = localAlerts;
    if (severityFilter !== 'all') {
      result = result.filter(a => a.severity === severityFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter(a => a.type === typeFilter);
    }
    return result;
  }, [localAlerts, severityFilter, typeFilter]);

  const groupedAlerts = useMemo(() => {
    if (groupBy === 'none') return null;
    const groups = {};
    for (const alert of filteredAlerts) {
      const key =
        groupBy === 'student'
          ? alert.studentName || alert.studentId || 'Sin alumno'
          : ALERT_TYPE_LABELS[alert.type] || alert.type || 'Otro';
      if (!groups[key]) groups[key] = [];
      groups[key].push(alert);
    }
    return groups;
  }, [filteredAlerts, groupBy]);

  const handleGroupChange = useCallback(mode => {
    setGroupBy(prev => (prev === mode ? 'none' : mode));
  }, []);

  const handleToggleSelect = useCallback(alertId => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(alertId)) next.delete(alertId);
      else next.add(alertId);
      return next;
    });
  }, []);

  const selectedAlerts = useMemo(
    () => filteredAlerts.filter(a => selectedIds.has(a.id)),
    [filteredAlerts, selectedIds]
  );

  const selectable = statusFilter === 'active' || !statusFilter;

  const itemActions = selectable
    ? {
        onResolve: actions.resolveAlert,
        onDismiss: a => actions.dismissWithUndo(a),
        onSnooze: actions.snoozeAlert,
        onPin: actions.pinAlert,
        onUnpin: actions.unpinAlert,
        onHistory: a => setHistoryId(a.id)
      }
    : { onHistory: a => setHistoryId(a.id) };

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
    <section
      className="space-y-5"
      aria-label={`Centro de alertas: ${severityCounts.critical} críticas, ${severityCounts.warning} advertencias, ${severityCounts.info} informativas`}
    >
      {onStatusChange && (
        <AlertStatusFilter
          value={statusFilter || 'active'}
          onChange={onStatusChange}
          counts={statusCounts}
        />
      )}

      <div className="grid grid-cols-3 gap-3" role="group" aria-label="Resumen por severidad">
        <SeverityCounter severity="critical" count={severityCounts.critical} />
        <SeverityCounter severity="warning" count={severityCounts.warning} />
        <SeverityCounter severity="info" count={severityCounts.info} />
      </div>

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
          className="w-56"
        />
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

      {filteredAlerts.length === 0 &&
        (() => {
          const hasFilter = severityFilter !== 'all' || typeFilter !== 'all';
          if (hasFilter) {
            return (
              <EmptyState
                variant="filtered"
                title="Ninguna alerta coincide con los filtros"
                description="Ajusta los filtros para ver otras alertas o límpialos para verlas todas."
                titleLevel="h3"
              />
            );
          }
          const emptyTitles = {
            resolved: 'Aún no se han resuelto alertas',
            dismissed: 'No has descartado ninguna alerta',
            snoozed: 'No hay alertas en pausa'
          };
          return (
            <EmptyState
              illustration={<EmptyAlertsIllustration size={140} />}
              title={emptyTitles[statusFilter] || 'Sin alertas activas'}
              description={
                statusFilter && statusFilter !== 'active'
                  ? 'Aquí aparecerán cuando cambies de filtro.'
                  : 'Todos los alumnos están dentro de los parámetros esperados.'
              }
              titleLevel="h3"
            />
          );
        })()}

      {/* aria-live para anunciar cambios a screen readers */}
      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {filteredAlerts.length === 0
          ? 'Sin alertas'
          : `${filteredAlerts.length} alertas`}
      </div>

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
                <AnimatePresence mode="popLayout">
                  {groupAlertsList.map(alert => (
                    <AlertCard
                      key={alert.id || alert._id}
                      alert={alert}
                      shouldReduceMotion={shouldReduceMotion}
                      selectable={selectable}
                      selected={selectedIds.has(alert.id)}
                      onToggleSelect={() => handleToggleSelect(alert.id)}
                      actions={itemActions}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            </GlassCard>
          ))}
        </div>
      )}

      {filteredAlerts.length > 0 && !groupedAlerts && (
        <motion.div
          variants={shouldReduceMotion ? {} : listContainerVariants(0.04)}
          initial={shouldReduceMotion ? false : 'hidden'}
          animate="visible"
          className="space-y-2"
        >
          <AnimatePresence mode="popLayout">
            {filteredAlerts.map(alert => (
              <AlertCard
                key={alert.id || alert._id}
                alert={alert}
                shouldReduceMotion={shouldReduceMotion}
                selectable={selectable}
                selected={selectedIds.has(alert.id)}
                onToggleSelect={() => handleToggleSelect(alert.id)}
                actions={itemActions}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AlertBulkBar
        count={selectedAlerts.length}
        onDismissAll={() => {
          actions.bulkDismiss(selectedAlerts);
          setSelectedIds(new Set());
        }}
        onSnoozeAll={() => {
          actions.bulkSnooze(selectedAlerts, { untilDays: 7 });
          setSelectedIds(new Set());
        }}
        onClear={() => setSelectedIds(new Set())}
      />

      <AlertHistoryModal alertId={historyId} onClose={() => setHistoryId(null)} />
    </section>
  );
}

AlertsHub.propTypes = {
  alerts: PropTypes.array,
  loading: PropTypes.bool,
  statusFilter: PropTypes.string,
  onStatusChange: PropTypes.func,
  statusCounts: PropTypes.object,
  onRefetch: PropTypes.func
};

export default memo(AlertsHub);
