/**
 * @fileoverview Funciones auxiliares y constantes compartidas del wizard de sesiones.
 * Extraidas de CreateSession.jsx para reutilizacion entre hooks y componentes.
 *
 * @module components/session/sessionHelpers
 */

// Configuracion del wizard
export const WIZARD_STEPS = [
  {
    id: 'deck',
    title: 'Seleccionar Mazo',
    subtitle: 'Elige las cartas',
    icon: 'CreditCard',
    description: 'El mazo define las tarjetas y assets que usaran los estudiantes'
  },
  {
    id: 'mechanic',
    title: 'Mecanica',
    subtitle: 'Tipo de juego',
    icon: 'Layers',
    description: 'Elige como interactuaran los estudiantes con las tarjetas'
  },
  {
    id: 'rules',
    title: 'Reglas',
    subtitle: 'Configura parametros',
    icon: 'Settings',
    description: 'Define tiempo, puntos y numero de rondas'
  },
  {
    id: 'review',
    title: 'Crear',
    subtitle: 'Revisa y lanza',
    icon: 'Save',
    description: 'Revisa la configuracion antes de crear la sesion'
  }
];

// Configuraciones por defecto segun dificultad
export const DIFFICULTY_PRESETS = {
  easy: {
    numberOfRounds: 3,
    timeLimit: 20,
    pointsPerCorrect: 10,
    penaltyPerError: 0
  },
  medium: {
    numberOfRounds: 5,
    timeLimit: 15,
    pointsPerCorrect: 10,
    penaltyPerError: -2
  },
  hard: {
    numberOfRounds: 7,
    timeLimit: 10,
    pointsPerCorrect: 15,
    penaltyPerError: -5
  }
};

// Configuraciones por defecto de memoria segun dificultad
export const MEMORY_DIFFICULTY_PRESETS = {
  easy: {
    timeLimit: 120,
    pointsPerCorrect: 10,
    penaltyPerError: 0
  },
  medium: {
    timeLimit: 90,
    pointsPerCorrect: 10,
    penaltyPerError: -2
  },
  hard: {
    timeLimit: 60,
    pointsPerCorrect: 15,
    penaltyPerError: -5
  }
};

// Estilos visuales para las variantes de dificultad
export const DIFFICULTY_VARIANT_STYLES = {
  easy: {
    selectedCard: 'border-success-base bg-success-base/10',
    selectedText: 'text-success-base',
    selectedIndicator: 'bg-success-base'
  },
  medium: {
    selectedCard: 'border-warning-base bg-warning-base/10',
    selectedText: 'text-warning-base',
    selectedIndicator: 'bg-warning-base'
  },
  hard: {
    selectedCard: 'border-error-base bg-error-base/10',
    selectedText: 'text-error-base',
    selectedIndicator: 'bg-error-base'
  }
};

const DEFAULT_ENABLED_MECHANICS = ['association', 'memory'];

const parseEnabledMechanics = () => {
  const raw = import.meta.env.VITE_ENABLED_SESSION_MECHANICS;
  if (!raw || typeof raw !== 'string') {
    return new Set(DEFAULT_ENABLED_MECHANICS);
  }

  const parsed = raw
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);

  return new Set(parsed.length > 0 ? parsed : DEFAULT_ENABLED_MECHANICS);
};

const ENABLED_SESSION_MECHANICS = parseEnabledMechanics();

export const normalizeMechanicName = mechanic => (mechanic?.name || '').toString().toLowerCase();

export const isMechanicSelectable = mechanic => {
  const normalizedName = normalizeMechanicName(mechanic);
  const availability = mechanic?.rules?.behavior?.availability;

  if (availability === 'coming_soon') {
    return false;
  }

  return ENABLED_SESSION_MECHANICS.has(normalizedName);
};

export const resolveMechanicId = mechanic => mechanic?.id || mechanic?._id;
export const resolveMechanicName = mechanic => normalizeMechanicName(mechanic);

export const findMechanicById = (mechanics, mechanicId) => {
  if (!mechanicId) {
    return null;
  }

  return mechanics.find(mechanic => resolveMechanicId(mechanic) === mechanicId) || null;
};

/**
 * Genera un placeholder contextual basado en el nombre del contexto del mazo
 */
export const getContextualPlaceholder = (contextName = '') => {
  const name = contextName.toLowerCase();
  if (name.includes('color')) return 'Ej: Busca la tarjeta del color rojo';
  if (name.includes('animal')) return 'Ej: Encuentra la tarjeta que representa un mamifero';
  if (name.includes('bandera') || name.includes('pais') || name.includes('europa')) return 'Ej: Busca la bandera de Francia';
  if (name.includes('numero') || name.includes('matemat')) return 'Ej: Busca el resultado de 3 + 4';
  if (name.includes('forma')) return 'Ej: Encuentra la forma con 3 lados';
  return 'Ej: Describe el reto que el estudiante debe resolver';
};

/**
 * Convierte las card mappings de un deck al formato simplificado
 */
export const toDeckCardMappings = deck =>
  Array.isArray(deck?.cardMappings)
    ? deck.cardMappings.map(mapping => ({
        uid: mapping.uid,
        assignedValue: mapping.assignedValue,
        displayData: mapping.displayData || {}
      }))
    : [];

/**
 * Construye el plan de asociacion por rondas, preservando datos previos
 */
export const buildAssociationPlanByRounds = ({ currentPlan, cards, numberOfRounds }) => {
  const safeCards = Array.isArray(cards) ? cards : [];
  const rounds = Number(numberOfRounds);

  if (safeCards.length === 0 || !Number.isFinite(rounds) || rounds < 1) {
    return [];
  }

  const cardByUid = new Map(safeCards.map(card => [card.uid, card]));
  const previousByRound = new Map(
    (Array.isArray(currentPlan) ? currentPlan : []).map(item => [Number(item.roundNumber), item])
  );

  return Array.from({ length: rounds }, (_, index) => {
    const roundNumber = index + 1;
    const previousItem = previousByRound.get(roundNumber);
    const preservedCard = previousItem?.uid ? cardByUid.get(previousItem.uid) : null;
    const card = preservedCard || safeCards[index % safeCards.length];

    return {
      roundNumber,
      uid: card.uid,
      assignedValue: card.assignedValue,
      displayData: card.displayData || {},
      promptText: previousItem?.promptText || ''
    };
  });
};

// Configuracion inicial del sessionConfig
export const INITIAL_SESSION_CONFIG = {
  name: '',
  deckId: null,
  mechanicId: null,
  difficulty: 'medium',
  config: {
    numberOfRounds: 5,
    timeLimit: 15,
    pointsPerCorrect: 10,
    penaltyPerError: -2
  },
  linkSensor: false
};
