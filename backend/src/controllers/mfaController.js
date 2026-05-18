/**
 * @fileoverview Controlador de MFA TOTP para super_admin (T-905 B7).
 *
 * Endpoints expuestos (todos bajo `/api/auth/mfa/*`):
 *
 * - `POST /setup-init`: genera secret TOTP nuevo (no persistido todavía) y
 *   devuelve `otpauthUrl` + `qrCodeDataUrl` para escanear con la app de
 *   autenticación. El secret se guarda temporalmente en Redis con TTL 5min
 *   hasta que el usuario confirme con un código válido.
 *
 * - `POST /setup-verify`: el usuario envía el primer código TOTP. Si verifica,
 *   se persiste `mfa.enabled=true`, secret cifrado (AES-256-GCM, AAD 'mfa') y
 *   se generan 8 backup codes (hash bcrypt, devueltos en plaintext una sola vez).
 *
 * - `POST /challenge`: el usuario envía un código TOTP. Si verifica, devuelve
 *   un MFA token JWT corto (5min, `JWT_MFA_SECRET`) que se presenta en el
 *   header `X-MFA-Token` en endpoints protegidos por `requireMfa`.
 *
 * - `POST /verify-backup-code`: alternativa al challenge usando un backup code
 *   single-use. El código se marca como `usedAt` y no se puede reutilizar.
 *
 * - `POST /backup-codes/regenerate`: requiere MFA reciente. Regenera 8 códigos
 *   nuevos, invalida los anteriores marcándolos todos como usados.
 *
 * - `DELETE /`: deshabilita MFA. Requiere MFA token reciente + password reentry.
 *
 * @module controllers/mfaController
 */

const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const totp = require('../utils/totp');

const userRepository = require('../repositories/userRepository');
const redisService = require('../services/redisService');
const { encryptField, decryptField } = require('../utils/cryptoUtils');
const { issueMfaToken } = require('../middlewares/requireMfa');
const { ValidationError, UnauthorizedError, ForbiddenError } = require('../utils/errors');
const { sendSuccess } = require('../utils/responseHelper');
const { logSecurityEvent, getRequestContext } = require('../utils/securityLogger');
const { revokeAllUserTokens, invalidateUserCache } = require('../middlewares/auth');
const logger = require('../utils/logger').child({ component: 'mfaController' });

const SETUP_NAMESPACE = 'mfa:setup';
const SETUP_TTL_SECONDS = 5 * 60;
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BYTES = 8; // 16 hex chars → 4 grupos de 4 con guiones

// Tolerancia de un step (30s antes/después) para evitar fallos por clock skew (window=1).

/**
 * Genera un backup code en formato `XXXX-XXXX-XXXX-XXXX` (hex uppercase).
 */
const generateBackupCode = () => {
  const hex = crypto.randomBytes(BACKUP_CODE_BYTES).toString('hex').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
};

const buildSetupKey = userId => String(userId);

const assertSuperAdmin = req => {
  if (req.user?.role !== 'super_admin') {
    throw new ForbiddenError('MFA disponible solo para super_admin', 'AUTHZ_DENIED');
  }
};

/**
 * POST /api/auth/mfa/setup-init
 * Genera un secret nuevo, NO lo persiste todavía.
 */
const setupInit = async (req, res) => {
  assertSuperAdmin(req);
  const userId = String(req.user._id);

  const secret = totp.generateSecret(20); // 20 bytes → 32 chars base32
  await redisService.setWithTTL(SETUP_NAMESPACE, buildSetupKey(userId), secret, SETUP_TTL_SECONDS);

  // El frontend (qrcode.react) renderiza el QR desde otpauthUrl — evitamos
  // dependencia QR backend. Devolvemos también el secret base32 en texto para
  // permitir entrada manual si el usuario no puede escanear (accesibilidad).
  const issuer = 'EduPlay RFID';
  const accountName = encodeURIComponent(req.user.email);
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${accountName}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

  logSecurityEvent('AUTH_LOGIN_SUCCESS', {
    ...getRequestContext(req),
    userId,
    note: 'mfa_setup_init'
  });

  sendSuccess(
    res,
    {
      otpauthUrl,
      secret,
      issuer,
      accountName: req.user.email
    },
    'Setup MFA iniciado. Escanea el QR (frontend) y verifica con un código.'
  );
};

/**
 * POST /api/auth/mfa/setup-verify
 * Body: { code }
 * Persiste enabled=true + backup codes.
 */
const setupVerify = async (req, res) => {
  assertSuperAdmin(req);
  const userId = String(req.user._id);
  const { code } = req.body;

  const pending = await redisService.get(SETUP_NAMESPACE, buildSetupKey(userId));
  if (!pending) {
    throw new ValidationError('No hay setup MFA pendiente. Reinicia con setup-init.');
  }

  const valid = totp.verify({ token: code, secret: pending, window: 1 });
  if (!valid) {
    logSecurityEvent('AUTH_LOGIN_FAILED', {
      ...getRequestContext(req),
      userId,
      reason: 'MFA_SETUP_VERIFY_INVALID'
    });
    throw new UnauthorizedError('Código TOTP inválido. Inténtalo de nuevo.', 'MFA_CODE_INVALID');
  }

  // Generar backup codes (plaintext para devolver una vez + hash bcrypt para persistir).
  const plainCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  const hashedCodes = await Promise.all(
    plainCodes.map(async plain => ({ hash: await bcrypt.hash(plain, 10), usedAt: null }))
  );

  await userRepository.updateById(userId, {
    'mfa.enabled': true,
    'mfa.secret': encryptField(pending, 'mfa'),
    'mfa.backupCodes': hashedCodes,
    'mfa.enabledAt': new Date()
  });

  await redisService.del(SETUP_NAMESPACE, buildSetupKey(userId));
  await invalidateUserCache(userId);

  // Forzar re-login para que el siguiente request pase por requireMfa: defensa
  // en profundidad — el token actual quedará inválido tras el flag de security.
  await revokeAllUserTokens(userId, 'mfa_enabled', getRequestContext(req));

  logSecurityEvent('AUTH_TOKENS_REVOKED_ALL', {
    ...getRequestContext(req),
    userId,
    reason: 'mfa_enabled'
  });

  sendSuccess(
    res,
    { backupCodes: plainCodes },
    'MFA habilitado. Guarda los códigos de respaldo en un sitio seguro — NO se mostrarán de nuevo.'
  );
};

/**
 * POST /api/auth/mfa/challenge
 * Body: { code }
 * Devuelve un MFA token corto si el código es válido.
 */
const challenge = async (req, res) => {
  assertSuperAdmin(req);
  const userId = String(req.user._id);
  const { code } = req.body;

  // Cargar secret cifrado (select:false → fetch explícito).
  const userDoc = await userRepository.findById(userId, { select: '+mfa.secret +mfa.enabled' });
  if (!userDoc?.mfa?.enabled) {
    throw new ForbiddenError('MFA no habilitado para este usuario', 'MFA_NOT_ENROLLED');
  }
  const secret = decryptField(userDoc.mfa.secret, 'mfa');

  const valid = totp.verify({ token: code, secret, window: 1 });
  if (!valid) {
    logSecurityEvent('AUTH_LOGIN_FAILED', {
      ...getRequestContext(req),
      userId,
      reason: 'MFA_CHALLENGE_INVALID'
    });
    throw new UnauthorizedError('Código TOTP inválido', 'MFA_CODE_INVALID');
  }

  await userRepository.updateById(userId, { 'mfa.lastUsedAt': new Date() });

  const mfaToken = issueMfaToken(userId);
  sendSuccess(res, { mfaToken, expiresIn: 300 }, 'MFA verificado. Token válido durante 5 minutos.');
};

/**
 * POST /api/auth/mfa/verify-backup-code
 * Body: { backupCode }
 * Marca el código como usado y devuelve un MFA token.
 */
const verifyBackupCode = async (req, res) => {
  assertSuperAdmin(req);
  const userId = String(req.user._id);
  const { backupCode } = req.body;

  const userDoc = await userRepository.findById(userId, {
    select: '+mfa.backupCodes +mfa.enabled'
  });
  if (!userDoc?.mfa?.enabled) {
    throw new ForbiddenError('MFA no habilitado', 'MFA_NOT_ENROLLED');
  }

  let matchedIndex = -1;
  for (let i = 0; i < userDoc.mfa.backupCodes.length; i++) {
    const entry = userDoc.mfa.backupCodes[i];
    if (entry.usedAt) {
      continue;
    }

    const matches = await bcrypt.compare(backupCode, entry.hash);
    if (matches) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex === -1) {
    logSecurityEvent('AUTH_LOGIN_FAILED', {
      ...getRequestContext(req),
      userId,
      reason: 'MFA_BACKUP_CODE_INVALID'
    });
    throw new UnauthorizedError('Backup code inválido o ya utilizado', 'MFA_CODE_INVALID');
  }

  // Marcar como usado. Construimos copias explícitas para evitar problemas con
  // sub-documentos Mongoose; el array se serializa luego como POJOs limpios.
  const updated = userDoc.mfa.backupCodes.map((entry, idx) => ({
    hash: entry.hash,
    usedAt: idx === matchedIndex ? new Date() : entry.usedAt
  }));
  await userRepository.updateById(userId, {
    'mfa.backupCodes': updated,
    'mfa.lastUsedAt': new Date()
  });

  logSecurityEvent('AUTH_LOGIN_SUCCESS', {
    ...getRequestContext(req),
    userId,
    note: 'mfa_backup_code_used'
  });

  const mfaToken = issueMfaToken(userId);
  sendSuccess(
    res,
    { mfaToken, expiresIn: 300 },
    'Backup code aceptado. Token MFA válido 5 minutos.'
  );
};

/**
 * POST /api/auth/mfa/backup-codes/regenerate
 * Requiere MFA reciente (validado por middleware requireMfa).
 */
const regenerateBackupCodes = async (req, res) => {
  assertSuperAdmin(req);
  const userId = String(req.user._id);

  const plainCodes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  const hashedCodes = await Promise.all(
    plainCodes.map(async plain => ({ hash: await bcrypt.hash(plain, 10), usedAt: null }))
  );

  await userRepository.updateById(userId, { 'mfa.backupCodes': hashedCodes });

  logSecurityEvent('AUTH_LOGIN_SUCCESS', {
    ...getRequestContext(req),
    userId,
    note: 'mfa_backup_codes_regenerated'
  });

  sendSuccess(
    res,
    { backupCodes: plainCodes },
    'Backup codes regenerados. Guarda los nuevos códigos — los anteriores ya no son válidos.'
  );
};

/**
 * DELETE /api/auth/mfa
 * Body: { password }
 * Deshabilita MFA. Requiere MFA token reciente + password reentry.
 */
const disable = async (req, res) => {
  assertSuperAdmin(req);
  const userId = String(req.user._id);
  const { password } = req.body;

  // Doble verificación: req.mfaVerified ya garantiza MFA reciente, pero exigimos
  // también password para defenderse de un token MFA robado.
  const userDoc = await userRepository.findById(userId, { select: '+password' });
  if (!userDoc) {
    throw new UnauthorizedError('Usuario no encontrado');
  }
  const passwordMatches = await userDoc.comparePassword(password);
  if (!passwordMatches) {
    logSecurityEvent('AUTH_PASSWORD_CHANGE_FAILED', {
      ...getRequestContext(req),
      userId,
      reason: 'MFA_DISABLE_PASSWORD_INVALID'
    });
    throw new UnauthorizedError('Contraseña incorrecta', 'PASSWORD_INVALID');
  }

  await userRepository.updateById(userId, {
    'mfa.enabled': false,
    'mfa.secret': null,
    'mfa.backupCodes': []
  });
  await invalidateUserCache(userId);

  logSecurityEvent('AUTH_TOKENS_REVOKED_ALL', {
    ...getRequestContext(req),
    userId,
    reason: 'mfa_disabled'
  });
  await revokeAllUserTokens(userId, 'mfa_disabled', getRequestContext(req));

  logger.warn('MFA deshabilitado por super_admin', { userId });
  sendSuccess(res, null, 'MFA deshabilitado. Inicia sesión de nuevo para confirmar.');
};

/**
 * GET /api/auth/mfa/status
 * Estado del MFA del super_admin actual: enabled, fechas y códigos restantes.
 * Cuando enabled=false el frontend pinta el wizard de setup; cuando true,
 * el panel de gestión (regenerar / deshabilitar).
 */
const status = async (req, res) => {
  assertSuperAdmin(req);
  const userId = String(req.user._id);

  // backupCodes tiene `select:false` por defecto — explícito para contar restantes.
  const userDoc = await userRepository.findById(userId, {
    select: '+mfa.backupCodes +mfa.enabled'
  });

  if (!userDoc?.mfa?.enabled) {
    sendSuccess(res, {
      enabled: false,
      enabledAt: null,
      lastUsedAt: null,
      backupCodesTotal: 0,
      backupCodesRemaining: 0
    });
    return;
  }

  const codes = Array.isArray(userDoc.mfa.backupCodes) ? userDoc.mfa.backupCodes : [];
  const remaining = codes.filter(entry => !entry.usedAt).length;

  sendSuccess(res, {
    enabled: true,
    enabledAt: userDoc.mfa.enabledAt,
    lastUsedAt: userDoc.mfa.lastUsedAt,
    backupCodesTotal: codes.length,
    backupCodesRemaining: remaining
  });
};

module.exports = {
  setupInit,
  setupVerify,
  challenge,
  verifyBackupCode,
  regenerateBackupCodes,
  disable,
  status
};
