/**
 * @fileoverview Controller para gestión CRUD de mazos (CardDeck).
 * Un mazo permite a un profesor reutilizar mapeos de tarjetas RFID para un contexto.
 * @module controllers/cardDeckController
 */

const cardDeckRepository = require('../repositories/cardDeckRepository');
const gameContextRepository = require('../repositories/gameContextRepository');
const cardDeckService = require('../services/cardDeckService');
const { NotFoundError, ConflictError, ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');
const { toCardDeckDetailDTOV1, toCardDeckListDTOV1 } = require('../utils/dtos');
const { sendSuccess, sendCreated, sendPaginated } = require('../utils/responseHelper');
const { buildFilter } = require('../utils/filterBuilder');
const { ensureResourceOwnership } = require('../utils/ownershipHelpers');
const { withTransaction } = require('../utils/withTransaction');

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

const deckFilterMappings = {
  contextId: { field: 'contextId', type: 'exact' },
  status: { field: 'status', type: 'exact' },
  search: { type: 'search', fields: ['name', 'description'] }
};

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
  const assignedValues = cardMappings.map(m => (m.assignedValue || '').toString().trim());

  if (uids.some(uid => !uid)) {
    throw new ValidationError('Todos los mapeos deben incluir uid');
  }
  if (assignedValues.some(v => !v)) {
    throw new ValidationError('Todos los mapeos deben incluir assignedValue');
  }

  if (new Set(uids).size !== uids.length) {
    throw new ValidationError('Los UIDs en cardMappings deben ser únicos');
  }

  // BUG-DECK-MEMORY-A (QA Sprint 0 post-v0.5.0): los mazos para Memoria
  // necesitan parejas (dos cartas con el mismo `assignedValue` para que
  // el alumno empareje). Antes el validator rechazaba CUALQUIER duplicado,
  // bloqueando la creación de mazos Memoria desde el wizard del frontend
  // (el seed los creaba directamente con `Model.create()` saltándose este
  // check, lo que confirma que el patrón es legítimo).
  //
  // Política actual: aceptar tanto "valores únicos" (Asociación/Secuencia)
  // como "todos en parejas exactas de 2" (Memoria). Cualquier otra
  // distribución sigue rechazándose.
  // Object.create(null) evita que un assignedValue como "__proto__" o "constructor"
  // resuelva contra Object.prototype y falsee el conteo de duplicados.
  const valueCounts = assignedValues.reduce((acc, v) => {
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, Object.create(null));
  const counts = Object.values(valueCounts);
  const allUnique = counts.every(c => c === 1);
  const allPairs = counts.every(c => c === 2);
  if (!allUnique && !allPairs) {
    throw new ValidationError(
      'Valores asignados no válidos: todas las cartas deben aparecer 1 vez ' +
        '(Asociación/Secuencia) o exactamente 2 veces (parejas para Memoria).'
    );
  }

  // Normalizar los UIDs en el propio array para persistir coherente
  return cardMappings.map(m => ({
    ...m,
    uid: m.uid.toString().trim().toUpperCase(),
    assignedValue: m.assignedValue.toString().trim()
  }));
}

async function validateContextAndAssignedValues(contextId, cardMappings) {
  const context = await gameContextRepository.findById(contextId);
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

/**
 * GET /api/decks
 */
const getDecks = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    order = 'desc',
    contextId,
    status,
    search
  } = req.query;

  const filter = buildFilter({ contextId, status, search }, deckFilterMappings, {
    baseFilter: { createdBy: req.user._id }
  });

  const skip = (page - 1) * limit;
  const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

  const [decks, total] = await Promise.all([
    cardDeckRepository.find(filter, {
      populate: { path: 'contextId', select: 'contextId name' },
      sort: sortOptions,
      limit: Number.parseInt(limit, 10),
      skip
    }),
    cardDeckRepository.count(filter)
  ]);

  logger.info('Lista de mazos obtenida', {
    requestedBy: req.user._id,
    filters: { ...filter, ...(search ? { search } : {}) },
    resultsCount: decks.length
  });

  sendPaginated(res, toCardDeckListDTOV1(decks), {
    page: Number.parseInt(page, 10),
    limit: Number.parseInt(limit, 10),
    total
  });
};

/**
 * GET /api/decks/:id
 */
const getDeckById = async (req, res) => {
  const { id } = req.params;

  const deck = await cardDeckRepository.findById(id, {
    populate: [
      { path: 'contextId', select: 'contextId name assets' },
      { path: 'createdBy', select: 'name email' }
    ]
  });

  if (!deck) {
    throw new NotFoundError('Mazo');
  }

  ensureResourceOwnership(deck, req.user._id, 'mazo');

  sendSuccess(res, toCardDeckDetailDTOV1(deck));
};

/**
 * GET /api/decks/check-card
 * Verifica si un UID existe en otros mazos activos del profesor (ADR-022).
 * Endpoint read-only para feedback inmediato durante el escaneo de tarjetas.
 */
const checkCard = async (req, res) => {
  const { uid, excludeDeckId } = req.query;
  const result = await cardDeckService.checkCardInOtherDecks(uid, req.user._id, excludeDeckId);
  sendSuccess(res, result);
};

/**
 * POST /api/decks
 */
const createDeck = async (req, res) => {
  // Captura MongoDB error 11000 (unique index) para lanzar ConflictError de dominio
  try {
    const { name, description, contextId, cardMappings, status } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new ValidationError('name es requerido (mínimo 2 caracteres)');
    }

    if (!contextId) {
      throw new ValidationError('contextId es requerido');
    }

    // Verificar límite de mazos activos por profesor
    const activeDecksCount = await cardDeckRepository.count({
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

    // Crear mazo con resolución atómica de conflictos cross-deck (ADR-022)
    const uids = normalizedMappings.map(m => m.uid);

    const { deck, conflictSummary } = await withTransaction(async session => {
      const summary = await cardDeckService.resolveCardConflicts(uids, req.user._id, session);

      const createdDeck = await cardDeckRepository.createWithSession(
        {
          name: name.trim(),
          description: description ? description.trim() : undefined,
          contextId,
          cardMappings: normalizedMappings,
          status: status || 'active',
          createdBy: req.user._id
        },
        session
      );

      return { deck: createdDeck, conflictSummary: summary };
    });

    await deck.populate([{ path: 'contextId', select: 'contextId name' }]);

    logger.info('Mazo creado', {
      deckId: deck._id,
      name: deck.name,
      contextId: deck.contextId,
      cardsCount: deck.cardMappings.length,
      createdBy: req.user._id,
      movedCards: conflictSummary.movedCards.length,
      archivedDecks: conflictSummary.archivedDecks.length
    });

    const responseData = toCardDeckDetailDTOV1(deck);
    if (conflictSummary.movedCards.length > 0) {
      responseData.affectedDecks = conflictSummary;
    }

    sendCreated(res, responseData, 'Mazo creado exitosamente');
  } catch (error) {
    // Duplicado por índice único (createdBy + name)
    if (error?.code === 11000) {
      throw new ConflictError('Ya existe un mazo con ese nombre');
    }
    throw error;
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

const parseDeckDescription = description => {
  if (description === undefined) {
    return undefined;
  }
  return description ? description.trim() : undefined;
};

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
    deck.cardMappings = normalizedMappings;
    return;
  }

  if (hasContextUpdate) {
    await validateContextAndAssignedValues(finalContextId, deck.cardMappings);
  }
};

const updateDeck = async (req, res) => {
  // Captura MongoDB error 11000 (unique index) para lanzar ConflictError de dominio
  try {
    const { id } = req.params;
    const { name, description, contextId, cardMappings, status } = req.body;

    const deck = await cardDeckRepository.findById(id);

    if (!deck) {
      throw new NotFoundError('Mazo');
    }

    ensureResourceOwnership(deck, req.user._id, 'mazo');

    applyDeckFieldUpdates(deck, { name, description, status });
    await applyDeckMappingUpdates(deck, { contextId, cardMappings });

    // Si se actualizan cardMappings, resolver conflictos cross-deck atómicamente (ADR-022)
    let conflictSummary = { movedCards: [], archivedDecks: [] };

    if (cardMappings !== undefined) {
      const uids = deck.cardMappings.map(m => m.uid);

      conflictSummary = await withTransaction(async session => {
        const summary = await cardDeckService.resolveCardConflicts(uids, req.user._id, session, id);
        await deck.save(session ? { session } : {});
        return summary;
      });
    } else {
      await deck.save();
    }

    await deck.populate([{ path: 'contextId', select: 'contextId name' }]);

    logger.info('Mazo actualizado', {
      deckId: deck._id,
      updatedBy: req.user._id,
      movedCards: conflictSummary.movedCards.length,
      archivedDecks: conflictSummary.archivedDecks.length
    });

    const responseData = toCardDeckDetailDTOV1(deck);
    if (conflictSummary.movedCards.length > 0) {
      responseData.affectedDecks = conflictSummary;
    }

    sendSuccess(res, responseData, 'Mazo actualizado exitosamente');
  } catch (error) {
    if (error?.code === 11000) {
      throw new ConflictError('Ya existe un mazo con ese nombre');
    }
    throw error;
  }
};

/**
 * DELETE /api/decks/:id
 * Soft delete: archiva el mazo.
 */
const deleteDeck = async (req, res) => {
  const { id } = req.params;

  const deck = await cardDeckRepository.findById(id);

  if (!deck) {
    throw new NotFoundError('Mazo');
  }

  ensureResourceOwnership(deck, req.user._id, 'mazo');

  deck.status = 'archived';
  await deck.save();

  logger.info('Mazo archivado', {
    deckId: deck._id,
    archivedBy: req.user._id
  });

  sendSuccess(res, null, 'Mazo eliminado (archivado) exitosamente');
};

module.exports = {
  getDecks,
  getDeckById,
  checkCard,
  createDeck,
  updateDeck,
  deleteDeck
};
