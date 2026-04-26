/**
 * @fileoverview Panel de administracion de contextos.
 *
 * Solo accesible para super_admin. Permite crear, editar y eliminar contextos
 * tematicos completos. La eliminacion borra tambien los archivos asociados en
 * Supabase Storage (gestionado por el backend en gameContextController.deleteContext).
 *
 * Para anadir/eliminar assets individuales dentro de un contexto, el flujo
 * sigue siendo el de profesores en /contexts/:id (con politica de ownership).
 *
 * @module pages/admin/AdminContexts
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Palette,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  AlertTriangle,
  ImageIcon,
  Music
} from 'lucide-react';
import { toast } from 'sonner';
import { contextsAPI, extractData, extractErrorMessage, isAbortError } from '../../services/api';
import ButtonPremium from '../../components/ui/ButtonPremium';
import InputPremium from '../../components/ui/InputPremium';
import GlassCard from '../../components/ui/GlassCard';
import StatusBadge from '../../components/ui/StatusBadge';
import { SkeletonCard } from '../../components/ui/SkeletonShimmer';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmationModal, {
  useConfirmationModal
} from '../../components/ui/ConfirmationModal';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { cn, formatDate } from '../../lib/utils';

const CONTEXT_ID_REGEX = /^[a-z0-9-]+$/;

/**
 * Modal compartido para crear o editar un contexto.
 *
 * Usa los endpoints `POST /api/contexts` y `PUT /api/contexts/:id`.
 * El backend impide cambiar `contextId` si ya hay assets en Storage,
 * por lo que en modo edicion el campo se desactiva en esa situacion.
 */
function ContextFormModal({ open, mode, initialContext, onClose, onSubmit, isLoading }) {
  const [contextId, setContextId] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState({});
  const firstInputRef = useRef(null);

  const isEdit = mode === 'edit';
  const hasStorageAssets = Boolean(
    initialContext?.assets?.some(a => a.imageUrl || a.thumbnailUrl || a.audioUrl)
  );

  useEffect(() => {
    if (open) {
      setContextId(initialContext?.contextId || '');
      setName(initialContext?.name || '');
      setErrors({});
      const t = setTimeout(() => firstInputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, initialContext]);

  const validate = () => {
    const next = {};
    if (!name || name.trim().length < 3) {
      next.name = 'El nombre debe tener al menos 3 caracteres.';
    }
    if (!contextId) {
      next.contextId = 'El identificador es obligatorio.';
    } else if (!CONTEXT_ID_REGEX.test(contextId)) {
      next.contextId = 'Solo minusculas, numeros y guiones (ej: geography-europe).';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!validate()) return;
    const payload = isEdit
      ? { name: name.trim(), ...(hasStorageAssets ? {} : { contextId }) }
      : { contextId, name: name.trim() };
    onSubmit(payload);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-background-base/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.form
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-form-title"
        className="relative z-10 w-full max-w-lg rounded-2xl border border-border-default bg-background-elevated p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-base/15 text-brand-base">
            <Palette size={20} aria-hidden="true" />
          </div>
          <div>
            <h2 id="context-form-title" className="text-lg font-bold text-text-primary">
              {isEdit ? 'Editar contexto' : 'Crear nuevo contexto'}
            </h2>
            <p className="text-xs text-text-muted">
              {isEdit
                ? 'Modifica metadatos del contexto. Los assets se gestionan por separado.'
                : 'El contexto se creara vacio; los assets se anaden despues vía upload.'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <InputPremium
            ref={firstInputRef}
            id="context-name"
            label="Nombre"
            placeholder="Ej: Países de Europa"
            value={name}
            onChange={e => setName(e.target.value)}
            error={errors.name}
            required
          />
          <div>
            <InputPremium
              id="context-id"
              label="Identificador (slug)"
              placeholder="ej: geography-europe"
              value={contextId}
              onChange={e => setContextId(e.target.value.toLowerCase().trim())}
              error={errors.contextId}
              disabled={isEdit && hasStorageAssets}
              required
            />
            {isEdit && hasStorageAssets && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-warning-base">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span>
                  No se puede cambiar el identificador porque ya hay archivos en Supabase Storage
                  bajo <code className="rounded bg-background-base/60 px-1">ctx-{initialContext?.contextId}</code>.
                </span>
              </p>
            )}
            {!isEdit && (
              <p className="mt-1 text-xs text-text-muted">
                Define la carpeta de Storage (<code className="rounded bg-background-base/60 px-1">ctx-{contextId || 'tu-id'}</code>).
                No podra cambiarse despues de subir assets.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <ButtonPremium type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancelar
          </ButtonPremium>
          <ButtonPremium type="submit" variant="primary" loading={isLoading}>
            {isEdit ? 'Guardar cambios' : 'Crear contexto'}
          </ButtonPremium>
        </div>
      </motion.form>
    </div>
  );
}

/**
 * Card resumen de un contexto en el listado admin.
 */
function AdminContextCard({ context, onEdit, onDelete }) {
  const totalAssets = context.assets?.length ?? context.assetsCount ?? 0;
  const imagesCount = context.assets?.filter(a => a.imageUrl).length ?? 0;
  const audiosCount = context.assets?.filter(a => a.audioUrl).length ?? 0;

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border-default bg-background-elevated/60 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-base/15 text-brand-base">
            <Palette size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-text-primary">{context.name}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <code className="rounded bg-background-base/60 px-1.5 py-0.5 text-[11px] text-text-muted">
                {context.contextId}
              </code>
              <StatusBadge variant={context.isActive ? 'success' : 'neutral'}>
                {context.isActive ? 'Activo' : 'Inactivo'}
              </StatusBadge>
            </div>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg border border-border-subtle bg-background-base/40 p-2">
          <dt className="text-text-muted">Assets</dt>
          <dd className="text-base font-bold text-text-primary">{totalAssets}</dd>
        </div>
        <div className="rounded-lg border border-border-subtle bg-background-base/40 p-2">
          <dt className="flex items-center justify-center gap-1 text-text-muted">
            <ImageIcon size={11} aria-hidden="true" /> Imágenes
          </dt>
          <dd className="text-base font-bold text-text-primary">{imagesCount}</dd>
        </div>
        <div className="rounded-lg border border-border-subtle bg-background-base/40 p-2">
          <dt className="flex items-center justify-center gap-1 text-text-muted">
            <Music size={11} aria-hidden="true" /> Audios
          </dt>
          <dd className="text-base font-bold text-text-primary">{audiosCount}</dd>
        </div>
      </dl>

      <p className="text-xs text-text-muted">Creado {formatDate(context.createdAt)}</p>

      <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
        <ButtonPremium variant="ghost" size="sm" onClick={() => onEdit(context)}>
          <Pencil size={14} className="mr-1" /> Editar
        </ButtonPremium>
        {/* Outline rojo en reposo → solido rojo en hover/focus. Evita el
            "click destructivo accidental" sobre una rejilla densa (QA 22/04/2026):
            la accion sigue claramente marcada como peligrosa, pero no invita al
            click tan agresivamente como el solid en la vista de listado. */}
        <ButtonPremium
          variant="outline"
          size="sm"
          onClick={() => onDelete(context)}
          className="border-error-base/60 text-error-base hover:bg-error-base hover:text-white hover:border-error-base focus-visible:bg-error-base focus-visible:text-white"
        >
          <Trash2 size={14} className="mr-1" /> Eliminar
        </ButtonPremium>
      </div>
    </article>
  );
}

/**
 * Renderiza la seccion principal de la pagina segun el estado: error, carga,
 * vacio o listado. Extraido para evitar ternarios anidados en el JSX.
 */
function renderContextsSection({
  error,
  loading,
  filtered,
  search,
  loadContexts,
  openEdit,
  onDeleteRequest
}) {
  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle size={48} className="text-error-base" />}
        title="Error al cargar contextos"
        description={error}
        action={{ label: 'Reintentar', onClick: loadContexts }}
      />
    );
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={<Palette size={48} className="text-text-muted" />}
        title={search ? 'Sin resultados' : 'No hay contextos'}
        description={
          search
            ? 'Prueba con otros terminos de busqueda.'
            : 'Crea el primer contexto para empezar.'
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map(ctx => (
        <AdminContextCard
          key={ctx.id || ctx._id}
          context={ctx}
          onEdit={openEdit}
          onDelete={onDeleteRequest}
        />
      ))}
    </div>
  );
}

/**
 * Pagina principal de administracion de contextos.
 */
export default function AdminContexts() {
  useDocumentTitle('Contextos | Admin');
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [formMode, setFormMode] = useState(null); // 'create' | 'edit' | null
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const deleteModal = useConfirmationModal();

  const loadContexts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await contextsAPI.getContexts({ limit: 100 });
      const data = extractData(res);
      const list = Array.isArray(data) ? data : data?.items || data?.contexts || [];
      setContexts(list);
    } catch (err) {
      if (isAbortError(err)) return;
      setError(extractErrorMessage(err) || 'No se pudieron cargar los contextos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContexts();
  }, [loadContexts]);

  const filtered = contexts.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name?.toLowerCase().includes(q) || c.contextId?.toLowerCase().includes(q);
  });

  const openCreate = () => {
    setEditing(null);
    setFormMode('create');
  };
  const openEdit = ctx => {
    setEditing(ctx);
    setFormMode('edit');
  };
  const closeForm = () => {
    if (submitting) return;
    setFormMode(null);
    setEditing(null);
  };

  const handleSubmit = async payload => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && editing) {
        await contextsAPI.updateContext(editing.id || editing._id, payload);
        toast.success(`Contexto "${payload.name}" actualizado.`);
      } else {
        await contextsAPI.createContext(payload);
        toast.success(`Contexto "${payload.name}" creado.`);
      }
      closeForm();
      await loadContexts();
    } catch (err) {
      toast.error(extractErrorMessage(err) || 'No se pudo guardar el contexto.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRequest = ctx => {
    const totalAssets = ctx.assets?.length ?? ctx.assetsCount ?? 0;
    deleteModal.openModal({
      title: `Eliminar contexto "${ctx.name}"`,
      variant: 'danger',
      confirmText: 'Eliminar definitivamente',
      cancelText: 'Cancelar',
      description: (
        <div className="space-y-3 text-sm text-text-secondary">
          <p>Vas a eliminar el contexto <strong>{ctx.name}</strong> de forma permanente.</p>
          <ul className="space-y-1 rounded-lg border border-error-base/30 bg-error-base/10 p-3 text-xs">
            <li className="flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-error-base" aria-hidden="true" />
              <span>Se borran <strong>{totalAssets}</strong> assets asociados (imagenes, thumbnails y audios).</span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-error-base" aria-hidden="true" />
              <span>
                Se elimina la carpeta <code className="rounded bg-background-base/60 px-1">ctx-{ctx.contextId}</code>{' '}
                de Supabase Storage (image, thumbnail y audio).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-error-base" aria-hidden="true" />
              <span>
                Si hay mazos, sesiones o partidas activas usando este contexto, la operacion se rechazara.
              </span>
            </li>
          </ul>
        </div>
      ),
      onConfirm: () => performDelete(ctx)
    });
  };

  const performDelete = async ctx => {
    setPendingDeleteId(ctx.id || ctx._id);
    try {
      await contextsAPI.deleteContext(ctx.id || ctx._id);
      toast.success(`Contexto "${ctx.name}" eliminado junto con sus archivos en Storage.`);
      await loadContexts();
    } catch (err) {
      toast.error(extractErrorMessage(err) || 'No se pudo eliminar el contexto.');
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-base/15 text-brand-base">
            <Palette size={24} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Gestión de Contextos</h1>
            <p className="text-sm text-text-muted">
              Crea, edita y elimina contextos temáticos. Las eliminaciones también limpian Supabase Storage.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ButtonPremium variant="secondary" size="sm" onClick={loadContexts} disabled={loading}>
            <RefreshCw size={14} className={cn('mr-1', loading && 'animate-spin')} /> Actualizar
          </ButtonPremium>
          <ButtonPremium variant="primary" onClick={openCreate}>
            <Plus size={16} className="mr-1" /> Nuevo contexto
          </ButtonPremium>
        </div>
      </header>

      <GlassCard variant="default" className="p-4">
        <InputPremium
          id="admin-contexts-search"
          label="Buscar"
          placeholder="Filtrar por nombre o slug..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </GlassCard>

      {renderContextsSection({
        error,
        loading,
        filtered,
        search,
        loadContexts,
        openEdit,
        onDeleteRequest: handleDeleteRequest
      })}

      <ContextFormModal
        open={formMode !== null}
        mode={formMode}
        initialContext={editing}
        onClose={closeForm}
        onSubmit={handleSubmit}
        isLoading={submitting}
      />

      <ConfirmationModal
        {...deleteModal.modalProps}
        loading={Boolean(pendingDeleteId)}
      />
    </main>
  );
}
