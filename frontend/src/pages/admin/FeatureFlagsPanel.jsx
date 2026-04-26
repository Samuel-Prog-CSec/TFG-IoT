/**
 * @fileoverview Panel de gestión de feature flags (solo super_admin).
 *
 * Lista todas las flags registradas con toggle de enabled, slider de rolloutPct,
 * whitelist editable y campo "reason". Permite crear nuevas flags desde un modal.
 *
 * @module pages/admin/FeatureFlagsPanel
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { featureFlagsAPI, extractData, extractErrorMessage } from '../../services/api';
import { useFeatureFlagsContext } from '../../context/FeatureFlagsContext';
import ButtonPremium from '../../components/ui/ButtonPremium';
import InputPremium from '../../components/ui/InputPremium';
import GlassCard from '../../components/ui/GlassCard';
import ConfirmationModal, { useConfirmationModal } from '../../components/ui/ConfirmationModal';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/SkeletonShimmer';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { cn, pageVariants, staggerContainer, staggerItem } from '../../lib/utils';
import Icon from '../../components/ui/Icon';
// ============================================================================
// Modal: crear nueva flag
// ============================================================================

function CreateFlagModal({ isOpen, onClose, onCreated, existingNames }) {
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setReason('');
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      setError('El nombre debe tener al menos 3 caracteres.');
      return;
    }
    if (!/^[a-z][\w-]*$/i.test(trimmed)) {
      setError('Solo letras, números, - y _. Debe empezar por letra.');
      return;
    }
    if (existingNames.includes(trimmed)) {
      setError('Ya existe una flag con ese nombre.');
      return;
    }

    setLoading(true);
    try {
      await featureFlagsAPI.upsert(trimmed, {
        enabled: false,
        rolloutPct: 0,
        whitelist: [],
        reason: reason.trim(),
      });
      toast.success(`Flag "${trimmed}" creada`);
      onCreated();
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md"
      >
        <GlassCard className="p-6">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-text-primary">
            <Icon name="Plus" size={20} className="text-brand-base" />
            Nueva feature flag
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <InputPremium
              label="Nombre"
              placeholder="ej: leaderboardsZSet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              hint="camelCase, kebab-case o snake_case. Mínimo 3 caracteres."
              disabled={loading}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- dialogo modal: el focus inicial en el primer input es UX esperada (WAI-ARIA dialog pattern)
              autoFocus
            />
            <InputPremium
              label="Razón (opcional)"
              placeholder="Por qué se añade la flag"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
            />
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-error-bg/40 p-3 text-sm text-error-base" role="alert">
                <Icon name="AlertCircle" size={16} />
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <ButtonPremium type="button" variant="ghost" onClick={onClose} disabled={loading}>
                Cancelar
              </ButtonPremium>
              <ButtonPremium type="submit" variant="primary" disabled={loading}>
                {loading ? 'Creando...' : 'Crear flag'}
              </ButtonPremium>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
}

// ============================================================================
// Fila: flag declarada en catálogo pero no creada todavía
// (PROP-81 — el admin la materializa con un click sin abrir el modal)
// ============================================================================

function UnregisteredFlagRow({ flag, onMaterialized }) {
  const [activating, setActivating] = useState(false);

  const materialize = async (enable) => {
    setActivating(true);
    try {
      await featureFlagsAPI.upsert(flag.name, {
        enabled: enable,
        rolloutPct: enable ? (flag.rolloutPct || 100) : 0,
        whitelist: [],
        reason: flag.reason || flag.description || ''
      });
      toast.success(
        enable
          ? `Flag "${flag.name}" creada y activada`
          : `Flag "${flag.name}" creada (apagada)`
      );
      onMaterialized();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setActivating(false);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-3 border border-dashed border-border-default bg-background-elevated/20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon name="Flag" size={18} className="text-text-muted" aria-hidden="true" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-base font-semibold text-text-primary">{flag.name}</h3>
              <span className="rounded-md bg-warning-base/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-warning-base">
                Por crear
              </span>
            </div>
            {flag.description && (
              <p className="text-xs text-text-muted">{flag.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ButtonPremium
            variant="ghost"
            onClick={() => materialize(false)}
            disabled={activating}
            aria-label={`Crear flag ${flag.name} apagada`}
          >
            Crear apagada
          </ButtonPremium>
          <ButtonPremium
            variant="primary"
            onClick={() => materialize(true)}
            disabled={activating}
            aria-label={`Crear y activar flag ${flag.name}`}
          >
            {activating ? (
              <>
                <Icon name="RefreshCw" size={14} className="animate-spin" />
                Creando
              </>
            ) : (
              <>
                <Icon name="Power" size={14} />
                Crear y activar
              </>
            )}
          </ButtonPremium>
        </div>
      </div>
    </GlassCard>
  );
}

// ============================================================================
// Fila: editor de una flag concreta
// ============================================================================

function FlagRow({ flag, onSaved, onDeleteRequested }) {
  const [draft, setDraft] = useState(flag);
  const [saving, setSaving] = useState(false);

  // Sincronizar cuando cambie desde fuera (tras refresh general)
  useEffect(() => {
    setDraft(flag);
  }, [flag]);

  const isDirty = useMemo(() => {
    return (
      draft.enabled !== flag.enabled ||
      draft.rolloutPct !== flag.rolloutPct ||
      draft.reason !== flag.reason ||
      draft.whitelist.join(',') !== flag.whitelist.join(',')
    );
  }, [draft, flag]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await featureFlagsAPI.upsert(flag.name, {
        enabled: draft.enabled,
        rolloutPct: draft.rolloutPct,
        whitelist: draft.whitelist,
        reason: draft.reason,
      });
      toast.success(`Flag "${flag.name}" actualizada`);
      onSaved();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon name="Flag"             size={18}
            className={cn(draft.enabled ? 'text-success-base' : 'text-text-muted')}
            aria-hidden="true"
          />
          <h3 className="font-mono text-base font-semibold text-text-primary">{flag.name}</h3>
          {flag.updatedAt && (
            <span className="text-xs text-text-muted">
              Editada {new Date(flag.updatedAt).toLocaleString('es-ES')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ButtonPremium
            variant="ghost"
            onClick={() => onDeleteRequested(flag)}
            aria-label={`Eliminar flag ${flag.name}`}
          >
            <Icon name="Trash2" size={14} />
          </ButtonPremium>
          <ButtonPremium
            variant={isDirty ? 'primary' : 'secondary'}
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            {saving ? (
              <>
                <Icon name="RefreshCw" size={14} className="animate-spin" />
                Guardando
              </>
            ) : (
              <>
                <Icon name="Save" size={14} />
                Guardar
              </>
            )}
          </ButtonPremium>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[auto_1fr_1fr]">
        {/* Toggle enabled */}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-background-elevated/30 px-4 py-3">
          <input
            type="checkbox"
            aria-label={`Activar o apagar la flag ${flag.name}`}
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
            className="size-5 accent-brand-base"
          />
          <div>
            <div className="text-sm font-semibold text-text-primary">
              {draft.enabled ? 'Activa' : 'Apagada'}
            </div>
            <div className="text-xs text-text-muted">Kill switch</div>
          </div>
        </label>

        {/* Slider rolloutPct */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`rollout-${flag.name}`}
            className="flex items-center justify-between text-sm font-medium text-text-secondary"
          >
            <span>Rollout por %</span>
            <span className="font-mono text-brand-base">{draft.rolloutPct}%</span>
          </label>
          <input
            id={`rollout-${flag.name}`}
            type="range"
            min="0"
            max="100"
            step="1"
            value={draft.rolloutPct}
            onChange={(e) =>
              setDraft({ ...draft, rolloutPct: Number.parseInt(e.target.value, 10) })
            }
            disabled={!draft.enabled}
            className={cn(
              'w-full accent-brand-base',
              !draft.enabled && 'opacity-40'
            )}
          />
          <p className="text-xs text-text-muted">
            {(() => {
              if (draft.rolloutPct === 0) return 'Solo whitelist recibirá la flag.';
              if (draft.rolloutPct === 100) return 'Todos los usuarios reciben la flag.';
              return `Aprox. ${draft.rolloutPct}% de usuarios (determinístico).`;
            })()}
          </p>
        </div>

        {/* Whitelist */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`whitelist-${flag.name}`}
            className="text-sm font-medium text-text-secondary"
          >
            Whitelist (userIds, uno por línea)
          </label>
          <textarea
            id={`whitelist-${flag.name}`}
            rows={3}
            value={draft.whitelist.join('\n')}
            onChange={(e) =>
              setDraft({
                ...draft,
                whitelist: e.target.value
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean),
              })
            }
            placeholder="65a1b2c3d4e5f67890abcdef"
            className="rounded-lg border border-border-default bg-background-elevated/40 px-3 py-2 font-mono text-xs text-text-primary focus:border-brand-base focus:outline-none"
          />
          {draft.whitelist.length > 0 && (
            <p className="text-xs text-text-muted">
              {draft.whitelist.length} usuarios en whitelist
            </p>
          )}
        </div>
      </div>

      {/* Reason */}
      <InputPremium
        label="Razón / motivo"
        placeholder="Contexto de negocio: por qué existe esta flag, cuándo se puede retirar"
        value={draft.reason}
        onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
      />
    </GlassCard>
  );
}

// ============================================================================
// Página principal
// ============================================================================

export default function FeatureFlagsPanel() {
  useDocumentTitle('Feature Flags | Admin');
  const { refresh: refreshContextFlags } = useFeatureFlagsContext();

  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const deleteModal = useConfirmationModal();
  const [pendingDelete, setPendingDelete] = useState(null);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    try {
      const response = await featureFlagsAPI.list();
      const data = extractData(response) || {};
      setFlags(data.flags || []);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const handleSaved = useCallback(async () => {
    await loadFlags();
    await refreshContextFlags();
  }, [loadFlags, refreshContextFlags]);

  const requestDelete = useCallback((flag) => {
    setPendingDelete(flag);
    deleteModal.open();
  }, [deleteModal]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await featureFlagsAPI.remove(pendingDelete.name);
      toast.success(`Flag "${pendingDelete.name}" eliminada`);
      await loadFlags();
      await refreshContextFlags();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setPendingDelete(null);
      deleteModal.close();
    }
  }, [pendingDelete, loadFlags, refreshContextFlags, deleteModal]);

  const existingNames = useMemo(() => flags.map((f) => f.name), [flags]);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6"
    >
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-brand-base/15">
            <Icon name="ShieldCheck" size={24} className="text-brand-base" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Feature Flags</h1>
            <p className="text-sm text-text-muted">
              Gestión distribuida con rollout determinístico y whitelist por usuario.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ButtonPremium variant="secondary" onClick={loadFlags} disabled={loading}>
            <Icon name="RefreshCw" size={14} className={loading ? 'animate-spin' : ''} />
            Refrescar
          </ButtonPremium>
          <ButtonPremium variant="primary" onClick={() => setCreateOpen(true)}>
            <Icon name="Plus" size={14} />
            Nueva flag
          </ButtonPremium>
        </div>
      </header>

      {/* Contenido */}
      {(() => {
        if (loading && flags.length === 0) {
          return (
            <div className="flex flex-col gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          );
        }
        if (flags.length === 0) {
          return (
            <EmptyState
              title="Aún no hay feature flags"
              description="Crea la primera flag para habilitar rollouts progresivos y kill switches."
              icon={<Icon name="Flag" size={40} className="text-text-muted" />}
              action={
                <ButtonPremium variant="primary" onClick={() => setCreateOpen(true)}>
                  <Icon name="Plus" size={14} />
                  Crear primera flag
                </ButtonPremium>
              }
            />
          );
        }
        return (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="flex flex-col gap-4"
          >
            <AnimatePresence initial={false}>
              {flags.map((flag) => (
                <motion.div key={flag.name} variants={staggerItem} layout>
                  {flag.status === 'unregistered' ? (
                    <UnregisteredFlagRow flag={flag} onMaterialized={handleSaved} />
                  ) : (
                    <FlagRow flag={flag} onSaved={handleSaved} onDeleteRequested={requestDelete} />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        );
      })()}

      {/* Modales */}
      <CreateFlagModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleSaved}
        existingNames={existingNames}
      />
      <ConfirmationModal
        open={deleteModal.isOpen}
        onClose={() => {
          setPendingDelete(null);
          deleteModal.close();
        }}
        onConfirm={confirmDelete}
        title="¿Eliminar feature flag?"
        description={
          pendingDelete
            ? `Eliminarás permanentemente "${pendingDelete.name}". Los usuarios volverán al valor por defecto (false). Esta acción no se puede deshacer.`
            : ''
        }
        confirmText="Eliminar"
        variant="danger"
      />
    </motion.div>
  );
}
