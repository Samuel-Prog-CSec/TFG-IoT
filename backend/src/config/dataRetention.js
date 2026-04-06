/**
 * @fileoverview Configuración de política de retención de datos.
 *
 * Fundamentación normativa:
 * - Art. 5.1.e RGPD: los datos deben conservarse durante no más tiempo
 *   del necesario para los fines del tratamiento.
 * - Considerando 26 RGPD: los datos anónimos no están sujetos al RGPD,
 *   por lo que las métricas anonimizadas pueden conservarse indefinidamente.
 *
 * @module config/dataRetention
 */

module.exports = {
  /** Meses tras los cuales los eventos detallados de GamePlay se anonimizan.
   *  Se elimina playerId y events[].cardUid. Las métricas agregadas se conservan. */
  GAMEPLAY_ANONYMIZATION_MONTHS: 12,

  /** Meses de inactividad tras los cuales un estudiante inactivo se elimina (hard delete).
   *  Se aplica solo a estudiantes con status 'inactive'. */
  INACTIVE_STUDENT_DELETION_MONTHS: 24,

  /** Meses de retención de logs de seguridad (referencia para documentación). */
  SECURITY_LOGS_RETENTION_MONTHS: 12,

  /** Propósitos válidos para consentimiento parental (Art. 8 RGPD). */
  CONSENT_PURPOSES: ['educational_tracking', 'performance_analytics']
};
