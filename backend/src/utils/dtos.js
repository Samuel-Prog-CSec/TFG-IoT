/**
 * @fileoverview Data Transfer Objects (DTOs) - Transformadores de datos para respuestas API.
 * Transforma documentos de Mongoose a objetos seguros sin campos sensibles.
 * IMPORTANTE: Usar estos DTOs en TODOS los controllers antes de enviar respuestas.
 * @module utils/dtos
 */

/**
 * DTO para User (respuesta segura sin password).
 * Elimina campos sensibles y metadatos internos.
 *
 * @param {Object} user - Documento User de Mongoose
 * @returns {Object|null} Usuario transformado o null si no existe
 *
 * @example
 * const safeUser = userDTO(user);
 * res.json({ success: true, data: safeUser });
 */
const userDTO = user => {
  if (!user) {
    return null;
  }

  const userData = typeof user.toObject === 'function' ? user.toObject() : user;

  return {
    id: userData._id?.toString(),
    name: userData.name,
    // Email solo para roles con login (alumnos no tienen email)
    email: ['teacher', 'super_admin'].includes(userData.role) ? userData.email : undefined,
    role: userData.role,
    status: userData.status,
    accountStatus: ['teacher', 'super_admin'].includes(userData.role)
      ? userData.accountStatus
      : undefined,
    profile: userData.profile
      ? {
          avatar: userData.profile.avatar,
          age: userData.profile.age,
          classroom: userData.profile.classroom,
          birthdate: userData.profile.birthdate
        }
      : undefined,
    // Métricas solo para alumnos
    studentMetrics:
      userData.role === 'student' && userData.studentMetrics
        ? {
            totalGamesPlayed: userData.studentMetrics.totalGamesPlayed,
            totalScore: userData.studentMetrics.totalScore,
            averageScore: userData.studentMetrics.averageScore,
            bestScore: userData.studentMetrics.bestScore,
            totalCorrectAnswers: userData.studentMetrics.totalCorrectAnswers,
            totalErrors: userData.studentMetrics.totalErrors,
            averageResponseTime: userData.studentMetrics.averageResponseTime,
            lastPlayedAt: userData.studentMetrics.lastPlayedAt
          }
        : undefined,
    createdBy: userData.createdBy?.toString(),
    lastLoginAt: userData.lastLoginAt,
    createdAt: userData.createdAt,
    updatedAt: userData.updatedAt
    // NO incluir: password, __v, tokens internos
  };
};

/**
 * DTO para array de Users.
 * Transforma múltiples usuarios de forma segura.
 *
 * @param {Array} users - Array de documentos User
 * @returns {Array} Array de usuarios transformados
 */
const userListDTO = users => {
  if (!Array.isArray(users)) {
    return [];
  }
  return users.map(userDTO).filter(Boolean);
};

/**
 * DTO para GamePlay (partida individual).
 * Transforma partida con eventos y métricas.
 *
 * @param {Object} gameplay - Documento GamePlay de Mongoose
 * @returns {Object|null} Partida transformada o null si no existe
 */
const gamePlayDTO = gameplay => {
  if (!gameplay) {
    return null;
  }

  const playData = typeof gameplay.toObject === 'function' ? gameplay.toObject() : gameplay;

  return {
    id: playData._id?.toString(),
    sessionId: playData.sessionId?.toString() || playData.sessionId,
    playerId: playData.playerId?.toString() || playData.playerId,
    score: playData.score,
    currentRound: playData.currentRound,
    status: playData.status,
    pausedAt: playData.pausedAt,
    remainingTime: playData.remainingTime,
    // Eventos transformados (sin __id interno de subdocumentos)
    events:
      playData.events?.map(event => ({
        timestamp: event.timestamp,
        eventType: event.eventType,
        cardUid: event.cardUid,
        expectedValue: event.expectedValue,
        actualValue: event.actualValue,
        pointsAwarded: event.pointsAwarded,
        timeElapsed: event.timeElapsed,
        roundNumber: event.roundNumber
      })) || [],
    metrics: playData.metrics
      ? {
          totalAttempts: playData.metrics.totalAttempts,
          correctAttempts: playData.metrics.correctAttempts,
          errorAttempts: playData.metrics.errorAttempts,
          timeoutAttempts: playData.metrics.timeoutAttempts,
          averageResponseTime: playData.metrics.averageResponseTime,
          completionTime: playData.metrics.completionTime
        }
      : undefined,
    startedAt: playData.startedAt,
    completedAt: playData.completedAt,
    createdAt: playData.createdAt,
    updatedAt: playData.updatedAt
    // NO incluir: __v
  };
};

/**
 * DTO para array de GamePlays.
 *
 * @param {Array} gameplays - Array de documentos GamePlay
 * @returns {Array} Array de partidas transformadas
 */
const gamePlayListDTO = gameplays => {
  if (!Array.isArray(gameplays)) {
    return [];
  }
  return gameplays.map(gamePlayDTO).filter(Boolean);
};

/**
 * DTO para GameSession (configuración de sesión de juego).
 * Transforma sesión con cardMappings y configuración.
 *
 * @param {Object} session - Documento GameSession de Mongoose
 * @returns {Object|null} Sesión transformada o null si no existe
 */
const gameSessionDTO = session => {
  if (!session) {
    return null;
  }

  const sessionData = typeof session.toObject === 'function' ? session.toObject() : session;

  return {
    id: sessionData._id?.toString(),
    mechanicId:
      sessionData.mechanicId?._id?.toString() ||
      sessionData.mechanicId?.toString() ||
      sessionData.mechanicId,
    deckId:
      sessionData.deckId?._id?.toString() || sessionData.deckId?.toString() || sessionData.deckId,
    contextId:
      sessionData.contextId?._id?.toString() ||
      sessionData.contextId?.toString() ||
      sessionData.contextId,
    config: sessionData.config
      ? {
          numberOfCards: sessionData.config.numberOfCards,
          numberOfRounds: sessionData.config.numberOfRounds,
          timeLimit: sessionData.config.timeLimit,
          pointsPerCorrect: sessionData.config.pointsPerCorrect,
          penaltyPerError: sessionData.config.penaltyPerError
        }
      : undefined,
    // CardMappings transformados
    cardMappings:
      sessionData.cardMappings?.map(mapping => ({
        cardId: mapping.cardId?.toString(),
        uid: mapping.uid,
        assignedValue: mapping.assignedValue,
        displayData: mapping.displayData
      })) || [],
    status: sessionData.status,
    difficulty: sessionData.difficulty,
    startedAt: sessionData.startedAt,
    endedAt: sessionData.endedAt,
    createdBy: sessionData.createdBy?.toString(),
    createdAt: sessionData.createdAt,
    updatedAt: sessionData.updatedAt
    // NO incluir: __v
  };
};

/**
 * DTO para array de GameSessions.
 *
 * @param {Array} sessions - Array de documentos GameSession
 * @returns {Array} Array de sesiones transformadas
 */
const gameSessionListDTO = sessions => {
  if (!Array.isArray(sessions)) {
    return [];
  }
  return sessions.map(gameSessionDTO).filter(Boolean);
};

/**
 * DTO para Card (tarjeta RFID).
 * Transforma tarjeta con metadatos.
 *
 * @param {Object} card - Documento Card de Mongoose
 * @returns {Object|null} Tarjeta transformada o null si no existe
 */
const cardDTO = card => {
  if (!card) {
    return null;
  }

  const cardData = typeof card.toObject === 'function' ? card.toObject() : card;

  return {
    id: cardData._id?.toString(),
    uid: cardData.uid,
    type: cardData.type,
    status: cardData.status,
    createdAt: cardData.createdAt,
    updatedAt: cardData.updatedAt
    // NO incluir: __v
  };
};

/**
 * DTO para array de Cards.
 *
 * @param {Array} cards - Array de documentos Card
 * @returns {Array} Array de tarjetas transformadas
 */
const cardListDTO = cards => {
  if (!Array.isArray(cards)) {
    return [];
  }
  return cards.map(cardDTO).filter(Boolean);
};

/**
 * DTO para GameMechanic (mecánica de juego).
 * Transforma mecánica con reglas.
 *
 * @param {Object} mechanic - Documento GameMechanic de Mongoose
 * @returns {Object|null} Mecánica transformada o null si no existe
 */
const gameMechanicDTO = mechanic => {
  if (!mechanic) {
    return null;
  }

  const mechanicData = typeof mechanic.toObject === 'function' ? mechanic.toObject() : mechanic;

  return {
    id: mechanicData._id?.toString(),
    name: mechanicData.name,
    displayName: mechanicData.displayName,
    description: mechanicData.description,
    icon: mechanicData.icon,
    rules: mechanicData.rules,
    isActive: mechanicData.isActive,
    createdAt: mechanicData.createdAt,
    updatedAt: mechanicData.updatedAt
    // NO incluir: __v
  };
};

/**
 * DTO para array de GameMechanics.
 *
 * @param {Array} mechanics - Array de documentos GameMechanic
 * @returns {Array} Array de mecánicas transformadas
 */
const gameMechanicListDTO = mechanics => {
  if (!Array.isArray(mechanics)) {
    return [];
  }
  return mechanics.map(gameMechanicDTO).filter(Boolean);
};

/**
 * DTO para GameContext (contexto temático).
 * Transforma contexto con assets multimedia.
 *
 * @param {Object} context - Documento GameContext de Mongoose
 * @returns {Object|null} Contexto transformado o null si no existe
 */
const gameContextDTO = context => {
  if (!context) {
    return null;
  }

  const contextData = typeof context.toObject === 'function' ? context.toObject() : context;

  return {
    id: contextData._id?.toString(),
    contextId: contextData.contextId,
    name: contextData.name,
    // Assets transformados (sin __id interno)
    assets:
      contextData.assets?.map(asset => ({
        key: asset.key,
        display: asset.display,
        value: asset.value,
        audioUrl: asset.audioUrl,
        imageUrl: asset.imageUrl,
        thumbnailUrl: asset.thumbnailUrl
      })) || [],
    createdAt: contextData.createdAt,
    updatedAt: contextData.updatedAt
    // NO incluir: __v
  };
};

/**
 * DTO para array de GameContexts.
 *
 * @param {Array} contexts - Array de documentos GameContext
 * @returns {Array} Array de contextos transformados
 */
const gameContextListDTO = contexts => {
  if (!Array.isArray(contexts)) {
    return [];
  }
  return contexts.map(gameContextDTO).filter(Boolean);
};

/**
 * DTO para CardDeck (mazo reutilizable).
 *
 * @param {Object} deck - Documento CardDeck de Mongoose
 * @returns {Object|null} Mazo transformado o null si no existe
 */
const cardDeckDTO = deck => {
  if (!deck) {
    return null;
  }

  const deckData = typeof deck.toObject === 'function' ? deck.toObject() : deck;

  const contextObject =
    deckData.contextId && typeof deckData.contextId === 'object' && deckData.contextId._id
      ? {
          id: deckData.contextId._id?.toString(),
          contextId: deckData.contextId.contextId,
          name: deckData.contextId.name
        }
      : undefined;

  const createdByObject =
    deckData.createdBy && typeof deckData.createdBy === 'object' && deckData.createdBy._id
      ? {
          id: deckData.createdBy._id?.toString(),
          name: deckData.createdBy.name,
          email: deckData.createdBy.email
        }
      : undefined;

  return {
    id: deckData._id?.toString(),
    name: deckData.name,
    description: deckData.description,
    contextId: contextObject?.id || deckData.contextId?.toString() || deckData.contextId,
    context: contextObject,
    cardMappings:
      deckData.cardMappings?.map(mapping => {
        const cardObject =
          mapping.cardId && typeof mapping.cardId === 'object' && mapping.cardId._id
            ? {
                id: mapping.cardId._id?.toString(),
                uid: mapping.cardId.uid,
                type: mapping.cardId.type,
                status: mapping.cardId.status,
                metadata: mapping.cardId.metadata
              }
            : undefined;

        return {
          id: mapping._id?.toString(),
          cardId: mapping.cardId?._id?.toString() || mapping.cardId?.toString() || mapping.cardId,
          uid: mapping.uid,
          assignedValue: mapping.assignedValue,
          displayData: mapping.displayData,
          card: cardObject
        };
      }) || [],
    status: deckData.status,
    createdBy: createdByObject?.id || deckData.createdBy?.toString() || deckData.createdBy,
    creator: createdByObject,
    createdAt: deckData.createdAt,
    updatedAt: deckData.updatedAt
  };
};

/**
 * DTO para array de CardDecks.
 *
 * @param {Array} decks - Array de documentos CardDeck
 * @returns {Array} Array de mazos transformados
 */
const cardDeckListDTO = decks => {
  if (!Array.isArray(decks)) {
    return [];
  }
  return decks.map(cardDeckDTO).filter(Boolean);
};

/**
 * DTO para respuestas paginadas.
 * Envuelve datos paginados con metadatos de paginación.
 *
 * @param {Array} data - Array de datos (ya transformados con DTO)
 * @param {number} page - Página actual
 * @param {number} limit - Items por página
 * @param {number} total - Total de items disponibles
 * @returns {Object} Respuesta paginada estructurada
 *
 * @example
 * const users = await User.find().limit(20);
 * const usersSafe = userListDTO(users);
 * const paginated = paginationDTO(usersSafe, 1, 20, 150);
 * res.json({ success: true, ...paginated });
 */
const paginationDTO = (data, pageOrMeta, limitArg, totalArg) => {
  // Firma retrocompatible:
  // - paginationDTO(items, page, limit, total)
  // - paginationDTO(items, { page, limit, total })
  const meta =
    pageOrMeta && typeof pageOrMeta === 'object'
      ? pageOrMeta
      : { page: pageOrMeta, limit: limitArg, total: totalArg };

  const page = Number(meta.page) || 1;
  const limit = Number(meta.limit) || data?.length || 0;
  const total = Number(meta.total) || 0;

  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
      hasPrevious: page > 1
    }
  };
};

module.exports = {
  // Individuales
  userDTO,
  gamePlayDTO,
  gameSessionDTO,
  cardDTO,
  gameMechanicDTO,
  gameContextDTO,
  cardDeckDTO,

  // Listas
  userListDTO,
  gamePlayListDTO,
  gameSessionListDTO,
  cardListDTO,
  gameMechanicListDTO,
  gameContextListDTO,
  cardDeckListDTO,

  // Paginación
  paginationDTO
};
