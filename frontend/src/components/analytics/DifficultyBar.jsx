/**
 * @fileoverview Barra horizontal compacta de dificultad (T-953 Fase A).
 *
 * Pensada para incrustarse en cards densas (StudentDetail, ContextDetail)
 * cuando el `<PerformanceByDimension>` es overkill. Es CSS puro (no
 * Recharts) — más liviana y más fácil de animar con Framer Motion.
 *
 * El valor `score` 0-100 se colorea con RAG (>=70 verde, 50-69 ámbar,
 * <50 rojo). Para colorblind-safe, además del color se rellena con un
 * `bg-stripe-diagonal` cuando el score es bajo (<50): la textura
 * comunica "atención" sin depender solo del rojo.
 *
 * @module components/analytics/DifficultyBar
 */

import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const RAG_BARS = Object.freeze({
  green: 'bg-success-base',
  amber: 'bg-warning-base',
  red: 'bg-error-base',
});

const RAG_LABELS = Object.freeze({
  green: 'Alto',
  amber: 'Medio',
  red: 'Bajo',
});

function scoreToRAG(score) {
  if (score >= 70) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

/**
 * @param {Object} props
 * @param {string} props.label - Etiqueta a la izquierda ("Memoria", "Animales", …).
 * @param {number} props.score - Valor 0-100.
 * @param {string} [props.detail] - Texto secundario a la derecha (opcional, ej: "12 partidas").
 * @param {boolean} [props.showValue=true] - Si muestra `{score}%` al final.
 * @param {string} [props.className]
 */
export default function DifficultyBar({
  label,
  score,
  detail,
  showValue = true,
  className,
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const rag = scoreToRAG(safeScore);
  const isLow = rag === 'red';
  const ragLabel = RAG_LABELS[rag];
  // Construye el aria-label sin template literals anidados (sonarjs).
  const detailSuffix = detail ? `, ${detail}` : '';
  const ariaLabel = `${label}: ${Math.round(safeScore)}% — nivel ${ragLabel}${detailSuffix}`;

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2',
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      <span className="flex-1 min-w-0 text-sm text-text-primary truncate font-medium">
        {label}
      </span>
      <div
        className="relative h-2 flex-1 max-w-[200px] rounded-full overflow-hidden bg-background-surface/50"
        aria-hidden="true"
      >
        <motion.span
          initial={shouldReduceMotion ? { width: `${safeScore}%` } : { width: 0 }}
          animate={{ width: `${safeScore}%` }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'absolute left-0 top-0 h-full rounded-full',
            RAG_BARS[rag],
            // Pattern colorblind-safe SOLO en valores bajos: la textura
            // comunica "atención" para que el rojo no sea el único canal.
            isLow && 'bg-stripe-diagonal',
          )}
        />
      </div>
      {showValue && (
        <span
          className={cn(
            'tabular-nums text-sm font-semibold w-12 text-right',
            rag === 'green' && 'text-success-base',
            rag === 'amber' && 'text-warning-base',
            rag === 'red' && 'text-error-base',
          )}
          aria-hidden="true"
        >
          {Math.round(safeScore)}%
        </span>
      )}
      {detail && (
        <span className="text-xs text-text-muted whitespace-nowrap">{detail}</span>
      )}
    </div>
  );
}

DifficultyBar.propTypes = {
  label: PropTypes.string.isRequired,
  score: PropTypes.number.isRequired,
  detail: PropTypes.node,
  showValue: PropTypes.bool,
  className: PropTypes.string,
};
