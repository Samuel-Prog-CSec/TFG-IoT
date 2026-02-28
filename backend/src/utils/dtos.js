/**
 * @fileoverview Data Transfer Objects (DTOs) - Transformadores de datos para respuestas API.
 * Transforma documentos de Mongoose a objetos seguros sin campos sensibles.
 * IMPORTANTE: Usar estos DTOs en TODOS los controllers antes de enviar respuestas.
 * @module utils/dtos
 */

const toPlainObject = value =>
  value && typeof value.toObject === 'function' ? value.toObject() : value;

const toId = value => {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value._id) {
    return value._id.toString();
  }
  if (typeof value === 'object' && value.id) {
    return value.id.toString();
  }
  if (typeof value.toString === 'function') {
    return value.toString();
  }
  return undefined;
};

const toPopulated = (value, mapper) => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if (value._id || value.id) {
    return mapper(value);
  }
  return undefined;
};

const mapStudentMetrics = metrics => {
  if (!metrics) {
    return undefined;
  }
  return {
    totalGamesPlayed: metrics.totalGamesPlayed,
    totalScore: metrics.totalScore,
    averageScore: metrics.averageScore,
    bestScore: metrics.bestScore,
    totalCorrectAnswers: metrics.totalCorrectAnswers,
    totalErrors: metrics.totalErrors,
    averageResponseTime: metrics.averageResponseTime,
    lastPlayedAt: metrics.lastPlayedAt
  };
};

const mapGamePlayMetrics = metrics => {
  if (!metrics) {
    return undefined;
  }
  return {
    totalAttempts: metrics.totalAttempts,
    correctAttempts: metrics.correctAttempts,
    errorAttempts: metrics.errorAttempts,
    timeoutAttempts: metrics.timeoutAttempts,
    averageResponseTime: metrics.averageResponseTime,
    completionTime: metrics.completionTime
  };
};

const mapGamePlayEvents = events =>
  Array.isArray(events)
    ? events.map(event => ({
        timestamp: event.timestamp,
        eventType: event.eventType,
        cardUid: event.cardUid,
        expectedValue: event.expectedValue,
        actualValue: event.actualValue,
        pointsAwarded: event.pointsAwarded,
        timeElapsed: event.timeElapsed,
        roundNumber: event.roundNumber
      }))
    : [];

/**
 * DTO v1 para User (respuesta segura sin password).
 * Elimina campos sensibles y metadatos internos.
 *
 * @param {Object} user - Documento User de Mongoose
 * @returns {Object|null} Usuario transformado o null si no existe
 */
const toUserDTOV1 = user => {
  if (!user) {
    return null;
  }

  const userData = toPlainObject(user);
  const hasLogin = ['teacher', 'super_admin'].includes(userData.role);

  return {
    id: toId(userData),
    name: userData.name,
    email: hasLogin ? userData.email : undefined,
    role: userData.role,
    status: userData.status,
    accountStatus: hasLogin ? userData.accountStatus : undefined,
    profile: userData.profile
      ? {
          avatar: userData.profile.avatar,
          age: userData.profile.age,
          classroom: userData.profile.classroom,
          birthdate: userData.profile.birthdate
        }
      : undefined,
    createdBy: toId(userData.createdBy),
    lastLoginAt: userData.lastLoginAt,
    createdAt: userData.createdAt,
    updatedAt: userData.updatedAt
    // NO incluir: password, __v, tokens internos
  };
};

/**
 * DTO v1 para Student (incluye métricas del alumno).
 *
 * @param {Object} user - Documento User de Mongoose
 * @returns {Object|null} Alumno transformado o null si no existe
 */
const toStudentDTOV1 = user => {
  const base = toUserDTOV1(user);
  if (!base) {
    return null;
  }

  const userData = toPlainObject(user);
  return {
    ...base,
    studentMetrics: mapStudentMetrics(userData.studentMetrics)
  };
};

/**
 * DTO v1 resumido para User (listas).
 *
 * @param {Object} user - Documento User de Mongoose
 * @returns {Object|null} Usuario resumido
 */
const toUserSummaryDTOV1 = user => {
  if (!user) {
    return null;
  }

  const userData = toPlainObject(user);

  return {
    id: toId(userData),
    name: userData.name,
    role: userData.role,
    status: userData.status,
    profile: userData.profile
      ? {
          avatar: userData.profile.avatar,
          age: userData.profile.age,
          classroom: userData.profile.classroom
        }
      : undefined,
    createdBy: toId(userData.createdBy),
    createdAt: userData.createdAt,
    updatedAt: userData.updatedAt
  };
};

/**
 * DTO v1 para array de Users (resumen).
 *
 * @param {Array} users - Array de documentos User
 * @returns {Array} Array de usuarios transformados
 */
const toUserListDTOV1 = users =>
  Array.isArray(users) ? users.map(toUserSummaryDTOV1).filter(Boolean) : [];

/**
 * DTO v1 para GamePlay (resumen sin eventos).
 *
 * @param {Object} gameplay - Documento GamePlay de Mongoose
 * @returns {Object|null} Partida resumida o null si no existe
 */
const toGamePlayDTOV1 = gameplay => {
  if (!gameplay) {
    return null;
  }

  const playData = toPlainObject(gameplay);

  const sessionRef = toPopulated(playData.sessionId, session => ({
    id: toId(session),
    mechanicId: toId(session.mechanicId),
    contextId: toId(session.contextId),
    config: session.config,
    difficulty: session.difficulty
  }));

  const playerRef = toPopulated(playData.playerId, player => ({
    id: toId(player),
    name: player.name,
    profile: player.profile
      ? {
          age: player.profile.age,
          classroom: player.profile.classroom
        }
      : undefined
  }));

  return {
    id: toId(playData),
    sessionId: toId(playData.sessionId),
    session: sessionRef,
    playerId: toId(playData.playerId),
    player: playerRef,
    score: playData.score,
    currentRound: playData.currentRound,
    status: playData.status,
    pausedAt: playData.pausedAt,
    remainingTime: playData.remainingTime,
    metrics: mapGamePlayMetrics(playData.metrics),
    startedAt: playData.startedAt,
    completedAt: playData.completedAt,
    createdAt: playData.createdAt,
    updatedAt: playData.updatedAt
  };
};

/**
 * DTO v1 para GamePlay (detalle con eventos).
 *
 * @param {Object} gameplay - Documento GamePlay de Mongoose
 * @returns {Object|null} Partida detallada o null si no existe
 */
const toGamePlayDetailDTOV1 = gameplay => {
  const base = toGamePlayDTOV1(gameplay);
  if (!base) {
    return null;
  }

  const playData = toPlainObject(gameplay);

  return {
    ...base,
    events: mapGamePlayEvents(playData.events)
  };
};

/**
 * DTO v1 para array de GamePlays (resumen).
 *
 * @param {Array} gameplays - Array de documentos GamePlay
 * @returns {Array} Array de partidas transformadas
 */
const toGamePlayListDTOV1 = gameplays =>
  Array.isArray(gameplays) ? gameplays.map(toGamePlayDTOV1).filter(Boolean) : [];

const toMechanicRefDTOV1 = mechanic =>
  toPopulated(mechanic, mech => ({
    id: toId(mech),
    name: mech.name,
    displayName: mech.displayName,
    icon: mech.icon
  }));

const toContextRefDTOV1 = context =>
  toPopulated(context, ctx => ({
    id: toId(ctx),
    contextId: ctx.contextId,
    name: ctx.name
  }));

const toDeckRefDTOV1 = deck =>
  toPopulated(deck, d => ({
    id: toId(d),
    name: d.name,
    status: d.status,
    contextId: toId(d.contextId)
  }));

const toUserRefDTOV1 = user =>
  toPopulated(user, u => ({
    id: toId(u),
    name: u.name,
    email: u.email
  }));

const mapCardMappingDTOV1 = mapping => {
  const mappingData = toPlainObject(mapping);
  const cardRef = toPopulated(mappingData.cardId, card => ({
    id: toId(card),
    uid: card.uid,
    type: card.type,
    status: card.status
  }));

  return {
    id: toId(mappingData),
    cardId: toId(mappingData.cardId),
    uid: mappingData.uid,
    assignedValue: mappingData.assignedValue,
    displayData: mappingData.displayData,
    card: cardRef
  };
};

const mapBoardLayoutItemDTOV1 = layoutItem => {
  const itemData = toPlainObject(layoutItem);

  return {
    slotIndex: itemData.slotIndex,
    cardId: toId(itemData.cardId),
    uid: itemData.uid,
    assignedValue: itemData.assignedValue,
    displayData: itemData.displayData
  };
};

/**
 * DTO v1 para GameSession (resumen sin cardMappings).
 *
 * @param {Object} session - Documento GameSession de Mongoose
 * @returns {Object|null} Sesión resumida o null si no existe
 */
const toGameSessionDTOV1 = session => {
  if (!session) {
    return null;
  }

  const sessionData = toPlainObject(session);

  return {
    id: toId(sessionData),
    mechanicId: toId(sessionData.mechanicId),
    deckId: toId(sessionData.deckId),
    contextId: toId(sessionData.contextId),
    mechanic: toMechanicRefDTOV1(sessionData.mechanicId),
    deck: toDeckRefDTOV1(sessionData.deckId),
    context: toContextRefDTOV1(sessionData.contextId),
    createdBy: toId(sessionData.createdBy),
    creator: toUserRefDTOV1(sessionData.createdBy),
    config: sessionData.config
      ? {
          numberOfCards: sessionData.config.numberOfCards,
          numberOfRounds: sessionData.config.numberOfRounds,
          timeLimit: sessionData.config.timeLimit,
          pointsPerCorrect: sessionData.config.pointsPerCorrect,
          penaltyPerError: sessionData.config.penaltyPerError
        }
      : undefined,
    cardMappingsCount: Array.isArray(sessionData.cardMappings)
      ? sessionData.cardMappings.length
      : sessionData.config?.numberOfCards || 0,
    boardLayout: Array.isArray(sessionData.boardLayout)
      ? sessionData.boardLayout.map(mapBoardLayoutItemDTOV1)
      : [],
    status: sessionData.status,
    difficulty: sessionData.difficulty,
    startedAt: sessionData.startedAt,
    endedAt: sessionData.endedAt,
    createdAt: sessionData.createdAt,
    updatedAt: sessionData.updatedAt
  };
};

/**
 * DTO v1 para GameSession (detalle con cardMappings).
 *
 * @param {Object} session - Documento GameSession de Mongoose
 * @returns {Object|null} Sesión detallada o null si no existe
 */
const toGameSessionDetailDTOV1 = session => {
  const base = toGameSessionDTOV1(session);
  if (!base) {
    return null;
  }

  const sessionData = toPlainObject(session);

  return {
    ...base,
    cardMappings: Array.isArray(sessionData.cardMappings)
      ? sessionData.cardMappings.map(mapCardMappingDTOV1)
      : []
  };
};

/**
 * DTO v1 para array de GameSessions (resumen).
 *
 * @param {Array} sessions - Array de documentos GameSession
 * @returns {Array} Array de sesiones transformadas
 */
const toGameSessionListDTOV1 = sessions =>
  Array.isArray(sessions) ? sessions.map(toGameSessionDTOV1).filter(Boolean) : [];

/**
 * DTO v1 para Card (tarjeta RFID).
 *
 * @param {Object} card - Documento Card de Mongoose
 * @returns {Object|null} Tarjeta transformada o null si no existe
 */
const toCardDTOV1 = card => {
  if (!card) {
    return null;
  }

  const cardData = toPlainObject(card);

  return {
    id: toId(cardData),
    uid: cardData.uid,
    type: cardData.type,
    status: cardData.status,
    createdAt: cardData.createdAt,
    updatedAt: cardData.updatedAt
  };
};

/**
 * DTO v1 para array de Cards.
 *
 * @param {Array} cards - Array de documentos Card
 * @returns {Array} Array de tarjetas transformadas
 */
const toCardListDTOV1 = cards =>
  Array.isArray(cards) ? cards.map(toCardDTOV1).filter(Boolean) : [];

/**
 * DTO v1 para GameMechanic.
 *
 * @param {Object} mechanic - Documento GameMechanic de Mongoose
 * @returns {Object|null} Mecánica transformada o null si no existe
 */
const toGameMechanicDTOV1 = mechanic => {
  if (!mechanic) {
    return null;
  }

  const mechanicData = toPlainObject(mechanic);

  return {
    id: toId(mechanicData),
    name: mechanicData.name,
    displayName: mechanicData.displayName,
    description: mechanicData.description,
    icon: mechanicData.icon,
    rules: mechanicData.rules,
    isActive: mechanicData.isActive,
    createdAt: mechanicData.createdAt,
    updatedAt: mechanicData.updatedAt
  };
};

/**
 * DTO v1 para array de GameMechanics.
 *
 * @param {Array} mechanics - Array de documentos GameMechanic
 * @returns {Array} Array de mecánicas transformadas
 */
const toGameMechanicListDTOV1 = mechanics =>
  Array.isArray(mechanics) ? mechanics.map(toGameMechanicDTOV1).filter(Boolean) : [];

/**
 * DTO v1 para GameContext (resumen sin assets).
 *
 * @param {Object} context - Documento GameContext de Mongoose
 * @returns {Object|null} Contexto resumido o null si no existe
 */
const toGameContextDTOV1 = context => {
  if (!context) {
    return null;
  }

  const contextData = toPlainObject(context);

  return {
    id: toId(contextData),
    contextId: contextData.contextId,
    name: contextData.name,
    isActive: contextData.isActive,
    assetsCount: Array.isArray(contextData.assets) ? contextData.assets.length : 0,
    createdAt: contextData.createdAt,
    updatedAt: contextData.updatedAt
  };
};

/**
 * DTO v1 para Asset (item dentro de GameContext).
 *
 * @param {Object} asset - Subdocumento asset
 * @returns {Object|null} Asset transformado o null si no existe
 */
const toAssetDTOV1 = asset => {
  if (!asset) {
    return null;
  }

  const assetData = toPlainObject(asset);

  return {
    key: assetData.key,
    display: assetData.display,
    value: assetData.value,
    audioUrl: assetData.audioUrl,
    imageUrl: assetData.imageUrl,
    thumbnailUrl: assetData.thumbnailUrl
  };
};

/**
 * DTO v1 para GameContext (detalle con assets).
 *
 * @param {Object} context - Documento GameContext de Mongoose
 * @returns {Object|null} Contexto detallado o null si no existe
 */
const toGameContextDetailDTOV1 = context => {
  const base = toGameContextDTOV1(context);
  if (!base) {
    return null;
  }

  const contextData = toPlainObject(context);

  return {
    ...base,
    assets: Array.isArray(contextData.assets) ? contextData.assets.map(toAssetDTOV1) : []
  };
};

/**
 * DTO v1 para array de GameContexts (resumen).
 *
 * @param {Array} contexts - Array de documentos GameContext
 * @returns {Array} Array de contextos transformados
 */
const toGameContextListDTOV1 = contexts =>
  Array.isArray(contexts) ? contexts.map(toGameContextDTOV1).filter(Boolean) : [];

/**
 * DTO v1 para CardDeck (resumen sin cardMappings).
 *
 * @param {Object} deck - Documento CardDeck de Mongoose
 * @returns {Object|null} Mazo resumido o null si no existe
 */
const toCardDeckDTOV1 = deck => {
  if (!deck) {
    return null;
  }

  const deckData = toPlainObject(deck);

  return {
    id: toId(deckData),
    name: deckData.name,
    description: deckData.description,
    contextId: toId(deckData.contextId),
    context: toContextRefDTOV1(deckData.contextId),
    status: deckData.status,
    cardsCount: Array.isArray(deckData.cardMappings) ? deckData.cardMappings.length : 0,
    createdBy: toId(deckData.createdBy),
    creator: toUserRefDTOV1(deckData.createdBy),
    createdAt: deckData.createdAt,
    updatedAt: deckData.updatedAt
  };
};

/**
 * DTO v1 para CardDeck (detalle con cardMappings).
 *
 * @param {Object} deck - Documento CardDeck de Mongoose
 * @returns {Object|null} Mazo detallado o null si no existe
 */
const toCardDeckDetailDTOV1 = deck => {
  const base = toCardDeckDTOV1(deck);
  if (!base) {
    return null;
  }

  const deckData = toPlainObject(deck);

  return {
    ...base,
    cardMappings: Array.isArray(deckData.cardMappings)
      ? deckData.cardMappings.map(mapCardMappingDTOV1)
      : []
  };
};

/**
 * DTO v1 para array de CardDecks (resumen).
 *
 * @param {Array} decks - Array de documentos CardDeck
 * @returns {Array} Array de mazos transformados
 */
const toCardDeckListDTOV1 = decks =>
  Array.isArray(decks) ? decks.map(toCardDeckDTOV1).filter(Boolean) : [];

/**
 * DTO v1 para respuestas paginadas.
 * Envuelve datos paginados con metadatos de paginación.
 *
 * @param {Array} data - Array de datos (ya transformados con DTO)
 * @param {number|Object} pageOrMeta - Página actual o meta
 * @param {number} limitArg - Items por página
 * @param {number} totalArg - Total de items disponibles
 * @returns {Object} Respuesta paginada estructurada
 */
const toPaginatedDTOV1 = (data, pageOrMeta, limitArg, totalArg) => {
  const meta =
    pageOrMeta && typeof pageOrMeta === 'object'
      ? pageOrMeta
      : { page: pageOrMeta, limit: limitArg, total: totalArg };

  const page = Number(meta.page) || 1;
  const limit = Number(meta.limit) || 0;
  const total = Number(meta.total) || 0;
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

/**
 * DTO v1 para respuesta de autenticación (tokens).
 *
 * @param {Object} user - Documento User
 * @param {Object} tokens - Tokens públicos
 * @returns {Object} Respuesta de auth estandarizada
 */
const toAuthResponseDTOV1 = (user, tokens) => ({
  user: toUserDTOV1(user),
  accessToken: tokens.accessToken,
  accessTokenExpiresIn: tokens.accessTokenExpiresIn,
  tokenType: tokens.tokenType
});

/**
 * DTO v1 para estadísticas de tarjetas.
 *
 * @param {Object} stats - Estadísticas agregadas
 * @returns {Object} Estadísticas normalizadas
 */
const toCardStatsDTOV1 = stats => ({
  total: stats.total,
  active: stats.active,
  inactive: stats.inactive,
  lost: stats.lost,
  mifare1kb: stats.mifare1kb,
  mifare4kb: stats.mifare4kb,
  ntag: stats.ntag,
  unknown: stats.unknown
});

/**
 * DTO v1 para estadísticas de alumno.
 *
 * @param {Object} user - Documento User
 * @param {Object|null} metrics - Métricas agregadas
 * @param {number} accuracyRate - Tasa de acierto
 * @returns {Object} Estadísticas de alumno normalizadas
 */
const toUserStatsDTOV1 = (user, metrics, accuracyRate) => {
  if (!user) {
    return null;
  }

  const userData = toPlainObject(user);

  if (userData.role !== 'student') {
    return {
      user: {
        id: toId(userData),
        name: userData.name,
        role: userData.role
      },
      metrics: null
    };
  }

  const baseMetrics = metrics || userData.studentMetrics || {};

  return {
    user: {
      id: toId(userData),
      name: userData.name,
      classroom: userData.profile?.classroom,
      age: userData.profile?.age
    },
    metrics: {
      ...baseMetrics,
      accuracyRate
    }
  };
};

/**
 * DTO v1 para estadísticas de partidas por jugador.
 *
 * @param {Object} payload - Datos de estadísticas
 * @returns {Object} Estadísticas normalizadas
 */
const toPlayerStatsDTOV1 = payload => ({
  playerId: payload.playerId,
  sessionId: payload.sessionId,
  stats: {
    ...payload.stats,
    accuracyRate: payload.accuracyRate
  }
});

/**
 * DTO v1 para métricas de sistema.
 *
 * @param {Object} payload - Snapshot del sistema
 * @returns {Object} Métricas normalizadas
 */
const toSystemMetricsDTOV1 = payload => ({
  timestamp: payload.timestamp,
  http: payload.http,
  websocket: payload.websocket,
  gameEngine: payload.gameEngine,
  rfid: payload.rfid
});

module.exports = {
  // Users
  toUserDTOV1,
  toStudentDTOV1,
  toUserSummaryDTOV1,
  toUserListDTOV1,

  // GamePlay
  toGamePlayDTOV1,
  toGamePlayDetailDTOV1,
  toGamePlayListDTOV1,

  // GameSession
  toGameSessionDTOV1,
  toGameSessionDetailDTOV1,
  toGameSessionListDTOV1,

  // Cards
  toCardDTOV1,
  toCardListDTOV1,

  // Mechanics
  toGameMechanicDTOV1,
  toGameMechanicListDTOV1,

  // Contexts
  toGameContextDTOV1,
  toGameContextDetailDTOV1,
  toGameContextListDTOV1,
  toAssetDTOV1,

  // Decks
  toCardDeckDTOV1,
  toCardDeckDetailDTOV1,
  toCardDeckListDTOV1,

  // Paginación
  toPaginatedDTOV1,

  // Auth
  toAuthResponseDTOV1,

  // Analytics
  toCardStatsDTOV1,
  toUserStatsDTOV1,
  toPlayerStatsDTOV1,
  toSystemMetricsDTOV1
};
