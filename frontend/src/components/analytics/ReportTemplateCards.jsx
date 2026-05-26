/**
 * @fileoverview Cards de plantillas predefinidas de informes (T-942 Fase D).
 *
 * Renderiza un grid de plantillas (system + custom) que con un click
 * pre-rellenan los dropdowns del `ReportGenerator`. Mapea el campo
 * `template.icon` (string Lucide-like) al componente concreto; cae a
 * FileText si el icono no está en el mapa.
 *
 * @module components/analytics/ReportTemplateCards
 */

import { memo } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import {
  GraduationCap,
  Users,
  Building2,
  FileText,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import SkeletonShimmer from '../ui/SkeletonShimmer';
import { cn, motionConfig } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

// Mapa string → componente. Si el icono no está, usa FileText como fallback
// (cubre el caso de plantillas custom creadas vía API con icono libre).
const ICON_MAP = {
  GraduationCap,
  Users,
  Building2,
  FileText,
  Sparkles
};

// Labels legibles para el pill que resume los defaults.
const REPORT_TYPE_LABEL = {
  classroom: 'Aula',
  student: 'Alumno'
};
const PERIOD_LABEL = {
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días'
};
const FORMAT_LABEL = {
  summary: 'Resumen',
  detailed: 'Detallado'
};

function buildDefaultsPill(defaults) {
  if (!defaults) return '—';
  const parts = [];
  if (defaults.reportType) parts.push(REPORT_TYPE_LABEL[defaults.reportType] || defaults.reportType);
  if (defaults.period) parts.push(PERIOD_LABEL[defaults.period] || defaults.period);
  if (defaults.format) parts.push(FORMAT_LABEL[defaults.format] || defaults.format);
  return parts.join(' · ');
}

/**
 * Skeleton equivalente al card real (mismo padding/height aproximado).
 */
function TemplateCardSkeleton() {
  return (
    <GlassCard variant="default" className="h-full">
      <div className="flex items-start gap-3 mb-3">
        <SkeletonShimmer variant="circle" className="size-10 shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonShimmer className="h-4 w-3/4" />
          <SkeletonShimmer className="h-3 w-full" />
          <SkeletonShimmer className="h-3 w-5/6" />
        </div>
      </div>
      <SkeletonShimmer className="h-6 w-32 rounded-full" />
    </GlassCard>
  );
}

/**
 * Card individual de plantilla.
 */
function TemplateCard({ template, onApply }) {
  const { shouldReduceMotion } = useReducedMotion();
  const Icon = ICON_MAP[template.icon] || FileText;

  return (
    <motion.button
      type="button"
      onClick={() => onApply(template)}
      whileHover={shouldReduceMotion ? undefined : { y: -4, scale: 1.02 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
      transition={motionConfig.spring}
      className="group block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base rounded-2xl"
      aria-label={`Aplicar plantilla ${template.name}`}
    >
      <GlassCard
        variant="default"
        className={cn(
          'h-full transition-[box-shadow,border-color] duration-300',
          'group-hover:border-brand-base/40 group-hover:shadow-[var(--shadow-lg)]'
        )}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="size-10 rounded-xl bg-brand-base/10 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-base/15 transition-colors">
            <Icon size={20} className="text-brand-on-alpha" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-text-primary font-display">
                {template.name}
              </h3>
              <ChevronRight
                size={16}
                className="text-text-muted opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0 transition-[opacity,transform] duration-200 flex-shrink-0"
                aria-hidden="true"
              />
            </div>
            <p className="text-xs text-text-muted mt-1 line-clamp-3">
              {template.description || 'Sin descripción.'}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-background-elevated/50 px-2.5 py-1 text-micro font-medium text-text-secondary tabular-nums">
          {buildDefaultsPill(template.defaults)}
        </span>
      </GlassCard>
    </motion.button>
  );
}

TemplateCard.propTypes = {
  template: PropTypes.shape({
    _id: PropTypes.string,
    key: PropTypes.string,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    icon: PropTypes.string,
    defaults: PropTypes.shape({
      reportType: PropTypes.oneOf(['classroom', 'student']),
      period: PropTypes.oneOf(['7d', '30d', '90d']),
      format: PropTypes.oneOf(['summary', 'detailed'])
    })
  }).isRequired,
  onApply: PropTypes.func.isRequired
};

/**
 * Grid de cards de plantillas.
 */
function ReportTemplateCards({ templates, onApply, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <TemplateCardSkeleton key={`tpl-sk-${i}`} />
        ))}
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <GlassCard variant="subtle" className="p-6 text-center">
        <p className="text-sm text-text-muted">
          No hay plantillas disponibles todavía.
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {templates.map((tpl) => (
        <TemplateCard key={tpl._id || tpl.key} template={tpl} onApply={onApply} />
      ))}
    </div>
  );
}

ReportTemplateCards.propTypes = {
  templates: PropTypes.array,
  onApply: PropTypes.func.isRequired,
  loading: PropTypes.bool
};

export default memo(ReportTemplateCards);
