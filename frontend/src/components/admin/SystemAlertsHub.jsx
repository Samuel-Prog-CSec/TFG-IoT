/**
 * @fileoverview Centro de alertas operativas para super_admin (T-942).
 *
 * Espejo de `AlertsHub.jsx` (alertas pedagógicas) reutilizando los
 * subcomponentes agnósticos (AlertStatusFilter, AlertBulkBar, EmptyState…)
 * y con un menú de acciones propio adaptado a escalas operativas (horas).
 *
 * @module components/admin/SystemAlertsHub
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { Filter } from 'lucide-react';
import { cn, listContainerVariants } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  SEVERITY_STYLES,
  SYSTEM_ALERT_TYPE_LABELS,
  SOURCE_STYLES,
  SYSTEM_ALERT_SOURCES
} from '../../constants/systemAlertTypes';
import GlassCard from '../ui/GlassCard';
import SelectPremium from '../ui/SelectPremium';
import SkeletonShimmer from '../ui/SkeletonShimmer';
import EmptyState from '../ui/EmptyState';
import { EmptyAlertsIllustration } from '../ui/illustrations';
import AlertStatusFilter from '../analytics/AlertStatusFilter';
import AlertBulkBar from '../analytics/AlertBulkBar';
import AlertHistoryModal from '../analytics/AlertHistoryModal';
import { useSystemAlertActions } from '../../hooks/useSystemAlertActions';
import systemAlertsService from '../../services/systemAlerts';
import SystemAlertCard from './SystemAlertCard';

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

const EMPTY_ALERTS = [];

function SystemAlertsHub({
  alerts = EMPTY_ALERTS,
  loading = false,
  statusFilter,
  onStatusChange,
  statusCounts = {},
  onRefetch
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [historyId, setHistoryId] = useState(null);

  const [localAlerts, setLocalAlerts] = useState(alerts);
  if (localAlerts !== alerts && alerts !== EMPTY_ALERTS) {
    setLocalAlerts(alerts);
  }

  const handleListChange = useCallback(updater => {
    setLocalAlerts(prev => updater(prev));
  }, []);

  const actions = useSystemAlertActions({ onListChange: handleListChange, onRefetch });

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

  const sourceOptions = useMemo(
    () => [
      { value: 'all', label: 'Todos los subsistemas' },
      ...SYSTEM_ALERT_SOURCES.map(src => ({
        value: src,
        label: SOURCE_STYLES[src]?.label || src
      }))
    ],
    []
  );

  const typeOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'Todos los tipos' }];
    for (const [value, label] of Object.entries(SYSTEM_ALERT_TYPE_LABELS)) {
      opts.push({ value, label });
    }
    return opts;
  }, []);

  const filteredAlerts = useMemo(() => {
    let result = localAlerts;
    if (severityFilter !== 'all') {
      result = result.filter(a => a.severity === severityFilter);
    }
    if (sourceFilter !== 'all') {
      result = result.filter(a => a.source === sourceFilter);
    }
    if (typeFilter !== 'all') {
      result = result.filter(a => a.type === typeFilter);
    }
    return result;
  }, [localAlerts, severityFilter, sourceFilter, typeFilter]);

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
      aria-label={`Alertas del sistema: ${severityCounts.critical} críticas, ${severityCounts.warning} advertencias, ${severityCounts.info} informativas`}
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
          options={sourceOptions}
          value={sourceFilter}
          onChange={setSourceFilter}
          placeholder="Subsistema"
          className="w-44"
        />
        <SelectPremium
          options={typeOptions}
          value={typeFilter}
          onChange={setTypeFilter}
          placeholder="Tipo"
          className="w-56"
        />
        {import.meta.env?.DEV && (
          <button
            type="button"
            onClick={async () => {
              try {
                await systemAlertsService.runDetectionNow();
                onRefetch?.();
              } catch {
                // El controller responde 403 en producción — no rompe.
              }
            }}
            className={cn(
              'ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
              // BUG-A11Y-FORCE-DETECT-BTN (QA Sprint 0): text-brand-base
              // sobre brand/10 light daba 4.42. brand-light dark + brand-dark light.
              'bg-brand-base/10 text-brand-on-alpha border border-brand-base/30 hover:bg-brand-base/20'
            )}
            title="Solo disponible en desarrollo"
          >
            Forzar detección
          </button>
        )}
      </div>

      {filteredAlerts.length === 0 &&
        (() => {
          const hasFilter =
            severityFilter !== 'all' || sourceFilter !== 'all' || typeFilter !== 'all';
          if (hasFilter) {
            return (
              <EmptyState
                variant="filtered"
                title="Ninguna alerta coincide con los filtros"
                description="Ajusta los filtros o límpialos para verlas todas."
                titleLevel="h3"
              />
            );
          }
          const emptyTitles = {
            resolved: 'Aún no se ha resuelto ninguna alerta',
            dismissed: 'No se ha descartado ninguna alerta',
            snoozed: 'No hay alertas en pausa'
          };
          return (
            <EmptyState
              illustration={<EmptyAlertsIllustration size={140} />}
              title={emptyTitles[statusFilter] || 'Sistema sin alertas'}
              description={
                statusFilter && statusFilter !== 'active'
                  ? 'Aquí aparecerán cuando cambies de filtro.'
                  : 'No se detectan incidencias operativas en este momento.'
              }
              titleLevel="h3"
            />
          );
        })()}

      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {filteredAlerts.length === 0
          ? 'Sin alertas'
          : `${filteredAlerts.length} alertas del sistema`}
      </div>

      {filteredAlerts.length > 0 && (
        <motion.div
          variants={shouldReduceMotion ? {} : listContainerVariants(0.04)}
          initial={shouldReduceMotion ? false : 'hidden'}
          animate="visible"
          className="space-y-2"
        >
          <AnimatePresence mode="popLayout">
            {filteredAlerts.map(alert => (
              <SystemAlertCard
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
          actions.bulkSnooze(selectedAlerts, { untilHours: 24 });
          setSelectedIds(new Set());
        }}
        onClear={() => setSelectedIds(new Set())}
      />

      <AlertHistoryModal alertId={historyId} onClose={() => setHistoryId(null)} />

      { }
      <GlassCard variant="subtle" padding="sm" className="text-micro text-text-muted">
        Las alertas del sistema se detectan automáticamente cada pocos minutos. Si descartas una
        crítica y la condición se mantiene, volverá a aparecer pasadas unas horas.
      </GlassCard>
    </section>
  );
}

SystemAlertsHub.propTypes = {
  alerts: PropTypes.array,
  loading: PropTypes.bool,
  statusFilter: PropTypes.string,
  onStatusChange: PropTypes.func,
  statusCounts: PropTypes.object,
  onRefetch: PropTypes.func
};

export default memo(SystemAlertsHub);
