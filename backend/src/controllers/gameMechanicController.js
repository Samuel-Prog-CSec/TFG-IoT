/**
 * @fileoverview Controller para gestión CRUD de mecánicas de juego.
 * Maneja las diferentes mecánicas disponibles (association, sequence, memory, etc.).
 * @module controllers/gameMechanicController
 */

const GameMechanic = require('../models/GameMechanic');
const { NotFoundError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');
const { toGameMechanicDTOV1, toGameMechanicListDTOV1, toPaginatedDTOV1 } = require('../utils/dtos');
const { escapeRegex } = require('../utils/escapeRegex');

/**
 * Obtener lista de mecánicas con paginación y filtros.
 *
 * GET /api/mechanics?page=1&limit=20&isActive=true&sortBy=name
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getMechanics = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc',
      isActive,
      search
    } = req.query;

    // Construir filtro
    const filter = {};

    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    // Búsqueda por nombre o displayName
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { displayName: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    // Paginación
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

    // Ejecutar query
    const [mechanics, total] = await Promise.all([
      GameMechanic.find(filter).sort(sortOptions).limit(parseInt(limit)).skip(skip),
      GameMechanic.countDocuments(filter)
    ]);

    logger.info('Lista de mecánicas obtenida', {
      requestedBy: req.user._id,
      filters: filter,
      resultsCount: mechanics.length
    });

    res.json({
      success: true,
      ...toPaginatedDTOV1(toGameMechanicListDTOV1(mechanics), {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      })
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener una mecánica específica por ID o nombre.
 *
 * GET /api/mechanics/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getMechanicById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Intentar buscar por ID de MongoDB o por nombre
    let mechanic;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      mechanic = await GameMechanic.findById(id);
    } else {
      // Buscar por nombre (ej: 'association', 'sequence')
      mechanic = await GameMechanic.findOne({ name: id.toLowerCase() });
    }

    if (!mechanic) {
      throw new NotFoundError('Mecánica de juego');
    }

    res.json({
      success: true,
      data: toGameMechanicDTOV1(mechanic)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Crear una nueva mecánica de juego.
 * Solo profesores pueden crear mecánicas.
 *
 * POST /api/mechanics
 * Headers: Authorization: Bearer <token>
 * Body: { name, displayName, description, icon?, rules?, isActive? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createMechanic = async (req, res, next) => {
  try {
    const { name, displayName, description, icon, rules, isActive } = req.body;

    // Verificar si el nombre ya existe
    const existingMechanic = await GameMechanic.findOne({ name: name.toLowerCase() });

    if (existingMechanic) {
      throw new ConflictError('Una mecánica con este nombre ya existe');
    }

    // Crear mecánica
    const mechanic = await GameMechanic.create({
      name: name.toLowerCase(),
      displayName,
      description,
      icon: icon || '🎮',
      rules: rules || {},
      isActive: isActive !== undefined ? isActive : true
    });

    logger.info('Mecánica creada', {
      mechanicId: mechanic._id,
      name: mechanic.name,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Mecánica creada exitosamente',
      data: toGameMechanicDTOV1(mechanic)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Actualizar una mecánica existente.
 *
 * PUT /api/mechanics/:id
 * Headers: Authorization: Bearer <token>
 * Body: { displayName?, description?, icon?, rules?, isActive? }
 *
 * NOTA: El nombre no se puede modificar para mantener consistencia.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateMechanic = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { displayName, description, icon, rules, isActive } = req.body;

    const mechanic = await GameMechanic.findById(id);

    if (!mechanic) {
      throw new NotFoundError('Mecánica de juego');
    }

    // Actualizar campos permitidos (name es inmutable)
    if (displayName) {
      mechanic.displayName = displayName;
    }
    if (description) {
      mechanic.description = description;
    }
    if (icon) {
      mechanic.icon = icon;
    }
    if (rules) {
      mechanic.rules = { ...mechanic.rules, ...rules };
    }
    if (isActive !== undefined) {
      mechanic.isActive = isActive;
    }

    await mechanic.save();

    logger.info('Mecánica actualizada', {
      mechanicId: mechanic._id,
      name: mechanic.name,
      updatedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Mecánica actualizada exitosamente',
      data: toGameMechanicDTOV1(mechanic)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Eliminar (desactivar) una mecánica.
 * Soft delete cambiando isActive a false.
 *
 * DELETE /api/mechanics/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteMechanic = async (req, res, next) => {
  try {
    const { id } = req.params;

    const mechanic = await GameMechanic.findById(id);

    if (!mechanic) {
      throw new NotFoundError('Mecánica de juego');
    }

    // Soft delete
    mechanic.isActive = false;
    await mechanic.save();

    logger.info('Mecánica desactivada', {
      mechanicId: mechanic._id,
      name: mechanic.name,
      deletedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Mecánica desactivada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener solo mecánicas activas.
 * Endpoint público para el frontend.
 *
 * GET /api/mechanics/active
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getActiveMechanics = async (req, res, next) => {
  try {
    const mechanics = await GameMechanic.find({ isActive: true }).sort({ name: 1 }).select('-__v');

    res.json({
      success: true,
      data: toGameMechanicListDTOV1(mechanics),
      meta: {
        count: mechanics.length
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMechanics,
  getMechanicById,
  createMechanic,
  updateMechanic,
  deleteMechanic,
  getActiveMechanics
};
