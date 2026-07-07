/**
 * @fileoverview Componente reutilizable para edición inline de texto
 * (T-952 Fase C).
 *
 * Renderiza un texto que al hover muestra un icono "Pencil"; al pulsar
 * sustituye el texto por un input con autofocus. Mientras el draft está
 * abierto:
 *
 *  - Escribir aplica autosave debounced (configurable).
 *  - Enter confirma (commit explícito). Escape cancela.
 *  - Blur del input también commitea.
 *  - Visualmente: cuando guarda, muestra spinner; cuando hay error,
 *    pinta el borde rojo + mensaje aria-live para lectores.
 *
 * Diseñado para encajar en cualquier sitio donde antes había un `<h3>`
 * o `<span>` con el nombre de una entidad: DeckCard, SessionCard,
 * StudentName, etc.
 *
 * @module components/ui/InlineEditableText
 */

import { useEffect, useId, useRef } from 'react';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Pencil, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useInlineEdit } from '../../hooks/useInlineEdit';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// eslint-disable-next-line sonarjs/cyclomatic-complexity -- edición inline con estados (idle/editing/saving/error) y manejadores de teclado
export default function InlineEditableText({
  value,
  onSave,
  validate,
  ariaLabel,
  className,
  inputClassName,
  textClassName,
  maxLength = 80,
  placeholder = '',
  trigger = 'hover-pencil',
  debounceMs = 800,
  autosave = true,
  as: TextTag = 'span',
  disabled = false,
}) {
  const editor = useInlineEdit({ value, onSave, validate, debounceMs, autosave });
  const { shouldReduceMotion } = useReducedMotion();
  const inputRef = useRef(null);
  const errorId = useId();

  useEffect(() => {
    if (editor.isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editor.isEditing]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editor.commit();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      editor.cancel();
    }
  };

  const handleBlur = () => {
    // Si hay error visible, no committeamos al blur — el usuario debe
    // corregir o cancelar explícitamente. Esto evita ciclos
    // "blur → fail → re-focus → blur" cuando la validación es estricta.
    if (editor.error) return;
    editor.commit();
  };

  const triggerEdit = () => {
    if (disabled) return;
    editor.start();
  };

  const triggerOnText = trigger === 'text' || trigger === 'hover-pencil';
  const showPencilButton = !disabled && (trigger === 'pencil' || trigger === 'hover-pencil');

  // Estado IDLE — muestra texto + (opcional) icono Pencil al hover.
  if (!editor.isEditing) {
    return (
      <span className={cn('group/inline inline-flex items-center gap-1.5', className)}>
        <TextTag
          className={cn(
            'truncate',
            triggerOnText && !disabled && 'cursor-text hover:text-brand-base transition-colors',
            textClassName,
          )}
          onClick={triggerOnText ? triggerEdit : undefined}
          onKeyDown={triggerOnText ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerEdit(); } } : undefined}
          role={triggerOnText && !disabled ? 'button' : undefined}
          tabIndex={triggerOnText && !disabled ? 0 : undefined}
          aria-label={triggerOnText && !disabled ? `Editar ${ariaLabel || value}` : undefined}
        >
          {value || placeholder}
        </TextTag>
        {showPencilButton && (
          <button
            type="button"
            onClick={triggerEdit}
            aria-label={`Editar ${ariaLabel || value}`}
            className={cn(
              'opacity-0 group-hover/inline:opacity-100 focus-visible:opacity-100',
              'transition-opacity duration-150 p-1 rounded-md',
              'text-text-muted hover:text-brand-base hover:bg-brand-base/10',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base',
            )}
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
        )}
      </span>
    );
  }

  // Estado EDITING — input + estado guardado/error.
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <AnimatePresence mode="wait">
        <motion.span
          key="edit"
          initial={shouldReduceMotion ? false : { opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="relative inline-flex items-center gap-1.5"
        >
          <input
            ref={inputRef}
            type="text"
            value={editor.draft}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(e) => editor.setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            aria-label={ariaLabel || 'Editar nombre'}
            aria-invalid={Boolean(editor.error)}
            aria-describedby={editor.error ? errorId : undefined}
            disabled={editor.isSaving || disabled}
            className={cn(
              'bg-background-elevated/80 border border-border-default rounded-md px-2 py-1',
              'text-sm font-medium text-text-primary',
              'focus:outline-none focus:ring-2 focus:ring-brand-base/40 focus:border-brand-base',
              'disabled:opacity-60',
              editor.error && 'border-error-base focus:ring-error-base/40 focus:border-error-base',
              inputClassName,
            )}
          />
          {editor.isSaving && (
            <Loader2 size={14} className="animate-spin text-text-muted" aria-hidden="true" />
          )}
        </motion.span>
      </AnimatePresence>
      {editor.error && (
        <span
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-xs text-error-base ml-2"
        >
          {editor.error}
        </span>
      )}
    </span>
  );
}

InlineEditableText.propTypes = {
  value: PropTypes.string.isRequired,
  onSave: PropTypes.func.isRequired,
  validate: PropTypes.func,
  ariaLabel: PropTypes.string,
  className: PropTypes.string,
  inputClassName: PropTypes.string,
  textClassName: PropTypes.string,
  maxLength: PropTypes.number,
  placeholder: PropTypes.string,
  trigger: PropTypes.oneOf(['text', 'pencil', 'hover-pencil']),
  debounceMs: PropTypes.number,
  autosave: PropTypes.bool,
  as: PropTypes.elementType,
  disabled: PropTypes.bool,
};
