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
 * Verifica si el usuario tiene consentimiento activo para performance_analytics.
 *
 * @param {string} userId - ID del usuario a verificar
 * @returns {Promise<boolean>} true si el consentimiento está activo para performance_analytics
 */
async function canTrackPerformance(userId) {
  const user = await userRepository.findById(userId, {
    select: 'consent'
  });

  if (!user) {
    logger.warn('Usuario no encontrado al verificar consentimiento de performance_analytics', {
      userId
    });
    return false;
  }

  return user.hasConsentFor('performance_analytics');
}

/**
 * Verifica si el usuario tiene consentimiento activo para educational_tracking.
 *
 * @param {string} userId - ID del usuario a verificar
 * @returns {Promise<boolean>} true si el consentimiento está activo para educational_tracking
 */
async function canTrackEducational(userId) {
  const user = await userRepository.findById(userId, {
    select: 'consent'
  });

  if (!user) {
    logger.warn('Usuario no encontrado al verificar consentimiento de educational_tracking', {
      userId
    });
    return false;
  }

  return user.hasConsentFor('educational_tracking');
}

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

/**
 * Obtiene el estado completo de consentimiento de un usuario.
 *
 * @param {string} userId - ID del usuario
 * @returns {Promise<{granted: boolean, purposes: string[], grantedAt: Date|null, withdrawnAt: Date|null}|null>}
 *   Objeto con el estado de consentimiento, o null si el usuario no existe
 */
async function getConsentStatus(userId) {
  const user = await userRepository.findById(userId, {
    select: 'consent'
  });

  if (!user) {
    logger.warn('Usuario no encontrado al obtener estado de consentimiento', { userId });
    return null;
  }

  const consent = user.consent || {};

  return {
    granted: consent.granted || false,
    purposes: consent.purposes || [],
    grantedAt: consent.grantedAt || null,
    withdrawnAt: consent.withdrawnAt || null
  };
}

module.exports = {
  canTrackPerformance,
  canTrackEducational,
  requireConsent,
  getConsentStatus
};
