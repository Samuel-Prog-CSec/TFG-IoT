/**
 * @fileoverview Sidebar de preview del informe en construcción (T-942 Fase D).
 *
 * Acompaña al `ReportGenerator` con una ilustración SVG inline distinta
 * según el `reportType` (classroom vs student) y un checklist de items que
 * incluirá el informe, derivado de `reportType + format`. La microcopy se
 * adapta al `period` para reforzar la decisión del docente antes de generar.
 *
 * @module components/analytics/ReportPreviewSidebar
 */

import { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import { CircleCheck, Users, User } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

// ─────────────────────────────────────────────────────────────
// Ilustraciones SVG inline (simples, coherentes con el resto del sistema)
// ─────────────────────────────────────────────────────────────

/**
 * Ilustración classroom: grid de avatares anónimos + barra de progreso aérea.
 */
function ClassroomIllustration() {
  return (
    <svg
      viewBox="0 0 200 140"
      role="img"
      aria-label="Informe de aula con métricas agregadas"
      className="w-full h-20"
    >
      <defs>
        <linearGradient id="cls-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-base)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--color-brand-base)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="184" height="124" rx="14" fill="url(#cls-bg)" />
      {/* Avatares en grid 3x2 */}
      {[
        [40, 50],
        [80, 50],
        [120, 50],
        [40, 90],
        [80, 90],
        [120, 90]
      ].map(([cx, cy], idx) => (
        <g key={`av-${cx}-${cy}`}>
          <circle
            cx={cx}
            cy={cy}
            r="11"
            fill={idx % 2 === 0 ? 'var(--color-brand-base)' : 'var(--color-accent-indigo)'}
            fillOpacity="0.6"
          />
          <circle cx={cx} cy={cy - 3} r="3.5" fill="var(--color-background-base)" fillOpacity="0.85" />
          <path
            d={`M${cx - 5} ${cy + 4} Q${cx} ${cy + 1.5} ${cx + 5} ${cy + 4}`}
            stroke="var(--color-background-base)"
            strokeOpacity="0.85"
            strokeWidth="1.4"
            fill="none"
          />
        </g>
      ))}
      {/* Mini barras de progreso lateral */}
      <g transform="translate(155, 38)">
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={`bar-${i}`}
            x="0"
            y={i * 14}
            width={[24, 18, 28, 22][i]}
            height="6"
            rx="3"
            fill="var(--color-brand-base)"
            fillOpacity={0.4 + i * 0.1}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * Ilustración student: avatar central + mini sparkline ascendente.
 */
function StudentIllustration() {
  return (
    <svg
      viewBox="0 0 200 140"
      role="img"
      aria-label="Informe individual de alumno"
      className="w-full h-20"
    >
      <defs>
        <linearGradient id="stu-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent-cyan)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-accent-cyan)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="184" height="124" rx="14" fill="url(#stu-bg)" />
      {/* Avatar central */}
      <g transform="translate(60, 30)">
        <circle cx="20" cy="22" r="20" fill="var(--color-accent-cyan)" fillOpacity="0.5" />
        <circle cx="20" cy="16" r="7" fill="var(--color-background-base)" fillOpacity="0.85" />
        <path
          d="M8 32 Q20 24 32 32"
          stroke="var(--color-background-base)"
          strokeOpacity="0.85"
          strokeWidth="2.5"
          fill="none"
        />
      </g>
      {/* Sparkline ascendente */}
      <path
        d="M120 100 L135 92 L150 84 L165 70 L180 58"
        stroke="var(--color-success-base)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      {[
        [120, 100],
        [135, 92],
        [150, 84],
        [165, 70],
        [180, 58]
      ].map(([cx, cy]) => (
        <circle key={`pt-${cx}-${cy}`} cx={cx} cy={cy} r="2.5" fill="var(--color-success-base)" />
      ))}
      {/* Texto stat */}
      <text
        x="120"
        y="120"
        fontSize="10"
        fontFamily="ui-sans-serif, system-ui"
        fill="var(--color-text-muted)"
      >
        Progreso
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Checklist items por reportType + format
// ─────────────────────────────────────────────────────────────

function buildChecklist(reportType, format) {
  if (reportType === 'classroom') {
    const base = ['KPIs del aula', 'Distribución por tier', 'Top 5 alumnos'];
    if (format === 'detailed') {
      return [...base, 'Tendencias temporales', 'Eficacia por contexto y mecánica'];
    }
    return base;
  }
  // student
  const base = ['KPIs individuales', 'Trayectoria de aprendizaje', 'Engagement'];
  if (format === 'detailed') {
    return [...base, 'Sesiones recientes', 'Mapa de tarjetas difíciles', 'Curvas de aprendizaje'];
  }
  return base;
}

function buildPeriodCopy(period) {
  if (period === '7d') return 'la última semana';
  if (period === '90d') return 'los últimos 3 meses';
  return 'el último mes';
}

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────

function ReportPreviewSidebar({ reportType, period, format }) {
  const checklist = useMemo(() => buildChecklist(reportType, format), [reportType, format]);
  const periodCopy = useMemo(() => buildPeriodCopy(period), [period]);
  const TypeIcon = reportType === 'classroom' ? Users : User;
  const typeLabel = reportType === 'classroom' ? 'Informe del aula' : 'Informe individual';

  return (
    <GlassCard variant="default">
      <div className="flex items-center gap-3 mb-3">
        <div className="size-9 rounded-lg bg-brand-base/10 flex items-center justify-center flex-shrink-0">
          <TypeIcon size={18} className="text-brand-on-alpha" aria-hidden="true" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-bold">
            Vista previa
          </p>
          <h3 className="text-sm font-bold text-text-primary font-display">
            {typeLabel}
          </h3>
        </div>
      </div>

      <div className="mb-3">
        {reportType === 'classroom' ? <ClassroomIllustration /> : <StudentIllustration />}
      </div>

      <div>
        <p className="text-[11px] font-semibold text-text-primary mb-1.5 uppercase tracking-wider">
          Este informe incluirá
        </p>
        <ul className="space-y-1">
          {checklist.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[13px] text-text-secondary leading-snug">
              <CircleCheck
                size={14}
                className="text-success-on-alpha flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-[11px] text-text-muted italic">
        Adaptado a {periodCopy}.
      </p>
    </GlassCard>
  );
}

ReportPreviewSidebar.propTypes = {
  reportType: PropTypes.oneOf(['classroom', 'student']).isRequired,
  period: PropTypes.oneOf(['7d', '30d', '90d']).isRequired,
  format: PropTypes.oneOf(['summary', 'detailed']).isRequired
};

export default memo(ReportPreviewSidebar);
