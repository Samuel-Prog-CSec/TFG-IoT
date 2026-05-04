/**
 * @fileoverview Tests unitarios del SequenceStrategy.
 *
 * Cubre:
 * - inicialización del estado a partir del sequencePlan.
 * - selectChallenge devuelve la secuencia de la ronda en curso.
 * - processScan: correct, incorrect (medium/hard), incorrect_with_hint
 *   (easy con pista parcial → completa), blocked (cursor avanza, no reinicia),
 *   ignored fuera de fase reproducing.
 * - forceTimeoutCurrentRound marca cartas restantes como timedOut.
 * - recordRoundCompletion persiste resumen y maneja transiciones.
 */

const SequenceStrategy = require('../src/strategies/mechanics/SequenceStrategy');

const buildSequence = (uids = ['AA000001', 'AA000002', 'AA000003']) =>
  uids.map(uid => ({
    uid,
    assignedValue: `Value-${uid}`,
    displayData: { display: uid }
  }));

const buildSession = ({
  difficulty = 'medium',
  numberOfRounds = 2,
  pointsPerCorrect = 10,
  penaltyPerError = -2,
  displaySeconds = 3,
  sequence = buildSequence()
} = {}) => ({
  difficulty,
  config: {
    numberOfRounds,
    pointsPerCorrect,
    penaltyPerError,
    timeLimit: 30
  },
  sequenceConfig: {
    minSequenceLength: 3,
    maxSequenceLength: 5,
    displaySeconds
  },
  sequencePlan: Array.from({ length: numberOfRounds }, (_, i) => ({
    roundNumber: i + 1,
    length: sequence.length,
    sequence
  }))
});

describe('SequenceStrategy', () => {
  let strategy;

  beforeEach(() => {
    strategy = new SequenceStrategy();
  });

  it('expone el nombre "sequence"', () => {
    expect(strategy.getName()).toBe('sequence');
  });

  it('isTurnBasedRound devuelve true', () => {
    expect(strategy.isTurnBasedRound()).toBe(true);
  });

  it('getRoundDurationMs devuelve timeLimit en ms', () => {
    expect(strategy.getRoundDurationMs({ config: { timeLimit: 12 } })).toBe(12_000);
  });

  describe('initialize', () => {
    it('clona el plan ordenado por roundNumber y resetea estado', () => {
      const sessionDoc = buildSession({ numberOfRounds: 3 });
      const state = strategy.initialize({ sessionDoc });

      expect(state.plan).toHaveLength(3);
      expect(state.plan[0].roundNumber).toBe(1);
      expect(state.phase).toBe('memorizing');
      expect(state.cursor).toBe(0);
      expect(state.attempts).toEqual({});
      expect(state.blocked).toEqual([]);
      expect(state.hintsConsumed).toBe(0);
      expect(state.displaySeconds).toBe(3);
      expect(state.difficulty).toBe('medium');
    });

    it('cae a difficulty=medium si la dificultad no está soportada', () => {
      const state = strategy.initialize({
        sessionDoc: { ...buildSession(), difficulty: 'expert' }
      });
      expect(state.difficulty).toBe('medium');
    });
  });

  describe('selectChallenge', () => {
    it('devuelve la secuencia de la ronda actual con phase memorizing', () => {
      const sessionDoc = buildSession();
      const state = strategy.initialize({ sessionDoc });
      const playState = { strategyState: state };

      const challenge = strategy.selectChallenge({
        playDoc: { currentRound: 1 },
        sessionDoc,
        playState
      });

      expect(challenge.displayData.mode).toBe('sequence_round');
      expect(challenge.displayData.roundNumber).toBe(1);
      expect(challenge.displayData.length).toBe(3);
      expect(challenge.displayData.sequence).toHaveLength(3);
      expect(challenge.displayData.phase).toBe('memorizing');
      expect(state.expectedSequence).toHaveLength(3);
    });

    it('devuelve null si no hay plan para la ronda solicitada', () => {
      const sessionDoc = buildSession({ numberOfRounds: 1 });
      const state = strategy.initialize({ sessionDoc });
      const result = strategy.selectChallenge({
        playDoc: { currentRound: 5 },
        sessionDoc,
        playState: { strategyState: state }
      });
      expect(result).toBeNull();
    });
  });

  describe('processScan', () => {
    const setup = ({ difficulty = 'medium' } = {}) => {
      const sessionDoc = buildSession({ difficulty });
      const state = strategy.initialize({ sessionDoc });
      strategy.selectChallenge({
        playDoc: { currentRound: 1 },
        sessionDoc,
        playState: { strategyState: state }
      });
      strategy.enterReproducingPhase(state);
      return { sessionDoc, state };
    };

    it('ignora scans cuando la fase no es reproducing', () => {
      const sessionDoc = buildSession();
      const state = strategy.initialize({ sessionDoc });
      strategy.selectChallenge({
        playDoc: { currentRound: 1 },
        sessionDoc,
        playState: { strategyState: state }
      });
      const result = strategy.processScan({
        scannedCard: { uid: 'AA000001', assignedValue: 'X' },
        sessionDoc,
        strategyState: state
      });
      expect(result.type).toBe('ignored');
      expect(result.reason).toBe('not_reproducing');
    });

    it('marca scan correcto y avanza el cursor', () => {
      const { sessionDoc, state } = setup();
      const result = strategy.processScan({
        scannedCard: { uid: 'AA000001', assignedValue: 'X' },
        sessionDoc,
        strategyState: state
      });
      expect(result.type).toBe('correct');
      expect(result.cursor).toBe(1);
      expect(result.points).toBe(10);
      expect(result.roundCompleted).toBe(false);
    });

    it('marca roundCompleted al acertar la última carta', () => {
      const { sessionDoc, state } = setup();
      strategy.processScan({ scannedCard: { uid: 'AA000001' }, sessionDoc, strategyState: state });
      strategy.processScan({ scannedCard: { uid: 'AA000002' }, sessionDoc, strategyState: state });
      const result = strategy.processScan({
        scannedCard: { uid: 'AA000003' },
        sessionDoc,
        strategyState: state
      });
      expect(result.type).toBe('correct');
      expect(result.roundCompleted).toBe(true);
    });

    it('en medium devuelve incorrect sin pista en el primer fallo', () => {
      const { sessionDoc, state } = setup({ difficulty: 'medium' });
      const result = strategy.processScan({
        scannedCard: { uid: 'AA999999', assignedValue: 'Other' },
        sessionDoc,
        strategyState: state
      });
      expect(result.type).toBe('incorrect');
      expect(result.attemptsForCurrent).toBe(1);
      expect(state.cursor).toBe(0); // no avanza
      expect(state.hintsConsumed).toBe(0);
    });

    it('en easy entrega pista parcial tras el primer fallo', () => {
      const { sessionDoc, state } = setup({ difficulty: 'easy' });
      const result = strategy.processScan({
        scannedCard: { uid: 'AA999999', assignedValue: 'Other' },
        sessionDoc,
        strategyState: state
      });
      expect(result.type).toBe('incorrect_with_hint');
      expect(result.hint.type).toBe('partial');
      expect(state.hintsConsumed).toBe(1);
      expect(state.cursor).toBe(0);
    });

    it('en easy entrega pista completa tras el segundo fallo', () => {
      const { sessionDoc, state } = setup({ difficulty: 'easy' });
      strategy.processScan({
        scannedCard: { uid: 'AA999999' },
        sessionDoc,
        strategyState: state
      });
      const result = strategy.processScan({
        scannedCard: { uid: 'AA999998' },
        sessionDoc,
        strategyState: state
      });
      expect(result.type).toBe('incorrect_with_hint');
      expect(result.hint.type).toBe('full');
      expect(result.hint.text).toBe('Value-AA000001');
      expect(state.hintsConsumed).toBe(2);
    });

    it('en easy bloquea la carta tras el tercer fallo y avanza el cursor', () => {
      const { sessionDoc, state } = setup({ difficulty: 'easy' });
      strategy.processScan({ scannedCard: { uid: 'A' }, sessionDoc, strategyState: state });
      strategy.processScan({ scannedCard: { uid: 'B' }, sessionDoc, strategyState: state });
      const result = strategy.processScan({
        scannedCard: { uid: 'C' },
        sessionDoc,
        strategyState: state
      });
      expect(result.type).toBe('blocked');
      expect(state.cursor).toBe(1); // avanza
      expect(state.blocked).toContain('AA000001');
    });

    it('en hard bloquea inmediatamente al primer fallo', () => {
      const { sessionDoc, state } = setup({ difficulty: 'hard' });
      const result = strategy.processScan({
        scannedCard: { uid: 'AA999999' },
        sessionDoc,
        strategyState: state
      });
      expect(result.type).toBe('blocked');
      expect(state.cursor).toBe(1);
      expect(state.blocked).toContain('AA000001');
    });

    it('NO reinicia la secuencia tras un blocked: continúa con la siguiente posición', () => {
      const { sessionDoc, state } = setup({ difficulty: 'hard' });
      // Falla la primera carta → blocked, cursor avanza a 1
      strategy.processScan({ scannedCard: { uid: 'X1' }, sessionDoc, strategyState: state });
      // Acierta la segunda carta → cursor avanza a 2
      const result = strategy.processScan({
        scannedCard: { uid: 'AA000002' },
        sessionDoc,
        strategyState: state
      });
      expect(result.type).toBe('correct');
      expect(state.cursor).toBe(2);
      expect(state.blocked).toContain('AA000001');
    });
  });

  describe('forceTimeoutCurrentRound', () => {
    it('marca todas las cartas restantes como timedOut', () => {
      const sessionDoc = buildSession();
      const state = strategy.initialize({ sessionDoc });
      strategy.selectChallenge({
        playDoc: { currentRound: 1 },
        sessionDoc,
        playState: { strategyState: state }
      });
      strategy.enterReproducingPhase(state);
      strategy.processScan({
        scannedCard: { uid: 'AA000001' },
        sessionDoc,
        strategyState: state
      });

      const result = strategy.forceTimeoutCurrentRound(state);

      expect(result.timedOutUids).toEqual(['AA000002', 'AA000003']);
      expect(state.cursor).toBe(3);
      expect(state.phase).toBe('completed');
      const statuses = result.results.map(r => r.status);
      expect(statuses).toEqual(['correct', 'timedOut', 'timedOut']);
    });
  });

  describe('recordRoundCompletion', () => {
    it('persiste el resumen y avanza el state', () => {
      const sessionDoc = buildSession();
      const state = strategy.initialize({ sessionDoc });
      strategy.selectChallenge({
        playDoc: { currentRound: 1 },
        sessionDoc,
        playState: { strategyState: state }
      });
      strategy.enterReproducingPhase(state);

      // Acertar todas
      ['AA000001', 'AA000002', 'AA000003'].forEach(uid => {
        strategy.processScan({ scannedCard: { uid }, sessionDoc, strategyState: state });
      });

      const summary = strategy.recordRoundCompletion(state);

      expect(summary.roundNumber).toBe(1);
      expect(summary.completed).toBe(true);
      expect(state.phase).toBe('completed');
      expect(state.roundResults).toHaveLength(1);
    });

    it('marca completed=false si hay alguna carta no correcta', () => {
      const sessionDoc = buildSession({ difficulty: 'hard' });
      const state = strategy.initialize({ sessionDoc });
      strategy.selectChallenge({
        playDoc: { currentRound: 1 },
        sessionDoc,
        playState: { strategyState: state }
      });
      strategy.enterReproducingPhase(state);
      // Bloquear la primera + acertar el resto
      strategy.processScan({ scannedCard: { uid: 'X' }, sessionDoc, strategyState: state });
      strategy.processScan({
        scannedCard: { uid: 'AA000002' },
        sessionDoc,
        strategyState: state
      });
      strategy.processScan({
        scannedCard: { uid: 'AA000003' },
        sessionDoc,
        strategyState: state
      });

      const summary = strategy.recordRoundCompletion(state);
      expect(summary.completed).toBe(false);
      expect(summary.results.find(r => r.uid === 'AA000001').status).toBe('blocked');
    });
  });
});
