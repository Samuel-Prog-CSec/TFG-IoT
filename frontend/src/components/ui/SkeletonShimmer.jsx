import { cn } from '../../lib/utils';

/**
 * Skeleton con efecto shimmer para estados de carga
 * 
 * @param {Object} props
 * @param {string} props.className - Clases adicionales (incluir width/height)
 * @param {'rectangle' | 'circle' | 'text'} props.variant - Forma del skeleton
 * @param {number} props.lines - Número de líneas para variante 'text'
 */
export default function SkeletonShimmer({ 
  className,
  variant = 'rectangle',
  lines = 1,
  ...props 
}) {
  const baseClasses = cn(
    'relative overflow-hidden',
    'bg-slate-800/60',
    'before:absolute before:inset-0',
    'before:bg-gradient-to-r before:from-transparent before:via-white/5 before:to-transparent',
    'before:animate-shimmer'
  );

  if (variant === 'circle') {
    return (
      <div 
        className={cn(baseClasses, 'rounded-full', className)}
        {...props}
      />
    );
  }

  if (variant === 'text') {
    return (
      <div className={cn('space-y-2', className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div 
            key={i}
            className={cn(
              baseClasses, 
              'h-4 rounded-lg',
              i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div 
      className={cn(baseClasses, 'rounded-xl', className)}
      {...props}
    />
  );
}

/**
 * Skeleton para cards completas
 */
export function SkeletonCard({ className }) {
  return (
    <div className={cn('glass-card p-6 space-y-4', className)}>
      <div className="flex items-center gap-4">
        <SkeletonShimmer variant="circle" className="w-12 h-12" />
        <div className="flex-1 space-y-2">
          <SkeletonShimmer className="h-4 w-3/4" />
          <SkeletonShimmer className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonShimmer variant="text" lines={3} />
    </div>
  );
}

/**
 * Skeleton para stat cards
 */
export function SkeletonStatCard({ className }) {
  return (
    <div className={cn('glass-card p-6', className)}>
      <div className="flex justify-between items-start mb-4">
        <SkeletonShimmer className="h-4 w-24" />
        <SkeletonShimmer variant="circle" className="w-10 h-10" />
      </div>
      <SkeletonShimmer className="h-8 w-20 mb-2" />
      <SkeletonShimmer className="h-3 w-32" />
    </div>
  );
}
