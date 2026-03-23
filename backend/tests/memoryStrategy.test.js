const MemoryStrategy = require('../src/strategies/mechanics/MemoryStrategy');

describe('MemoryStrategy', () => {
  const buildSessionDoc = () => ({
    config: {
      timeLimit: 60
    },
    cardMappings: [
      {
        cardId: 'c1',
        uid: 'AA000001',
        assignedValue: 'A',
        displayData: { value: 'A', display: '🅰️' }
      },
      {
        cardId: 'c2',
        uid: 'AA000002',
        assignedValue: 'A',
        displayData: { value: 'A', display: '🅰️' }
      },
      {
        cardId: 'c3',
        uid: 'AA000003',
        assignedValue: 'B',
        displayData: { value: 'B', display: '🅱️' }
      },
      {
        cardId: 'c4',
        uid: 'AA000004',
        assignedValue: 'B',
        displayData: { value: 'B', display: '🅱️' }
      }
    ],
    boardLayout: [
      {
        slotIndex: 0,
        cardId: 'c1',
        uid: 'AA000001',
        assignedValue: 'A',
        displayData: { value: 'A' }
      },
      {
        slotIndex: 1,
        cardId: 'c2',
        uid: 'AA000002',
        assignedValue: 'A',
        displayData: { value: 'A' }
      },
      {
        slotIndex: 2,
        cardId: 'c3',
        uid: 'AA000003',
        assignedValue: 'B',
        displayData: { value: 'B' }
      },
      {
        slotIndex: 3,
        cardId: 'c4',
        uid: 'AA000004',
        assignedValue: 'B',
        displayData: { value: 'B' }
      }
    ],
    mechanicId: {
      rules: {
        behavior: {
          matchingGroupSize: 2,
          hideUnmatchedAfterDelayMs: 1200
        }
      }
    }
  });

  it('reveals first pick and resolves match on second pick', () => {
    const strategy = new MemoryStrategy();
    const sessionDoc = buildSessionDoc();
    const strategyState = strategy.initialize({ sessionDoc });

    const firstOutcome = strategy.processScan({
      scannedCard: { uid: 'AA000001', assignedValue: 'A' },
      sessionDoc,
      strategyState
    });

    expect(firstOutcome.type).toBe('first_pick');
    expect(firstOutcome.board.find(slot => slot.uid === 'AA000001')?.isRevealed).toBe(true);

    const secondOutcome = strategy.processScan({
      scannedCard: { uid: 'AA000002', assignedValue: 'A' },
      sessionDoc,
      strategyState
    });

    expect(secondOutcome.type).toBe('resolved');
    expect(secondOutcome.isCorrect).toBe(true);
    expect(strategyState.matchedUids).toEqual(expect.arrayContaining(['AA000001', 'AA000002']));
  });

  it('marks mismatch and conceals selected cards', () => {
    const strategy = new MemoryStrategy();
    const sessionDoc = buildSessionDoc();
    const strategyState = strategy.initialize({ sessionDoc });

    strategy.processScan({
      scannedCard: { uid: 'AA000001', assignedValue: 'A' },
      sessionDoc,
      strategyState
    });

    const mismatchOutcome = strategy.processScan({
      scannedCard: { uid: 'AA000003', assignedValue: 'B' },
      sessionDoc,
      strategyState
    });

    expect(mismatchOutcome.type).toBe('resolved');
    expect(mismatchOutcome.isCorrect).toBe(false);
    expect(mismatchOutcome.selectedUids).toEqual(['AA000001', 'AA000003']);

    strategy.concealSelected(strategyState, mismatchOutcome.selectedUids);

    const board = strategy.buildBoardForClient(strategyState);
    expect(board.find(slot => slot.uid === 'AA000001')?.isRevealed).toBe(false);
    expect(board.find(slot => slot.uid === 'AA000003')?.isRevealed).toBe(false);
  });
});
