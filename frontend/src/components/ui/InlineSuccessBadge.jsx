/**
 * @fileoverview InlineSuccessBadge — micro-confirmación junto al trigger (T-955).
 *
 * Pequeño badge "✓ Guardado" que aparece al lado del botón que disparó la
 * acción de éxito. Implementación CSS-only (sin AnimatePresence) para
 * evitar la fragilidad de mount/unmount detection cuando el wrapper se
 * re-renderiza por cambios de loading/saving en torno al save (B-1, QA
 * 2026-05-12). El badge siempre permanece en el DOM y CSS aplica
 * opacity/scale/transform en función de `data-visible`.
 *
 * Respeta `prefers-reduced-motion` con CSS @media (sin animaciones).
 * `role="status"` + `aria-live="polite"` para screen readers — sólo
 * anuncia cuando entra en estado visible.
 *
 * @module components/ui/InlineSuccessBadge
 */

import PropTypes from 'prop-types';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const PLACEMENT_CLASSES = {
  right: 'left-full ml-3 top-1/2 -translate-y-1/2',
  left: 'right-full mr-3 top-1/2 -translate-y-1/2',
  top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
  bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  inline: 'static translate-y-0 translate-x-0'
};

export default function InlineSuccessBadge({
  visible,
  label = 'Guardado',
  placement = 'right',
  className = '',
  showIcon = true
}) {
  const isAbsolute = placement !== 'inline';

  return (
    <span
      role="status"
      aria-live="polite"
      data-visible={visible ? 'true' : 'false'}
      aria-hidden={!visible}
      className={cn(
        isAbsolute && 'absolute',
        isAbsolute && PLACEMENT_CLASSES[placement],
        'inline-flex items-center gap-1.5',
        'px-2.5 py-1 rounded-full',
        'text-[12px] font-semibold leading-none',
        'bg-success-base/15 text-success-dark',
        'border border-success-base/30',
        'shadow-[0_2px_8px_color-mix(in_oklab,var(--color-success-glow)_50%,transparent)]',
        'whitespace-nowrap pointer-events-none select-none',
        'transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        // Estado oculto (default) — el badge vive en el DOM pero invisible
        // y desplazado ligeramente. Cuando `data-visible=true`, recupera
        // opacidad y se asienta en su posición.
        'data-[visible=false]:opacity-0',
        'data-[visible=true]:opacity-100',
        // El placement controla el origen del transform inicial.
        placement === 'right' && 'data-[visible=false]:-translate-x-2',
        placement === 'left' && 'data-[visible=false]:translate-x-2',
        placement === 'top' && 'data-[visible=false]:translate-y-1',
        placement === 'bottom' && 'data-[visible=false]:-translate-y-1',
        placement === 'inline' && 'data-[visible=false]:scale-90',
        'motion-reduce:transition-none motion-reduce:transform-none',
        className
      )}
    >
      {showIcon && <CheckCircle2 size={14} aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}

InlineSuccessBadge.propTypes = {
  visible: PropTypes.bool.isRequired,
  label: PropTypes.string,
  placement: PropTypes.oneOf(['right', 'left', 'top', 'bottom', 'inline']),
  className: PropTypes.string,
  showIcon: PropTypes.bool
};
