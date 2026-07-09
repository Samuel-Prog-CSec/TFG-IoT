/**
 * @fileoverview Modal de impresión de cartas de un mazo.
 * Genera un PDF con las imágenes del mazo al tamaño físico elegido para recortarlas
 * y pegarlas en las tarjetas. Sigue el patrón de modal del proyecto (backdrop +
 * panel con spring, focus trap, Escape, scroll lock) y solo consume tokens
 * semánticos (light/dark coherentes). Muy guiado: tooltips, previsualización en
 * vivo y estado vacío con mascota.
 * @module components/print/PrintDeckModal
 */

import { useCallback, useEffect, useRef } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Printer, Download, X } from 'lucide-react';
import { cn, formFieldVariants } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { usePrintDeck } from '../../hooks/usePrintDeck';
import ButtonPremium from '../ui/ButtonPremium';
import CharacterMascot from '../game/CharacterMascot';
import PrintSizeControls from './PrintSizeControls';
import PrintCardSelector from './PrintCardSelector';
import PrintPreviewSheet from './PrintPreviewSheet';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Contenido del modal (usa el hook). Se monta al abrir, por lo que el estado
 * (tamaño, selección) se reinicia en cada apertura.
 */
function PrintDeckContent({ deckId, deckName, cards, newUids, onClose }) {
  const { shouldReduceMotion } = useReducedMotion();
  const print = usePrintDeck({ deckId, deckName, cards, newUids });

  // Estado vacío: el mazo no tiene ninguna imagen que imprimir.
  if (print.printable.length === 0) {
    return (
      <>
        <ModalHeader onClose={onClose} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <CharacterMascot mood="thinking" size="md" noBubble />
          <p className="max-w-sm text-text-secondary">
            Este mazo no tiene imágenes que imprimir. Solo se pueden imprimir cartas con imagen
            (los audios no se imprimen).
          </p>
          <ButtonPremium variant="secondary" onClick={onClose}>
            Entendido
          </ButtonPremium>
        </div>
      </>
    );
  }

  return (
    <>
      <ModalHeader onClose={onClose} />

      <div className="flex-1 overflow-y-auto custom-scrollbar px-6">
        <p className="mb-4 text-sm text-text-secondary">
          Genera un PDF con las imágenes del mazo para recortarlas y pegarlas en tus tarjetas
          físicas.
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_1fr]">
          {/* Controles */}
          <div className="flex flex-col gap-5">
            <PrintSizeControls
              preset={print.preset}
              onPresetChange={print.setPreset}
              widthCm={print.widthCm}
              heightCm={print.heightCm}
              onWidthChange={print.setWidthCm}
              onHeightChange={print.setHeightCm}
              sizeErrors={print.sizeErrors}
              showLabel={print.showLabel}
              onShowLabelChange={print.setShowLabel}
              effectiveWidthCm={print.effectiveWidthCm}
              effectiveHeightCm={print.effectiveHeightCm}
            />

            <PrintCardSelector
              cards={print.printable}
              selectedUids={print.selectedUids}
              onToggle={print.toggleCard}
              onSelectAll={print.selectAll}
              onSelectNone={print.selectNone}
              onSelectNew={print.selectNew}
              hasNew={print.hasNew}
              newCount={print.newCount}
            />
          </div>

          {/* Previsualización */}
          <motion.div
            variants={shouldReduceMotion ? undefined : formFieldVariants(2)}
            initial={shouldReduceMotion ? false : 'hidden'}
            animate="visible"
            className="lg:sticky lg:top-0"
          >
            <PrintPreviewSheet
              layout={print.layout}
              selectedCards={print.selectedCards}
              pages={print.pages}
            />
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 flex-col gap-2 border-t border-border-subtle px-6 py-4">
        {print.error && (
          <p role="alert" className="text-sm text-error-base">
            {print.error}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          <ButtonPremium variant="ghost" onClick={onClose} disabled={print.generating}>
            Cerrar
          </ButtonPremium>
          <ButtonPremium
            variant="primary"
            onClick={print.generate}
            loading={print.generating}
            disabled={!print.canGenerate}
            icon={<Download size={18} />}
          >
            {print.generating ? 'Generando…' : 'Descargar PDF'}
          </ButtonPremium>
        </div>
      </div>
    </>
  );
}

/** Cabecera reutilizable del modal (icono + título + cerrar). */
function ModalHeader({ onClose }) {
  return (
    <div className="flex shrink-0 items-start gap-4 p-6 pb-4">
      <div className="flex size-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-base/15 text-brand-base">
        <Printer size={24} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 id="print-modal-title" className="text-lg font-semibold text-text-primary">
          Imprimir cartas
        </h3>
        <p className="text-sm text-text-muted">Descarga las imágenes del mazo en PDF</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-muted transition-[colors,transform] hover:bg-border-default hover:text-text-primary active:scale-90 focus-ring"
        aria-label="Cerrar"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.deckId
 * @param {string} props.deckName
 * @param {Array} props.cards - cardMappings del mazo (con displayData)
 * @param {string[]} [props.newUids] - UIDs añadidos en esta edición (para "Solo las nuevas")
 */
export default function PrintDeckModal({ open, onClose, deckId, deckName, cards, newUids = [] }) {
  const modalRef = useRef(null);

  const handleKeyDown = useCallback(
    e => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(FOCUSABLE);
        if (focusables.length === 0) {
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const previousActive = document.activeElement;
    const focusTimer = setTimeout(() => {
      modalRef.current?.querySelector(FOCUSABLE)?.focus();
    }, 50);
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previousActive?.focus?.();
    };
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="print-modal-title"
        >
          <motion.div
            ref={modalRef}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className={cn(
              'relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl border border-border-default bg-background-base shadow-2xl',
              'max-w-[min(920px,94vw)]'
            )}
          >
            <PrintDeckContent
              deckId={deckId}
              deckName={deckName}
              cards={cards}
              newUids={newUids}
              onClose={onClose}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
