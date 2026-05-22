/**
 * @fileoverview Helpers para generar fixtures de test.
 *
 * Dos familias:
 *   - **CardMappings/Board/AssociationPlan**: helpers sin dependencia del modelo Card
 *     (las tarjetas RFID son tokens fungibles identificados únicamente por UID, ADR-012).
 *   - **Actores y recursos** (T-907 cierre, B9 reactivación): factories que crean
 *     teachers, contextos, mazos y sesiones listos para usar. Centralizar el setup en
 *     factories elimina la fragilidad reportada en T-905 B9 al construir recursos a
 *     mano: cada test usa el helper, y un cambio de schema solo requiere tocar este
 *     archivo. Pensados para tests de ownership/IDOR, donde el foco es la autorización,
 *     no la creación correcta de fixtures.
 *
 * @module tests/helpers/testFixtures
 */

const User = require('../../src/models/User');
const CardDeck = require('../../src/models/CardDeck');
const GameContext = require('../../src/models/GameContext');
const GameMechanic = require('../../src/models/GameMechanic');
const GameSession = require('../../src/models/GameSession');
const { generateTokenPair } = require('../../src/middlewares/auth');

/**
 * Genera un array de cardMappings para tests.
 * Cada mapping tiene uid, assignedValue y displayData — sin cardId.
 *
 * @param {number} count - Número de mappings a generar (default 2)
 * @param {Object} [options] - Opciones de personalización
 * @param {string} [options.uidPrefix='AA00'] - Prefijo hex para UIDs generados
 * @param {string[]} [options.values] - Valores asignados custom (por índice)
 * @param {Object[]} [options.displayData] - Display data custom (por índice)
 * @returns {Object[]} Array de cardMappings listos para usar en CardDeck/GameSession
 *
 * @example
 * // Generar 3 mappings con valores custom
 * createTestCardMappings(3, { values: ['España', 'Francia', 'Italia'] });
 *
 * @example
 * // Generar 2 mappings con prefijo distinto
 * createTestCardMappings(2, { uidPrefix: 'BB00' });
 */
function createTestCardMappings(count = 2, options = {}) {
  const prefix = options.uidPrefix || 'AA00';

  return Array.from({ length: count }, (_, i) => ({
    uid: `${prefix}${(i + 1).toString(16).toUpperCase().padStart(4, '0')}`,
    assignedValue: options.values?.[i] || `Value${i + 1}`,
    displayData: options.displayData?.[i] || {
      value: options.values?.[i] || `Value${i + 1}`,
      key: `key${i + 1}`,
      display: ''
    }
  }));
}

/**
 * Genera un boardLayout a partir de cardMappings.
 * Cada slot recibe slotIndex secuencial y uid/assignedValue/displayData del mapping.
 *
 * @param {Object[]} cardMappings - Mappings generados con createTestCardMappings
 * @returns {Object[]} Array de boardLayout items
 */
function createTestBoardLayout(cardMappings) {
  return (cardMappings || []).map((m, i) => ({
    slotIndex: i,
    uid: m.uid,
    assignedValue: m.assignedValue,
    displayData: m.displayData || {}
  }));
}

/**
 * Genera un associationChallengePlan a partir de cardMappings.
 * Cicla round-robin sobre los mappings para cubrir numberOfRounds.
 *
 * @param {Object[]} cardMappings - Mappings generados con createTestCardMappings
 * @param {number} numberOfRounds - Número de rondas del plan
 * @returns {Object[]} Array de challenge items
 */
function createTestAssociationPlan(cardMappings, numberOfRounds) {
  const mappings = cardMappings || [];
  if (mappings.length === 0 || numberOfRounds < 1) {
    return [];
  }

  return Array.from({ length: numberOfRounds }, (_, i) => {
    const m = mappings[i % mappings.length];
    return {
      roundNumber: i + 1,
      uid: m.uid,
      assignedValue: m.assignedValue,
      displayData: m.displayData || {}
    };
  });
}

// ============================================================================
// Actor factories — para tests de ownership / IDOR cross-teacher (B9, T-907)
// ============================================================================

/**
 * `mockReq` con headers de fingerprint estables. Necesario porque
 * `generateTokenPair` calcula un fingerprint hash a partir de los headers, y
 * `verifyAccessToken` rechaza el token si el hash del request no coincide.
 * Reutilizable: todos los tests pueden usar este mismo objeto.
 */
const fingerprintHeaders = {
  'user-agent': 'jest-test',
  'accept-language': 'en',
  'accept-encoding': 'gzip'
};

const mockReq = { headers: fingerprintHeaders };

/**
 * Crea un teacher en BD con account approved y status active. El correo se
 * randomiza para evitar colisiones entre tests del mismo file.
 *
 * @param {Object} [overrides] - Campos a sobreescribir.
 * @returns {Promise<Object>} Documento User.
 */
async function createTeacher(overrides = {}) {
  const id = overrides.suffix || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return User.create({
    name: overrides.name || `Teacher ${id}`,
    email: overrides.email || `teacher-${id}@test.com`,
    password: overrides.password || 'Password123!',
    role: 'teacher',
    status: 'active',
    accountStatus: 'approved',
    ...overrides,
    // Mantener role/status/accountStatus forzados aunque overrides traiga otra cosa
    // a menos que el caller explícitamente fuerce esos campos en overrides.
    ...(overrides.role ? { role: overrides.role } : {}),
    ...(overrides.status ? { status: overrides.status } : {}),
    ...(overrides.accountStatus ? { accountStatus: overrides.accountStatus } : {})
  });
}

/**
 * Genera un access token Bearer para el usuario. Usa `fingerprintHeaders` por
 * defecto para que `verifyAccessToken` valide igual cuando supertest envía esos
 * mismos headers.
 *
 * @param {Object} user - Documento User de Mongoose.
 * @returns {Promise<string>} Access token JWT.
 */
async function createTokenFor(user) {
  const pair = await generateTokenPair(user, mockReq);
  return pair.accessToken;
}

/**
 * Crea (o devuelve) un GameMechanic. La validación `isMechanicEnabled` del
 * controller acepta cualquier mecánica activa, pero usar 'association' es lo
 * más seguro porque tiene cobertura completa en el código de gameplay.
 *
 * @param {Object} [overrides]
 * @returns {Promise<Object>} Documento GameMechanic.
 */
async function createMechanic(overrides = {}) {
  return GameMechanic.create({
    name: overrides.name || 'association',
    displayName: overrides.displayName || 'Association',
    isActive: overrides.isActive ?? true,
    rules: overrides.rules || {}
  });
}

/**
 * Crea un GameContext con un puñado de assets básicos. Suficiente para
 * validar la creación de mazos en tests de IDOR (los assets no se consumen,
 * solo se referencia el contextId).
 *
 * @param {Object} [overrides]
 * @returns {Promise<Object>} Documento GameContext.
 */
async function createContext(overrides = {}) {
  const id = overrides.suffix || `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return GameContext.create({
    contextId: overrides.contextId || `ctx-${id}`,
    name: overrides.name || `Contexto ${id}`,
    assets: overrides.assets || [
      { key: 'a', value: 'Alfa', display: 'A' },
      { key: 'b', value: 'Beta', display: 'B' },
      { key: 'c', value: 'Gamma', display: 'C' }
    ]
  });
}

/**
 * Crea un CardDeck owned por `teacher` y vinculado a `context`. Por defecto
 * incluye 2 cardMappings via `createTestCardMappings`.
 *
 * @param {Object} teacher - User documento (debe ser role teacher).
 * @param {Object} context - GameContext documento.
 * @param {Object} [overrides] - Sobre `name`, `cardMappings`, `status`, etc.
 * @returns {Promise<Object>} Documento CardDeck.
 */
async function createDeckFor(teacher, context, overrides = {}) {
  return CardDeck.create({
    name: overrides.name || `Deck ${Date.now()}`,
    contextId: context._id,
    cardMappings:
      overrides.cardMappings ||
      createTestCardMappings(2, { uidPrefix: overrides.uidPrefix || 'AA00' }),
    createdBy: teacher._id,
    status: overrides.status || 'active',
    ...overrides
  });
}

/**
 * Crea una GameSession owned por `teacher`. Acepta deck/mechanic/context para
 * vincular IDs requeridos por el schema. Sin la opción `status`, deja la
 * sesión en 'pending' (igual a la API de creación). Para tests de IDOR sobre
 * PUT/DELETE — que rechazan sesiones ya iniciadas — usar `status: 'pending'`
 * (default).
 *
 * @param {Object} teacher
 * @param {Object} deck
 * @param {Object} mechanic
 * @param {Object} context
 * @param {Object} [overrides]
 * @returns {Promise<Object>} Documento GameSession.
 */
async function createSessionFor(teacher, deck, mechanic, context, overrides = {}) {
  const cardMappings = overrides.cardMappings || deck.cardMappings;
  return GameSession.create({
    mechanicId: mechanic._id,
    deckId: deck._id,
    contextId: context._id,
    config: overrides.config || {
      numberOfCards: cardMappings.length,
      numberOfRounds: 5,
      timeLimit: 15,
      pointsPerCorrect: 10,
      penaltyPerError: -2
    },
    cardMappings,
    status: overrides.status || 'created',
    createdBy: teacher._id,
    ...overrides
  });
}

/**
 * Limpia todas las colecciones tocadas por las actor factories. Útil en
 * `beforeEach` de tests que crean recursos.
 *
 * @returns {Promise<void>}
 */
async function clearActorCollections() {
  await Promise.all([
    User.deleteMany({}),
    CardDeck.deleteMany({}),
    GameContext.deleteMany({}),
    GameMechanic.deleteMany({}),
    GameSession.deleteMany({})
  ]);
}

module.exports = {
  // CardMappings helpers (originales)
  createTestCardMappings,
  createTestBoardLayout,
  createTestAssociationPlan,
  // Actor factories (T-907 B9)
  fingerprintHeaders,
  mockReq,
  createTeacher,
  createTokenFor,
  createMechanic,
  createContext,
  createDeckFor,
  createSessionFor,
  clearActorCollections
};
