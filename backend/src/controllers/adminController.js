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
const { userDTO } = require('../utils/dtos');

const assertTargetIsTeacher = user => {
  if (!user) {
    throw new NotFoundError('Usuario');
  }

  if (user.role !== 'teacher') {
    throw new ValidationError('Solo se pueden aprobar o rechazar cuentas de profesores');
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
        user: userDTO(target)
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

    logger.info('Profesor rechazado por super admin', {
      rejectedUserId: target._id,
      rejectedEmail: target.email,
      rejectedBy: req.user?._id
    });

    res.json({
      success: true,
      message: 'Profesor rechazado exitosamente',
      data: {
        user: userDTO(target)
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  approveTeacher,
  rejectTeacher
};
