/**
 * @fileoverview Constantes compartidas de alertas inteligentes (T-941).
 *
 * Centraliza iconos, etiquetas, estilos por severidad y catálogos de estado
 * para que `AlertsHub`, `AlertsPanel`, `AlertActionsMenu`, modales y badges
 * NO dupliquen estos mapeos (refactor DRY post-QA 2026-04-22).
 *
 * IMPORTANTE: cualquier cambio de paleta o tipos debe sincronizarse con
 * `backend/src/config/alerts.js` (única fuente de verdad de tipos).
 *
 * @module constants/alertTypes
 */

import {
  TrendingDown,
  Clock,
  AlertTriangle,
  Pause,
  TrendingUp,
  Minus,
  XCircle,
  Activity,
  Sparkles,
  Trophy,
  Layers,
  Repeat,
  AlertOctagon,
  Info,
  CheckCircle2,
  ClockArrowDown,
  BellOff,
  Pin
} from 'lucide-react';

/**
 * Mapeo tipo → icono Lucide.
 */
export const ALERT_TYPE_ICONS = {
  declining_performance: TrendingDown,
  inactivity: Clock,
  sudden_score_drop: AlertTriangle,
  consistent_timeout: Pause,
  improving_fast: TrendingUp,
  plateau_detected: Minus,
  high_abandonment: XCircle,
  engagement_drop: ClockArrowDown,
  recovery_after_drop: Sparkles,
  mastery_milestone: Trophy,
  mechanic_specific_struggle: Layers,
  sequence_stagnation: Repeat,
  sequence_order_errors: Activity
};

/**
 * Mapeo tipo → etiqueta en español. SINCRONIZADO con la fuente de verdad
 * `backend/src/config/alerts.js` (campo `label`). Si una alerta cambia su
 * label en el backend, actualizar también aquí para que `AlertCard` y la
 * notificación realtime coincidan en copy.
 */
export const ALERT_TYPE_LABELS = {
  declining_performance: 'Rendimiento en descenso',
  inactivity: 'Inactividad',
  sudden_score_drop: 'Caída repentina de puntuación',
  consistent_timeout: 'Timeouts consistentes',
  improving_fast: 'Mejora rápida',
  plateau_detected: 'Estancamiento detectado',
  high_abandonment: 'Alto abandono',
  engagement_drop: 'Caída de compromiso',
  recovery_after_drop: 'Recuperación tras bache',
  mastery_milestone: 'Hito de dominio',
  mechanic_specific_struggle: 'Dificultad específica por mecánica',
  sequence_stagnation: 'Estancamiento en Secuencia',
  sequence_order_errors: 'Errores de orden en Secuencia'
};

/**
 * Estilos por severidad. Reutilizados por todos los componentes.
 */
// Tokens `-on-alpha` cumplen AA en ambos temas sobre `bg-{tone}-base/10`
// (definidos en index.css). Sustituyen los workarounds Sprint 0
// `text-red-300 light:text-error-dark` y similares.
export const SEVERITY_STYLES = {
  critical: {
    dot: 'bg-error-base',
    glow: 'shadow-[0_0_6px_var(--color-error-glow)]',
    bg: 'bg-error-base/10',
    border: 'border-error-base/30',
    text: 'text-error-on-alpha',
    label: 'Críticas',
    Icon: AlertOctagon
  },
  warning: {
    dot: 'bg-warning-base',
    glow: 'shadow-[0_0_6px_var(--color-warning-glow)]',
    bg: 'bg-warning-base/10',
    border: 'border-warning-base/30',
    text: 'text-warning-on-alpha',
    label: 'Advertencia',
    Icon: AlertTriangle
  },
  info: {
    dot: 'bg-info-base',
    glow: 'shadow-[0_0_6px_var(--color-info-glow)]',
    bg: 'bg-info-base/10',
    border: 'border-info-base/30',
    text: 'text-info-on-alpha',
    label: 'Info',
    Icon: Info
  }
};

/**
 * Estilos por estado del ciclo de vida.
 */
export const STATUS_STYLES = {
  active: {
    label: 'Activas',
    badge: 'bg-error-base/10 text-error-base border-error-base/20',
    Icon: AlertOctagon
  },
  resolved: {
    label: 'Resueltas',
    badge: 'bg-success-base/10 text-success-base border-success-base/20',
    Icon: CheckCircle2
  },
  dismissed: {
    label: 'Descartadas',
    badge: 'bg-text-muted/10 text-text-muted border-text-muted/20',
    Icon: BellOff
  },
  snoozed: {
    label: 'En pausa',
    badge: 'bg-info-base/10 text-info-base border-info-base/20',
    Icon: Pause
  }
};

/** Orden de estados para tabs/filtros. */
export const STATUS_ORDER = ['active', 'snoozed', 'resolved', 'dismissed'];

/** Motivos admitidos para dismiss + traducción ES. */
export const DISMISS_REASONS = [
  { value: 'false_positive', label: 'Falso positivo' },
  { value: 'already_addressed', label: 'Ya lo he trabajado con el alumno' },
  { value: 'irrelevant', label: 'No es relevante' },
  { value: 'other', label: 'Otro motivo' }
];

/** Preset de días de snooze. */
export const SNOOZE_PRESETS_DAYS = [1, 7, 14, 30];

/** Color/icono para indicador "pinned". */
export const PIN_ICON = Pin;
