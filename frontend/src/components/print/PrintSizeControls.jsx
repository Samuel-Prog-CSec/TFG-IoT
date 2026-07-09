/**
 * @fileoverview Controles de tamaño de tarjeta para el modal de impresión.
 * Presets (estándar / personalizado), inputs en cm con guards inline y el
 * toggle de "mostrar etiqueta". Componente controlado.
 * @module components/print/PrintSizeControls
 */

import { m as motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { cn, formFieldVariants } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import InputPremium from '../ui/InputPremium';
import Tooltip from '../ui/Tooltip';
import { MIN_CARD_CM, MAX_CARD_WIDTH_CM, MAX_CARD_HEIGHT_CM } from '../../lib/printLayout';

const PRESETS = [
  { id: 'standard', label: 'Tarjeta estándar', hint: '5,5 × 8,5 cm' },
  { id: 'custom', label: 'Personalizado', hint: 'Elige el tamaño' }
];

/**
 * @param {Object} props
 * @param {'standard'|'custom'} props.preset
 * @param {(preset: string) => void} props.onPresetChange
 * @param {string} props.widthCm
 * @param {string} props.heightCm
 * @param {(value: string) => void} props.onWidthChange
 * @param {(value: string) => void} props.onHeightChange
 * @param {{widthError: string|null, heightError: string|null}} props.sizeErrors
 * @param {boolean} props.showLabel
 * @param {(value: boolean) => void} props.onShowLabelChange
 * @param {number} props.effectiveWidthCm
 * @param {number} props.effectiveHeightCm
 */
export default function PrintSizeControls({
  preset,
  onPresetChange,
  widthCm,
  heightCm,
  onWidthChange,
  onHeightChange,
  sizeErrors,
  showLabel,
  onShowLabelChange,
  effectiveWidthCm,
  effectiveHeightCm
}) {
  const { shouldReduceMotion } = useReducedMotion();

  return (
    <motion.section
      variants={shouldReduceMotion ? undefined : formFieldVariants(0)}
      initial={shouldReduceMotion ? false : 'hidden'}
      animate="visible"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-text-primary">Tamaño de cada tarjeta</h4>
        <Tooltip
          side="top"
          content="Es el tamaño MÁXIMO. La imagen se ajusta dentro sin deformarse (mantiene su forma)."
        >
          <span className="inline-flex text-text-muted transition-colors hover:text-brand-base">
            <Info size={15} aria-hidden="true" />
          </span>
        </Tooltip>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tamaño de tarjeta">
        {PRESETS.map(option => {
          const selected = preset === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onPresetChange(option.id)}
              className={cn(
                'flex flex-col items-start rounded-xl border px-3 py-2.5 text-left',
                'transition-[color,background-color,border-color] duration-200',
                'focus-ring active:scale-[0.98]',
                selected
                  ? 'border-brand-base bg-brand-base/10 text-brand-on-alpha'
                  : 'border-border-default bg-background-elevated/60 text-text-secondary hover:border-border-strong'
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-text-muted">{option.hint}</span>
            </button>
          );
        })}
      </div>

      {/* Inputs personalizados o resumen del estándar */}
      {preset === 'custom' ? (
        <div className="grid grid-cols-2 gap-3">
          <InputPremium
            label="Ancho (cm)"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={MIN_CARD_CM}
            max={MAX_CARD_WIDTH_CM}
            value={widthCm}
            onChange={e => onWidthChange(e.target.value)}
            error={sizeErrors.widthError || undefined}
            helperText={`Entre ${MIN_CARD_CM} y ${MAX_CARD_WIDTH_CM} cm`}
          />
          <InputPremium
            label="Alto (cm)"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={MIN_CARD_CM}
            max={MAX_CARD_HEIGHT_CM}
            value={heightCm}
            onChange={e => onHeightChange(e.target.value)}
            error={sizeErrors.heightError || undefined}
            helperText={`Entre ${MIN_CARD_CM} y ${MAX_CARD_HEIGHT_CM} cm`}
          />
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Cada tarjeta ocupará como máximo{' '}
          <span className="font-medium text-text-secondary">
            {effectiveWidthCm} × {effectiveHeightCm} cm
          </span>
          . Elegimos la orientación de página que aprovecha más papel.
        </p>
      )}

      {/* Toggle de etiqueta */}
      <button
        type="button"
        role="switch"
        aria-checked={showLabel}
        onClick={() => onShowLabelChange(!showLabel)}
        className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-border-default bg-background-elevated/40 px-3 py-2.5 text-left focus-ring active:scale-[0.99]"
      >
        <span className="flex flex-col">
          <span className="text-sm font-medium text-text-primary">Mostrar el nombre</span>
          <span className="text-xs text-text-muted">Escribe el valor bajo cada imagen</span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200',
            showLabel ? 'bg-brand-base' : 'bg-border-strong'
          )}
        >
          <motion.span
            layout={!shouldReduceMotion}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className={cn(
              'absolute top-0.5 size-5 rounded-full bg-white shadow-sm',
              showLabel ? 'left-[22px]' : 'left-0.5'
            )}
          />
        </span>
      </button>
    </motion.section>
  );
}
