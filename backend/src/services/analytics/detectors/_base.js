/**
 * @fileoverview Interface base para detectores de alertas (T-941).
 *
 * Cada detector implementa `run(ctx)` y devuelve un array de "findings"
 * con shape estable. El servicio orquestador (`alertDetectionService`)
 * llama a cada detector en paralelo y reconcilia los findings con las
 * SmartAlerts persistidas (insert / update / auto-resolve).
 *
 * Convención: los detectores **no escriben en BD**. Solo retornan findings.
 * La persistencia y el ciclo de vida son responsabilidad del servicio.
 *
 * @module services/analytics/detectors/_base
 */

/**
 * @typedef {Object} AlertFinding
 * @property {string} studentId      - ObjectId del alumno.
 * @property {string} type           - Tipo de alerta (clave en ALERT_TYPES).
 * @property {'critical'|'warning'|'info'} severity
 * @property {string} description    - Mensaje human-readable (ES, sin PII).
 * @property {string} recommendation - Sugerencia pedagógica.
 * @property {Date} detectedAt       - Timestamp estable del evento subyacente.
 * @property {object} [data]         - Payload específico del tipo.
 * @property {string} [gamePlayId]   - Partida que disparó (si aplica).
 */

/**
 * @typedef {Object} DetectionContext
 * @property {string} teacherId
 * @property {Array<object>} students - Lista de alumnos {_id, name, studentMetrics, ...}
 * @property {Date} referenceDate    - "Hoy" — permite simular fechas pasadas en backfill.
 */

class AlertDetector {
  /**
   * @param {object} opts
   * @param {string} opts.type
   */
  constructor({ type }) {
    if (!type) {
      throw new Error('AlertDetector requiere `type`');
    }
    this.type = type;
  }

  /**
   * Ejecuta la detección. Debe retornar SIEMPRE un array (vacío si no hay findings).
   * Nunca debe lanzar errores no recuperables: si una query falla, el detector
   * loguea warn y devuelve `[]` para no abortar el resto de detectores.
   *
   * @param {DetectionContext} ctx
   * @returns {Promise<AlertFinding[]>}
   */
  // eslint-disable-next-line no-unused-vars -- contrato abstracto
  async run(ctx) {
    throw new Error(`Detector ${this.type} no implementa run()`);
  }
}

module.exports = { AlertDetector };
