/**
 * @fileoverview Constantes compartidas de SystemAlerts (T-942).
 *
 * Espejo de `constants/alertTypes.js` (alertas pedagógicas del teacher) para
 * las alertas operativas del super_admin. Comparte la paleta SEVERITY_STYLES
 * y STATUS_STYLES para reutilizar componentes.
 *
 * IMPORTANTE: sincronizar con `backend/src/config/systemAlerts.js` (única
 * fuente de verdad de tipos y sources).
 *
 * @module constants/systemAlertTypes
 */

import {
  Activity,
  Database,
  MemoryStick,
  ListTodo,
  Lock,
  ShieldAlert,
  ShieldOff,
  ShieldCheck,
  Fingerprint,
  UserCog,
  UserMinus,
  ImageOff,
  Archive,
  FileX2,
  Gauge,
  HardDrive,
  Network,
  Cpu
} from 'lucide-react';

// Reexportamos los estilos compartidos para que SystemAlertsHub no tenga que
// importar de dos sitios distintos.
export {
  SEVERITY_STYLES,
  STATUS_STYLES,
  STATUS_ORDER,
  DISMISS_REASONS,
  PIN_ICON
} from './alertTypes';

/** Tipo → icono Lucide. */
export const SYSTEM_ALERT_TYPE_ICONS = {
  redis_high_latency: Activity,
  mongo_disconnected: Database,
  memory_pressure: MemoryStick,
  queue_backlog: ListTodo,
  upstash_commands_quota: Gauge,
  atlas_storage_quota: HardDrive,
  rate_limit_store_fallback: Network,
  in_memory_cache_low_hit: Cpu,
  account_lockout_spike: Lock,
  auth_failed_spike: ShieldAlert,
  token_theft_detected: ShieldOff,
  rfid_hmac_spike: Fingerprint,
  pending_teachers_aging: UserCog,
  inactive_teachers: UserMinus,
  context_without_assets: ImageOff,
  data_retention_lag: Archive,
  consent_withdrawal_spike: FileX2,
  admin_approval_spike: ShieldCheck
};

// Tipo → etiqueta corta en español, en lenguaje claro y sin jerga técnica
// (el detalle técnico vive en la descripción y en "Detalles técnicos" de la
// tarjeta). Sincronizado con los `label` de backend/src/config/systemAlerts.js.
export const SYSTEM_ALERT_TYPE_LABELS = {
  redis_high_latency: 'El sistema responde con lentitud',
  mongo_disconnected: 'La base de datos no responde',
  memory_pressure: 'Memoria del servidor casi llena',
  queue_backlog: 'Tareas en segundo plano acumuladas',
  upstash_commands_quota: 'Cerca del límite del plan gratuito',
  atlas_storage_quota: 'Almacenamiento casi lleno',
  rate_limit_store_fallback: 'Protección frente a abusos reducida',
  in_memory_cache_low_hit: 'Rendimiento de la caché bajo',
  account_lockout_spike: 'Aumento de cuentas bloqueadas',
  auth_failed_spike: 'Muchos intentos de acceso fallidos',
  token_theft_detected: 'Posible acceso no autorizado',
  rfid_hmac_spike: 'Actividad sospechosa en los lectores RFID',
  pending_teachers_aging: 'Profesores esperando aprobación hace tiempo',
  inactive_teachers: 'Profesores inactivos',
  context_without_assets: 'Contexto sin contenido',
  data_retention_lag: 'Limpieza periódica de datos retrasada',
  consent_withdrawal_spike: 'Aumento de retiradas de consentimiento',
  admin_approval_spike: 'Aumento inusual de aprobaciones o rechazos'
};

/** Subsistemas (filtro principal en la UI). */
export const SYSTEM_ALERT_SOURCES = [
  'redis',
  'mongo',
  'memory',
  'queue',
  'auth',
  'moderation',
  'compliance',
  'admin'
];

/**
 * Estilos por source. Pareja de paletas alineadas con la signature
 * "DIRECCIÓN" del super_admin (más sobria, sin saturación pedagógica).
 */
export const SOURCE_STYLES = {
  redis: {
    label: 'Rendimiento',
    badge: 'bg-rose-500/10 text-rose-300 light:text-rose-700 border-rose-500/30'
  },
  // BUG-A11Y-SYSALERT-BADGES (QA Sprint 0): el proyecto usa `light:` custom
  // variant, no la clase `.dark` de Tailwind. Las clases `dark:text-*`
  // existentes nunca aplicaban. Refactor: default = color luminoso (dark
  // mode), `light:` invierte a tono oscuro (AA sobre bg claro).
  mongo: {
    label: 'Base de datos',
    badge: 'bg-emerald-500/10 text-emerald-300 light:text-emerald-700 border-emerald-500/30'
  },
  memory: {
    label: 'Memoria',
    badge: 'bg-amber-500/10 text-amber-300 light:text-amber-800 border-amber-500/30'
  },
  queue: {
    label: 'Tareas',
    badge: 'bg-sky-500/10 text-sky-300 light:text-sky-700 border-sky-500/30'
  },
  auth: {
    label: 'Seguridad',
    badge: 'bg-red-500/10 text-red-300 light:text-red-700 border-red-500/30'
  },
  moderation: {
    label: 'Moderación',
    badge: 'bg-indigo-500/10 text-indigo-300 light:text-indigo-700 border-indigo-500/30'
  },
  compliance: {
    label: 'Protección de datos',
    badge: 'bg-teal-500/10 text-teal-300 light:text-teal-700 border-teal-500/30'
  },
  admin: {
    label: 'Administración',
    badge: 'bg-violet-500/10 text-violet-300 light:text-violet-700 border-violet-500/30'
  }
};

/** Preset de horas de snooze (las alertas de sistema se piensan en horas). */
export const SYSTEM_SNOOZE_PRESETS_HOURS = [1, 6, 24, 72];

/** Severidades de SystemAnnouncement (banner a profesores). */
export const ANNOUNCEMENT_SEVERITIES = ['info', 'warning', 'urgent'];

/** Audiencias de SystemAnnouncement. */
export const ANNOUNCEMENT_AUDIENCES = [
  { value: 'all_teachers', label: 'Todos los profesores' },
  { value: 'all_users', label: 'Todos los usuarios (profes + admins)' }
];

/**
 * Estilos visuales por severidad del announcement (no usar SEVERITY_STYLES
 * de alertas — ahí 'urgent' no existe).
 */
export const ANNOUNCEMENT_SEVERITY_STYLES = {
  // Tokens `-on-alpha` (index.css) cumplen AA en ambos temas. Eliminados
  // los workarounds light:text-{tone}-dark del Sprint 0.
  info: {
    label: 'Informativo',
    container: 'bg-info-base/10 border-info-base/30 text-info-on-alpha',
    iconClass: 'text-info-base'
  },
  warning: {
    label: 'Aviso',
    container: 'bg-warning-base/10 border-warning-base/30 text-warning-on-alpha',
    iconClass: 'text-warning-base'
  },
  urgent: {
    label: 'Urgente',
    container: 'bg-error-base/10 border-error-base/40 text-error-on-alpha',
    iconClass: 'text-error-base'
  }
};
