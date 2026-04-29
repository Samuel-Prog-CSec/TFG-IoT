/**
 * @fileoverview Helpers centralizados para respuestas API.
 * Estandariza el formato de respuesta en todos los controllers,
 * eliminando la construcción manual repetitiva de `{ success: true, data }`.
 *
 * Contrato de respuesta:
 * - Éxito:    { success: true, data, message? }
 * - Paginado: { success: true, data: [...], pagination: { page, limit, total, totalPages, hasNext, hasPrev } }
 * - Creado:   { success: true, data, message? } con status 201
 * - Sin contenido: status 204 sin body
 *
 * @module utils/responseHelper
 */

const { toPaginatedDTOV1 } = require('./dtos');

/**
 * Envía una respuesta JSON exitosa.
 *
 * @param {import('express').Response} res - Objeto de respuesta de Express
 * @param {*} data - Datos a enviar en la respuesta
 * @param {string} [message] - Mensaje descriptivo opcional
 * @param {number} [status=200] - Código de estado HTTP
 *
 * @example
 * sendSuccess(res, toUserDTOV1(user));
 * sendSuccess(res, null, 'Operación completada');
 */
const sendSuccess = (res, data, message, status = 200) => {
  const body = { success: true, data };

  if (message) {
    body.message = message;
  }

  res.status(status).json(body);
};

/**
 * Envía una respuesta JSON de recurso creado (201).
 *
 * @param {import('express').Response} res - Objeto de respuesta de Express
 * @param {*} data - Datos del recurso creado
 * @param {string} [message] - Mensaje descriptivo opcional
 *
 * @example
 * sendCreated(res, toSessionDTOV1(session), 'Sesión creada exitosamente');
 */
const sendCreated = (res, data, message) => {
  sendSuccess(res, data, message, 201);
};

/**
 * Envía una respuesta JSON paginada.
 * Integra toPaginatedDTOV1 internamente para generar los metadatos de paginación.
 *
 * @param {import('express').Response} res - Objeto de respuesta de Express
 * @param {Array} data - Array de datos ya transformados con DTO
 * @param {Object} paginationOpts - Opciones de paginación
 * @param {number} paginationOpts.page - Página actual
 * @param {number} paginationOpts.limit - Items por página
 * @param {number} paginationOpts.total - Total de items disponibles
 *
 * @example
 * sendPaginated(res, toUserListDTOV1(users), { page: 1, limit: 20, total: 100 });
 */
const sendPaginated = (res, data, paginationOpts) => {
  res.json({
    success: true,
    ...toPaginatedDTOV1(data, paginationOpts)
  });
};

/**
 * Envía una respuesta sin contenido (204).
 * Utilizado en operaciones DELETE o cuando no hay datos que devolver.
 *
 * @param {import('express').Response} res - Objeto de respuesta de Express
 *
 * @example
 * sendNoContent(res);
 */
const sendNoContent = res => {
  res.status(204).end();
};

module.exports = {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendNoContent
};
