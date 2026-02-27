import { cn } from '../../lib/utils';
import GlassCard from './GlassCard';

/**
 * @fileoverview Elementos de Skeleton Shimmer
 * Provee componentes de carga reactivos que imitan con exactitud milimétrica 
 * la geometría y volumen de los componentes finales, previniendo el Layout Shift.
 */

/**
 * Esqueleto base animado (bloques, círculos o texto)
 * @param {Object} props
 * @param {string} props.className
 * @param {'rectangle' | 'circle' | 'text'} props.variant
 * @param {number} props.lines
 */
export default function SkeletonShimmer({ 
  className,
  variant = 'rectangle',
  lines = 1,
  ...props 
}) {
  const baseClasses = cn(
    'relative overflow-hidden',
    'bg-background-elevated/50',
    'before:absolute before:inset-0',
    'before:-translate-x-full before:animate-[shimmer_2s_infinite]',
    'before:bg-gradient-to-r before:from-transparent before:via-text-primary/5 before:to-transparent'
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
      <div className={cn('space-y-2.5', className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div 
            key={i}
            className={cn(
              baseClasses, 
              'h-4 rounded-md',
              // Simular anchos variables para líneas de texto
              i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full'
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
 * Skeleton estandarizado para reemplazar una GlassCard llena de contenido.
 */
export function SkeletonCard({ className }) {
  return (
    <GlassCard variant="default" className={cn('space-y-5', className)}>
      <div className="flex items-center gap-4">
        <SkeletonShimmer variant="circle" className="w-12 h-12 shrink-0" />
        <div className="flex-1 space-y-3">
          <SkeletonShimmer className="h-4 w-3/4" />
          <SkeletonShimmer className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonShimmer variant="text" lines={3} className="pt-2" />
    </GlassCard>
  );
}

/**
 * Skeleton optimizado numéricamente para tarjetas de KPIs/Estadísticas superiores.
 */
export function SkeletonStatCard({ className }) {
  return (
    <GlassCard variant="default" padding="sm" className={className}>
      <div className="flex justify-between items-start mb-4">
        <SkeletonShimmer className="h-4 w-24" />
        <SkeletonShimmer variant="circle" className="w-10 h-10" />
      </div>
      <SkeletonShimmer className="h-8 w-20 mb-3" />
      <SkeletonShimmer className="h-3 w-32" />
    </GlassCard>
  );
}
