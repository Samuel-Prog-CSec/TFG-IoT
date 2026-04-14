/**
 * @fileoverview Funciones helper de validación y normalización para sesiones de juego.
 * Extraídas de gameSessionController.js para mejorar la mantenibilidad.
 * @module controllers/helpers/sessionValidationHelpers
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
    clonedSession.requiresAssociationPlanConfiguration = false;
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
    return 'Sesión clonada exitosamente. Los retos de asociación se copiaron de la sesión original.';
  }

  return 'Sesión clonada exitosamente';
};

module.exports = {
  DEFAULT_MEMORY_MATCHING_GROUP_SIZE,
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
  buildCloneSuccessMessage
};
