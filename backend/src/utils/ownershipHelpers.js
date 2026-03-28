/**
 * @fileoverview Utilidades para verificación de propiedad de recursos.
 * Centraliza los checks de ownership que se repiten en múltiples controllers,
 * eliminando duplicación y garantizando mensajes de error consistentes.
 *
 * Variantes:
 * - ensureResourceOwnership:        solo el creador tiene acceso
 * - ensureResourceOwnershipOrAdmin:  creador o super_admin
 * - ensureStudentBelongsToTeacher:   verifica que el teacher creó al alumno
 *
 * @module utils/ownershipHelpers
 */

const { ForbiddenError, NotFoundError } = require('./errors');

/**
 * Extrae el ID del creador de una entidad.
 * Maneja tanto ObjectId directo como objeto populado.
 *
 * @param {Object} entity - Documento Mongoose con campo createdBy
 * @returns {string|undefined} ID del creador como string
 */
const getOwnerId = entity =>
  entity?.createdBy?._id?.toString?.() ?? entity?.createdBy?.toString?.();

/**
 * Verifica que el usuario es el creador del recurso.
 * Lanza ForbiddenError si no coincide.
 *
 * @param {Object} entity - Documento Mongoose con campo createdBy
 * @param {string|Object} userId - ID del usuario actual (string u ObjectId)
 * @param {string} resourceName - Nombre del recurso para el mensaje de error
 * @throws {ForbiddenError} Si el usuario no es el creador
 */
const ensureResourceOwnership = (entity, userId, resourceName) => {
  if (getOwnerId(entity) !== userId.toString()) {
    throw new ForbiddenError(`No tienes permiso para acceder a este ${resourceName}`);
  }
};

/**
 * Verifica que el usuario es el creador del recurso O es super_admin.
 * Los super_admin siempre tienen acceso.
 *
 * @param {Object} entity - Documento Mongoose con campo createdBy
 * @param {Object} user - Usuario actual (req.user) con _id y role
 * @param {string} resourceName - Nombre del recurso para el mensaje de error
 * @throws {ForbiddenError} Si el usuario no es creador ni super_admin
 */
const ensureResourceOwnershipOrAdmin = (entity, user, resourceName) => {
  if (user.role === 'super_admin') {
    return;
  }
  ensureResourceOwnership(entity, user._id, resourceName);
};

/**
 * Verifica que un teacher tiene acceso al alumno (lo creó).
 * Los super_admin siempre tienen acceso.
 * Busca el alumno en BD y compara createdBy.
 *
 * @param {string} studentId - ID del alumno a verificar
 * @param {Object} user - Usuario actual (req.user) con _id y role
 * @param {Object} userRepository - Repositorio de usuarios
 * @throws {NotFoundError} Si el alumno no existe
 * @throws {ForbiddenError} Si el teacher no creó al alumno
 */
const ensureStudentBelongsToTeacher = async (studentId, user, userRepository) => {
  if (user.role !== 'teacher') {
    return;
  }
  const student = await userRepository.findById(studentId, { select: 'createdBy' });
  if (!student) {
    throw new NotFoundError('Alumno');
  }
  if (student.createdBy?.toString() !== user._id.toString()) {
    throw new ForbiddenError('No tienes permiso para ver este alumno');
  }
};

module.exports = {
  getOwnerId,
  ensureResourceOwnership,
  ensureResourceOwnershipOrAdmin,
  ensureStudentBelongsToTeacher
};
