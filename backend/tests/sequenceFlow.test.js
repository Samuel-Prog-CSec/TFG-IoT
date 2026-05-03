/**
 * @fileoverview Tests del flujo Secuencia (sequenceFlow.js).
 *
 * Verifica el contrato de eventos socket sin levantar GameEngine completo:
 * - sequence_phase_memorizing emitido al iniciar la ronda.
 * - Tras `displaySeconds`, sequence_phase_reproducing.
 * - sequence_card_result tras cada scan.
 * - sequence_round_result al completar (correct/blocked/timedOut).
 * - buildSequenceFinalSummary agrega métricas correctamente.
 */

const sequenceFlow = require('../src/services/gameEngine/sequenceFlow');
const SequenceStrategy = require('../src/strategies/mechanics/SequenceStrategy');

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const buildSequence = uids =>
  uids.map(uid => ({ uid, assignedValue: `Value-${uid}`, displayData: { display: uid } }));

const buildEnvironment = ({
  difficulty = 'medium',
  sequence = buildSequence(['UID01', 'UID02', 'UID03'])
} = {}) => {
  const sessionDoc = {
    difficulty,
    config: {
      numberOfRounds: 1,
      pointsPerCorrect: 10,
      penaltyPerError: -2,
      timeLimit: 30
    },
    sequenceConfig: { minSequenceLength: 3, maxSequenceLength: 5, displaySeconds: 3 },
    sequencePlan: [{ roundNumber: 1, length: sequence.length, sequence }]
  };

  const strategy = new SequenceStrategy();
  const strategyState = strategy.initialize({ sessionDoc });

  const playDoc = {
    _id: { toString: () => 'play-1' },
    score: 0,
    currentRound: 1,
    metrics: {},
    addEventAtomic: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined)
  };

  const playState = {
    playDoc,
    sessionDoc,
    mechanicName: 'sequence',
    mechanicStrategy: strategy,
    strategyState,
    awaitingResponse: false,
    paused: false
  };

  // Pre-poblar currentChallenge como hace sendNextRound:
  const challenge = strategy.selectChallenge({
    playDoc,
    sessionDoc,
    playState
  });
  playState.currentChallenge = {
    uid: null,
    assignedValue: null,
    displayData: challenge.displayData
  };

  const emit = jest.fn();
  const ioTo = jest.fn(() => ({ emit }));
  const engine = {
    activePlays: new Map([['play-1', playState]]),
    metrics: { totalRoundResponses: 0 },
    io: { to: ioTo },
    endPlay: jest.fn().mockResolvedValue(undefined),
    sendNextRound: jest.fn().mockResolvedValue(undefined)
  };

  return { engine, playState, emit, ioTo, strategy };
};

describe('sequenceFlow.startSequenceMemorizingPhase', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it('emite sequence_phase_memorizing con la secuencia visible', () => {
    const { engine, emit } = buildEnvironment();
    sequenceFlow.startSequenceMemorizingPhase(engine, 'play-1');

    expect(emit).toHaveBeenCalledWith(
      'sequence_phase_memorizing',
      expect.objectContaining({
        playId: 'play-1',
        roundNumber: 1,
        length: 3,
        displaySeconds: 3
      })
    );
  });

  it('programa la transición a reproducing tras displaySeconds', () => {
    const { engine, emit } = buildEnvironment();
    sequenceFlow.startSequenceMemorizingPhase(engine, 'play-1');
    emit.mockClear();

    jest.advanceTimersByTime(3000);

    expect(emit).toHaveBeenCalledWith(
      'sequence_phase_reproducing',
      expect.objectContaining({ playId: 'play-1', length: 3 })
    );
  });
});

describe('sequenceFlow.processSequenceScan', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it('emite sequence_card_result en scan correcto', async () => {
    const { engine, playState, emit } = buildEnvironment();
    sequenceFlow.startSequenceMemorizingPhase(engine, 'play-1');
    jest.advanceTimersByTime(3000);
    emit.mockClear();

    await sequenceFlow.processSequenceScan(engine, 'play-1', playState, {
      uid: 'UID01',
      assignedValue: 'Value-UID01'
    });

    expect(emit).toHaveBeenCalledWith(
      'sequence_card_result',
      expect.objectContaining({ type: 'correct', uid: 'UID01' })
    );
    expect(playState.playDoc.addEventAtomic).toHaveBeenCalled();
  });

  it('emite sequence_round_result al completar la secuencia', async () => {
    const { engine, playState, emit } = buildEnvironment();
    sequenceFlow.startSequenceMemorizingPhase(engine, 'play-1');
    jest.advanceTimersByTime(3000);

    await sequenceFlow.processSequenceScan(engine, 'play-1', playState, { uid: 'UID01' });
    await sequenceFlow.processSequenceScan(engine, 'play-1', playState, { uid: 'UID02' });
    emit.mockClear();
    await sequenceFlow.processSequenceScan(engine, 'play-1', playState, { uid: 'UID03' });

    const roundResultCall = emit.mock.calls.find(
      ([eventName]) => eventName === 'sequence_round_result'
    );
    expect(roundResultCall).toBeTruthy();
    expect(roundResultCall[1]).toMatchObject({
      playId: 'play-1',
      roundNumber: 1,
      completed: true
    });
  });

  it('emite sequence_round_result en hard tras un scan erróneo', async () => {
    const { engine, playState, emit } = buildEnvironment({ difficulty: 'hard' });
    sequenceFlow.startSequenceMemorizingPhase(engine, 'play-1');
    jest.advanceTimersByTime(3000);

    // En hard, el primer fallo bloquea esa carta y avanza el cursor.
    await sequenceFlow.processSequenceScan(engine, 'play-1', playState, { uid: 'WRONG1' });
    await sequenceFlow.processSequenceScan(engine, 'play-1', playState, { uid: 'WRONG2' });
    await sequenceFlow.processSequenceScan(engine, 'play-1', playState, { uid: 'WRONG3' });

    const roundResultCall = emit.mock.calls.find(
      ([eventName]) => eventName === 'sequence_round_result'
    );
    expect(roundResultCall).toBeTruthy();
    expect(roundResultCall[1].completed).toBe(false);
    expect(roundResultCall[1].results.every(r => r.status === 'blocked')).toBe(true);
  });
});

describe('sequenceFlow.handleSequenceRoundTimeout', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  it('marca cartas no resueltas como timedOut', async () => {
    const { engine, playState, emit } = buildEnvironment();
    sequenceFlow.startSequenceMemorizingPhase(engine, 'play-1');
    jest.advanceTimersByTime(3000);

    // Acertar solo la primera carta antes del timeout
    await sequenceFlow.processSequenceScan(engine, 'play-1', playState, { uid: 'UID01' });
    emit.mockClear();

    await sequenceFlow.handleSequenceRoundTimeout(engine, 'play-1');

    const roundResultCall = emit.mock.calls.find(
      ([eventName]) => eventName === 'sequence_round_result'
    );
    expect(roundResultCall[1].timedOut).toBe(true);
    const statuses = roundResultCall[1].results.map(r => r.status);
    expect(statuses).toEqual(['correct', 'timedOut', 'timedOut']);
  });
});

describe('sequenceFlow.buildSequenceFinalSummary', () => {
  it('devuelve métricas neutras si no hay rondas resueltas', () => {
    const summary = sequenceFlow.buildSequenceFinalSummary({
      strategyState: { roundResults: [] }
    });
    expect(summary.sequencesCompleted).toBe(0);
    expect(summary.maxSequenceLengthAchieved).toBe(0);
  });

  it('agrega métricas de varias rondas', () => {
    const playState = {
      strategyState: {
        roundResults: [
          {
            roundNumber: 1,
            length: 3,
            durationMs: 1500,
            results: [
              { uid: 'A', status: 'correct', attempts: 0 },
              { uid: 'B', status: 'correct', attempts: 0 },
              { uid: 'C', status: 'correct', attempts: 0 }
            ]
          },
          {
            roundNumber: 2,
            length: 4,
            durationMs: 2200,
            results: [
              { uid: 'A', status: 'correct', attempts: 0 },
              { uid: 'B', status: 'blocked', attempts: 2 },
              { uid: 'C', status: 'correct', attempts: 1 },
              { uid: 'D', status: 'correct', attempts: 0 }
            ]
          },
          {
            roundNumber: 3,
            length: 3,
            durationMs: 800,
            results: [
              { uid: 'A', status: 'correct', attempts: 0 },
              { uid: 'B', status: 'timedOut', attempts: 0 },
              { uid: 'C', status: 'timedOut', attempts: 0 }
            ]
          }
        ],
        hintsConsumed: 2
      }
    };

    const summary = sequenceFlow.buildSequenceFinalSummary(playState);
    expect(summary.sequencesCompleted).toBe(1); // round 1 todas correctas
    expect(summary.sequencesBlocked).toBe(1); // round 2
    expect(summary.sequencesTimedOut).toBe(1); // round 3
    expect(summary.maxSequenceLengthAchieved).toBe(3); // sólo el round 1 cuenta
    expect(summary.partialReproductions).toBe(3 + 3 + 1); // 7
    expect(summary.blockedCardsTotal).toBe(1);
    expect(summary.hintsUsed).toBe(2);
  });
});
