/**
 * @fileoverview Página de alertas y avisos del centro (T-942).
 *
 * Ruta `/admin/system-alerts`, accesible solo para super_admin.
 * Estructura en tres tabs:
 *   - Alertas del sistema: <SystemAlertsHub />
 *   - Avisos a profesores: <SystemAnnouncementsManager />
 *   - Desbloqueos: <LockoutUnlockForm /> (T-905 post-Sprint 0)
 *
 * Carga los datos bajo demanda al cambiar de tab (similar a
 * `InsightsReports.jsx` del teacher).
 *
 * @module pages/admin/SystemAlertsPage
 */

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Megaphone, Unlock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import systemAlertsService from '../../services/systemAlerts';
import GlassCard from '../../components/ui/GlassCard';
import ErrorState from '../../components/ui/ErrorState';
import SystemAlertsHub from '../../components/admin/SystemAlertsHub';
import SystemAnnouncementsManager from '../../components/admin/SystemAnnouncementsManager';
import LockoutUnlockForm from '../../components/admin/LockoutUnlockForm';
import AdminPageShell from '../../components/admin/AdminPageHero';

const TABS = [
  { key: 'alerts', label: 'Alertas del sistema', Icon: ShieldAlert },
  { key: 'announcements', label: 'Avisos a profesores', Icon: Megaphone },
  { key: 'lockouts', label: 'Desbloqueos', Icon: Unlock }
];

export default function SystemAlertsPage() {
  useDocumentTitle('Alertas y avisos del centro');

  const [tab, setTab] = useState('alerts');
  const [statusFilter, setStatusFilter] = useState('active');

  // Estado de alertas
  const [alerts, setAlerts] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // D.1 (pre-v1.0.0): AbortController propagado al servicio para que la
  // navegación rápida desde sidebar admin no deje requests colgadas.
  const fetchAlerts = useCallback(async (signal) => {
    if (tab !== 'alerts') return;
    setLoading(true);
    setError(null);
    try {
      // El service separa `params` (query) de `config` (axios config + signal).
      const [list, summary] = await Promise.all([
        systemAlertsService.getSystemAlerts({ status: statusFilter }, { signal }),
        systemAlertsService.getSystemAlertsSummary({ signal })
      ]);
      setAlerts(list?.items || []);
      setStatusCounts(summary?.byStatus || {});
    } catch (err) {
      if (err?.code === 'ERR_CANCELED') return;
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [tab, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetchAlerts(controller.signal);
    return () => controller.abort();
  }, [fetchAlerts]);

  useRefetchOnFocus({
    refetch: fetchAlerts,
    enabled: tab === 'alerts',
    isLoading: loading,
    hasData: alerts.length > 0,
    hasError: !!error
  });

  const handleStatusChange = useCallback(next => {
    setStatusFilter(next);
  }, []);

  return (
    <AdminPageShell
      icon={ShieldAlert}
      title="Alertas y avisos del centro"
      description="Vigila el estado operativo (Redis, MongoDB, colas, seguridad, moderación y cumplimiento) y publica avisos para todo el profesorado desde un único panel."
      ariaLabel="Alertas y avisos del centro"
      className="space-y-0"
    >
      <div className="space-y-6" data-page="admin-system-alerts">

      {/* BUG-A11Y-SYSTEMALERTS-TABS (QA Sprint 0): role="tab" sin parent
          role="tablist" rompe la regla axe. Aunque jsx-a11y avisa de "non-
          interactive to interactive role", tablist es el correcto contenedor
          ARIA cuando los hijos son `role="tab"` con `aria-selected`. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role */}
      <nav aria-label="Secciones" role="tablist" className="flex flex-wrap items-center gap-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'bg-brand-base/15 text-brand-on-alpha border border-brand-base/30'
                : 'bg-background-elevated/40 text-text-secondary border border-border-subtle hover:text-text-primary'
            )}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'alerts' &&
        (error ? (
          <GlassCard padding="md">
            <ErrorState
              title="No se pudieron cargar las alertas"
              description={error?.message || 'Inténtalo de nuevo en unos segundos.'}
              onRetry={fetchAlerts}
            />
          </GlassCard>
        ) : (
          <SystemAlertsHub
            alerts={alerts}
            loading={loading}
            statusFilter={statusFilter}
            statusCounts={statusCounts}
            onStatusChange={handleStatusChange}
            onRefetch={fetchAlerts}
          />
        ))}

      {tab === 'announcements' && <SystemAnnouncementsManager />}

      {tab === 'lockouts' && <LockoutUnlockForm />}
      </div>
    </AdminPageShell>
  );
}
