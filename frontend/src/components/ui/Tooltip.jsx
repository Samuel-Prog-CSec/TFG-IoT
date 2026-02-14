/**
 * @fileoverview Tooltip accesible y consistente para acciones de UI.
 * @module components/ui/Tooltip
 */

import { useId, cloneElement, isValidElement } from 'react';
import { cn } from '../../lib/utils';

export default function Tooltip({
  content,
  children,
  side = 'top',
  className,
  disabled = false
}) {
  const tooltipId = useId();

  if (!content || disabled) {
    return children;
  }

  const child = isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': tooltipId })
    : <span aria-describedby={tooltipId}>{children}</span>;

  return (
    <span className={cn('tooltip-anchor group', className)}>
      {child}
      <span
        id={tooltipId}
        role="tooltip"
        className={cn('tooltip-content', `tooltip-${side}`)}
      >
        {content}
      </span>
    </span>
  );
}
