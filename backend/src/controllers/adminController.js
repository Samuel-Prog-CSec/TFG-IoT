/**
 * @fileoverview Controller de administración para Super Admin.
 * Gestiona la aprobación/rechazo de cuentas de profesores.
 *
 * Endpoints:
 * - POST /api/admin/users/:id/approve
 * - POST /api/admin/users/:id/reject
 *
 * @module controllers/adminController
 */

const userRepository = require('../repositories/userRepository');
const { ValidationError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');
const { toUserDTOV1, toUserListDTOV1 } = require('../utils/dtos');
const { sendSuccess, sendPaginated } = require('../utils/responseHelper');
const { revokeAllUserTokens } = require('../middlewares/auth');
const { disconnectUserSockets } = require('../utils/socketUtils');
const { getRequestContext } = require('../utils/securityLogger');
const { escapeRegex } = require('../utils/escapeRegex');

const assertTargetIsTeacher = user => {
  if (!user) {
    throw new NotFoundError('Usuario');
  }

  if (user.role !== 'teacher') {
    throw new ValidationError('Solo se pueden aprobar o rechazar cuentas de profesores');
  }
};

const assertTargetIsPendingTeacher = user => {
  assertTargetIsTeacher(user);

  if (user.accountStatus !== 'pending_approval') {
    throw new ValidationError('Solo se pueden aprobar o rechazar profesores en estado pendiente');
  }
};

/**
 * Obtener lista paginada de profesores pendientes de aprobación.
 */
const getPendingTeachers = async (req, res) => {
  const { page = 1, limit = 20, sortBy = 'createdAt', order = 'desc', search } = req.query;

  const filter = {
    role: 'teacher',
    accountStatus: 'pending_approval'
  };

  if (search) {
    const safeSearch = escapeRegex(search);
    filter.$or = [
      { name: { $regex: safeSearch, $options: 'i' } },
      { email: { $regex: safeSearch, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;
  const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

  const [teachers, total] = await Promise.all([
    userRepository.find(filter, {
      sort: sortOptions,
      limit: Number.parseInt(limit, 10),
      skip,
      select: '-password'
    }),
    userRepository.count(filter)
  ]);

  sendPaginated(res, toUserListDTOV1(teachers), {
    page: Number.parseInt(page, 10),
    limit: Number.parseInt(limit, 10),
    total
  });
};

/**
 * Aprueba un profesor (accountStatus = approved).
 */
const approveTeacher = async (req, res) => {
  const { id } = req.params;

  const target = await userRepository.findById(id);
  if (!target) {
    throw new NotFoundError('Usuario');
  }

  assertTargetIsPendingTeacher(target);

  target.accountStatus = 'approved';
  await target.save();

  logger.info('Profesor aprobado por super admin', {
    approvedUserId: target._id,
    approvedEmail: target.email,
    approvedBy: req.user?._id
  });

  sendSuccess(res, { user: toUserDTOV1(target) }, 'Profesor aprobado exitosamente');
};

/**
 * Rechaza un profesor (accountStatus = rejected).
 */
const rejectTeacher = async (req, res) => {
  const { id } = req.params;

  const target = await userRepository.findById(id);
  if (!target) {
    throw new NotFoundError('Usuario');
  }

  assertTargetIsPendingTeacher(target);

  target.accountStatus = 'rejected';
  await target.save();

  await revokeAllUserTokens(target._id.toString(), 'account_rejected', {
    ...getRequestContext(req),
    userId: target._id,
    rejectedBy: req.user?._id
  });

  const io = req.app.get('io');
  disconnectUserSockets(io, target._id.toString(), 'ACCOUNT_REJECTED');

  logger.info('Profesor rechazado por super admin', {
    rejectedUserId: target._id,
    rejectedEmail: target.email,
    rejectedBy: req.user?._id
  });

  sendSuccess(res, { user: toUserDTOV1(target) }, 'Profesor rechazado exitosamente');
};

module.exports = {
  getPendingTeachers,
  approveTeacher,
  rejectTeacher
};
