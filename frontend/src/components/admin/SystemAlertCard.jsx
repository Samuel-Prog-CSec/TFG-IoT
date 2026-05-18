/**
 * @fileoverview Tarjeta visual de SystemAlert (T-942).
 *
 * Espejo de `AlertCard` (alertas pedagógicas) sin avatar de alumno y con:
 *  - Pill del subsistema (`source`) con paleta por dominio.
 *  - `component` en monospace si está presente.
 *  - Payload `data` colapsable (botón "Detalles técnicos").
 *  - Link a runbook si `alert.runbookUrl`.
 *
 * @module components/admin/SystemAlertCard
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Clock } from 'lucide-react';
import { cn, listItemVariants } from '../../lib/utils';
import { formatRelativeTime } from '../../lib/dateUtils';
import {
  SYSTEM_ALERT_TYPE_ICONS,
  SYSTEM_ALERT_TYPE_LABELS,
  SOURCE_STYLES,
  SEVERITY_STYLES,
  PIN_ICON
} from '../../constants/systemAlertTypes';
import EscalationBadge from '../analytics/EscalationBadge';
import SystemAlertActionsMenu from './SystemAlertActionsMenu';

function CardFooter({ alert, hasData, showDetails, onToggleDetails }) {
  return (
    <footer className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
      <span className="inline-flex items-center gap-1">
        <Clock size={11} aria-hidden="true" />
        {alert.detectedAt ? formatRelativeTime(alert.detectedAt) : 'Sin fecha de detección'}
      </span>
      {alert.occurrencesCount > 1 && (
        <span className="inline-flex items-center gap-1">
          {alert.occurrencesCount} ocurrencias
        </span>
      )}
      {alert.runbookUrl && (
        <a
          href={alert.runbookUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-text-secondary hover:bg-background-elevated/60 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/40"
        >
          <ExternalLink size={11} aria-hidden="true" />
          Ver runbook
        </a>
      )}
      {hasData && (
        <button
          type="button"
          onClick={onToggleDetails}
          aria-expanded={showDetails}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-background-elevated/60 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/40"
        >
          {showDetails ? (
            <ChevronUp size={11} aria-hidden="true" />
          ) : (
            <ChevronDown size={11} aria-hidden="true" />
          )}
          Detalles técnicos
        </button>
      )}
    </footer>
  );
}

CardFooter.propTypes = {
  alert: PropTypes.object.isRequired,
  hasData: PropTypes.bool,
  showDetails: PropTypes.bool,
  onToggleDetails: PropTypes.func
};

export default function SystemAlertCard({
  alert,
  shouldReduceMotion,
  selected,
  selectable,
  onToggleSelect,
  actions
}) {
  const [showDetails, setShowDetails] = useState(false);
  const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
  const source = SOURCE_STYLES[alert.source] || {
    label: alert.source,
    badge: 'bg-text-muted/10 text-text-muted border-text-muted/20'
  };
  const TypeIcon = SYSTEM_ALERT_TYPE_ICONS[alert.type] || AlertTriangle;
  const typeLabel = SYSTEM_ALERT_TYPE_LABELS[alert.type] || alert.type;
  const isCritical = alert.severity === 'critical';
  const isInactive = alert.status === 'dismissed' || alert.status === 'resolved';
  const hasData = alert.data && typeof alert.data === 'object' && Object.keys(alert.data).length > 0;

  return (
    <motion.div
      variants={shouldReduceMotion ? {} : listItemVariants}
      whileHover={shouldReduceMotion || isInactive ? undefined : { y: -2, scale: 1.005 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      role="group"
      aria-label={`Alerta de sistema: ${typeLabel}`}
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
            checked={!!selected}
            onChange={onToggleSelect}
            aria-label={`Seleccionar alerta ${typeLabel}`}
            className="mt-1 size-4 rounded border-border-default text-brand-base focus:ring-brand-base/40"
          />
        )}
        <div
          className={cn(
            'size-9 flex-shrink-0 rounded-lg flex items-center justify-center',
            severity.bg,
            severity.text
          )}
          aria-hidden="true"
        >
          <TypeIcon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {alert.pinned && (
              <PIN_ICON
                size={12}
                aria-label="Fijada"
                className="text-amber-400 fill-amber-400/30"
              />
            )}
            <h3 className="font-semibold text-text-primary text-sm">{alert.title}</h3>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                severity.bg,
                severity.border,
                severity.text
              )}
            >
              <severity.Icon size={10} aria-hidden="true" />
              {severity.label}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                source.badge
              )}
            >
              {source.label}
            </span>
            {alert.component && (
              <code className="text-[11px] text-text-muted bg-background-base/50 rounded px-1.5 py-0.5 font-mono">
                {alert.component}
              </code>
            )}
            <EscalationBadge daysActive={alert.daysActive} isEscalated={alert.isEscalated} />
          </header>

          <p className="mt-2 text-sm text-text-secondary leading-snug">{alert.description}</p>

          {alert.recommendation && (
            <p className="mt-1 text-xs text-text-muted italic">{alert.recommendation}</p>
          )}

          <CardFooter
            alert={alert}
            hasData={hasData}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails(v => !v)}
          />

          {showDetails && hasData && (
            <pre className="mt-2 overflow-x-auto rounded-md border border-border-subtle bg-background-base/40 p-2 text-[11px] text-text-secondary">
              <code>{JSON.stringify(alert.data, null, 2)}</code>
            </pre>
          )}
        </div>

        {actions && (
          <SystemAlertActionsMenu
            alert={alert}
            onResolve={actions.onResolve}
            onDismiss={actions.onDismiss}
            onSnooze={actions.onSnooze}
            onPin={actions.onPin}
            onUnpin={actions.onUnpin}
            onHistory={actions.onHistory}
          />
        )}
      </div>
    </motion.div>
  );
}

SystemAlertCard.propTypes = {
  alert: PropTypes.object.isRequired,
  shouldReduceMotion: PropTypes.bool,
  selected: PropTypes.bool,
  selectable: PropTypes.bool,
  onToggleSelect: PropTypes.func,
  actions: PropTypes.object
};
