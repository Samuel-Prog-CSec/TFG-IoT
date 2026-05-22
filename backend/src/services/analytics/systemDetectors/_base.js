/**
 * @fileoverview Interface base para detectores de alertas de sistema
 *
 * Cada detector implementa `run(ctx)` y devuelve un array de "findings" con
 * shape estable. El orquestador `systemAlertDetectionService` ejecuta todos
 * los detectores en paralelo y reconcilia los findings con las SystemAlerts
 * persistidas (insert / update / auto-resolve / escalation).
 *
 * Contrato: los detectores **no escriben en BD**. Solo retornan findings y
 * NUNCA lanzan errores fatales — si una query falla, loguean warn y
 * devuelven `[]` para no abortar al resto.
 *
 * @module services/analytics/systemDetectors/_base
 */

/**
 * @typedef {Object} SystemAlertFinding
 * @property {string} type            - Clave en SYSTEM_ALERT_TYPES
 * @property {'critical'|'warning'|'info'} severity
 * @property {string} source          - Subsistema (redis/mongo/auth/...)
 * @property {string} [component]     - Subcomponente específico
 * @property {string} title           - Titular (≤120)
 * @property {string} description     - Mensaje (≤280)
 * @property {string} [recommendation]- Sugerencia operativa (≤280)
 * @property {object} [data]          - Payload específico (umbral, valor observado…)
 * @property {string} [runbookUrl]
 * @property {Date}   [detectedAt]    - Timestamp del evento subyacente
 */

/**
 * @typedef {Object} SystemDetectionContext
 * @property {Date}    now
 * @property {object}  runtimeMetrics       - Snapshot agregado (CPU, mem, redis, etc.)
 * @property {object}  mongooseConn         - mongoose.connection
 * @property {object}  queues               - Map<queueName, BullMQ Queue>
 * @property {Date|null} lastRetentionRun
 * @property {object}  securityCounters     - Snapshot {auth_failed, account_locked, token_theft, consent_withdrawn}
 */

class SystemAlertDetector {
  /**
   * @param {object} opts
   * @param {string} opts.type
   * @param {string} opts.source
   */
  constructor({ type, source }) {
    if (!type) {
      throw new Error('SystemAlertDetector requiere `type`');
    }
    if (!source) {
      throw new Error('SystemAlertDetector requiere `source`');
    }
    this.type = type;
    this.source = source;
  }

  /**
   * Ejecuta la detección. Debe retornar SIEMPRE un array (vacío si no hay
   * findings). Nunca debe propagar errores no recuperables.
   *
   * @param {SystemDetectionContext} ctx
   * @returns {Promise<SystemAlertFinding[]>}
   */
  // eslint-disable-next-line no-unused-vars -- contrato abstracto
  async run(ctx) {
    throw new Error(`Detector ${this.type} no implementa run()`);
  }
}

module.exports = { SystemAlertDetector };
