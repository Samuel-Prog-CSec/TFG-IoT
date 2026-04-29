/**
 * @fileoverview Tests de coherencia entre las constantes de enum y los modelos
 * Mongoose que las consumen.
 *
 * Si alguien añade un valor en un schema sin actualizar la constante (o al
 * revés), este test falla. La coherencia con los validators Zod queda
 * garantizada estructuralmente: ambos importan el mismo array desde
 * `src/constants/enums.js`, así que un cambio se propaga a las dos capas
 * por construcción.
 */

const {
  DIFFICULTY,
  SESSION_STATUS,
  PLAY_STATUS,
  ROLES,
  USER_STATUS,
  ACCOUNT_STATUS,
  DECK_STATUS,
  EVENT_TYPE,
  CONSENT_PURPOSES,
  CONSENT_CHANNEL,
  CONSENT_ACTION
} = require('../../src/constants/enums');

const GameSession = require('../../src/models/GameSession');
const GamePlay = require('../../src/models/GamePlay');
const User = require('../../src/models/User');
const CardDeck = require('../../src/models/CardDeck');

describe('constants/enums — sanity de valores', () => {
  it('todas las constantes son arrays no vacíos de strings únicos', () => {
    const all = {
      DIFFICULTY,
      SESSION_STATUS,
      PLAY_STATUS,
      ROLES,
      USER_STATUS,
      ACCOUNT_STATUS,
      DECK_STATUS,
      EVENT_TYPE,
      CONSENT_PURPOSES,
      CONSENT_CHANNEL,
      CONSENT_ACTION
    };

    for (const values of Object.values(all)) {
      expect(Array.isArray(values)).toBe(true);
      expect(values.length).toBeGreaterThan(0);
      expect(values.every(v => typeof v === 'string')).toBe(true);
      expect(new Set(values).size).toBe(values.length);
      // Las constantes están congeladas para evitar mutaciones accidentales.
      expect(Object.isFrozen(values)).toBe(true);
    }
  });

  it('preserva los valores literales que el frontend serializa', () => {
    // Estos valores forman parte del contrato público con el frontend
    // (URL params, switches en UI, badges). Cambiarlos sería breaking.
    expect(DIFFICULTY).toEqual(['easy', 'medium', 'hard', 'custom']);
    expect(SESSION_STATUS).toEqual(['created', 'active', 'completed']);
    expect(PLAY_STATUS).toEqual(['in-progress', 'completed', 'abandoned', 'paused']);
    expect(ROLES).toEqual(['super_admin', 'teacher', 'student']);
    expect(USER_STATUS).toEqual(['active', 'inactive']);
    expect(DECK_STATUS).toEqual(['active', 'archived']);
  });
});

describe('constants/enums — coherencia Mongoose ↔ constantes', () => {
  it('GameSession.status usa SESSION_STATUS', () => {
    expect(GameSession.schema.path('status').enumValues).toEqual([...SESSION_STATUS]);
  });

  it('GameSession.difficulty usa DIFFICULTY', () => {
    expect(GameSession.schema.path('difficulty').enumValues).toEqual([...DIFFICULTY]);
  });

  it('GamePlay.status usa PLAY_STATUS', () => {
    expect(GamePlay.schema.path('status').enumValues).toEqual([...PLAY_STATUS]);
  });

  it('GamePlay.events.eventType usa EVENT_TYPE', () => {
    // El path es un array de subdocs; navegamos al schema interno.
    const eventTypePath = GamePlay.schema.path('events').schema.path('eventType');
    expect(eventTypePath.enumValues).toEqual([...EVENT_TYPE]);
  });

  it('User.role usa ROLES', () => {
    expect(User.schema.path('role').enumValues).toEqual([...ROLES]);
  });

  it('User.accountStatus usa ACCOUNT_STATUS', () => {
    expect(User.schema.path('accountStatus').enumValues).toEqual([...ACCOUNT_STATUS]);
  });

  it('User.status usa USER_STATUS', () => {
    expect(User.schema.path('status').enumValues).toEqual([...USER_STATUS]);
  });

  it('User.consent.channel usa CONSENT_CHANNEL', () => {
    expect(User.schema.path('consent.channel').enumValues).toEqual([...CONSENT_CHANNEL]);
  });

  it('CardDeck.status usa DECK_STATUS', () => {
    expect(CardDeck.schema.path('status').enumValues).toEqual([...DECK_STATUS]);
  });
});
