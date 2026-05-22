/**
 * @fileoverview Gestor CRUD de avisos a profesores (T-942).
 *
 * Muestra una lista de SystemAnnouncements (activos y archivados), permite
 * crear/editar/archivar y previsualizar el banner final que verá el teacher.
 *
 * @module components/admin/SystemAnnouncementsManager
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Archive, Pencil, AlertOctagon, AlertTriangle, Info, Eye } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  ANNOUNCEMENT_SEVERITY_STYLES
} from '../../constants/systemAlertTypes';
import announcementsService from '../../services/announcements';
import ButtonPremium from '../ui/ButtonPremium';
import GlassCard from '../ui/GlassCard';
import EmptyState from '../ui/EmptyState';
import SkeletonShimmer from '../ui/SkeletonShimmer';
import ConfirmationModal from '../ui/ConfirmationModal';
import SystemAnnouncementForm from './SystemAnnouncementForm';
import TeacherAnnouncementBanner from '../layout/TeacherAnnouncementBanner';

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  urgent: AlertOctagon
};

const formatDate = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function SystemAnnouncementsManager() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [editing, setEditing] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const fetch = useCallback(
    async (preserveTab = tab) => {
      setLoading(true);
      setError(null);
      try {
        const res = await announcementsService.listAnnouncements({
          active: preserveTab === 'active'
        });
        setItems(res?.items || []);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    },
    [tab]
  );

  useEffect(() => {
    fetch(tab);
  }, [fetch, tab]);

  const visibleItems = useMemo(() => items, [items]);

  const handleCreate = () => {
    setFormMode('create');
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = item => {
    setFormMode('edit');
    setEditing(item);
    setFormOpen(true);
  };

  const handleSubmit = async payload => {
    if (formMode === 'edit' && editing?.id) {
      await announcementsService.updateAnnouncement(editing.id, payload);
      toast.success('Aviso actualizado');
    } else {
      await announcementsService.createAnnouncement(payload);
      toast.success('Aviso publicado');
    }
    setFormOpen(false);
    setEditing(null);
    await fetch(tab);
  };

  const handleArchive = async () => {
    if (!archiveTarget?.id) return;
    try {
      await announcementsService.archiveAnnouncement(archiveTarget.id);
      toast.success('Aviso archivado');
      setArchiveTarget(null);
      await fetch(tab);
    } catch (err) {
      toast.error('No se pudo archivar', { description: err?.message });
    }
  };

  return (
    <section className="space-y-5" aria-label="Gestor de avisos del centro">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('active')}
            aria-pressed={tab === 'active'}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              tab === 'active'
                ? 'bg-brand-base/20 text-brand-base border border-brand-base/30'
                : 'bg-background-elevated/50 text-text-muted border border-border-subtle hover:text-text-secondary'
            )}
          >
            Activos
          </button>
          <button
            type="button"
            onClick={() => setTab('archived')}
            aria-pressed={tab === 'archived'}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              tab === 'archived'
                ? 'bg-brand-base/20 text-brand-base border border-brand-base/30'
                : 'bg-background-elevated/50 text-text-muted border border-border-subtle hover:text-text-secondary'
            )}
          >
            Archivados
          </button>
        </div>
        <ButtonPremium onClick={handleCreate} variant="primary">
          <Plus size={14} aria-hidden="true" />
          Nuevo aviso
        </ButtonPremium>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <SkeletonShimmer key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-error-base">No se pudieron cargar los avisos. Refresca.</p>
      )}

      {!loading && !error && visibleItems.length === 0 && (
        <EmptyState
          title={tab === 'active' ? 'Sin avisos activos' : 'Sin avisos archivados'}
          description={
            tab === 'active'
              ? 'Crea un aviso para informar a los profesores del centro.'
              : 'Aquí verás los avisos que hayas archivado.'
          }
          titleLevel="h3"
        />
      )}

      {!loading && !error && visibleItems.length > 0 && (
        <div className="space-y-2">
          {visibleItems.map(item => {
            const style = ANNOUNCEMENT_SEVERITY_STYLES[item.severity];
            const Icon = SEVERITY_ICON[item.severity] || Info;
            return (
              <GlassCard key={item.id} padding="md" variant="subtle">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 size-8 rounded-lg flex items-center justify-center flex-shrink-0 border',
                      style?.container
                    )}
                    aria-hidden="true"
                  >
                    <Icon size={16} className={style?.iconClass} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <header className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-sm text-text-primary">{item.title}</h3>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                          style?.container
                        )}
                      >
                        {style?.label}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {item.audience === 'all_teachers' ? 'Profesores' : 'Todos los usuarios'}
                      </span>
                      {item.isExpired && (
                        <span className="text-[10px] uppercase tracking-wide text-text-muted">
                          Expirado
                        </span>
                      )}
                    </header>
                    <p className="mt-1 text-sm text-text-secondary leading-snug">{item.body}</p>
                    <footer className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
                      <span>Publicado: {formatDate(item.publishedAt)}</span>
                      {item.expiresAt && <span>Caduca: {formatDate(item.expiresAt)}</span>}
                      {item.authorName && <span>Por {item.authorName}</span>}
                    </footer>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      aria-label="Vista previa del banner"
                      className="rounded-md p-1.5 text-text-muted hover:bg-background-elevated/60 hover:text-text-primary"
                      title="Vista previa"
                    >
                      <Eye size={14} aria-hidden="true" />
                    </button>
                    {item.active && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          aria-label="Editar aviso"
                          className="rounded-md p-1.5 text-text-muted hover:bg-background-elevated/60 hover:text-text-primary"
                          title="Editar"
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setArchiveTarget(item)}
                          aria-label="Archivar aviso"
                          className="rounded-md p-1.5 text-text-muted hover:bg-background-elevated/60 hover:text-text-primary"
                          title="Archivar"
                        >
                          <Archive size={14} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      <SystemAnnouncementForm
        open={formOpen}
        mode={formMode}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSubmit}
      />

      {previewItem && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- dialog wrapper escucha Escape para cerrar overlay
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa del banner"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm px-4 py-10 overflow-y-auto"
          onKeyDown={e => {
            if (e.key === 'Escape') setPreviewItem(null);
          }}
        >
          {/* Backdrop clickable independiente (cumple a11y separando interactivo de wrapper). */}
          <button
            type="button"
            aria-label="Cerrar vista previa"
            tabIndex={-1}
            onClick={() => setPreviewItem(null)}
            className="absolute inset-0 cursor-default focus:outline-none"
          />
          <div className="relative w-full max-w-2xl bg-background-surface border border-border-default rounded-2xl shadow-2xl overflow-hidden">
            <header className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
              <p className="text-sm font-semibold text-text-primary">
                Cómo lo verá el profesor
              </p>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                aria-label="Cerrar"
                className="rounded-md p-1 text-text-muted hover:bg-background-elevated/60 hover:text-text-primary"
              >
                ×
              </button>
            </header>
            <div className="p-4 bg-background-base/40">
              <TeacherAnnouncementBanner
                announcements={[previewItem]}
                onDismiss={() => {}}
                isPreview
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!archiveTarget}
        title="Archivar aviso"
        message={
          archiveTarget
            ? `¿Quieres archivar "${archiveTarget.title}"? Los profesores dejarán de verlo de inmediato.`
            : ''
        }
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        variant="archive"
        onConfirm={handleArchive}
        onClose={() => setArchiveTarget(null)}
      />
    </section>
  );
}
