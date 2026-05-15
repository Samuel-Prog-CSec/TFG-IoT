/**
 * @fileoverview Servicio centralizado de verificación de consentimiento RGPD.
 *
 * Elimina la duplicación de lógica de consentimiento dispersa en controladores
 * (analyticsController, analyticsAdvancedController) y proporciona una API
 * única para consultar y exigir consentimiento.
 *
 * Referencia legal:
 * - Art. 6.1 RGPD — Licitud del tratamiento
 * - Art. 8 RGPD + Art. 7 LOPDGDD — Consentimiento parental (menores)
 * - Art. 21 RGPD — Derecho de oposición
 *
 * @module services/consentService
 */

const userRepository = require('../repositories/userRepository');
const { ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger').child({ component: 'consentService' });

/**
 * Exige consentimiento activo para un propósito específico.
 * Lanza ForbiddenError si el consentimiento no está otorgado.
 *
 * @param {string} userId - ID del usuario a verificar
 * @param {string} purpose - Propósito requerido ('performance_analytics' | 'educational_tracking')
 * @throws {ForbiddenError} Si el consentimiento no está activo para el propósito indicado
 */
async function requireConsent(userId, purpose) {
  const user = await userRepository.findById(userId, {
    select: 'consent'
  });

  if (!user?.hasConsentFor(purpose)) {
    logger.info('Acceso denegado por falta de consentimiento', {
      userId,
      purpose
    });

    throw new ForbiddenError(
      'El tutor de este estudiante ha ejercido su derecho de oposición a analytics (Art. 21 RGPD)'
    );
  }
}

module.exports = {
  requireConsent
};
