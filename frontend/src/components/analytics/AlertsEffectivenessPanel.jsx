/**
 * @fileoverview Panel "Eficacia del sistema de alertas" (T-941 H.3).
 *
 * Meta-insight: el docente ve cómo está usando el sistema y cuántas alertas
 * se resuelven solas vs requieren atención manual.
 */

import { useEffect, useState } from 'react';
import { TrendingUp, BellOff, CheckCircle2, Clock, AlertOctagon } from 'lucide-react';
import analyticsService from '../../services/analytics';
import { ALERT_TYPE_LABELS } from '../../constants/alertTypes';
import SkeletonShimmer from '../ui/SkeletonShimmer';

const MetricBlock = ({ label, value, icon: Icon, tone = 'neutral' }) => {
  const toneClass = {
    neutral: 'text-text-secondary',
    success: 'text-success-base',
    warning: 'text-warning-base',
    danger: 'text-error-base',
    info: 'text-info-base'
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-subtle bg-background-elevated/40 px-4 py-3">
      <span className={`flex size-9 items-center justify-center rounded-lg bg-background-surface ${toneClass}`}>
        <Icon size={16} aria-hidden="true" />
      </span>
      <div>
        <p className="text-xl font-bold text-text-primary tabular-nums font-display">
          {value}
        </p>
        <p className="text-micro text-text-muted font-medium">{label}</p>
      </div>
    </div>
  );
};

export default function AlertsEffectivenessPanel({ days = 30 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    analyticsService
      .getAlertsEffectiveness({ days }, { signal: controller.signal })
      .then(setData)
      .catch(() => null)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [days]);

  if (loading) {
    return (
      <section className="space-y-4" aria-label="Eficacia del sistema de alertas (cargando)">
        <SkeletonShimmer className="h-6 w-64" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <SkeletonShimmer key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (!data) return null;

  const insightText = (() => {
    if (data.falsePositiveRate > 30) {
      return `Has marcado el ${data.falsePositiveRate}% como falsos positivos. Considera ajustar los umbrales del sistema.`;
    }
    if (data.totalGenerated === 0) {
      return 'Aún no se han generado alertas en este periodo.';
    }
    const resolved = data.resolvedAutomatically + data.resolvedManually;
    const resolvedPercent = Math.round((resolved / data.totalGenerated) * 100);
    return `${resolvedPercent}% de las alertas se han resuelto. Tiempo medio: ${data.averageDaysToResolve} días.`;
  })();

  return (
    <section
      className="space-y-4 rounded-2xl border border-border-subtle bg-background-elevated/30 p-5"
      aria-label="Eficacia del sistema de alertas"
    >
      <header>
        <h3 className="text-base font-bold text-text-primary font-display">
          Eficacia del sistema en los últimos {days} días
        </h3>
        <p className="mt-1 text-xs text-text-muted">{insightText}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricBlock
          label="Alertas generadas"
          value={data.totalGenerated}
          icon={TrendingUp}
        />
        <MetricBlock
          label="Activas ahora"
          value={data.activeNow}
          icon={AlertOctagon}
          tone={data.activeNow > 5 ? 'warning' : 'neutral'}
        />
        <MetricBlock
          label="Resueltas automáticas"
          value={data.resolvedAutomatically}
          icon={CheckCircle2}
          tone="success"
        />
        <MetricBlock
          label="Descartadas"
          value={data.dismissed}
          icon={BellOff}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricBlock
          label="Tiempo medio a resolución"
          value={`${data.averageDaysToResolve} d`}
          icon={Clock}
          tone="info"
        />
        <MetricBlock
          label="Falsos positivos"
          value={`${data.falsePositiveRate}%`}
          icon={BellOff}
          tone={data.falsePositiveRate > 30 ? 'warning' : 'neutral'}
        />
      </div>

      {data.topTypes?.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-background-surface/40 p-4">
          <p className="mb-2 text-xs font-semibold text-text-secondary">
            Tipos más generados
          </p>
          <ul className="space-y-1.5">
            {data.topTypes.map(t => (
              <li
                key={t.type}
                className="flex items-center justify-between text-xs text-text-secondary"
              >
                <span className="truncate">
                  {ALERT_TYPE_LABELS[t.type] || t.type}
                </span>
                <span className="tabular-nums font-medium text-text-primary">
                  {t.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
