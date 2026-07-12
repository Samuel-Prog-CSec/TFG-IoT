/**
 * @fileoverview Selector de cartas a imprimir (rejilla de miniaturas con checkbox).
 * Permite imprimir el mazo completo o solo algunas cartas (ahorro de papel) y, en
 * edición, "solo las nuevas". Componente controlado.
 * @module components/print/PrintCardSelector
 */

import { m as motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getBestAssetImageUrl } from '../../lib/cardMapping';

/**
 * @param {Object} props
 * @param {Array} props.cards - Cartas imprimibles (con displayData)
 * @param {Set<string>} props.selectedUids
 * @param {(uid: string) => void} props.onToggle
 * @param {() => void} props.onSelectAll
 * @param {() => void} props.onSelectNone
 * @param {() => void} props.onSelectNew
 * @param {boolean} props.hasNew
 * @param {number} props.newCount
 */
export default function PrintCardSelector({
  cards,
  selectedUids,
  onToggle,
  onSelectAll,
  onSelectNone,
  onSelectNew,
  hasNew,
  newCount
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const total = cards.length;
  const selected = cards.filter(c => selectedUids.has(c.uid)).length;

  return (
    <section className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-text-primary">
          Cartas a imprimir{' '}
          <span className="font-normal text-text-muted">
            ({selected} de {total})
          </span>
        </h4>
        <div className="flex items-center gap-1.5 text-xs">
          {hasNew && (
            <button
              type="button"
              onClick={onSelectNew}
              className="rounded-full border border-brand-base/40 bg-brand-base/10 px-2.5 py-1 font-medium text-brand-on-alpha transition-colors hover:bg-brand-base/20 focus-ring"
            >
              Solo las nuevas ({newCount})
            </button>
          )}
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-lg px-2 py-1 font-medium text-text-secondary transition-colors hover:bg-glass-bg hover:text-text-primary focus-ring"
          >
            Todo
          </button>
          <button
            type="button"
            onClick={onSelectNone}
            className="rounded-lg px-2 py-1 font-medium text-text-secondary transition-colors hover:bg-glass-bg hover:text-text-primary focus-ring"
          >
            Ninguno
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {cards.map(card => {
          const isSelected = selectedUids.has(card.uid);
          const imageUrl = getBestAssetImageUrl(card.displayData);
          const label = card.assignedValue || card.uid;
          return (
            <motion.button
              key={card.uid}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-label={label}
              onClick={() => onToggle(card.uid)}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-lg border transition-[border-color,box-shadow,opacity] duration-200 focus-ring',
                isSelected
                  ? 'border-brand-base shadow-[0_0_0_1px_var(--color-brand-base)]'
                  : 'border-border-default opacity-55 hover:opacity-90'
              )}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  loading="lazy"
                  className="size-full bg-background-surface object-contain"
                />
              ) : (
                <span
                  className="flex size-full items-center justify-center bg-background-surface text-[10px] text-text-muted"
                  aria-hidden="true"
                >
                  {label.slice(0, 3)}
                </span>
              )}

              {/* Marca de selección */}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute right-1 top-1 flex size-4 items-center justify-center rounded-full transition-colors duration-200',
                  isSelected
                    ? 'bg-brand-base text-white'
                    : 'border border-border-strong bg-background-base/70 text-transparent'
                )}
              >
                <Check size={11} strokeWidth={3} />
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
