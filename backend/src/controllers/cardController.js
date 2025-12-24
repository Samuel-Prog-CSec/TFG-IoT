/**
 * @fileoverview Controller para gestión CRUD de tarjetas RFID.
 * Maneja registro, actualización y consulta de tarjetas físicas.
 * @module controllers/cardController
 */

const Card = require('../models/Card');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');
const { cardDTO, cardListDTO, paginationDTO } = require('../utils/dtos');

/**
 * Obtener lista de tarjetas con paginación y filtros.
 *
 * GET /api/cards?page=1&limit=20&status=active&type=MIFARE_1KB&sortBy=uid
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getCards = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 30,
      sortBy = 'createdAt',
      order = 'desc',
      status,
      type,
      search
    } = req.query;

    // Construir filtro
    const filter = {};

    if (status) {
      filter.status = status;
    }
    if (type) {
      filter.type = type;
    }

    // Búsqueda por UID parcial
    if (search) {
      filter.uid = { $regex: search.toUpperCase(), $options: 'i' };
    }

    // Paginación
    const skip = (page - 1) * limit; // Calcular offset
    const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

    // Ejecutar query
    const [cards, total] = await Promise.all([
      Card.find(filter).sort(sortOptions).limit(parseInt(limit)).skip(skip),
      Card.countDocuments(filter)
    ]);

    logger.info('Lista de tarjetas obtenida', {
      requestedBy: req.user._id,
      filters: filter,
      resultsCount: cards.length
    });

    res.json({
      success: true,
      data: paginationDTO(cardListDTO(cards), {
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
 * Obtener una tarjeta específica por ID o UID.
 *
 * GET /api/cards/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getCardById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Intentar buscar por ID de MongoDB o por UID
    let card;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      // Es un ObjectId válido
      card = await Card.findById(id);
    } else {
      // Asumir que es un UID
      card = await Card.findOne({ uid: id.toUpperCase() });
    }

    if (!card) {
      throw new NotFoundError('Tarjeta');
    }

    res.json({
      success: true,
      data: cardDTO(card)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Registrar una nueva tarjeta RFID.
 *
 * POST /api/cards
 * Headers: Authorization: Bearer <token>
 * Body: { uid, type?, status? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createCard = async (req, res, next) => {
  try {
    const { uid, type, status } = req.body;

    // Verificar si el UID ya existe
    const existingCard = await Card.findOne({ uid: uid.toUpperCase() });

    if (existingCard) {
      throw new ConflictError('Una tarjeta con este UID ya existe');
    }

    // Crear tarjeta
    const card = await Card.create({
      uid: uid.toUpperCase(),
      type: type || 'UNKNOWN',
      status: status || 'active'
    });

    logger.info('Tarjeta registrada', {
      cardId: card._id,
      uid: card.uid,
      type: card.type,
      registeredBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Tarjeta registrada exitosamente',
      data: cardDTO(card)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Actualizar una tarjeta existente.
 *
 * PUT /api/cards/:id
 * Headers: Authorization: Bearer <token>
 * Body: { type?, status? }
 *
 * NOTA: El UID no se puede modificar después de crear la tarjeta.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateCard = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { type, status } = req.body;

    const card = await Card.findById(id);

    if (!card) {
      throw new NotFoundError('Tarjeta');
    }

    // Actualizar campos permitidos
    if (type) {
      card.type = type;
    }
    if (status) {
      card.status = status;
    }

    await card.save();

    logger.info('Tarjeta actualizada', {
      cardId: card._id,
      uid: card.uid,
      updatedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Tarjeta actualizada exitosamente',
      data: cardDTO(card)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Eliminar una tarjeta (soft delete cambiando status a 'lost').
 *
 * DELETE /api/cards/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteCard = async (req, res, next) => {
  try {
    const { id } = req.params;

    const card = await Card.findById(id);

    if (!card) {
      throw new NotFoundError('Tarjeta');
    }

    // Soft delete - marcar como perdida
    card.status = 'lost';
    await card.save();

    logger.info('Tarjeta marcada como perdida', {
      cardId: card._id,
      uid: card.uid,
      deletedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Tarjeta marcada como perdida exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Registrar múltiples tarjetas en batch.
 * Útil para importar un set completo de tarjetas.
 *
 * POST /api/cards/batch
 * Headers: Authorization: Bearer <token>
 * Body: { cards: [{ uid, type? }] }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createCardsBatch = async (req, res, next) => {
  try {
    const { cards } = req.body;

    if (!Array.isArray(cards) || cards.length === 0) {
      throw new ValidationError('Debe proporcionar un array de tarjetas');
    }

    // Normalizar UIDs a uppercase
    const normalizedCards = cards.map(card => ({
      ...card,
      uid: card.uid.toUpperCase(),
      type: card.type || 'UNKNOWN',
      status: card.status || 'active'
    }));

    // Verificar duplicados en el batch
    const uids = normalizedCards.map(c => c.uid);
    const uniqueUids = [...new Set(uids)];

    if (uids.length !== uniqueUids.length) {
      throw new ValidationError('Hay UIDs duplicados en el batch');
    }

    // Verificar si algún UID ya existe en la BD
    const existingCards = await Card.find({ uid: { $in: uniqueUids } });

    if (existingCards.length > 0) {
      const existingUids = existingCards.map(c => c.uid);
      throw new ConflictError(`Las siguientes tarjetas ya existen: ${existingUids.join(', ')}`);
    }

    // Insertar todas las tarjetas
    const createdCards = await Card.insertMany(normalizedCards);

    logger.info('Batch de tarjetas registradas', {
      count: createdCards.length,
      registeredBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: `${createdCards.length} tarjetas registradas exitosamente`,
      data: {
        cards: cardListDTO(createdCards),
        count: createdCards.length
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obtener estadísticas de uso de las tarjetas.
 *
 * GET /api/cards/stats
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getCardStats = async (req, res, next) => {
  try {
    const stats = await Card.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          inactive: {
            $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
          },
          lost: {
            $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] }
          },
          mifare1kb: {
            $sum: { $cond: [{ $eq: ['$type', 'MIFARE_1KB'] }, 1, 0] }
          },
          mifare4kb: {
            $sum: { $cond: [{ $eq: ['$type', 'MIFARE_4KB'] }, 1, 0] }
          },
          ntag: {
            $sum: { $cond: [{ $eq: ['$type', 'NTAG'] }, 1, 0] }
          },
          unknown: {
            $sum: { $cond: [{ $eq: ['$type', 'UNKNOWN'] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      total: 0,
      active: 0,
      inactive: 0,
      lost: 0,
      mifare1kb: 0,
      mifare4kb: 0,
      ntag: 0,
      unknown: 0
    };

    delete result._id;

    res.json({
      success: true,
      data: {
        stats: result
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCards,
  getCardById,
  createCard,
  updateCard,
  deleteCard,
  createCardsBatch,
  getCardStats
};
