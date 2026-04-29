/**
 * @fileoverview Tests unitarios para AssociationStrategy.
 * Verifica la mecánica de asociación: selección planificada, fallback random y estado.
 */

const AssociationStrategy = require('../src/strategies/mechanics/AssociationStrategy');

describe('AssociationStrategy', () => {
  let strategy;

  const buildMapping = (uid, value, displayData = {}) => ({
    uid,
    assignedValue: value,
    displayData: { value, ...displayData }
  });

  const buildSessionDoc = (overrides = {}) => ({
    cardMappings: [
      buildMapping('AA000001', 'Cat', { display: '🐱' }),
      buildMapping('AA000002', 'Dog', { display: '🐶' }),
      buildMapping('AA000003', 'Bird', { display: '🐦' })
    ],
    associationChallengePlan: [
      {
        roundNumber: 1,
        uid: 'AA000001',
        displayData: { value: 'Cat', custom: true },
        promptText: 'Find the cat'
      },
      { roundNumber: 2, uid: 'AA000002', displayData: {}, promptText: 'Find the dog' }
    ],
    ...overrides
  });

  beforeEach(() => {
    strategy = new AssociationStrategy();
  });

  describe('constructor / initialize', () => {
    it('has name "association"', () => {
      expect(strategy.getName()).toBe('association');
    });

    it('initialize returns state with lastUid null', () => {
      expect(strategy.initialize()).toEqual({ lastUid: null });
    });
  });

  describe('resolvePlannedChallenge', () => {
    it('returns the correct mapping for a valid round', () => {
      const sessionDoc = buildSessionDoc();
      const playDoc = { currentRound: 1 };

      const result = strategy.resolvePlannedChallenge({ sessionDoc, playDoc });

      expect(result).not.toBeNull();
      expect(result.uid).toBe('AA000001');
      expect(result.promptText).toBe('Find the cat');
    });

    it('uses displayData from plan when it has keys', () => {
      const sessionDoc = buildSessionDoc();
      const playDoc = { currentRound: 1 };

      const result = strategy.resolvePlannedChallenge({ sessionDoc, playDoc });

      expect(result.displayData.custom).toBe(true);
    });

    it('falls back to mapping displayData when plan displayData is empty', () => {
      const sessionDoc = buildSessionDoc();
      const playDoc = { currentRound: 2 };

      const result = strategy.resolvePlannedChallenge({ sessionDoc, playDoc });

      expect(result.uid).toBe('AA000002');
      expect(result.displayData.display).toBe('🐶');
    });

    it('returns null when roundNumber < 1', () => {
      const sessionDoc = buildSessionDoc();
      const playDoc = { currentRound: 0 };

      expect(strategy.resolvePlannedChallenge({ sessionDoc, playDoc })).toBeNull();
    });

    it('returns null when roundNumber is not a finite number', () => {
      const sessionDoc = buildSessionDoc();
      const playDoc = { currentRound: NaN };

      expect(strategy.resolvePlannedChallenge({ sessionDoc, playDoc })).toBeNull();
    });

    it('returns null when plan is empty', () => {
      const sessionDoc = buildSessionDoc({ associationChallengePlan: [] });
      const playDoc = { currentRound: 1 };

      expect(strategy.resolvePlannedChallenge({ sessionDoc, playDoc })).toBeNull();
    });

    it('returns null when plan is not an array', () => {
      const sessionDoc = buildSessionDoc({ associationChallengePlan: null });
      const playDoc = { currentRound: 1 };

      expect(strategy.resolvePlannedChallenge({ sessionDoc, playDoc })).toBeNull();
    });

    it('returns null when no mapping matches the planned uid', () => {
      const sessionDoc = buildSessionDoc({
        associationChallengePlan: [
          { roundNumber: 1, uid: 'NONEXISTENT', displayData: {}, promptText: 'x' }
        ]
      });
      const playDoc = { currentRound: 1 };

      expect(strategy.resolvePlannedChallenge({ sessionDoc, playDoc })).toBeNull();
    });

    it('returns null when no plan item matches the round number', () => {
      const sessionDoc = buildSessionDoc();
      const playDoc = { currentRound: 99 };

      expect(strategy.resolvePlannedChallenge({ sessionDoc, playDoc })).toBeNull();
    });
  });

  describe('selectChallenge', () => {
    it('uses planned challenge when available', () => {
      const sessionDoc = buildSessionDoc();
      const playState = {
        playDoc: { currentRound: 1 },
        strategyState: { lastUid: null }
      };

      const result = strategy.selectChallenge({ sessionDoc, playState });

      expect(result.uid).toBe('AA000001');
      expect(result.promptText).toBe('Find the cat');
      expect(playState.strategyState.lastUid).toBe('AA000001');
    });

    it('falls back to random selection when no planned challenge exists', () => {
      const sessionDoc = buildSessionDoc({ associationChallengePlan: [] });
      const playState = {
        playDoc: { currentRound: 1 },
        strategyState: { lastUid: null }
      };

      const result = strategy.selectChallenge({ sessionDoc, playState });

      expect(result).not.toBeNull();
      expect(['AA000001', 'AA000002', 'AA000003']).toContain(result.uid);
      expect(playState.strategyState.lastUid).toBe(result.uid);
    });

    it('avoids repeating lastUid in random selection when possible', () => {
      const sessionDoc = buildSessionDoc({ associationChallengePlan: [] });
      const results = new Set();

      for (let i = 0; i < 20; i++) {
        const playState = {
          playDoc: { currentRound: 1 },
          strategyState: { lastUid: 'AA000001' }
        };
        const result = strategy.selectChallenge({ sessionDoc, playState });
        results.add(result.uid);
      }

      expect(results.size).toBeGreaterThan(1);
    });

    it('returns null when cardMappings is empty', () => {
      const sessionDoc = buildSessionDoc({
        cardMappings: [],
        associationChallengePlan: []
      });
      const playState = {
        playDoc: { currentRound: 1 },
        strategyState: { lastUid: null }
      };

      expect(strategy.selectChallenge({ sessionDoc, playState })).toBeNull();
    });
  });
});
