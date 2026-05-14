import PropTypes from 'prop-types';
import { Monitor, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useTheme } from '../../context/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @fileoverview ThemeToggle (T-951 Fase 2 + ajuste post-QA).
 *
 * Segmented control de 3 estados — Auto / Claro / Oscuro — con thumb
 * deslizante animado vía Framer Motion `layoutId`. La opción activa se
 * resalta con `bg-brand-base/15` y borde `brand-base/30`; el resto
 * queda en `text-text-muted` para no competir.
 *
 * Soporta dos densidades:
 *  - `compact` (default `false`): muestra label "Auto / Claro / Oscuro"
 *    junto al icono. Útil en cards y pantallas auth donde sobra espacio.
 *  - `compact={true}`: solo iconos, accesibilidad vía `aria-label` y
 *    `title`. Diseñado para layouts estrechos como el footer del
 *    sidebar (288px de ancho con paddings).
 *
 * Accesibilidad:
 *  - `role="radiogroup"` con `aria-label="Tema de la interfaz"`.
 *  - Cada opción es un `<button role="radio" aria-checked>` etiquetado.
 *  - El thumb ignora el lector de pantalla (`aria-hidden`).
 *  - Cumple `prefers-reduced-motion`: sin animar el thumb cuando el SO
 *    lo solicita; el cambio funcional sigue ocurriendo.
 */

const OPTIONS = [
  {
    mode: 'auto',
    label: 'Auto',
    icon: Monitor,
    description: 'Sigue al sistema',
  },
  {
    mode: 'light',
    label: 'Claro',
    icon: Sun,
    description: 'Forzar tema claro',
  },
  {
    mode: 'dark',
    label: 'Oscuro',
    icon: Moon,
    description: 'Forzar tema oscuro',
  },
];

export default function ThemeToggle({ className, compact = false }) {
  const { mode, setMode } = useTheme();
  const { shouldReduceMotion } = useReducedMotion();

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className={cn(
        'relative inline-flex items-center gap-1 rounded-xl p-1',
        'bg-background-surface/50 border border-border-subtle backdrop-blur-sm',
        compact ? 'w-full justify-between' : '',
        className,
      )}
    >
      {OPTIONS.map(({ mode: optionMode, label, icon: Icon, description }) => {
        const active = mode === optionMode;
        return (
          <button
            key={optionMode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} — ${description}`}
            title={`${label} — ${description}`}
            onClick={() => setMode(optionMode)}
            className={cn(
              'relative flex items-center justify-center rounded-lg',
              'text-xs font-medium transition-colors duration-200',
              compact ? 'flex-1 gap-1 px-2 py-1.5' : 'gap-1.5 px-2.5 py-1.5',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base',
              active ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary',
            )}
          >
            {/* Thumb deslizante: motion.span con layoutId para animar el cambio */}
            {active && (
              <motion.span
                layoutId="theme-toggle-thumb"
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 380, damping: 30 }
                }
                className={cn(
                  'absolute inset-0 rounded-lg',
                  'bg-brand-base/15 border border-brand-base/35',
                  'shadow-[var(--shadow-sm)]',
                )}
                aria-hidden="true"
              />
            )}
            <span className={cn(
              'relative z-10 flex items-center',
              compact ? 'gap-0' : 'gap-1.5',
            )}>
              <Icon size={compact ? 16 : 14} aria-hidden="true" />
              {!compact && <span>{label}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

ThemeToggle.propTypes = {
  className: PropTypes.string,
  compact: PropTypes.bool,
};
