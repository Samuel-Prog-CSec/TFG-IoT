/**
 * @fileoverview Tests unitarios para SequenceStrategy.
 * Verifica la mecánica de secuencia: inicialización, selección por índice y wrap-around.
 */

const SequenceStrategy = require('../src/strategies/mechanics/SequenceStrategy');

describe('SequenceStrategy', () => {
  let strategy;

  const buildMappings = () => [
    { uid: 'AA000001', assignedValue: 'A' },
    { uid: 'AA000002', assignedValue: 'B' },
    { uid: 'AA000003', assignedValue: 'C' }
  ];

  beforeEach(() => {
    strategy = new SequenceStrategy();
  });

  it('has name "sequence"', () => {
    expect(strategy.getName()).toBe('sequence');
  });

  describe('initialize', () => {
    it('stores cardMappings as sequence state', () => {
      const mappings = buildMappings();
      const state = strategy.initialize({ sessionDoc: { cardMappings: mappings } });

      expect(state.sequence).toEqual(mappings);
    });

    it('returns empty sequence when cardMappings is not an array', () => {
      const state = strategy.initialize({ sessionDoc: { cardMappings: null } });

      expect(state.sequence).toEqual([]);
    });

    it('returns empty sequence when sessionDoc has no cardMappings', () => {
      const state = strategy.initialize({ sessionDoc: {} });

      expect(state.sequence).toEqual([]);
    });
  });

  describe('selectChallenge', () => {
    it('returns the mapping at index (currentRound - 1)', () => {
      const sequence = buildMappings();

      const result = strategy.selectChallenge({
        playDoc: { currentRound: 1 },
        playState: { strategyState: { sequence } }
      });

      expect(result.uid).toBe('AA000001');
    });

    it('returns the second mapping for round 2', () => {
      const sequence = buildMappings();

      const result = strategy.selectChallenge({
        playDoc: { currentRound: 2 },
        playState: { strategyState: { sequence } }
      });

      expect(result.uid).toBe('AA000002');
    });

    it('wraps around to the beginning after exhausting the sequence', () => {
      const sequence = buildMappings();

      const result = strategy.selectChallenge({
        playDoc: { currentRound: 4 },
        playState: { strategyState: { sequence } }
      });

      expect(result.uid).toBe('AA000001');
    });

    it('returns null when sequence is empty', () => {
      const result = strategy.selectChallenge({
        playDoc: { currentRound: 1 },
        playState: { strategyState: { sequence: [] } }
      });

      expect(result).toBeNull();
    });

    it('returns null when strategyState has no sequence', () => {
      const result = strategy.selectChallenge({
        playDoc: { currentRound: 1 },
        playState: { strategyState: {} }
      });

      expect(result).toBeNull();
    });
  });
});
