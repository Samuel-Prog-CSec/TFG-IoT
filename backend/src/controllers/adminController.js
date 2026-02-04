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

const User = require('../models/User');
const { ValidationError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');
const { toUserDTOV1, toUserListDTOV1, toPaginatedDTOV1 } = require('../utils/dtos');
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

/**
 * Obtener lista paginada de profesores pendientes de aprobación.
 */
const getPendingTeachers = async (req, res, next) => {
  try {
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
      User.find(filter)
        .sort(sortOptions)
        .limit(Number.parseInt(limit, 10))
        .skip(skip)
        .select('-password'),
      User.countDocuments(filter)
    ]);

    res.json({
      success: true,
      ...toPaginatedDTOV1(
        toUserListDTOV1(teachers),
        Number.parseInt(page, 10),
        Number.parseInt(limit, 10),
        total
      )
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Aprueba un profesor (accountStatus = approved).
 */
const approveTeacher = async (req, res, next) => {
  try {
    const { id } = req.params;

    const target = await User.findById(id);
    if (!target) {
      throw new NotFoundError('Usuario');
    }

    assertTargetIsTeacher(target);

    target.accountStatus = 'approved';
    await target.save();

    logger.info('Profesor aprobado por super admin', {
      approvedUserId: target._id,
      approvedEmail: target.email,
      approvedBy: req.user?._id
    });

    res.json({
      success: true,
      message: 'Profesor aprobado exitosamente',
      data: {
        user: toUserDTOV1(target)
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Rechaza un profesor (accountStatus = rejected).
 */
const rejectTeacher = async (req, res, next) => {
  try {
    const { id } = req.params;

    const target = await User.findById(id);
    if (!target) {
      throw new NotFoundError('Usuario');
    }

    assertTargetIsTeacher(target);

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

    res.json({
      success: true,
      message: 'Profesor rechazado exitosamente',
      data: {
        user: toUserDTOV1(target)
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPendingTeachers,
  approveTeacher,
  rejectTeacher
};
