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
        {Array.from({ length: lines }, (_, i) => ({ id: `skeleton-line-${i}`, index: i })).map(line => (
          <div
            key={line.id}
            className={cn(
              baseClasses,
              'h-4 rounded-md',
              // Simular anchos variables para líneas de texto
              line.index === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full'
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
        <SkeletonShimmer variant="circle" className="size-12 shrink-0" />
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
        <SkeletonShimmer variant="circle" className="size-10" />
      </div>
      <SkeletonShimmer className="h-8 w-20 mb-3" />
      <SkeletonShimmer className="h-3 w-32" />
    </GlassCard>
  );
}

/**
 * Skeleton que simula un área de gráfico con ejes y línea ondulada.
 * Previene CLS al reservar el espacio exacto del chart final.
 *
 * @param {Object} props
 * @param {number} props.height - Altura del skeleton en px (default: 200)
 * @param {boolean} props.showAxes - Mostrar ejes X/Y simulados (default: true)
 * @param {string} props.className
 */
export function SkeletonChart({ height = 200, showAxes = true, className }) {
  return (
    <GlassCard variant="default" className={cn('overflow-hidden', className)}>
      <div className="flex items-end gap-2" style={{ height }}>
        {/* Y axis */}
        {showAxes && (
          <div className="flex flex-col justify-between h-full py-2 shrink-0">
            {[0, 1, 2, 3].map(i => (
              <SkeletonShimmer key={i} className="h-2.5 w-6 rounded-sm" />
            ))}
          </div>
        )}

        {/* Chart area */}
        <div className="flex-1 relative h-full">
          {/* Simulated wave line */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 400 200"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M 0 150 C 50 130, 100 80, 150 100 S 250 140, 300 90 S 370 60, 400 80"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-background-surface/60 animate-pulse"
            />
            <path
              d="M 0 150 C 50 130, 100 80, 150 100 S 250 140, 300 90 S 370 60, 400 80 L 400 200 L 0 200 Z"
              className="fill-background-surface/20 animate-pulse"
            />
          </svg>

          {/* X axis labels */}
          {showAxes && (
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 pb-1">
              {[0, 1, 2, 3, 4].map(i => (
                <SkeletonShimmer key={i} className="h-2 w-8 rounded-sm" />
              ))}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

/**
 * Skeleton que simula un grid de cards con layout responsive.
 * Útil para páginas de listado (sesiones, mazos, contextos).
 *
 * @param {Object} props
 * @param {number} props.count - Número de skeleton cards (default: 6)
 * @param {number} props.columns - Columnas en desktop (default: 3)
 * @param {string} props.className
 */
export function SkeletonGrid({ count = 6, columns = 3, className }) {
  const gridCols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  // Generamos keys estables a partir del count (re-creadas si count cambia, no
  // re-renderizadas innecesariamente) — evitamos usar el indice de array como key.
  const keys = Array.from({ length: count }, (_, i) => `sk-card-${i}`);

  return (
    <div className={cn(
      'grid grid-cols-1 gap-4',
      gridCols[columns] || gridCols[3],
      className
    )}>
      {keys.map(key => (
        <SkeletonCard key={key} />
      ))}
    </div>
  );
}
