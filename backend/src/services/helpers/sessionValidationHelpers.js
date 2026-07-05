/**
 * @fileoverview Funciones helper de validación y normalización para sesiones de juego.
 * (I4) Movidas de controllers/helpers/ a services/helpers/: son lógica de DOMINIO
 * que consumen tanto el controller como los services (gameSessionService, GameEngine);
 * tenerlas bajo controllers/ obligaba a los services a importar hacia arriba
 * (inversión de capas). Solo dependen de utils.
 * @module services/helpers/sessionValidationHelpers
 */

const { ValidationError } = require('../../utils/errors');
const logger = require('../../utils/logger');

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
  const mappingByUid = new Map((cardMappings || []).map(mapping => [mapping.uid, mapping]));

  for (const slot of normalizedLayout) {
    const mapping = mappingByUid.get(slot.uid);
    if (!mapping) {
      throw new ValidationError(
        'boardLayout contiene una tarjeta que no pertenece al mazo de la sesión'
      );
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

  normalizedPlan.forEach((item, index) => {
    const expectedRound = index + 1;
    if (item.roundNumber !== expectedRound) {
      throw new ValidationError(
        `associationChallengePlan debe estar ordenado por rondas consecutivas (esperada ${expectedRound})`
      );
    }

    const resolved = mappingByUid.get(item.uid);

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
  const mappingByAssignedValue = new Map(mappings.map(mapping => [mapping.assignedValue, mapping]));

  const repairedPlan = [];
  const unresolvedRounds = [];

  for (let round = 1; round <= numberOfRounds; round += 1) {
    const existing = existingPlan.find(item => item.roundNumber === round);

    let resolved = null;
    if (existing) {
      resolved =
        mappingByUid.get(existing.uid) ||
        mappingByAssignedValue.get(existing.assignedValue) ||
        null;
    }

    if (!resolved) {
      unresolvedRounds.push(round);
      continue;
    }

    repairedPlan.push({
      roundNumber: round,
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
    clonedSession.sequencePlan = [];
    clonedSession.requiresAssociationPlanConfiguration = false;
    return;
  }

  if (mechanicName === 'association') {
    clonedSession.boardLayout = [];
    clonedSession.sequencePlan = [];
    clonedSession.associationChallengePlan = buildAssociationCloneDraftPlan({
      sourceSession,
      cardMappings,
      numberOfRounds: Number(clonedSession.config?.numberOfRounds || 0)
    });
    clonedSession.requiresAssociationPlanConfiguration = false;
    return;
  }

  if (mechanicName === 'sequence') {
    clonedSession.boardLayout = [];
    clonedSession.associationChallengePlan = [];
    clonedSession.requiresAssociationPlanConfiguration = false;
    clonedSession.sequencePlan = buildSequenceClonePlan({
      sourceSession,
      cardMappings,
      numberOfRounds: Number(clonedSession.config?.numberOfRounds || 0),
      sequenceConfig: clonedSession.sequenceConfig,
      userId
    });
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

/**
 * Construye el `sequencePlan` para una sesión clonada de Secuencia. Si el
 * plan original sigue siendo compatible con el mazo y la config actuales,
 * lo preservamos para mantener la fidelidad pedagógica de la sesión; en
 * caso contrario lo regeneramos a partir de cardMappings (BUG QA
 * 03/05/2026: el clon nunca copiaba el plan y entrar a jugar mostraba
 * "La sesión de Secuencia no tiene un plan válido").
 */
const buildSequenceClonePlan = ({
  sourceSession,
  cardMappings,
  numberOfRounds,
  sequenceConfig,
  userId
}) => {
  // Lazy require para evitar ciclo: services/* depende de helpers/*.
  const {
    generateSequencePlan,
    isPlanCompatible
  } = require('../../services/sequencePlanGenerator');

  const cfg = sequenceConfig || {};
  const minLength = Number(cfg.minSequenceLength) || 3;
  const maxLength = Number(cfg.maxSequenceLength) || minLength;
  const sourcePlan = Array.isArray(sourceSession.sequencePlan)
    ? sourceSession.sequencePlan.map(round => ({
        roundNumber: round.roundNumber,
        length: round.length,
        sequence: (round.sequence || []).map(item => ({
          uid: item.uid,
          assignedValue: item.assignedValue,
          displayData: item.displayData ? { ...item.displayData } : {}
        }))
      }))
    : [];

  if (
    sourcePlan.length > 0 &&
    isPlanCompatible(sourcePlan, cardMappings, {
      numberOfRounds,
      minLength,
      maxLength
    })
  ) {
    return sourcePlan;
  }

  if (sourcePlan.length > 0) {
    logger.warn('sequencePlan original no compatible tras resincronizar mazo; se regenera plan', {
      sessionId: sourceSession._id,
      clonedBy: userId
    });
  }

  return generateSequencePlan(cardMappings, {
    numberOfRounds,
    minLength,
    maxLength
  });
};

const buildCloneSuccessMessage = mechanicName => {
  if (mechanicName === 'memory') {
    return 'Sesión clonada exitosamente. Debes configurar de nuevo el tablero para memoria.';
  }

  if (mechanicName === 'association') {
    return 'Sesión clonada exitosamente. Los retos de asociación se copiaron de la sesión original.';
  }

  if (mechanicName === 'sequence') {
    return 'Sesión clonada exitosamente. El plan de secuencias se copió de la sesión original.';
  }

  return 'Sesión clonada exitosamente';
};

// =====================================================================
// Helpers de la mecánica Secuencia
// =====================================================================

const DEFAULT_SEQUENCE_CONFIG = Object.freeze({
  minSequenceLength: 3,
  maxSequenceLength: 5,
  displaySeconds: 3,
  autoPlayHints: false
});

/**
 * Aplica la configuración Secuencia a la sesión, asegurando defaults sensatos
 * y validando `min <= max`.
 */
const applySequenceConfigForCreate = ({ session, sequenceConfig }) => {
  const provided = sequenceConfig || {};
  const min = Number.isFinite(Number(provided.minSequenceLength))
    ? Number(provided.minSequenceLength)
    : DEFAULT_SEQUENCE_CONFIG.minSequenceLength;
  const max = Number.isFinite(Number(provided.maxSequenceLength))
    ? Number(provided.maxSequenceLength)
    : DEFAULT_SEQUENCE_CONFIG.maxSequenceLength;
  const displaySeconds = Number.isFinite(Number(provided.displaySeconds))
    ? Number(provided.displaySeconds)
    : DEFAULT_SEQUENCE_CONFIG.displaySeconds;

  if (min > max) {
    throw new ValidationError(
      'La longitud mínima de secuencia debe ser menor o igual a la longitud máxima'
    );
  }

  session.sequenceConfig = {
    minSequenceLength: min,
    maxSequenceLength: max,
    displaySeconds,
    // Audio en pistas (opt-in del profesor): al fallar, si la carta esperada
    // tiene audio se reproduce (Fácil con cada pista; Media 1 vez; Difícil
    // nunca). Si el update no incluye el flag, se conserva el valor previo
    // (mismo criterio que autoPlayPrompt en Asociación).
    autoPlayHints:
      provided.autoPlayHints === undefined
        ? Boolean(session.sequenceConfig?.autoPlayHints)
        : Boolean(provided.autoPlayHints)
  };
};

/**
 * Genera o valida el plan de secuencias para una sesión Secuencia.
 *
 * - Si el cliente no envía `sequencePlan`, se genera automáticamente con
 *   `sequencePlanGenerator` usando el `sequenceConfig` ya aplicado.
 * - Si el cliente envía un plan, se valida contra el mazo y los rangos.
 */
const applySequencePlanForCreate = ({ session, sequencePlan, cardMappings, numberOfRounds }) => {
  const {
    generateSequencePlan,
    isPlanCompatible
  } = require('../../services/sequencePlanGenerator');

  const cfg = session.sequenceConfig || DEFAULT_SEQUENCE_CONFIG;
  const opts = {
    numberOfRounds,
    minLength: cfg.minSequenceLength,
    maxLength: cfg.maxSequenceLength
  };

  if (!Array.isArray(sequencePlan) || sequencePlan.length === 0) {
    session.sequencePlan = generateSequencePlan(cardMappings, opts);
    return;
  }

  if (!isPlanCompatible(sequencePlan, cardMappings, opts)) {
    throw new ValidationError(
      'sequencePlan no es válido para el mazo o configuración seleccionados'
    );
  }

  session.sequencePlan = sequencePlan.map(round => ({
    roundNumber: Number(round.roundNumber),
    length: Number(round.length),
    sequence: round.sequence.map(item => ({
      uid: item.uid,
      assignedValue: item.assignedValue,
      displayData: item.displayData ? { ...item.displayData } : {}
    }))
  }));
};

/**
 * Regenera el plan de secuencias si la configuración cambia (al editar).
 * Mantiene el plan vigente si sigue siendo compatible.
 */
const applySequencePlanOnUpdate = ({ session, mechanicName, sequencePlan, sequenceConfig }) => {
  if (mechanicName !== 'sequence') {
    session.sequencePlan = [];
    session.sequenceConfig = undefined;
    return;
  }

  if (sequenceConfig !== undefined) {
    applySequenceConfigForCreate({ session, sequenceConfig });
  }

  const numberOfRounds = Number(session.config?.numberOfRounds || 0);
  applySequencePlanForCreate({
    session,
    sequencePlan,
    cardMappings: session.cardMappings,
    numberOfRounds
  });
};

module.exports = {
  DEFAULT_MEMORY_MATCHING_GROUP_SIZE,
  DEFAULT_SEQUENCE_CONFIG,
  normalizeObjectId,
  normalizeMechanicName,
  getEnabledSessionMechanics,
  isMechanicEnabledForSessionCreation,
  validateConfigAgainstMechanicRules,
  ensureMemoryBoardLayoutIsComplete,
  normalizeBoardLayout,
  buildBoardLayoutFromMappings,
  validateBoardLayoutAgainstMappings,
  normalizeAssociationChallengePlan,
  buildAssociationFallbackPlan,
  validateAssociationChallengePlanAgainstMappings,
  repairAssociationChallengePlanAgainstMappings,
  applyAssociationPlanOnUpdate,
  ensureAssociationPlanReadyForStart,
  buildAssociationCloneDraftPlan,
  applyCloneMechanicState,
  buildCloneSuccessMessage,
  applySequenceConfigForCreate,
  applySequencePlanForCreate,
  applySequencePlanOnUpdate
};
