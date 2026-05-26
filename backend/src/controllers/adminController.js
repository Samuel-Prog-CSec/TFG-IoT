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
const { buildFilter } = require('../utils/filterBuilder');
const { revokeAllUserTokens } = require('../middlewares/auth');
const { disconnectUserSockets } = require('../utils/socketUtils');
const { getRequestContext } = require('../utils/securityLogger');
const accountLockoutService = require('../services/accountLockoutService');
const securityCounters = require('../services/security/securityCountersService');

const pendingTeacherFilterMappings = {
  search: { type: 'search', fields: ['name', 'email'] }
};

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

  const filter = buildFilter({ search }, pendingTeacherFilterMappings, {
    baseFilter: { role: 'teacher', accountStatus: 'pending_approval' }
  });

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
 *
 * Atomic check-and-set: el `updateOne` filtra por `role: 'teacher'` +
 * `accountStatus: 'pending_approval'`, de modo que dos super_admin que
 * disparen la acción concurrentemente sobre el mismo docente compiten en
 * una sola operación atómica de Mongo — el segundo recibe `null` y el
 * estado no se sobrescribe. Si `null`, diagnosticamos best-effort con un
 * `findById` posterior para distinguir 404 (no existe) de 409 (ya procesado).
 */
const approveTeacher = async (req, res) => {
  const { id } = req.params;

  const target = await userRepository.updateOne(
    { _id: id, role: 'teacher', accountStatus: 'pending_approval' },
    { $set: { accountStatus: 'approved' } }
  );

  if (!target) {
    // Diagnóstico best-effort para el mensaje de error. La operación NO se
    // aplicó (el atomic falló), así que aquí no hay riesgo de doble-aprobar.
    const existing = await userRepository.findById(id);
    assertTargetIsPendingTeacher(existing); // tira NotFound o ValidationError
    // Caso teórico: el existing pasó la aserción pero el atomic había
    // fallado — race entre los dos awaits con otro super_admin procesando.
    throw new ValidationError('La cuenta ya fue procesada por otro administrador');
  }

  // Incrementa el contador de aprobaciones administrativas para que el
  // detector `adminApprovalSpike` pueda emitir alerta si una sesión de
  // super_admin procesa más solicitudes por hora de las esperadas.
  securityCounters.increment('admin_approval').catch(() => {});

  logger.info('Profesor aprobado por super admin', {
    approvedUserId: target._id,
    approvedEmail: target.email,
    approvedBy: req.user?._id
  });

  sendSuccess(res, { user: toUserDTOV1(target) }, 'Profesor aprobado exitosamente');
};

/**
 * Rechaza un profesor (accountStatus = rejected). Mismo patrón atómico que
 * `approveTeacher` para blindar contra TOCTOU concurrente.
 */
const rejectTeacher = async (req, res) => {
  const { id } = req.params;

  const target = await userRepository.updateOne(
    { _id: id, role: 'teacher', accountStatus: 'pending_approval' },
    { $set: { accountStatus: 'rejected' } }
  );

  if (!target) {
    const existing = await userRepository.findById(id);
    assertTargetIsPendingTeacher(existing);
    throw new ValidationError('La cuenta ya fue procesada por otro administrador');
  }

  // Mismo contador que `approveTeacher`: el detector `adminApprovalSpike`
  // observa el agregado por hora, no distingue aprobar vs rechazar.
  securityCounters.increment('admin_approval').catch(() => {});

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

/**
 * Desbloquea manualmente una cuenta bloqueada por intentos fallidos.
 *
 * Endpoint de emergencia: si un docente queda bloqueado y necesita acceso urgente
 * antes de que expire la ventana de lockout (15min por defecto), un super_admin
 * puede liberar la cuenta. La acción queda registrada como evento de seguridad.
 *
 * NOTA (T-905 B7): cuando MFA esté operativo se aplicará `requireMfa` a este
 * endpoint. De momento el control de acceso es role super_admin + auth.
 *
 * POST /api/admin/lockouts/unlock
 * Body: { email }
 */
const unlockAccount = async (req, res) => {
  const { email } = req.body;
  const requestContext = getRequestContext(req);

  const cleared = await accountLockoutService.forceUnlock(email, {
    ...requestContext,
    triggeredBy: req.user?._id?.toString()
  });

  if (!cleared) {
    // No diferenciamos "no existía" vs "no estaba bloqueado" para no facilitar
    // enumeración; respondemos OK idempotente.
    logger.info('Unlock account: no había lockout activo (idempotente)', {
      email,
      triggeredBy: req.user?._id
    });
  } else {
    logger.info('Unlock account ejecutado por super admin', {
      email,
      triggeredBy: req.user?._id
    });
  }

  sendSuccess(res, { unlocked: cleared }, 'Cuenta desbloqueada exitosamente');
};

module.exports = {
  getPendingTeachers,
  approveTeacher,
  rejectTeacher,
  unlockAccount
};
