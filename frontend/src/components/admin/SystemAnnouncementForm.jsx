/**
 * @fileoverview Formulario modal para crear o editar un SystemAnnouncement (T-942).
 *
 * @module components/admin/SystemAnnouncementForm
 */

import { useEffect, useId, useState } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Save } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  ANNOUNCEMENT_SEVERITIES,
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_SEVERITY_STYLES
} from '../../constants/systemAlertTypes';
import ButtonPremium from '../ui/ButtonPremium';
import InputPremium from '../ui/InputPremium';

const toLocalInput = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export default function SystemAnnouncementForm({ open, mode, initial, onClose, onSubmit }) {
  const titleId = useId();
  const bodyId = useId();
  const linkLabelId = useId();
  const linkUrlId = useId();
  const expiresId = useId();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('info');
  const [audience, setAudience] = useState('all_teachers');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title || '');
    setBody(initial?.body || '');
    setSeverity(initial?.severity || 'info');
    setAudience(initial?.audience || 'all_teachers');
    setLinkUrl(initial?.linkUrl || '');
    setLinkLabel(initial?.linkLabel || '');
    setExpiresAt(initial?.expiresAt ? toLocalInput(initial.expiresAt) : '');
    setError(null);
    setSubmitting(false);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return undefined;
    const handle = e => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  const canSubmit =
    title.trim().length >= 3 && body.trim().length >= 3 && !submitting;

  const handleSubmit = async event => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        body: body.trim(),
        severity,
        audience,
        linkUrl: linkUrl.trim() || null,
        linkLabel: linkLabel.trim() || null,
        expiresAt: fromLocalInput(expiresAt)
      });
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'No se pudo guardar');
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 lg:p-8 overflow-y-auto"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <motion.form
          key="form"
          onClick={e => e.stopPropagation()}
          onSubmit={handleSubmit}
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="w-full max-w-2xl bg-background-surface border border-border-default rounded-2xl shadow-2xl overflow-hidden my-auto"
        >
          <header className="flex items-center justify-between px-6 py-5 border-b border-border-subtle">
            <div className="space-y-1">
              <p className="text-micro uppercase tracking-[0.12em] text-text-muted font-semibold">
                {mode === 'edit' ? 'Editar aviso' : 'Nuevo aviso a profesores'}
              </p>
              <h2 id={titleId} className="text-lg font-semibold text-text-primary font-display">
                Aviso del centro
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-lg p-2 text-text-muted hover:bg-background-elevated/60 hover:text-text-primary focus-ring"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          <div className="px-6 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
            <InputPremium
              id={titleId}
              label="Título"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Cierre del centro el viernes"
              maxLength={120}
              required
            />

            <div className="flex flex-col gap-1">
              <label
                htmlFor={bodyId}
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Cuerpo
              </label>
              <textarea
                id={bodyId}
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="El centro permanecerá cerrado durante el puente. Las sesiones quedarán pospuestas hasta el lunes."
                className={cn(
                  'w-full rounded-lg border border-border-default bg-background-elevated/50 px-3 py-2 text-sm text-text-primary',
                  'focus:outline-none focus:ring-2 focus:ring-brand-base/50'
                )}
                required
              />
              <p className="text-micro text-text-muted">{body.length}/500 caracteres</p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-text-secondary mb-1">Severidad</legend>
              <div className="grid grid-cols-3 gap-2.5">
                {ANNOUNCEMENT_SEVERITIES.map(s => {
                  const style = ANNOUNCEMENT_SEVERITY_STYLES[s];
                  const checked = severity === s;
                  return (
                    <label
                      key={s}
                      className={cn(
                        'flex items-center justify-center gap-1 rounded-xl border px-4 py-3 cursor-pointer transition-colors',
                        checked
                          ? style.container
                          : 'border-border-subtle text-text-secondary hover:bg-background-elevated/40'
                      )}
                    >
                      <input
                        type="radio"
                        name="severity"
                        value={s}
                        checked={checked}
                        onChange={() => setSeverity(s)}
                        className="sr-only"
                      />
                      <span className="text-xs uppercase tracking-[0.08em] font-semibold">
                        {style.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="space-y-2.5">
              <legend className="text-sm font-medium text-text-secondary mb-1">Audiencia</legend>
              {ANNOUNCEMENT_AUDIENCES.map(opt => (
                <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer py-0.5">
                  <input
                    type="radio"
                    name="audience"
                    value={opt.value}
                    checked={audience === opt.value}
                    onChange={() => setAudience(opt.value)}
                    className="size-4 text-brand-base focus:ring-brand-base/40"
                  />
                  <span className="text-sm text-text-secondary">{opt.label}</span>
                </label>
              ))}
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <InputPremium
                id={linkLabelId}
                label="Texto del enlace (opcional)"
                value={linkLabel}
                onChange={e => setLinkLabel(e.target.value)}
                maxLength={40}
                placeholder="Saber más"
              />
              <InputPremium
                id={linkUrlId}
                label="URL del enlace (opcional)"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                type="url"
                maxLength={240}
                placeholder="https://..."
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor={expiresId}
                className="block text-sm font-medium text-text-secondary mb-1.5"
              >
                Caduca el (opcional)
              </label>
              <input
                id={expiresId}
                type="datetime-local"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className={cn(
                  'w-full rounded-lg border border-border-default bg-background-elevated/50 px-3 py-2 text-sm text-text-primary',
                  'focus:outline-none focus:ring-2 focus:ring-brand-base/50'
                )}
              />
              <p className="text-micro text-text-muted">
                Si lo dejas en blanco, el aviso permanece activo hasta que lo archives.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-error-base">
                {error}
              </p>
            )}
          </div>

          <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-background-base/30">
            <ButtonPremium type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </ButtonPremium>
            <ButtonPremium type="submit" variant="primary" disabled={!canSubmit}>
              {mode === 'edit' ? (
                <>
                  <Save size={14} aria-hidden="true" /> Guardar cambios
                </>
              ) : (
                <>
                  <Send size={14} aria-hidden="true" /> Publicar aviso
                </>
              )}
            </ButtonPremium>
          </footer>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}

SystemAnnouncementForm.propTypes = {
  open: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(['create', 'edit']),
  initial: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired
};
