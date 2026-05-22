import { memo } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import AnimatedNumber from '../ui/AnimatedNumber';

/**
 * Colores RAG segun estado
 */
const RAG_STYLES = {
  green: {
    border: 'border-l-success-base',
    dot: 'bg-success-base',
    glow: 'shadow-[0_0_8px_var(--color-success-glow)]',
    text: 'text-success-base',
  },
  amber: {
    border: 'border-l-warning-base',
    dot: 'bg-warning-base',
    glow: 'shadow-[0_0_8px_var(--color-warning-glow)]',
    text: 'text-warning-base',
  },
  red: {
    border: 'border-l-error-base',
    dot: 'bg-error-base',
    glow: 'shadow-[0_0_8px_var(--color-error-glow)]',
    text: 'text-error-base',
  },
  gray: {
    border: 'border-l-text-muted',
    dot: 'bg-text-muted',
    glow: '',
    text: 'text-text-muted',
  },
};

/**
 * KPI Card con indicador RAG (semaforo), valor principal, comparativa con clase,
 * y descripcion. Componente firma del sistema de analytics.
 *
 * El patron de 4 capas:
 * 1. Valor numerico principal
 * 2. Indicador RAG (borde izquierdo coloreado + dot)
 * 3. Comparativa contextual (vs clase)
 * 4. Micro-narrativa (label descriptivo)
 *
 * @param {Object} props
 * @param {string} props.label - Nombre del KPI
 * @param {string|number} props.value - Valor principal
 * @param {string} [props.suffix] - Sufijo (%, s, pts)
 * @param {string} [props.ragStatus] - Estado RAG: green | amber | red | gray
 * @param {string} [props.comparison] - Texto de comparativa ("vs clase: +11%")
 * @param {boolean} [props.comparisonPositive] - Si la comparativa es positiva
 * @param {React.ReactNode} [props.icon] - Icono opcional
 */
function StudentKPICard({
  label,
  value,
  suffix = '',
  ragStatus = 'gray',
  comparison,
  comparisonPositive,
  icon,
}) {
  const rag = RAG_STYLES[ragStatus] || RAG_STYLES.gray;

  return (
    <GlassCard
      variant="default"
      padding="none"
      className={cn(
        "p-4 border-l-4 transition-[box-shadow,border-color] duration-300",
        "hover:shadow-[0_4px_16px_rgba(0,0,0,0.2)]",
        // h-full + flex-col para que todas las cards de la fila igualen su
        // altura al más alto (las que tienen `comparison` llevan +1 línea).
        // Sin esto, en el grid de KPIs hay cards más altas que otras y el
        // resultado es visualmente irregular (QA 2026-04-29).
        "h-full flex flex-col",
        rag.border
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1 truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1.5">
            <AnimatedNumber
              value={`${value}${suffix}`}
              className="text-2xl font-bold text-text-primary font-display tabular-nums"
            />
          </div>
        </div>

        {/* RAG dot + optional icon */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {icon && (
            <div className={cn("p-1.5 rounded-lg bg-background-surface/50", rag.text)}>
              {icon}
            </div>
          )}
          {/* BUG-A11Y-KPI-DOT (QA Sprint 0): div con aria-label sin role
              provoca aria-prohibited-attr. role="img" legitima la etiqueta. */}
          <div role="img" className={cn("size-2.5 rounded-full", rag.dot, ragStatus !== 'gray' && rag.glow)} aria-label={`Estado: ${ragStatus}`} />
        </div>
      </div>

      {/* Comparison line — anclada al fondo (`mt-auto`) para que las cards sin
          comparison no queden con el valor "flotando" cuando la altura se iguala
          al más alto del grid. */}
      {comparison && (
        <div className={cn(
          "mt-auto pt-2 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
          comparisonPositive === true && 'bg-success-base/8',
          comparisonPositive === false && 'bg-error-base/8'
        )}>
          {comparisonPositive != null && (
            comparisonPositive
              ? <ArrowUpRight size={12} className="text-success-base" aria-hidden="true" />
              : <ArrowDownRight size={12} className="text-error-base" aria-hidden="true" />
          )}
          {comparisonPositive == null && (
            <Minus size={12} className="text-text-muted" aria-hidden="true" />
          )}
          <span className="text-xs text-text-muted font-medium">{comparison}</span>
        </div>
      )}
    </GlassCard>
  );
}

StudentKPICard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  suffix: PropTypes.string,
  ragStatus: PropTypes.oneOf(['green', 'amber', 'red', 'gray']),
  comparison: PropTypes.string,
  comparisonPositive: PropTypes.bool,
  icon: PropTypes.node,
};

export default memo(StudentKPICard);
