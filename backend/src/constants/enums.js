/**
 * @fileoverview Enums compartidos entre validators (Zod) y modelos (Mongoose).
 *
 * Única fuente de verdad para los valores enumerados que viven en ambas capas
 * — la frontera Zod y el schema Mongoose. Si un enum solo lo usa una capa
 * (p.ej. `timeRange` en analytics, exclusivo de Zod), no pertenece aquí.
 *
 * Importar siempre desde este módulo en lugar de duplicar literales:
 *   const { DIFFICULTY } = require('../constants/enums');
 *   z.enum(DIFFICULTY)        // en un validator
 *   { type: String, enum: DIFFICULTY }   // en un schema
 *
 * El test `tests/unit/constants/enums.test.js` valida que ningún schema
 * Mongoose ni validator Zod queda desincronizado respecto a estas constantes.
 *
 * @module constants/enums
 */

/** Dificultad de la sesión (auto, manual de tres niveles, o custom). */
const DIFFICULTY = Object.freeze(['easy', 'medium', 'hard', 'custom']);

/** Estados de una sesión de juego. */
const SESSION_STATUS = Object.freeze(['created', 'active', 'completed']);

/** Estados de una partida individual (un alumno dentro de una sesión). */
const PLAY_STATUS = Object.freeze(['in-progress', 'completed', 'abandoned', 'paused']);

/** Roles de usuario. */
const ROLES = Object.freeze(['super_admin', 'teacher', 'student']);

/** Estado lógico del usuario (activo/desactivado por admin). */
const USER_STATUS = Object.freeze(['active', 'inactive']);

/** Estado de aprobación de cuenta (alta de profesor pendiente de revisión). */
const ACCOUNT_STATUS = Object.freeze(['pending_approval', 'approved', 'rejected']);

/** Estado de un mazo. */
const DECK_STATUS = Object.freeze(['active', 'archived']);

/**
 * Tipos de evento dentro del log de una partida.
 * Incluye `server_restart` para registrar interrupciones por reinicio del backend.
 */
const EVENT_TYPE = Object.freeze([
  'card_scanned',
  'correct',
  'error',
  'timeout',
  'round_start',
  'round_end',
  'server_restart'
]);

/** Finalidades del consentimiento parental (Art. 8 RGPD + Art. 7 LOPDGDD). */
const CONSENT_PURPOSES = Object.freeze(['educational_tracking', 'performance_analytics']);

/** Canal por el que se recogió el consentimiento. */
const CONSENT_CHANNEL = Object.freeze(['web_form', 'api', 'admin_panel']);

/** Acción registrada en el historial de consentimiento. */
const CONSENT_ACTION = Object.freeze(['granted', 'withdrawn']);

/**
 * Reglas por dificultad de la mecánica Secuencia.
 *
 * Cada entrada define:
 * - `maxAttemptsPerCard`: número total de intentos por carta antes de bloquearla.
 *   Al alcanzar este límite, la carta se da por fallada y el cursor avanza
 *   (la secuencia NO se reinicia, decisión pedagógica explícita).
 * - `hints`: array ordenado de pistas que se entregan tras cada fallo previo
 *   al bloqueo. Por ejemplo, en `easy` el primer fallo entrega `'partial'`
 *   y el segundo `'full'`; el tercero bloquea sin pista.
 *
 * Tipos de pista:
 * - `'partial'`: palabra parcialmente revelada (`L?ó?` para `León`).
 * - `'full'`: palabra completa (`León`).
 */
const SEQUENCE_DIFFICULTY_RULES = Object.freeze({
  easy: Object.freeze({
    maxAttemptsPerCard: 3,
    hints: Object.freeze(['partial', 'full'])
  }),
  medium: Object.freeze({
    maxAttemptsPerCard: 2,
    hints: Object.freeze([])
  }),
  hard: Object.freeze({
    maxAttemptsPerCard: 1,
    hints: Object.freeze([])
  })
});

/** Tipos de pista soportados por Secuencia (para validadores y DTOs). */
const SEQUENCE_HINT_TYPES = Object.freeze(['partial', 'full']);

/** Estados intra-ronda de Secuencia. */
const SEQUENCE_PHASE = Object.freeze(['memorizing', 'reproducing', 'completed']);

/** Resultado de una carta dentro de una ronda Secuencia. */
const SEQUENCE_CARD_STATUS = Object.freeze(['correct', 'blocked', 'timedOut']);

module.exports = {
  DIFFICULTY,
  SESSION_STATUS,
  PLAY_STATUS,
  ROLES,
  USER_STATUS,
  ACCOUNT_STATUS,
  DECK_STATUS,
  EVENT_TYPE,
  CONSENT_PURPOSES,
  CONSENT_CHANNEL,
  CONSENT_ACTION,
  SEQUENCE_DIFFICULTY_RULES,
  SEQUENCE_HINT_TYPES,
  SEQUENCE_PHASE,
  SEQUENCE_CARD_STATUS
};
