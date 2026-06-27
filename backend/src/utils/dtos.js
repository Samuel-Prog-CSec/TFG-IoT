/**
 * @fileoverview Data Transfer Objects (DTOs) - Transformadores de datos para respuestas API.
 * Transforma documentos de Mongoose a objetos seguros sin campos sensibles.
 * IMPORTANTE: Usar estos DTOs en TODOS los controllers antes de enviar respuestas.
 * @module utils/dtos
 */

const { pseudonymize } = require('./pseudonymize');

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

/**
 * Normaliza el campo createdBy de un user. Si viene poblado (objeto con name),
 * devuelve {id, name}; si solo es ObjectId/string, devuelve el id en string.
 * Permite que el frontend muestre el nombre del profesor que creo a un alumno
 * sin tener que cargar otro endpoint.
 */
const mapCreatedBy = createdBy => {
  if (!createdBy) {
    return undefined;
  }
  if (typeof createdBy === 'object' && (createdBy._id || createdBy.id) && createdBy.name) {
    return { id: toId(createdBy), name: createdBy.name };
  }
  return toId(createdBy);
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
    lastPlayedAt: metrics.lastPlayedAt,
    // Mejor longitud de secuencia alcanzada en cualquier partida (mecánica
    // Secuencia). `undefined` para alumnos que no han jugado todavía o
    // documentos previos a T-921.
    maxSequenceLengthAchieved: metrics.maxSequenceLengthAchieved
  };
};

const mapGamePlayMetrics = metrics => {
  if (!metrics) {
    return undefined;
  }
  const base = {
    totalAttempts: metrics.totalAttempts,
    correctAttempts: metrics.correctAttempts,
    errorAttempts: metrics.errorAttempts,
    timeoutAttempts: metrics.timeoutAttempts,
    averageResponseTime: metrics.averageResponseTime,
    completionTime: metrics.completionTime
  };

  // Métricas específicas de Secuencia. Se exponen sólo si están presentes
  // en el documento (no se inicializan a 0 para evitar contaminar plays de
  // Asociación/Memoria con campos no aplicables).
  const sequenceFields = [
    'sequencesCompleted',
    'sequencesBlocked',
    'sequencesTimedOut',
    'maxSequenceLengthAchieved',
    'partialReproductions',
    'partialRounds',
    'roundsPlayed',
    'averageReproductionTimeMs',
    'blockedCardsTotal',
    'hintsUsed'
  ];
  for (const key of sequenceFields) {
    if (metrics[key] !== undefined) {
      base[key] = metrics[key];
    }
  }

  // Métricas específicas de Memoria (ADR-A). Sólo aparecen para plays
  // 'memory'; en otros tipos el sub-objeto queda undefined y se omite.
  if (metrics.memory) {
    const m =
      typeof metrics.memory.toObject === 'function' ? metrics.memory.toObject() : metrics.memory;
    base.memory = {
      groupsMatched: Number.isFinite(Number(m.groupsMatched)) ? Number(m.groupsMatched) : 0,
      peakStreak: Number.isFinite(Number(m.peakStreak)) ? Number(m.peakStreak) : 0,
      averageMatchTimeMs: Number.isFinite(Number(m.averageMatchTimeMs))
        ? Number(m.averageMatchTimeMs)
        : 0,
      attemptsToFirstMatch: m.attemptsToFirstMatch ?? null,
      groupSize: Number.isFinite(Number(m.groupSize)) ? Number(m.groupSize) : 2
    };
  }

  // Métricas específicas de Asociación (ADR-A). El mapa byValueAccuracy se
  // serializa a objeto plano para que el frontend pueda mapearlo sin saber
  // de Mongoose. categoryDominance se incluye sólo si hay un slug claro.
  if (metrics.association) {
    const a =
      typeof metrics.association.toObject === 'function'
        ? metrics.association.toObject()
        : metrics.association;
    const byValueAccuracy =
      a.byValueAccuracy && typeof a.byValueAccuracy === 'object'
        ? Object.fromEntries(
            Object.entries(a.byValueAccuracy).map(([key, value]) => [
              key,
              {
                correct: Number(value?.correct || 0),
                total: Number(value?.total || 0)
              }
            ])
          )
        : {};
    base.association = {
      peakStreak: Number.isFinite(Number(a.peakStreak)) ? Number(a.peakStreak) : 0,
      quickestCorrectMs: a.quickestCorrectMs ?? null,
      slowestCorrectMs: a.slowestCorrectMs ?? null,
      byValueAccuracy,
      categoryDominance: a.categoryDominance ?? null
    };
  }

  return base;
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
          // birthdate ELIMINADO: Art. 5.1.c RGPD (minimización)
          // Onboarding interactivo (T-951 PROP-13). Se expone al cliente
          // para que `useOnboarding` pueda hidratar su estado y NO mostrar
          // el tour a usuarios que ya lo completaron.
          onboarding: userData.profile.onboarding
            ? {
                teacherCompleted: !!userData.profile.onboarding.teacherCompleted,
                superAdminCompleted: !!userData.profile.onboarding.superAdminCompleted,
                currentStep: userData.profile.onboarding.currentStep ?? 0,
                currentTrack: userData.profile.onboarding.currentTrack ?? null,
                version: userData.profile.onboarding.version ?? 1,
                lastSeenAt: userData.profile.onboarding.lastSeenAt ?? null
              }
            : undefined
        }
      : undefined,
    createdBy: mapCreatedBy(userData.createdBy),
    lastLoginAt: hasLogin ? userData.lastLoginAt : undefined,
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
    studentMetrics: mapStudentMetrics(userData.studentMetrics),
    consent: userData.consent
      ? {
          granted: userData.consent.granted,
          grantedBy: userData.consent.grantedBy,
          grantedAt: userData.consent.grantedAt,
          purposes: userData.consent.purposes,
          policyVersion: userData.consent.policyVersion,
          withdrawnAt: userData.consent.withdrawnAt
        }
      : undefined,
    consentHistory: Array.isArray(userData.consentHistory)
      ? userData.consentHistory.map(entry => ({
          action: entry.action,
          grantedBy: entry.grantedBy,
          timestamp: entry.timestamp,
          policyVersion: entry.policyVersion,
          purposes: entry.purposes
        }))
      : []
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
  const hasLogin = ['teacher', 'super_admin'].includes(userData.role);

  return {
    id: toId(userData),
    name: userData.name,
    // Email solo para roles con login (docentes/dirección); los alumnos no
    // tienen. Necesario en la lista de aprobaciones, donde la dirección
    // identifica y busca por email a los profesores pendientes.
    email: hasLogin ? userData.email : undefined,
    role: userData.role,
    status: userData.status,
    profile: userData.profile
      ? {
          avatar: userData.profile.avatar,
          age: userData.profile.age,
          classroom: userData.profile.classroom
        }
      : undefined,
    consent: userData.consent ? { granted: userData.consent.granted } : undefined,
    createdBy: mapCreatedBy(userData.createdBy),
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
    // ADR-114: techo absoluto de la partida — el frontend lo usa para
    // pintar `score / maxScore (Z%)` en el GameOver y dar contexto al
    // alumno y al docente sobre qué % de lo posible se logró.
    maxScore: playData.maxScore ?? null,
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

  return {
    id: toId(mappingData),
    uid: mappingData.uid,
    assignedValue: mappingData.assignedValue,
    displayData: mappingData.displayData
  };
};

const mapBoardLayoutItemDTOV1 = layoutItem => {
  const itemData = toPlainObject(layoutItem);

  return {
    slotIndex: itemData.slotIndex,
    uid: itemData.uid,
    assignedValue: itemData.assignedValue,
    displayData: itemData.displayData
  };
};

const mapAssociationChallengeItemDTOV1 = challengeItem => {
  const itemData = toPlainObject(challengeItem);

  return {
    roundNumber: itemData.roundNumber,
    uid: itemData.uid,
    assignedValue: itemData.assignedValue,
    displayData: itemData.displayData,
    promptText: itemData.promptText
  };
};

const mapSequenceItemDTOV1 = item => {
  const itemData = toPlainObject(item);
  return {
    uid: itemData.uid,
    assignedValue: itemData.assignedValue,
    displayData: itemData.displayData
  };
};

const mapSequencePlanRoundDTOV1 = round => {
  const roundData = toPlainObject(round);
  return {
    roundNumber: roundData.roundNumber,
    length: roundData.length,
    sequence: Array.isArray(roundData.sequence) ? roundData.sequence.map(mapSequenceItemDTOV1) : []
  };
};

const mapSequenceConfigDTOV1 = config => {
  if (!config) {
    return undefined;
  }
  const cfg = toPlainObject(config);
  return {
    minSequenceLength: cfg.minSequenceLength,
    maxSequenceLength: cfg.maxSequenceLength,
    displaySeconds: cfg.displaySeconds
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
    name: sessionData.name || null,
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
    associationChallengePlan: Array.isArray(sessionData.associationChallengePlan)
      ? sessionData.associationChallengePlan.map(mapAssociationChallengeItemDTOV1)
      : [],
    sequencePlan: Array.isArray(sessionData.sequencePlan)
      ? sessionData.sequencePlan.map(mapSequencePlanRoundDTOV1)
      : [],
    sequenceConfig: mapSequenceConfigDTOV1(sessionData.sequenceConfig),
    requiresAssociationPlanConfiguration: Boolean(sessionData.requiresAssociationPlanConfiguration),
    status: sessionData.status,
    difficulty: sessionData.difficulty,
    // Play stats (attached externally by controller when listing sessions)
    playStats: sessionData.playStats || null,
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
  const assets = Array.isArray(contextData.assets) ? contextData.assets : [];

  return {
    id: toId(contextData),
    contextId: contextData.contextId,
    name: contextData.name,
    isActive: contextData.isActive,
    assets: assets.map(toAssetDTOV1),
    assetsCount: assets.length,
    imageCount: assets.filter(a => a.imageUrl).length,
    audioCount: assets.filter(a => a.audioUrl).length,
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

  // uploadedBy puede venir poblado (objeto User) o solo como ObjectId/string.
  // Normalizamos a {id, name} cuando hay populate, o a {id} cuando no.
  let uploadedBy = null;
  if (assetData.uploadedBy) {
    if (typeof assetData.uploadedBy === 'object' && assetData.uploadedBy._id) {
      uploadedBy = {
        id: assetData.uploadedBy._id.toString(),
        name: assetData.uploadedBy.name || null
      };
    } else {
      uploadedBy = { id: toId(assetData.uploadedBy), name: null };
    }
  }

  return {
    key: assetData.key,
    display: assetData.display,
    value: assetData.value,
    audioUrl: assetData.audioUrl,
    imageUrl: assetData.imageUrl,
    thumbnailUrl: assetData.thumbnailUrl,
    dominantColor: assetData.dominantColor || null,
    uploadedBy
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
    // Preview de hasta 6 mappings — coincide con el mazo estandar (6 cartas
    // unicas) para que la card del deck muestre todas las miniaturas.
    cardMappings: Array.isArray(deckData.cardMappings)
      ? deckData.cardMappings.slice(0, 6).map(mapCardMappingDTOV1)
      : [],
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
  rfid: payload.rfid,
  // Bloque con métricas de Redis: hits/misses del cache de slim-user en auth,
  // y contador acumulado de fallbacks del rate limiter HTTP a MemoryStore.
  // Clave para detectar en producción si el cache y el rate-limit distribuidos
  // están operativos.
  redis: payload.redis,
  // B.6 (pre-v1.0.0): visibility del modo activo del rate limiter Socket.IO
  // (Redis ZSET distribuido vs memory-local). Sin esto no se puede validar
  // en Koyeb prod que el path correcto está en uso.
  socketRateLimiter: payload.socketRateLimiter,
  // T-931 (pre-v1.0.0): contadores de la materialización Redis (ZSET
  // leaderboards + Hash studentMetrics + reconciliación BullMQ nocturna).
  t931: payload.t931,
  memory: payload.memory
});

/**
 * DTO para analytics seudonimizado (Art. 25 RGPD).
 * Expone pseudoId en vez de id/name para separar PII de datos analíticos.
 *
 * @param {Object} user - Documento User de Mongoose
 * @returns {Object|null} Datos analíticos sin PII directa
 */
const toStudentAnalyticsDTOV1 = user => {
  if (!user) {
    return null;
  }

  const userData = toPlainObject(user);
  return {
    pseudoId: pseudonymize(userData._id || userData.id),
    profile: {
      age: userData.profile?.age,
      classroom: userData.profile?.classroom
    },
    studentMetrics: mapStudentMetrics(userData.studentMetrics),
    consent: userData.consent
      ? {
          granted: userData.consent.granted,
          purposes: userData.consent.purposes
        }
      : undefined
  };
};

/**
 * DTO para resolución de identidad (endpoint dedicado).
 * Vincula pseudoId con datos identificativos — solo accesible por el profesor propietario.
 *
 * @param {Object} user - Documento User de Mongoose
 * @returns {Object|null} Mapeo pseudoId → identidad
 */
const toStudentIdentityDTOV1 = user => {
  if (!user) {
    return null;
  }

  const userData = toPlainObject(user);
  return {
    pseudoId: pseudonymize(userData._id || userData.id),
    id: toId(userData),
    name: userData.name,
    profile: {
      avatar: userData.profile?.avatar,
      age: userData.profile?.age,
      classroom: userData.profile?.classroom
    }
  };
};

/**
 * DTO v1 para Notification (T-955). Serializa el documento Mongoose a un
 * objeto plano apto para enviar por HTTP y por Socket.IO `notification:created`.
 *
 * @param {Object} doc - Documento Notification de Mongoose o plain object.
 * @returns {Object|null}
 */
const toNotificationDTOV1 = doc => {
  if (!doc) {
    return null;
  }
  const data = toPlainObject(doc);
  return {
    id: toId(data),
    type: data.type,
    priority: data.priority || 'info',
    title: data.title,
    body: data.body || '',
    link: data.link || null,
    metadata: data.metadata && typeof data.metadata === 'object' ? { ...data.metadata } : {},
    read: !!data.read,
    readAt: data.readAt || null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
};

/**
 * DTO para alertas inteligentes persistidas (T-941).
 *
 * Incluye virtuals `daysActive` e `isEscalated` para la UI. Expone
 * `studentId` solo a docentes con ownership (ya filtrado en controller).
 * `studentPseudoId` se usa en logs/exports; `studentName` lo añade el
 * service tras hidratar desde el catálogo del docente.
 *
 * @param {object} doc - Documento Mongoose o POJO `.lean()`.
 * @param {object} [opts]
 * @param {string} [opts.studentName] - Nombre humano (no en BD).
 * @param {string} [opts.dismissedByName] - Nombre del docente que descartó.
 * @returns {object|null}
 */
const toSmartAlertDTOV1 = (doc, opts = {}) => {
  if (!doc) {
    return null;
  }
  const data = toPlainObject(doc);
  const detectedAt = data.detectedAt ? new Date(data.detectedAt) : null;
  const reference =
    data.status === 'resolved' && data.resolvedAt ? new Date(data.resolvedAt) : new Date();
  const daysActive = detectedAt ? Math.floor((reference - detectedAt) / 86400000) : 0;
  const isEscalated = Array.isArray(data.severityHistory)
    ? data.severityHistory.some(s => s.reason === 'escalation')
    : false;

  return {
    id: toId(data),
    type: data.type,
    severity: data.severity,
    status: data.status,

    studentId: toId(data.studentId),
    studentPseudoId: data.studentPseudoId,
    studentName: opts.studentName || null,

    description: data.description,
    recommendation: data.recommendation || null,
    data: data.data && typeof data.data === 'object' ? { ...data.data } : {},

    detectedAt: data.detectedAt || null,
    lastSeenAt: data.lastSeenAt || null,
    occurrencesCount: data.occurrencesCount ?? 1,

    resolvedAt: data.resolvedAt || null,
    resolvedAutomatically: !!data.resolvedAutomatically,

    dismissedAt: data.dismissedAt || null,
    dismissedBy: toId(data.dismissedBy) || null,
    dismissedByName: opts.dismissedByName || null,
    dismissReason: data.dismissReason || null,

    snoozedUntil: data.snoozedUntil || null,
    snoozedAt: data.snoozedAt || null,

    pinned: !!data.pinned,
    pinnedAt: data.pinnedAt || null,

    gamePlayId: toId(data.gamePlayId) || null,
    notificationId: toId(data.notificationId) || null,
    severityHistory: Array.isArray(data.severityHistory)
      ? data.severityHistory.map(s => ({
          severity: s.severity,
          changedAt: s.changedAt,
          reason: s.reason
        }))
      : [],

    daysActive,
    isEscalated,

    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
};

// ─────────────── SystemAlert (T-942) ──────────────────

/**
 * Serializa una SystemAlert al shape V1 del API admin.
 *
 * @param {object} doc - Documento Mongoose o POJO `.lean()`
 * @param {object} [opts]
 * @param {string} [opts.dismissedByName]
 * @param {string} [opts.resolvedByName]
 * @param {string} [opts.snoozedByName]
 * @param {string} [opts.pinnedByName]
 * @returns {object|null}
 */
// eslint-disable-next-line sonarjs/cyclomatic-complexity -- mapeo DTO con múltiples campos opcionales; lineal y trazable, dividirlo no aporta claridad
const toSystemAlertDTOV1 = (doc, opts = {}) => {
  if (!doc) {
    return null;
  }
  const data = toPlainObject(doc);
  const detectedAt = data.detectedAt ? new Date(data.detectedAt) : null;
  const reference =
    data.status === 'resolved' && data.resolvedAt ? new Date(data.resolvedAt) : new Date();
  const hoursActive = detectedAt
    ? Math.max(0, Math.floor((reference - detectedAt) / (60 * 60 * 1000)))
    : 0;
  const daysActive = Math.floor(hoursActive / 24);
  const isEscalated = Array.isArray(data.severityHistory)
    ? data.severityHistory.some(s => s.reason === 'escalation')
    : false;

  return {
    id: toId(data),
    type: data.type,
    severity: data.severity,
    status: data.status,
    source: data.source,
    component: data.component || null,

    title: data.title,
    description: data.description,
    recommendation: data.recommendation || null,
    data: data.data && typeof data.data === 'object' ? { ...data.data } : {},
    runbookUrl: data.runbookUrl || null,

    detectedAt: data.detectedAt || null,
    lastSeenAt: data.lastSeenAt || null,
    occurrencesCount: data.occurrencesCount ?? 1,

    resolvedAt: data.resolvedAt || null,
    resolvedAutomatically: !!data.resolvedAutomatically,
    resolvedBy: toId(data.resolvedBy) || null,
    resolvedByName: opts.resolvedByName || null,

    dismissedAt: data.dismissedAt || null,
    dismissedBy: toId(data.dismissedBy) || null,
    dismissedByName: opts.dismissedByName || null,
    dismissReason: data.dismissReason || null,

    snoozedUntil: data.snoozedUntil || null,
    snoozedAt: data.snoozedAt || null,
    snoozedBy: toId(data.snoozedBy) || null,
    snoozedByName: opts.snoozedByName || null,

    pinned: !!data.pinned,
    pinnedAt: data.pinnedAt || null,
    pinnedBy: toId(data.pinnedBy) || null,
    pinnedByName: opts.pinnedByName || null,

    notificationId: toId(data.notificationId) || null,
    severityHistory: Array.isArray(data.severityHistory)
      ? data.severityHistory.map(s => ({
          severity: s.severity,
          changedAt: s.changedAt,
          reason: s.reason
        }))
      : [],

    hoursActive,
    daysActive,
    isEscalated,

    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
};

/**
 * Serializa un SystemAnnouncement con metadata completa (para super_admin).
 *
 * @param {object} doc
 * @param {object} [opts]
 * @param {string} [opts.authorName]
 * @returns {object|null}
 */
const toSystemAnnouncementDTOV1 = (doc, opts = {}) => {
  if (!doc) {
    return null;
  }
  const data = toPlainObject(doc);
  return {
    id: toId(data),
    title: data.title,
    body: data.body,
    severity: data.severity,
    audience: data.audience,
    linkUrl: data.linkUrl || null,
    linkLabel: data.linkLabel || null,
    publishedAt: data.publishedAt || null,
    expiresAt: data.expiresAt || null,
    active: !!data.active,
    archivedAt: data.archivedAt || null,
    archivedBy: toId(data.archivedBy) || null,
    createdBy: toId(data.createdBy) || null,
    authorName: opts.authorName || null,
    isExpired: !!(data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  };
};

/**
 * Versión pública (para teacher) del SystemAnnouncement: solo lo necesario
 * para renderizar el banner. Sin `createdBy`/audit metadata.
 *
 * @param {object} doc
 * @returns {object|null}
 */
const toPublicAnnouncementDTOV1 = doc => {
  if (!doc) {
    return null;
  }
  const data = toPlainObject(doc);
  return {
    id: toId(data),
    title: data.title,
    body: data.body,
    severity: data.severity,
    linkUrl: data.linkUrl || null,
    linkLabel: data.linkLabel || null,
    publishedAt: data.publishedAt || null,
    expiresAt: data.expiresAt || null
  };
};

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
  toUserStatsDTOV1,
  toPlayerStatsDTOV1,
  toSystemMetricsDTOV1,

  // Analytics seudonimizados (Art. 25 RGPD)
  toStudentAnalyticsDTOV1,
  toStudentIdentityDTOV1,

  // Notifications (T-955)
  toNotificationDTOV1,

  // SmartAlert (T-941)
  toSmartAlertDTOV1,

  // SystemAlert + SystemAnnouncement (T-942)
  toSystemAlertDTOV1,
  toSystemAnnouncementDTOV1,
  toPublicAnnouncementDTOV1
};
