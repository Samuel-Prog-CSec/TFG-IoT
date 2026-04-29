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
  CONSENT_ACTION
};
