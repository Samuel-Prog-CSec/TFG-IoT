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
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
          {icon}
        </div>
      )}
      {title && (
        <p className="text-slate-100 text-lg font-semibold">
          {title}
        </p>
      )}
      {description && (
        <p className="text-slate-500 mt-2 max-w-md mx-auto">
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
