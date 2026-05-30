import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';
import GlassCard from './GlassCard';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @fileoverview Overlay de ayuda de atajos de teclado (T-951 Fase 5).
 *
 * Modal accesible vía `Shift+?` que muestra los atajos disponibles
 * agrupados por sección. Cada combinación se renderiza con elementos
 * `<kbd>` semánticos para que los lectores de pantalla los anuncien
 * correctamente.
 */

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const panelVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.15 } },
};

const reducedVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

function Kbd({ children }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5',
        'font-mono text-xs font-semibold',
        'bg-background-elevated border border-border-default',
        'rounded-md shadow-[var(--shadow-sm)]',
        'text-text-primary',
      )}
    >
      {children}
    </kbd>
  );
}

Kbd.propTypes = { children: PropTypes.node.isRequired };

/**
 * Renderiza una combinación de teclas (`Shift+?`, `g s`) como una
 * secuencia de `<kbd>` separados por un signo "+" o un espacio.
 */
function KbdCombo({ combo }) {
  if (combo.includes(' ')) {
    const [first, second] = combo.split(' ');
    return (
      <span className="inline-flex items-center gap-1.5">
        <Kbd>{first}</Kbd>
        <span className="text-text-muted text-xs">luego</span>
        <Kbd>{second}</Kbd>
      </span>
    );
  }
  const parts = combo.split('+');
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((part, idx) => (
        <span key={`${combo}-${part}`} className="inline-flex items-center gap-1">
          <Kbd>{part}</Kbd>
          {idx < parts.length - 1 && <span className="text-text-muted text-xs">+</span>}
        </span>
      ))}
    </span>
  );
}

KbdCombo.propTypes = { combo: PropTypes.string.isRequired };

export default function KeyboardShortcutsOverlay({ isOpen, onClose, sections }) {
  const { shouldReduceMotion } = useReducedMotion();

  // Esc cierra el overlay (atajo estándar de modales).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  const cVariants = shouldReduceMotion ? reducedVariants : containerVariants;
  const pVariants = shouldReduceMotion ? reducedVariants : panelVariants;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="kbd-shortcuts-backdrop"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-backdrop backdrop-blur-md p-4"
          variants={cVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar"
            variants={pVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Atajos de teclado"
          >
            <GlassCard variant="solid" padding="lg" className="relative">
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'absolute top-4 right-4 p-2 rounded-xl',
                  'text-text-muted hover:text-text-primary',
                  'bg-background-elevated/40 hover:bg-background-elevated/70',
                  'border border-border-subtle hover:border-border-default',
                  'transition-colors duration-200 focus-ring',
                )}
                aria-label="Cerrar atajos"
              >
                <X size={18} aria-hidden="true" />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="size-12 rounded-2xl bg-brand-base/15 border border-brand-base/30 flex items-center justify-center text-brand-base">
                  <Keyboard size={24} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-text-primary font-display tracking-tight">
                    Atajos de teclado
                  </h2>
                  <p className="text-sm text-text-muted">
                    Pulsa <Kbd>Shift</Kbd> + <Kbd>?</Kbd> en cualquier momento para abrir esta lista.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {sections.map((section) => (
                  <div key={section.title}>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">
                      {section.title}
                    </h3>
                    <ul className="space-y-2">
                      {section.shortcuts.map((shortcut) => (
                        <li
                          key={shortcut.key}
                          className="flex items-center justify-between gap-4 px-3 py-2 rounded-lg bg-background-elevated/30 border border-border-subtle"
                        >
                          <span className="text-sm text-text-secondary">
                            {shortcut.description}
                          </span>
                          <KbdCombo combo={shortcut.key} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

KeyboardShortcutsOverlay.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  sections: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string.isRequired,
      shortcuts: PropTypes.arrayOf(
        PropTypes.shape({
          key: PropTypes.string.isRequired,
          description: PropTypes.string.isRequired,
        }),
      ).isRequired,
    }),
  ).isRequired,
};
