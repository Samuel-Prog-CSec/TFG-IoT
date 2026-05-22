/**
 * @fileoverview MetricPill — primitivo de métrica reutilizable (ADR-F).
 *
 * Antes de esta sesión, los 3 sub-componentes `GameOverStats*` duplicaban
 * la misma estructura HTML de "pill" (label + value + tone + opcional
 * icon + tooltip). Esto hacía cualquier ajuste estético tener que
 * tocar 3 archivos. Este primitivo unifica la presentación y deja a los
 * `GameOverStats*` solo decidir QUÉ mostrar, no cómo.
 *
 * También se usa en otros sitios donde aparece la misma signatura visual
 * (HighlightCards de analytics, footer de partida) para mantener
 * consistencia visual global. La altura es `min-h` para alinear con
 * cualquier hero metric superior sin que pequeñas diferencias en value
 * (longitud) descuelguen el grid.
 *
 * @module components/ui/MetricPill
 */

import { memo } from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

// BUG (QA 2026-05-16): el tono neutral usaba `text-white` hardcoded. En
// modo claro el fondo es claro y los números (T. medio, Tiempo, Errores)
// quedaban invisibles sobre `bg-background-elevated/60`. Cambiamos a
// `text-text-primary` que respeta el tema activo (oscuro: blanco-cálido,
// claro: gris oscuro) garantizando contraste WCAG en ambos.
const TONE_CLASSES = Object.freeze({
  neutral: 'bg-background-elevated/60 border-border-subtle text-text-primary',
  success: 'bg-success-base/10 border-success-base/20 text-success-base',
  error: 'bg-error-base/10 border-error-base/20 text-error-base',
  amber: 'bg-accent-amber/10 border-accent-amber/20 text-accent-amber',
  brand: 'bg-brand-base/10 border-brand-base/20 text-brand-base',
  indigo: 'bg-accent-indigo/10 border-accent-indigo/20 text-accent-indigo',
  cyan: 'bg-accent-cyan/10 border-accent-cyan/20 text-accent-cyan'
});

function MetricPill({
  label,
  value,
  tone = 'neutral',
  icon: IconComponent,
  tooltip,
  delta,
  align = 'center',
  className
}) {
  const alignClass = align === 'left' ? 'text-left' : 'text-center';
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 text-xs min-h-[3.25rem]',
        TONE_CLASSES[tone] || TONE_CLASSES.neutral,
        alignClass,
        className
      )}
      title={tooltip}
    >
      <div
        className={cn(
          'text-text-muted flex items-center gap-1',
          align === 'left' ? 'justify-start' : 'justify-center'
        )}
      >
        {IconComponent ? <IconComponent size={11} aria-hidden="true" /> : null}
        {label}
      </div>
      <div className="font-display font-semibold tabular-nums leading-tight">
        {value}
      </div>
      {delta !== undefined && delta !== null ? (
        <div
          className={cn(
            'mt-0.5 text-[10px] tabular-nums',
            typeof delta === 'number' && delta > 0 && 'text-success-base',
            typeof delta === 'number' && delta < 0 && 'text-error-base',
            typeof delta === 'number' && delta === 0 && 'text-text-muted'
          )}
        >
          {typeof delta === 'number' ? formatDelta(delta) : delta}
        </div>
      ) : null}
    </div>
  );
}

function formatDelta(value) {
  if (value > 0) return `↑ +${value}`;
  if (value < 0) return `↓ ${value}`;
  return '· 0';
}

MetricPill.propTypes = {
  label: PropTypes.node.isRequired,
  value: PropTypes.node.isRequired,
  tone: PropTypes.oneOf(Object.keys(TONE_CLASSES)),
  icon: PropTypes.elementType,
  tooltip: PropTypes.string,
  // Diferencia respecto a una referencia (p.ej. partida anterior). Si es
  // número, lo formatea con flecha y signo. Si es string, lo muestra tal
  // cual (e.g. "+12 pts").
  delta: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  align: PropTypes.oneOf(['center', 'left']),
  className: PropTypes.string
};

export default memo(MetricPill);
