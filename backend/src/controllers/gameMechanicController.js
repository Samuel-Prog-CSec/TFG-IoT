/**
 * @fileoverview Controller de mecánicas de juego (solo lectura).
 *
 * Las mecánicas son inmutables a nivel de API: solo los desarrolladores
 * las definen mediante seeders y migraciones. Por tanto, este controller
 * únicamente expone operaciones de lectura.
 *
 * @module controllers/gameMechanicController
 */

const gameMechanicRepository = require('../repositories/gameMechanicRepository');
const { NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');
const { toGameMechanicDTOV1, toGameMechanicListDTOV1 } = require('../utils/dtos');
const { sendSuccess, sendPaginated } = require('../utils/responseHelper');
const { buildFilter } = require('../utils/filterBuilder');
const { cacheGet } = require('../utils/cacheHelper');

const mechanicFilterMappings = {
  isActive: { field: 'isActive', type: 'exact' },
  search: { type: 'search', fields: ['name', 'displayName'] }
};

/**
 * Obtener lista de mecánicas con paginación y filtros.
 *
 * GET /api/mechanics?page=1&limit=20&isActive=true&sortBy=name
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getMechanics = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    order = 'desc',
    isActive,
    search
  } = req.query;

  const filter = buildFilter({ isActive, search }, mechanicFilterMappings);

  const skip = (page - 1) * limit;
  const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

  const [mechanics, total] = await Promise.all([
    gameMechanicRepository.find(filter, {
      sort: sortOptions,
      limit: Number.parseInt(limit, 10),
      skip
    }),
    gameMechanicRepository.count(filter)
  ]);

  logger.info('Lista de mecánicas obtenida', {
    requestedBy: req.user._id,
    filters: filter,
    resultsCount: mechanics.length
  });

  sendPaginated(res, toGameMechanicListDTOV1(mechanics), {
    page: Number.parseInt(page, 10),
    limit: Number.parseInt(limit, 10),
    total
  });
};

/**
 * Obtener una mecánica específica por ID o nombre.
 *
 * GET /api/mechanics/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getMechanicById = async (req, res) => {
  const { id } = req.params;

  const mechanic = await cacheGet(
    'cache:mechanic',
    `byId:${id}`,
    async () => {
      let result;
      if (id.match(/^[0-9a-f]{24}$/i)) {
        result = await gameMechanicRepository.findById(id);
      } else {
        result = await gameMechanicRepository.findOne({ name: id.toLowerCase() });
      }
      return result;
    },
    3600
  );

  if (!mechanic) {
    throw new NotFoundError('Mecánica de juego');
  }

  sendSuccess(res, toGameMechanicDTOV1(mechanic));
};

/**
 * Obtener solo mecánicas activas.
 * Endpoint público para el frontend.
 *
 * GET /api/mechanics/active
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const getActiveMechanics = async (req, res) => {
  const mechanics = await gameMechanicRepository.find(
    { isActive: true },
    { sort: { name: 1 }, select: '-__v' }
  );

  sendSuccess(res, toGameMechanicListDTOV1(mechanics));
};

module.exports = {
  getMechanics,
  getMechanicById,
  getActiveMechanics
};
