/**
 * @fileoverview Panel deslizante con detalle de una celda de la matriz
 * cruzada Mecanica × Contexto (T-942 Fase C).
 *
 * Slide-in desde la derecha sobre overlay semi-transparente. Implementa
 * el pattern drill-down lateral reutilizable: focus trap basico (Esc +
 * Tab cycling), restauracion del foco al cerrar, scroll-lock del body,
 * aria-modal y respeto a `prefers-reduced-motion`.
 *
 * @module components/analytics/CrossMatrixDrillDown
 */

import { useCallback, useEffect, useId, useRef } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ExternalLink,
  CircleCheck,
  CircleAlert,
  CircleX,
  Gamepad2,
  Users,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { scoreToRAGWithNull } from '../../constants/analyticsThresholds';
import { formatMechanicName } from '../../lib/mechanicNames';

/**
 * Formato del improvement rate (slope ya calculado por backend) como "+12%"
 * o "-5%" con guion si no aplica. No usamos formatDelta porque el slope no
 * requiere baseline (es la pendiente de la regresion lineal).
 */
function formatImprovement(rate) {
  if (rate == null || !Number.isFinite(rate)) return '—';
  const rounded = Math.round(rate);
  if (rounded === 0) return '0%';
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

// Estilos del header del panel segun color RAG. Tokens `-on-alpha` cubren
// AA en ambos temas sin variantes light:.
const RAG_HEADER = {
  green: { text: 'text-success-on-alpha', icon: CircleCheck, label: 'Alto rendimiento' },
  amber: { text: 'text-warning-on-alpha', icon: CircleAlert, label: 'Rendimiento medio' },
  red: { text: 'text-error-on-alpha', icon: CircleX, label: 'Rendimiento bajo' },
  gray: { text: 'text-text-secondary', icon: CircleAlert, label: 'Sin datos' },
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Formatea segundos a una cadena humana (`1m 23s`, `45s`).
 */
function formatSeconds(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

/**
 * Panel drill-down lateral para una celda de la matriz cruzada.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen — Controla la presencia del panel.
 * @param {Object|null} props.cell — Celda enriquecida del endpoint cross
 *   matrix. Si null y `isOpen=true`, no se renderiza.
 * @param {() => void} props.onClose — Callback al cerrar (Esc, X o backdrop).
 */
function CrossMatrixDrillDown({ isOpen, cell, onClose }) {
  const { shouldReduceMotion } = useReducedMotion();
  const panelRef = useRef(null);
  // Guardamos el elemento que tenia foco antes de abrir para devolverselo
  // al cerrar (evita "perder" la posicion al user de teclado).
  const previousFocusRef = useRef(null);
  const titleId = useId();

  // Captura del foco previo al montar el panel.
  useEffect(() => {
    if (!isOpen) return undefined;
    previousFocusRef.current = document.activeElement;
    return () => {
      // Devolver foco al cerrar. setTimeout porque AnimatePresence aun
      // puede tener el panel en DOM en el momento de cleanup.
      const target = previousFocusRef.current;
      if (target && typeof target.focus === 'function') {
        setTimeout(() => target.focus(), 0);
      }
    };
  }, [isOpen]);

  // Focus inicial al primer elemento focuseable + scroll-lock body.
  useEffect(() => {
    if (!isOpen) return undefined;
    const focusFirst = () => {
      const focusables = panelRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables && focusables.length > 0) {
        focusables[0].focus({ preventScroll: true });
      }
    };
    // Pequeno delay para no competir con la animacion de entrada.
    const tid = setTimeout(focusFirst, 50);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(tid);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Esc + focus trap (Tab cycling).
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Salida temprana en cleanup states (cell puede ser null al cerrar).
  if (!cell && !isOpen) return null;

  const rag = scoreToRAGWithNull(cell?.avgScore);
  const ragConfig = RAG_HEADER[rag] || RAG_HEADER.gray;
  const RagIcon = ragConfig.icon;

  const mechanicLabel = formatMechanicName(cell?.mechanicName || 'Mecánica');
  const contextLabel = cell?.contextName || 'Contexto';

  // Link a sesiones — SessionsPage no lee aun query params (T-942 deja la
  // integracion para una iteracion posterior), pero el href ya lleva los
  // datos para no romper enlaces externos. data-* permite que un futuro
  // wrapper aplique los filtros automaticamente.
  const sessionsHref = `/sessions?contextId=${encodeURIComponent(
    cell?.contextId || ''
  )}&mechanicId=${encodeURIComponent(cell?.mechanicId || '')}`;

  return (
    <AnimatePresence>
      {isOpen && cell && (
        <>
          {/* Backdrop: bloquea scroll y absorbe click fuera para cerrar. */}
          <motion.button
            type="button"
            aria-label="Cerrar panel"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.stateChange, ease: EASING.outQuart }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 light:bg-black/20 backdrop-blur-sm cursor-default"
          />
          {/* Panel lateral. role=dialog + aria-modal asegura que lectores
              tratan este nodo como ventana modal aunque viva en flow. */}
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={shouldReduceMotion ? { opacity: 0 } : { x: 420, opacity: 0 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { x: 420, opacity: 0 }}
            transition={{ duration: DURATION.layout, ease: EASING.outExpo }}
            className={cn(
              'fixed top-0 right-0 z-50 h-[100dvh] w-[min(420px,92vw)]',
              'bg-background-base border-l border-border-default',
              'shadow-2xl flex flex-col overflow-hidden'
            )}
          >
            {/* Header con titulo y boton cerrar. */}
            <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted font-bold mb-1">
                  Detalle de la combinación
                </p>
                <h2
                  id={titleId}
                  className="text-base font-bold text-text-primary font-display leading-tight"
                >
                  {mechanicLabel} × {contextLabel}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar detalle"
                className={cn(
                  'rounded-lg p-2 text-text-muted hover:text-text-primary',
                  'hover:bg-background-elevated/60 transition-colors',
                  'focus-ring flex-shrink-0'
                )}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            {/* Score grande + RAG badge. */}
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs text-text-muted mb-1">Puntuación media</p>
                  <p
                    className={cn(
                      'text-4xl font-bold tabular-nums leading-none',
                      ragConfig.text
                    )}
                  >
                    {cell.avgScore != null ? Math.round(cell.avgScore) : '—'}
                    <span className="text-xl ml-1">%</span>
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                    'bg-background-elevated/60 border border-border-subtle',
                    ragConfig.text
                  )}
                >
                  <RagIcon size={12} aria-hidden="true" />
                  {ragConfig.label}
                </span>
              </div>
            </div>

            {/* Contenido scrollable. */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 custom-scrollbar">
              {/* Metricas. */}
              <section aria-labelledby={`${titleId}-metrics`}>
                <h3
                  id={`${titleId}-metrics`}
                  className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3"
                >
                  Métricas
                </h3>
                <dl className="grid grid-cols-2 gap-3">
                  <MetricItem
                    icon={Gamepad2}
                    label="Partidas"
                    value={cell.totalPlays ?? 0}
                  />
                  <MetricItem
                    icon={Users}
                    label="Alumnos"
                    value={cell.uniqueStudents ?? 0}
                  />
                  <MetricItem
                    icon={Clock}
                    label="Tiempo medio"
                    value={formatSeconds(cell.avgCompletionTime)}
                  />
                  <MetricItem
                    icon={TrendingUp}
                    label="Mejora"
                    value={formatImprovement(cell.improvementRate)}
                    tone={(() => {
                      if (cell.improvementRate == null) return 'neutral';
                      if (cell.improvementRate > 0) return 'positive';
                      if (cell.improvementRate < 0) return 'negative';
                      return 'neutral';
                    })()}
                  />
                </dl>
              </section>

              {/* Interpretacion narrativa (BI framework). */}
              {cell.interpretation && (
                <section aria-labelledby={`${titleId}-interp`}>
                  <h3
                    id={`${titleId}-interp`}
                    className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3"
                  >
                    Interpretación
                  </h3>
                  <div className="space-y-3 text-sm">
                    {cell.interpretation.whatHappened && (
                      <InterpretationItem
                        label="Qué pasa"
                        value={cell.interpretation.whatHappened}
                      />
                    )}
                    {cell.interpretation.soWhat && (
                      <InterpretationItem
                        label="Implicación"
                        value={cell.interpretation.soWhat}
                      />
                    )}
                    {cell.interpretation.nowWhat && (
                      <InterpretationItem
                        label="Qué hacer"
                        value={cell.interpretation.nowWhat}
                      />
                    )}
                  </div>
                </section>
              )}

              {/* Acciones rapidas. */}
              <section aria-labelledby={`${titleId}-actions`}>
                <h3
                  id={`${titleId}-actions`}
                  className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3"
                >
                  Acciones rápidas
                </h3>
                <Link
                  to={sessionsHref}
                  data-context-id={cell.contextId}
                  data-mechanic-id={cell.mechanicId}
                  className={cn(
                    'flex items-center justify-between gap-3 px-4 py-3 rounded-xl',
                    'bg-background-elevated/60 hover:bg-background-elevated',
                    'border border-border-subtle hover:border-border-default',
                    'text-sm text-text-primary transition-colors focus-ring'
                  )}
                >
                  <span>Ver sesiones con esta combinación</span>
                  <ExternalLink
                    size={14}
                    className="text-text-muted flex-shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

CrossMatrixDrillDown.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  cell: PropTypes.shape({
    mechanicId: PropTypes.string,
    mechanicName: PropTypes.string,
    contextId: PropTypes.string,
    contextName: PropTypes.string,
    avgScore: PropTypes.number,
    totalPlays: PropTypes.number,
    uniqueStudents: PropTypes.number,
    avgCompletionTime: PropTypes.number,
    improvementRate: PropTypes.number,
    scoreRag: PropTypes.object,
    learningRag: PropTypes.object,
    interpretation: PropTypes.shape({
      whatHappened: PropTypes.string,
      soWhat: PropTypes.string,
      nowWhat: PropTypes.string,
    }),
  }),
  onClose: PropTypes.func.isRequired,
};

/**
 * Item de metrica con icono Lucide, label y valor tabular.
 */
function MetricItem({ icon: Icon, label, value, tone = 'neutral' }) {
  const toneClass = (() => {
    if (tone === 'positive') return 'text-success-on-alpha';
    if (tone === 'negative') return 'text-error-on-alpha';
    return 'text-text-primary';
  })();
  return (
    <div className="rounded-xl bg-background-elevated/40 border border-border-subtle p-3">
      <div className="flex items-center gap-2 text-text-muted text-xs mb-1.5">
        <Icon size={12} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className={cn('text-base font-bold tabular-nums', toneClass)}>{value}</p>
    </div>
  );
}

MetricItem.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  tone: PropTypes.oneOf(['neutral', 'positive', 'negative']),
};

function InterpretationItem({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
        {label}
      </p>
      <p className="text-text-secondary leading-relaxed">{value}</p>
    </div>
  );
}

InterpretationItem.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
};

export default CrossMatrixDrillDown;
