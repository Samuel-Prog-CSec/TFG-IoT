/**
 * @fileoverview Controller para gestión CRUD de sesiones de juego.
 * Maneja la configuración de sesiones con mecánicas, contextos y mapeo de tarjetas.
 * @module controllers/gameSessionController
 */

const gameSessionRepository = require('../repositories/gameSessionRepository');
const gameMechanicRepository = require('../repositories/gameMechanicRepository');
const gamePlayRepository = require('../repositories/gamePlayRepository');
const gameSessionService = require('../services/gameSessionService');
const {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError
} = require('../utils/errors');
const logger = require('../utils/logger');
const {
  toGameSessionDetailDTOV1,
  toGameSessionListDTOV1,
  toPaginatedDTOV1
} = require('../utils/dtos');

const isSessionReadLeanEnabled = () => process.env.SESSION_READ_LEAN_ENABLED !== 'false';
const DEFAULT_MEMORY_MATCHING_GROUP_SIZE = 2;

const normalizeObjectId = value => value?.toString?.() || value;
const normalizeMechanicName = value => (value || '').toString().trim().toLowerCase();

const getEnabledSessionMechanics = () => {
  const raw = process.env.SESSION_ENABLED_MECHANICS;
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  const parsed = raw
    .split(',')
    .map(item => normalizeMechanicName(item))
    .filter(Boolean);

  return new Set(parsed);
};

const isMechanicEnabledForSessionCreation = mechanic => {
  const mechanicName = normalizeMechanicName(mechanic?.name);
  const availability = normalizeMechanicName(mechanic?.rules?.behavior?.availability);

  if (availability === 'coming_soon') {
    return false;
  }

  const enabledMechanics = getEnabledSessionMechanics();
  if (!enabledMechanics) {
    return Boolean(mechanicName);
  }

  return mechanicName && enabledMechanics.has(mechanicName);
};

const validateConfigAgainstMechanicRules = ({ mechanic, config = {} }) => {
  const limits = mechanic?.rules?.limits || {};
  const validations = [
    {
      key: 'numberOfRounds',
      min: Number(limits.minRounds),
      max: Number(limits.maxRounds),
      label: 'numberOfRounds'
    },
    {
      key: 'timeLimit',
      min: Number(limits.minTimeLimit),
      max: Number(limits.maxTimeLimit),
      label: 'timeLimit'
    },
    {
      key: 'numberOfCards',
      min: Number(limits.minCards),
      max: Number(limits.maxCards),
      label: 'numberOfCards'
    }
  ];

  for (const rule of validations) {
    if (config?.[rule.key] === undefined) {
      continue;
    }

    const value = Number(config[rule.key]);
    if (!Number.isFinite(value)) {
      throw new ValidationError(`${rule.label} debe ser numérico`);
    }

    if (Number.isFinite(rule.min) && value < rule.min) {
      throw new ValidationError(
        `${rule.label} debe ser >= ${rule.min} para la mecánica ${mechanic.name}`
      );
    }

    if (Number.isFinite(rule.max) && value > rule.max) {
      throw new ValidationError(
        `${rule.label} debe ser <= ${rule.max} para la mecánica ${mechanic.name}`
      );
    }
  }
};

const ensureMemoryBoardLayoutIsComplete = ({ mechanic, boardLayout, cardMappings }) => {
  const mechanicName = normalizeMechanicName(mechanic?.name);
  if (mechanicName !== 'memory') {
    return;
  }

  if (!Array.isArray(boardLayout) || boardLayout.length === 0) {
    throw new ValidationError('boardLayout es obligatorio para sesiones de memoria');
  }

  const normalizedMappings = Array.isArray(cardMappings) ? cardMappings : [];
  if (boardLayout.length !== normalizedMappings.length) {
    throw new ValidationError(
      `boardLayout debe incluir exactamente ${normalizedMappings.length} tarjetas para memoria`
    );
  }

  const groupSize = Math.max(
    DEFAULT_MEMORY_MATCHING_GROUP_SIZE,
    Number(mechanic?.rules?.behavior?.matchingGroupSize) || DEFAULT_MEMORY_MATCHING_GROUP_SIZE
  );
  const valuesCount = boardLayout.reduce((acc, slot) => {
    const value = (slot?.assignedValue || '').toString();
    if (!value) {
      return acc;
    }
    acc.set(value, (acc.get(value) || 0) + 1);
    return acc;
  }, new Map());

  for (const [value, count] of valuesCount.entries()) {
    if (count !== groupSize) {
      throw new ValidationError(
        `boardLayout inválido para memoria: el valor "${value}" debe aparecer ${groupSize} veces`
      );
    }
  }
};

const normalizeBoardLayout = (layout = []) => {
  if (!Array.isArray(layout)) {
    return [];
  }

  return layout.map(item => ({
    slotIndex: item.slotIndex,
    cardId: item.cardId,
    uid: item.uid,
    assignedValue: item.assignedValue,
    displayData: item.displayData || {}
  }));
};

const buildBoardLayoutFromMappings = cardMappings => {
  if (!Array.isArray(cardMappings)) {
    return [];
  }

  return cardMappings.map((mapping, slotIndex) => ({
    slotIndex,
    cardId: mapping.cardId,
    uid: mapping.uid,
    assignedValue: mapping.assignedValue,
    displayData: mapping.displayData || {}
  }));
};

const validateBoardLayoutAgainstMappings = (boardLayout, cardMappings) => {
  if (!Array.isArray(boardLayout) || boardLayout.length === 0) {
    return;
  }

  const normalizedLayout = normalizeBoardLayout(boardLayout);
  const mappingByCardId = new Map(
    (cardMappings || []).map(mapping => [normalizeObjectId(mapping.cardId), mapping])
  );

  for (const slot of normalizedLayout) {
    const mapping = mappingByCardId.get(normalizeObjectId(slot.cardId));
    if (!mapping) {
      throw new ValidationError(
        'boardLayout contiene una tarjeta que no pertenece al mazo de la sesión'
      );
    }

    if (slot.uid !== mapping.uid) {
      throw new ValidationError('boardLayout tiene uid inconsistente para una tarjeta del mazo');
    }

    if (slot.assignedValue !== mapping.assignedValue) {
      throw new ValidationError(
        'boardLayout tiene assignedValue inconsistente para una tarjeta del mazo'
      );
    }
  }
};

const normalizeAssociationChallengePlan = (plan = []) => {
  if (!Array.isArray(plan)) {
    return [];
  }

  return [...plan]
    .map(item => ({
      roundNumber: Number(item.roundNumber),
      cardId: item.cardId,
      uid: item.uid,
      assignedValue: item.assignedValue,
      displayData: item.displayData || {},
      promptText: item.promptText
    }))
    .filter(item => Number.isFinite(item.roundNumber) && item.roundNumber > 0)
    .sort((a, b) => a.roundNumber - b.roundNumber);
};

const buildAssociationFallbackPlan = ({ cardMappings, numberOfRounds }) => {
  const mappings = Array.isArray(cardMappings) ? cardMappings : [];
  if (mappings.length === 0 || !Number.isFinite(numberOfRounds) || numberOfRounds < 1) {
    return [];
  }

  return Array.from({ length: numberOfRounds }, (_, index) => {
    const mapping = mappings[index % mappings.length];
    return {
      roundNumber: index + 1,
      cardId: mapping.cardId,
      uid: mapping.uid,
      assignedValue: mapping.assignedValue,
      displayData: mapping.displayData || {}
    };
  });
};

const validateAssociationChallengePlanAgainstMappings = ({
  associationChallengePlan,
  cardMappings,
  numberOfRounds
}) => {
  const normalizedPlan = normalizeAssociationChallengePlan(associationChallengePlan);
  if (!Array.isArray(cardMappings) || cardMappings.length === 0) {
    throw new ValidationError('No hay tarjetas disponibles para generar retos de asociación');
  }

  if (!Number.isFinite(numberOfRounds) || numberOfRounds < 1) {
    throw new ValidationError('numberOfRounds debe ser un número válido para asociación');
  }

  if (normalizedPlan.length === 0) {
    throw new ValidationError(
      'associationChallengePlan es obligatorio para asociación y debe cubrir todas las rondas'
    );
  }

  if (normalizedPlan.length !== numberOfRounds) {
    throw new ValidationError(
      `associationChallengePlan debe incluir exactamente ${numberOfRounds} retos`
    );
  }

  const mappingByUid = new Map((cardMappings || []).map(mapping => [mapping.uid, mapping]));
  const mappingByCardId = new Map(
    (cardMappings || []).map(mapping => [normalizeObjectId(mapping.cardId), mapping])
  );

  normalizedPlan.forEach((item, index) => {
    const expectedRound = index + 1;
    if (item.roundNumber !== expectedRound) {
      throw new ValidationError(
        `associationChallengePlan debe estar ordenado por rondas consecutivas (esperada ${expectedRound})`
      );
    }

    const mappingByUidMatch = mappingByUid.get(item.uid);
    const mappingByCardIdMatch = mappingByCardId.get(normalizeObjectId(item.cardId));
    const resolved = mappingByUidMatch || mappingByCardIdMatch;

    if (!resolved) {
      throw new ValidationError(
        `El reto de ronda ${item.roundNumber} referencia una tarjeta no disponible en el mazo`
      );
    }

    if (item.assignedValue !== resolved.assignedValue) {
      throw new ValidationError(
        `El reto de ronda ${item.roundNumber} tiene assignedValue inconsistente con el mazo actual`
      );
    }
  });

  return normalizedPlan;
};

const repairAssociationChallengePlanAgainstMappings = ({
  associationChallengePlan,
  cardMappings,
  numberOfRounds
}) => {
  const mappings = Array.isArray(cardMappings) ? cardMappings : [];
  const existingPlan = normalizeAssociationChallengePlan(associationChallengePlan);

  const mappingByUid = new Map(mappings.map(mapping => [mapping.uid, mapping]));
  const mappingByCardId = new Map(
    mappings.map(mapping => [normalizeObjectId(mapping.cardId), mapping])
  );
  const mappingByAssignedValue = new Map(mappings.map(mapping => [mapping.assignedValue, mapping]));

  const repairedPlan = [];
  const unresolvedRounds = [];

  for (let round = 1; round <= numberOfRounds; round += 1) {
    const existing = existingPlan.find(item => item.roundNumber === round);

    let resolved = null;
    if (existing) {
      resolved =
        mappingByUid.get(existing.uid) ||
        mappingByCardId.get(normalizeObjectId(existing.cardId)) ||
        mappingByAssignedValue.get(existing.assignedValue) ||
        null;
    }

    if (!resolved) {
      unresolvedRounds.push(round);
      continue;
    }

    repairedPlan.push({
      roundNumber: round,
      cardId: resolved.cardId,
      uid: resolved.uid,
      assignedValue: resolved.assignedValue,
      displayData:
        existing?.displayData && Object.keys(existing.displayData).length > 0
          ? existing.displayData
          : resolved.displayData || {},
      promptText: existing?.promptText
    });
  }

  return {
    repairedPlan,
    unresolvedRounds,
    changed: JSON.stringify(repairedPlan) !== JSON.stringify(existingPlan)
  };
};

const applyAssociationPlanOnUpdate = ({ session, associationChallengePlan, mechanicName }) => {
  if (mechanicName === 'association') {
    if (associationChallengePlan !== undefined) {
      const normalizedPlan = validateAssociationChallengePlanAgainstMappings({
        associationChallengePlan,
        cardMappings: session.cardMappings,
        numberOfRounds: Number(session.config?.numberOfRounds)
      });
      session.associationChallengePlan = normalizedPlan;
      session.requiresAssociationPlanConfiguration = false;
    }
    return;
  }

  session.associationChallengePlan = [];
  session.requiresAssociationPlanConfiguration = false;
};

const ensureAssociationPlanReadyForStart = async session => {
  if (session.requiresAssociationPlanConfiguration) {
    throw new ValidationError(
      'Debes configurar los retos de asociación antes de iniciar la sesión clonada.'
    );
  }

  let planForValidation = normalizeAssociationChallengePlan(session.associationChallengePlan || []);
  const rounds = Number(session.config?.numberOfRounds || 0);

  if (planForValidation.length === 0) {
    planForValidation = buildAssociationFallbackPlan({
      cardMappings: session.cardMappings,
      numberOfRounds: rounds
    });
  }

  const repaired = repairAssociationChallengePlanAgainstMappings({
    associationChallengePlan: planForValidation,
    cardMappings: session.cardMappings,
    numberOfRounds: rounds
  });

  if (repaired.unresolvedRounds.length > 0) {
    throw new ValidationError(
      `No se pudo auto-reparar la planificación de retos de asociación. Revisa las rondas: ${repaired.unresolvedRounds.join(', ')}`
    );
  }

  validateAssociationChallengePlanAgainstMappings({
    associationChallengePlan: repaired.repairedPlan,
    cardMappings: session.cardMappings,
    numberOfRounds: rounds
  });

  if (
    repaired.changed ||
    !Array.isArray(session.associationChallengePlan) ||
    session.associationChallengePlan.length === 0
  ) {
    session.associationChallengePlan = repaired.repairedPlan;
    session.requiresAssociationPlanConfiguration = false;
    await session.save();
  }
};

const buildAssociationCloneDraftPlan = ({ sourceSession, cardMappings, numberOfRounds }) => {
  let basePlan = normalizeAssociationChallengePlan(sourceSession?.associationChallengePlan || []);

  if (basePlan.length === 0) {
    basePlan = buildAssociationFallbackPlan({
      cardMappings,
      numberOfRounds
    });
  }

  const repaired = repairAssociationChallengePlanAgainstMappings({
    associationChallengePlan: basePlan,
    cardMappings,
    numberOfRounds
  });

  if (repaired.unresolvedRounds.length === 0) {
    return repaired.repairedPlan;
  }

  const fallbackPlan = buildAssociationFallbackPlan({
    cardMappings,
    numberOfRounds
  });

  const repairedByRound = new Map(
    repaired.repairedPlan.map(item => [Number(item.roundNumber), item])
  );

  return fallbackPlan.map(item => repairedByRound.get(Number(item.roundNumber)) || item);
};

const applyCloneMechanicState = ({
  clonedSession,
  sourceSession,
  cardMappings,
  userId,
  mechanicName
}) => {
  if (mechanicName === 'memory') {
    clonedSession.boardLayout = [];
    clonedSession.associationChallengePlan = [];
    clonedSession.requiresAssociationPlanConfiguration = false;
    return;
  }

  if (mechanicName === 'association') {
    clonedSession.boardLayout = [];
    clonedSession.associationChallengePlan = buildAssociationCloneDraftPlan({
      sourceSession,
      cardMappings,
      numberOfRounds: Number(clonedSession.config?.numberOfRounds || 0)
    });
    clonedSession.requiresAssociationPlanConfiguration = true;
    return;
  }

  const sourceLayout = normalizeBoardLayout(sourceSession.boardLayout || []);

  if (sourceLayout.length > 0) {
    try {
      validateBoardLayoutAgainstMappings(sourceLayout, cardMappings);
      clonedSession.boardLayout = sourceLayout;
    } catch (error) {
      logger.warn(
        'boardLayout original no compatible tras resincronizar mazo; se reconstruye layout',
        {
          sessionId: sourceSession._id,
          clonedBy: userId,
          reason: error.message
        }
      );
      clonedSession.boardLayout = buildBoardLayoutFromMappings(cardMappings);
    }
    return;
  }

  clonedSession.boardLayout = buildBoardLayoutFromMappings(cardMappings);
};

const buildCloneSuccessMessage = mechanicName => {
  if (mechanicName === 'memory') {
    return 'Sesión clonada exitosamente. Debes configurar de nuevo el tablero para memoria.';
  }

  if (mechanicName === 'association') {
    return 'Sesión clonada exitosamente. Se precargaron los retos de asociación como borrador; revísalos y confirma antes de iniciar.';
  }

  return 'Sesión clonada exitosamente';
};

/**
 * Obtener lista de sesiones con paginación y filtros.
 *
 * GET /api/sessions?page=1&status=active&mechanicId=...&contextId=...
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getSessions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      order = 'desc',
      mechanicId,
      contextId,
      status,
      difficulty,
      createdBy
    } = req.query;

    // Construir filtro
    const filter = {};

    if (mechanicId) {
      filter.mechanicId = mechanicId;
    }
    if (contextId) {
      filter.contextId = contextId;
    }
    if (status) {
      filter.status = status;
    }
    if (difficulty) {
      filter.difficulty = difficulty;
    }
    if (createdBy) {
      filter.createdBy = createdBy;
    }

    // Los profesores ven todas sus sesiones, los alumnos no deberían acceder
    if (req.user.role === 'student') {
      throw new ForbiddenError('Los alumnos no pueden acceder a sesiones directamente');
    }

    // Filtrar SIEMPRE por sesiones del profesor actual.
    // Evita que un teacher fuerce createdBy en query para consultar sesiones ajenas.
    if (req.user.role === 'teacher') {
      filter.createdBy = req.user._id;
    }

    // Paginación
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: order === 'asc' ? 1 : -1 };

    // Ejecutar query con populate
    const [sessions, total] = await Promise.all([
      gameSessionRepository.find(filter, {
        select:
          'mechanicId deckId contextId createdBy config status difficulty startedAt endedAt createdAt updatedAt',
        populate: [
          { path: 'mechanicId', select: 'name displayName icon' },
          { path: 'deckId', select: 'name status contextId' },
          { path: 'contextId', select: 'contextId name' },
          { path: 'createdBy', select: 'name email' }
        ],
        sort: sortOptions,
        limit: Number.parseInt(limit, 10),
        skip,
        lean: isSessionReadLeanEnabled()
      }),
      gameSessionRepository.count(filter)
    ]);

    logger.info('Lista de sesiones obtenida', {
      requestedBy: req.user._id,
      filters: filter,
      resultsCount: sessions.length
    });

    res.json({
      success: true,
      ...toPaginatedDTOV1(toGameSessionListDTOV1(sessions), {
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
 * Obtener una sesión específica por ID.
 *
 * GET /api/sessions/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getSessionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await gameSessionRepository.findById(id, {
      select:
        'mechanicId deckId contextId createdBy config cardMappings boardLayout associationChallengePlan requiresAssociationPlanConfiguration status difficulty startedAt endedAt createdAt updatedAt',
      populate: [
        { path: 'mechanicId', select: 'name displayName icon' },
        { path: 'deckId', select: 'name status contextId' },
        { path: 'contextId', select: 'contextId name' },
        { path: 'createdBy', select: 'name email' },
        { path: 'cardMappings.cardId', select: 'uid type status' }
      ],
      lean: isSessionReadLeanEnabled()
    });

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    const ownerId = session?.createdBy?._id || session?.createdBy;

    // Verificar permisos: solo el creador o super admin
    if (ownerId?.toString() !== req.user._id.toString() && req.user.role !== 'super_admin') {
      throw new ForbiddenError('No tienes permiso para ver esta sesión');
    }

    res.json({
      success: true,
      data: toGameSessionDetailDTOV1(session)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Crear una nueva sesión de juego.
 *
 * POST /api/sessions
 * Headers: Authorization: Bearer <token>
 * Body: { mechanicId, contextId, config, cardMappings }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const createSession = async (req, res, next) => {
  try {
    const {
      mechanicId,
      contextId,
      deckId,
      sensorId,
      config = {},
      cardMappings,
      boardLayout,
      associationChallengePlan
    } = req.body;

    // NUEVA REGLA: el mapping de la sesión SIEMPRE depende del mazo asignado.
    // Por tanto, no aceptamos cardMappings manuales al crear la sesión.
    if (cardMappings) {
      throw new ValidationError(
        'cardMappings no se acepta: la sesión toma el mapping desde el mazo (deckId)'
      );
    }

    if (!deckId) {
      throw new ValidationError('deckId es requerido para crear una sesión');
    }

    // Verificar que la mecánica existe y está activa
    const mechanic = await gameMechanicRepository.findById(mechanicId);
    if (!mechanic) {
      throw new NotFoundError('Mecánica de juego');
    }
    if (!mechanic.isActive) {
      throw new ValidationError('La mecánica seleccionada no está activa');
    }

    const mechanicName = normalizeMechanicName(mechanic.name);
    if (!isMechanicEnabledForSessionCreation(mechanic)) {
      throw new ValidationError(
        'La mecánica seleccionada no está habilitada para creación de sesiones en el entorno actual.'
      );
    }

    validateConfigAgainstMechanicRules({ mechanic, config });

    // La sesión se construye a partir del mazo
    const session = gameSessionRepository.build({
      mechanicId,
      deckId,
      // contextId / cardMappings / numberOfCards se rellenan al sincronizar
      contextId: contextId || undefined,
      sensorId,
      config: {
        ...config
      },
      status: 'created',
      createdBy: req.user._id
    });

    const {
      deck,
      context,
      cardMappings: syncedMappings
    } = await gameSessionService.syncSessionFromDeck(session, {
      deckId,
      userId: req.user._id
    });

    if (boardLayout !== undefined) {
      validateBoardLayoutAgainstMappings(boardLayout, syncedMappings);
      session.boardLayout = normalizeBoardLayout(boardLayout);
    }

    if (mechanicName === 'association') {
      const normalizedPlan = validateAssociationChallengePlanAgainstMappings({
        associationChallengePlan,
        cardMappings: syncedMappings,
        numberOfRounds: Number(session.config?.numberOfRounds)
      });
      session.associationChallengePlan = normalizedPlan;
      session.requiresAssociationPlanConfiguration = false;
    } else {
      session.associationChallengePlan = [];
      session.requiresAssociationPlanConfiguration = false;
    }

    ensureMemoryBoardLayoutIsComplete({
      mechanic,
      boardLayout: session.boardLayout,
      cardMappings: syncedMappings
    });

    // Si el cliente envía contextId explícito, debe coincidir con el del mazo
    if (contextId && deck.contextId.toString() !== contextId.toString()) {
      throw new ValidationError('contextId no coincide con el contexto del mazo');
    }

    // Si el cliente envía numberOfCards, debe coincidir con el del mazo
    if (config.numberOfCards !== undefined && config.numberOfCards !== syncedMappings.length) {
      throw new ValidationError(
        `config.numberOfCards (${config.numberOfCards}) no coincide con el número de cardMappings del mazo (${syncedMappings.length})`
      );
    }

    // Crear la sesión
    // NOTA: La dificultad se auto-calcula en el modelo basándose en numberOfCards
    await session.save();

    // Populate para respuesta completa
    await session.populate([
      { path: 'mechanicId', select: 'name displayName icon' },
      { path: 'contextId', select: 'contextId name' },
      { path: 'createdBy', select: 'name email' }
    ]);

    logger.info('Sesión creada', {
      sessionId: session._id,
      mechanicId: mechanicName,
      contextId: context.contextId,
      cardsCount: syncedMappings.length,
      deckId,
      sensorId,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Sesión creada exitosamente',
      data: toGameSessionDetailDTOV1(session)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Actualizar una sesión existente.
 * Solo se puede actualizar si no ha iniciado.
 *
 * PUT /api/sessions/:id
 * Headers: Authorization: Bearer <token>
 * Body: { config? }
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const updateSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { deckId, sensorId, config, boardLayout, associationChallengePlan } = req.body;

    const session = await gameSessionRepository.findById(id);

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    // Verificar permisos
    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para actualizar esta sesión');
    }

    // Solo se puede actualizar si NO está activa
    if (session.status === 'active') {
      throw new ValidationError('No se puede actualizar una sesión activa');
    }

    // Si se proporciona deckId, se cambia el mazo. Si no, se mantiene.
    if (deckId !== undefined) {
      session.deckId = deckId;
    }

    if (sensorId !== undefined) {
      session.sensorId = sensorId;
    }

    if (!session.deckId) {
      throw new ValidationError('La sesión no tiene mazo asignado (deckId)');
    }

    // Regla: SIEMPRE sincronizar mapping con el mazo actual (aunque no haya cambiado).
    await gameSessionService.syncSessionFromDeck(session, {
      deckId: session.deckId,
      userId: req.user._id
    });

    const mechanic = await gameMechanicRepository.findById(session.mechanicId);
    if (!mechanic) {
      throw new NotFoundError('Mecánica de juego');
    }

    // Actualizar campos (excepto numberOfCards, que depende del mazo)
    if (config) {
      if (config.numberOfCards !== undefined) {
        throw new ValidationError('config.numberOfCards no se puede modificar: depende del mazo');
      }

      const nextConfig = { ...session.config, ...config };
      validateConfigAgainstMechanicRules({ mechanic, config: nextConfig });

      session.config = { ...session.config, ...config };
    }

    if (boardLayout !== undefined) {
      validateBoardLayoutAgainstMappings(boardLayout, session.cardMappings);
      session.boardLayout = normalizeBoardLayout(boardLayout);
    }

    const mechanicName = normalizeMechanicName(mechanic?.name);
    applyAssociationPlanOnUpdate({
      session,
      associationChallengePlan,
      mechanicName
    });

    ensureMemoryBoardLayoutIsComplete({
      mechanic,
      boardLayout: session.boardLayout,
      cardMappings: session.cardMappings
    });

    await session.save();

    logger.info('Sesión actualizada', {
      sessionId: session._id,
      updatedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Sesión actualizada exitosamente',
      data: toGameSessionDetailDTOV1(session)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Eliminar una sesión.
 * Solo se puede eliminar si no ha iniciado.
 *
 * DELETE /api/sessions/:id
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const deleteSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await gameSessionRepository.findById(id);

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    // Verificar permisos
    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para eliminar esta sesión');
    }

    // Solo se puede eliminar si no ha iniciado
    if (session.status !== 'created') {
      throw new ValidationError('Solo se pueden eliminar sesiones que no han iniciado');
    }

    await session.deleteOne();

    logger.info('Sesión eliminada', {
      sessionId: session._id,
      deletedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Sesión eliminada exitosamente'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Iniciar una sesión de juego.
 * Cambia el status a 'active' y registra startedAt.
 *
 * POST /api/sessions/:id/start
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const startSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await gameSessionRepository.findById(id);

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    // Verificar permisos
    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para iniciar esta sesión');
    }

    // Permitir iniciar si es una sesión nueva o una sesión ya jugada (repetición)
    if (!['created', 'completed'].includes(session.status)) {
      throw new ValidationError('Solo se puede iniciar una sesión en estado created o completed');
    }

    if (!session.deckId) {
      throw new ValidationError('La sesión no tiene mazo asignado (deckId)');
    }

    // SIEMPRE sincronizar mapping antes de iniciar
    await gameSessionService.syncSessionFromDeck(session, {
      deckId: session.deckId,
      userId: req.user._id
    });

    const mechanic = await gameMechanicRepository.findById(session.mechanicId);
    if (!mechanic) {
      throw new NotFoundError('Mecánica de juego');
    }

    const mechanicName = normalizeMechanicName(mechanic?.name);

    if (mechanicName === 'association') {
      await ensureAssociationPlanReadyForStart(session);
    }

    ensureMemoryBoardLayoutIsComplete({
      mechanic,
      boardLayout: session.boardLayout,
      cardMappings: session.cardMappings
    });

    // Si era una sesión completada, limpiar endedAt al reiniciar
    if (session.status === 'completed') {
      session.endedAt = undefined;
      await session.save();
    }

    // Usar el método del modelo
    await session.start();

    logger.info('Sesión iniciada', {
      sessionId: session._id,
      startedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Sesión iniciada exitosamente',
      data: toGameSessionDetailDTOV1(session)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Finalizar una sesión.
 *
 * POST /api/sessions/:id/end
 * Headers: Authorization: Bearer <token>
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const endSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await gameSessionRepository.findById(id);

    if (!session) {
      throw new NotFoundError('Sesión de juego');
    }

    // Verificar permisos
    if (session.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para finalizar esta sesión');
    }

    // Verificar que no haya partidas activas
    const activePlays = await gamePlayRepository.count({
      sessionId: session._id,
      status: { $in: ['in-progress', 'paused'] }
    });

    if (activePlays > 0) {
      throw new ConflictError(
        `No se puede finalizar la sesión: hay ${activePlays} partida(s) activa(s)`
      );
    }

    // Usar el método del modelo
    await session.end();

    logger.info('Sesión finalizada', {
      sessionId: session._id,
      endedBy: req.user._id
    });

    res.json({
      success: true,
      message: 'Sesión finalizada exitosamente',
      data: toGameSessionDetailDTOV1(session)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clonar una sesión existente resincronizando contra el mazo actual.
 *
 * POST /api/sessions/:id/clone
 * Headers: Authorization: Bearer <token>
 * Body: {}
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const cloneSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const sourceSession = await gameSessionRepository.findById(id);
    if (!sourceSession) {
      throw new NotFoundError('Sesión de juego');
    }

    if (sourceSession.createdBy.toString() !== req.user._id.toString()) {
      throw new ForbiddenError('No tienes permiso para clonar esta sesión');
    }

    const { clonedSession, mechanic, cardMappings } =
      await gameSessionService.cloneSessionFromExisting({
        sourceSession,
        userId: req.user._id
      });

    if (!isMechanicEnabledForSessionCreation(mechanic)) {
      throw new ValidationError(
        'La mecánica de la sesión original no está habilitada para creación de sesiones en el entorno actual.'
      );
    }

    validateConfigAgainstMechanicRules({
      mechanic,
      config: clonedSession.config
    });

    const mechanicName = normalizeMechanicName(mechanic?.name);

    applyCloneMechanicState({
      clonedSession,
      sourceSession,
      cardMappings,
      userId: req.user._id,
      mechanicName
    });

    clonedSession.status = 'created';
    clonedSession.startedAt = undefined;
    clonedSession.endedAt = undefined;

    await clonedSession.save();

    await clonedSession.populate([
      { path: 'mechanicId', select: 'name displayName icon' },
      { path: 'deckId', select: 'name status contextId' },
      { path: 'contextId', select: 'contextId name' },
      { path: 'createdBy', select: 'name email' },
      { path: 'cardMappings.cardId', select: 'uid type status' }
    ]);

    logger.info('Sesión clonada', {
      sourceSessionId: sourceSession._id,
      clonedSessionId: clonedSession._id,
      mechanic: mechanic.name,
      cardMappingsCount: cardMappings.length,
      clonedBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: buildCloneSuccessMessage(mechanicName),
      data: toGameSessionDetailDTOV1(clonedSession)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
  startSession,
  endSession,
  cloneSession
};
