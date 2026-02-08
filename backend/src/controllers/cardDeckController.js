/**
 * @fileoverview Controller para gestión CRUD de mazos (CardDeck).
 * Un mazo permite a un profesor reutilizar mapeos de tarjetas RFID para un contexto.
 * @module controllers/cardDeckController
 */

const CardDeck = require('../models/CardDeck');
const GameContext = require('../models/GameContext');
const Card = require('../models/Card');
const {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError
} = require('../utils/errors');
const logger = require('../utils/logger');
const { toCardDeckDetailDTOV1, toCardDeckListDTOV1, toPaginatedDTOV1 } = require('../utils/dtos');
const { escapeRegex } = require('../utils/escapeRegex');

/**
 * Límites de configuración para mazos de cartas.
 * @constant {number} MAX_DECK_CARDS - Máximo de tarjetas por mazo (coherente con configuración de sesión)
 * @constant {number} MIN_DECK_CARDS - Mínimo de tarjetas por mazo (necesario para juego básico)
 * @constant {number} MAX_DECKS_PER_TEACHER - Máximo de mazos activos por profesor.
 *   Decisión de diseño: 50 mazos permite flexibilidad suficiente para múltiples cursos/temáticas
 *   sin comprometer rendimiento de queries ni UX (listas muy largas son difíciles de gestionar).
 *   Los mazos archivados NO cuentan hacia este límite.
 */
const MAX_DECK_CARDS = 20;
const MIN_DECK_CARDS = 2;
const MAX_DECKS_PER_TEACHER = 50;

function validateDeckMappingsStructure(cardMappings) {
  if (!Array.isArray(cardMappings)) {
    throw new ValidationError('cardMappings debe ser un array');
  }
  if (cardMappings.length < MIN_DECK_CARDS || cardMappings.length > MAX_DECK_CARDS) {
    throw new ValidationError(
      `cardMappings debe tener entre ${MIN_DECK_CARDS} y ${MAX_DECK_CARDS} elementos`
    );
  }

  const uids = cardMappings.map(m => (m.uid || '').toString().trim().toUpperCase());
  const cardIds = cardMappings.map(m => m.cardId?.toString());
  const assignedValues = cardMappings.map(m => (m.assignedValue || '').toString().trim());

  if (uids.some(uid => !uid)) {
    throw new ValidationError('Todos los mapeos deben incluir uid');
  }
  if (cardIds.some(id => !id)) {
    throw new ValidationError('Todos los mapeos deben incluir cardId');
  }
  if (assignedValues.some(v => !v)) {
    throw new ValidationError('Todos los mapeos deben incluir assignedValue');
  }

  if (new Set(uids).size !== uids.length) {
    throw new ValidationError('Los UIDs en cardMappings deben ser únicos');
  }
  if (new Set(cardIds).size !== cardIds.length) {
    throw new ValidationError('Los cardIds en cardMappings deben ser únicos');
  }
  if (new Set(assignedValues).size !== assignedValues.length) {
    throw new ValidationError('No puede haber valores asignados duplicados en cardMappings');
  }

  // Normalizar los UIDs en el propio array para persistir coherente
  return cardMappings.map(m => ({
    ...m,
    uid: m.uid.toString().trim().toUpperCase(),
    assignedValue: m.assignedValue.toString().trim()
  }));
}

async function validateContextAndAssignedValues(contextId, cardMappings) {
  const context = await GameContext.findById(contextId);
  if (!context) {
    throw new NotFoundError('Contexto de juego');
  }

  // assignedValue debe existir dentro de los assets del contexto (por value)
  const allowedValues = new Set((context.assets || []).map(a => a.value));
  const invalidValues = cardMappings.map(m => m.assignedValue).filter(v => !allowedValues.has(v));

  if (invalidValues.length > 0) {
    throw new ValidationError(
      `assignedValue no existe en los assets del contexto: ${[...new Set(invalidValues)].join(', ')}`
    );
  }

  return context;
}

async function validateCardsExistAndActive(cardMappings) {
  const cardIds = cardMappings.map(m => m.cardId);
  const cards = await Card.find({ _id: { $in: cardIds } });

  if (cards.length !== cardIds.length) {
    throw new ValidationError('Una o más tarjetas no existen');
  }

  const inactiveCards = cards.filter(card => card.status !== 'active');
  if (inactiveCards.length > 0) {
    throw new ValidationError(
      `Las siguientes tarjetas no están activas: ${inactiveCards.map(c => c.uid).join(', ')}`
    );
  }

  // Validar consistencia uid declarado vs uid de la tarjeta
  const cardById = new Map(cards.map(c => [c._id.toString(), c]));
  const mismatch = cardMappings.filter(m => {
    const card = cardById.get(m.cardId.toString());
    return !card || card.uid !== m.uid;
  });

  if (mismatch.length > 0) {
    throw new ValidationError(
      `UID no coincide con la tarjeta para: ${mismatch.map(m => m.uid).join(', ')}`
    );
  }

  return cards;
}

/**
 * GET /api/decks
 */
const getDecks = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc',
      contextId,
      status,
      search
    } = req.query;

    const filter = { createdBy: req.user._id };

    if (contextId) {
      filter.contextId = contextId;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { description: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

    const [decks, total] = await Promise.all([
      CardDeck.find(filter)
        .populate('contextId', 'contextId name')
        .sort(sortOptions)
        .limit(Number.parseInt(limit, 10))
        .skip(skip),
      CardDeck.countDocuments(filter)
    ]);

    logger.info('Lista de mazos obtenida', {
      requestedBy: req.user._id,
      filters: { ...filter, ...(search ? { search } : {}) },
      resultsCount: decks.length
    });

    res.json({
      success: true,
      ...toPaginatedDTOV1(toCardDeckListDTOV1(decks), {
        page: Number.parseInt(page, 10),
        limit: Number.parseInt(limit, 10),
        total
      })
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/decks/:id
 */
const getDeckById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deck = await CardDeck.findById(id)
      .populate('contextId', 'contextId name assets')
      .populate('createdBy', 'name email')
      .populate('cardMappings.cardId', 'uid type status metadata');

    if (!deck) {
      throw new NotFoundError('Mazo');
    }

    if (deck.createdBy._id.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para ver este mazo');
    }

    res.json({
      success: true,
      data: toCardDeckDetailDTOV1(deck)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/decks
 */
const createDeck = async (req, res, next) => {
  try {
    const { name, description, contextId, cardMappings, status } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new ValidationError('name es requerido (mínimo 2 caracteres)');
    }

    if (!contextId) {
      throw new ValidationError('contextId es requerido');
    }

    // Verificar límite de mazos activos por profesor
    const activeDecksCount = await CardDeck.countDocuments({
      createdBy: req.user._id,
      status: 'active'
    });

    if (activeDecksCount >= MAX_DECKS_PER_TEACHER) {
      throw new ValidationError(
        `Has alcanzado el límite de ${MAX_DECKS_PER_TEACHER} mazos activos. ` +
          'Archiva alguno existente para poder crear más.'
      );
    }

    const normalizedMappings = validateDeckMappingsStructure(cardMappings);

    // Validar contexto y que assignedValue pertenece al contexto
    await validateContextAndAssignedValues(contextId, normalizedMappings);

    // Validar tarjetas
    await validateCardsExistAndActive(normalizedMappings);

    const deck = await CardDeck.create({
      name: name.trim(),
      description: description ? description.trim() : undefined,
      contextId,
      cardMappings: normalizedMappings,
      status: status || 'active',
      createdBy: req.user._id
    });

    await deck.populate([{ path: 'contextId', select: 'contextId name' }]);

    logger.info('Mazo creado', {
      deckId: deck._id,
      name: deck.name,
      contextId: deck.contextId,
      cardsCount: deck.cardMappings.length,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Mazo creado exitosamente',
      data: toCardDeckDetailDTOV1(deck)
    });
  } catch (error) {
    // Duplicado por índice único (createdBy + name)
    if (error?.code === 11000) {
      return next(new ConflictError('Ya existe un mazo con ese nombre'));
    }
    next(error);
  }
};

/**
 * PUT /api/decks/:id
 */
const parseDeckName = name => {
  if (name === undefined) {
    return undefined;
  }
  if (typeof name !== 'string' || name.trim().length < 2) {
    throw new ValidationError('name debe tener al menos 2 caracteres');
  }
  return name.trim();
};

const parseDeckDescription = description =>
  description === undefined ? undefined : description ? description.trim() : undefined;

const parseDeckStatus = status => {
  if (status === undefined) {
    return undefined;
  }
  if (!['active', 'archived'].includes(status)) {
    throw new ValidationError('status inválido');
  }
  return status;
};

const applyDeckFieldUpdates = (deck, { name, description, status }) => {
  const parsedName = parseDeckName(name);
  if (parsedName !== undefined) {
    deck.name = parsedName;
  }

  const parsedDescription = parseDeckDescription(description);
  if (parsedDescription !== undefined) {
    deck.description = parsedDescription;
  }

  const parsedStatus = parseDeckStatus(status);
  if (parsedStatus !== undefined) {
    deck.status = parsedStatus;
  }
};

const applyDeckMappingUpdates = async (deck, { contextId, cardMappings }) => {
  const hasContextUpdate = contextId !== undefined;
  const hasCardMappingsUpdate = cardMappings !== undefined;
  const finalContextId = hasContextUpdate ? contextId : deck.contextId;

  if (hasContextUpdate) {
    deck.contextId = contextId;
  }

  if (hasCardMappingsUpdate) {
    const normalizedMappings = validateDeckMappingsStructure(cardMappings);
    await validateContextAndAssignedValues(finalContextId, normalizedMappings);
    await validateCardsExistAndActive(normalizedMappings);
    deck.cardMappings = normalizedMappings;
    return;
  }

  if (hasContextUpdate) {
    await validateContextAndAssignedValues(finalContextId, deck.cardMappings);
  }
};

const updateDeck = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, contextId, cardMappings, status } = req.body;

    const deck = await CardDeck.findById(id);

    if (!deck) {
      throw new NotFoundError('Mazo');
    }

    if (deck.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para actualizar este mazo');
    }

    applyDeckFieldUpdates(deck, { name, description, status });
    await applyDeckMappingUpdates(deck, { contextId, cardMappings });

    await deck.save();
    await deck.populate([{ path: 'contextId', select: 'contextId name' }]);

    logger.info('Mazo actualizado', {
      deckId: deck._id,
      updatedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Mazo actualizado exitosamente',
      data: toCardDeckDetailDTOV1(deck)
    });
  } catch (error) {
    if (error?.code === 11000) {
      return next(new ConflictError('Ya existe un mazo con ese nombre'));
    }
    next(error);
  }
};

/**
 * DELETE /api/decks/:id
 * Soft delete: archiva el mazo.
 */
const deleteDeck = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deck = await CardDeck.findById(id);

    if (!deck) {
      throw new NotFoundError('Mazo');
    }

    if (deck.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para eliminar este mazo');
    }

    deck.status = 'archived';
    await deck.save();

    logger.info('Mazo archivado', {
      deckId: deck._id,
      archivedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Mazo eliminado (archivado) exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDecks,
  getDeckById,
  createDeck,
  updateDeck,
  deleteDeck
};
