/**
 * @fileoverview Estado vacio reutilizable con layout consistente.
 * @module components/ui/EmptyState
 */

import { cn } from '../../lib/utils';
import GlassCard from './GlassCard';

export default function EmptyState({
  title,
  description,
  icon,
  action,
  className
}) {
  return (
    <GlassCard className={cn('p-10 text-center', className)}>
      {icon && (
        <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-glass-bg text-text-muted">
          {icon}
        </div>
      )}
      {title && (
        <p className="text-text-primary text-lg font-semibold">
          {title}
        </p>
      )}
      {description && (
        <p className="text-text-disabled mt-2 max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-6 flex justify-center">
          {action}
        </div>
      )}
    </GlassCard>
  );
}
