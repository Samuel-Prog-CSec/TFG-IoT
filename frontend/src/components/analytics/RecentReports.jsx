/**
 * @fileoverview Lista de informes recientes generados por el docente (T-942 Fase D).
 *
 * Muestra los últimos informes persistidos (hasta 10 visibles, scroll si
 * más). Cada row permite Reabrir (carga payload completo sin re-generar) o
 * Eliminar (confirm inline antes del delete real). Vacío con microcopy
 * concreta que invita a usar las plantillas de arriba.
 *
 * @module components/analytics/RecentReports
 */

import { memo, useState } from 'react';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Users,
  User,
  Eye,
  Trash2,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import ButtonPremium from '../ui/ButtonPremium';
import SkeletonShimmer from '../ui/SkeletonShimmer';
import { cn, DURATION, EASING } from '../../lib/utils';
import { formatRelativeTime } from '../../lib/dateUtils';

const TYPE_LABEL = {
  classroom: 'Informe del aula',
  student: 'Informe individual'
};

const PERIOD_SHORT = {
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días'
};

const FORMAT_SHORT = {
  summary: 'Resumen',
  detailed: 'Detallado'
};

function buildFallbackTitle(report) {
  const type = TYPE_LABEL[report.reportType] || 'Informe';
  const period = PERIOD_SHORT[report.period] || report.period;
  return `${type} · ${period}`;
}

/**
 * Fila individual de informe en la lista.
 */
function ReportRow({ report, onOpen, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const Icon = report.reportType === 'classroom' ? Users : User;
  const title = report.title || buildFallbackTitle(report);

  const handleDeleteClick = () => {
    if (confirming) {
      onDelete(report._id);
    } else {
      setConfirming(true);
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: DURATION.stateChange, ease: EASING.outQuart }}
      className="flex items-center gap-3 px-3 py-3 rounded-xl border border-border-subtle bg-background-elevated/30 hover:border-border-default transition-colors"
    >
      <div className="size-9 rounded-lg bg-brand-base/10 flex items-center justify-center flex-shrink-0">
        <Icon size={16} className="text-brand-on-alpha" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{title}</p>
        <p className="text-xs text-text-muted mt-0.5">
          {FORMAT_SHORT[report.format] || report.format}
          {' · '}
          <time dateTime={report.generatedAt}>
            {formatRelativeTime(report.generatedAt)}
          </time>
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ButtonPremium
          variant="ghost"
          size="sm"
          onClick={() => onOpen(report._id)}
          icon={<Eye size={14} />}
          aria-label={`Reabrir ${title}`}
        >
          Reabrir
        </ButtonPremium>
        {confirming ? (
          <div className="flex items-center gap-1.5">
            <ButtonPremium
              variant="danger"
              size="sm"
              onClick={handleDeleteClick}
              icon={<Trash2 size={14} />}
              aria-label={`Confirmar borrado de ${title}`}
            >
              Borrar
            </ButtonPremium>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-base"
              aria-label="Cancelar borrado"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <ButtonPremium
            variant="ghost"
            size="sm"
            onClick={handleDeleteClick}
            icon={<Trash2 size={14} />}
            aria-label={`Eliminar ${title}`}
          >
            Eliminar
          </ButtonPremium>
        )}
      </div>
    </motion.li>
  );
}

ReportRow.propTypes = {
  report: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    title: PropTypes.string,
    reportType: PropTypes.oneOf(['classroom', 'student']).isRequired,
    period: PropTypes.string.isRequired,
    format: PropTypes.string.isRequired,
    generatedAt: PropTypes.string.isRequired
  }).isRequired,
  onOpen: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired
};

/**
 * Lista de informes recientes.
 */
function RecentReports({ reports, loading, onOpen, onDelete, error, hasMore, loadingMore, onLoadMore, total }) {
  const count = reports?.length || 0;
  // `total` (del backend) puede superar a los cargados cuando hay paginación;
  // mostramos «N de M» para que el docente sepa que existen más informes que los
  // visibles, en vez de creer que `count` es el total (eran ≤20 por el cap previo).
  const totalLabel = typeof total === 'number' && total > count ? `${count} de ${total}` : `${count}`;
  const totalForNoun = typeof total === 'number' ? total : count;
  const noun = totalForNoun === 1 ? 'informe' : 'informes';

  return (
    <GlassCard variant="default">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-base/10">
            <FileText size={20} className="text-brand-on-alpha" aria-hidden="true" />
          </div>
          <h3 className="text-base font-semibold text-text-primary font-display">
            Informes recientes
          </h3>
        </div>
        {!loading && count > 0 && (
          <span className="text-xs text-text-muted tabular-nums">
            {totalLabel} {noun}
          </span>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-error-base/30 bg-error-base/10 px-3 py-2 text-sm text-error-on-alpha"
        >
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <SkeletonShimmer key={`rr-sk-${i}`} className="h-16 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && count === 0 && !error && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="size-16 rounded-2xl bg-brand-base/10 flex items-center justify-center">
            <Sparkles size={28} className="text-brand-base/70" aria-hidden="true" />
          </div>
          <p className="text-sm text-text-muted max-w-sm">
            Aún no has generado ningún informe. Prueba una plantilla de arriba para empezar.
          </p>
        </div>
      )}

      {!loading && count > 0 && (
        <ul
          className={cn(
            'space-y-2',
            count > 10 && 'max-h-[520px] overflow-y-auto custom-scrollbar pr-1'
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {reports.map((report) => (
              <ReportRow
                key={report._id}
                report={report}
                onOpen={onOpen}
                onDelete={onDelete}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      {!loading && hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-border-default bg-background-elevated/60 text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base"
          >
            {loadingMore ? 'Cargando…' : 'Cargar más informes'}
          </button>
        </div>
      )}
    </GlassCard>
  );
}

RecentReports.propTypes = {
  reports: PropTypes.array,
  loading: PropTypes.bool,
  onOpen: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  error: PropTypes.string,
  hasMore: PropTypes.bool,
  loadingMore: PropTypes.bool,
  onLoadMore: PropTypes.func,
  total: PropTypes.number
};

export default memo(RecentReports);
