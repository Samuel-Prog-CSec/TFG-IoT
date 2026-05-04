const MemoryStrategy = require('../src/strategies/mechanics/MemoryStrategy');

describe('MemoryStrategy', () => {
  const buildSessionDoc = () => ({
    config: {
      timeLimit: 60
    },
    cardMappings: [
      {
        uid: 'AA000001',
        assignedValue: 'A',
        displayData: { value: 'A', display: '🅰️' }
      },
      {
        uid: 'AA000002',
        assignedValue: 'A',
        displayData: { value: 'A', display: '🅰️' }
      },
      {
        uid: 'AA000003',
        assignedValue: 'B',
        displayData: { value: 'B', display: '🅱️' }
      },
      {
        uid: 'AA000004',
        assignedValue: 'B',
        displayData: { value: 'B', display: '🅱️' }
      }
    ],
    boardLayout: [
      {
        slotIndex: 0,
        uid: 'AA000001',
        assignedValue: 'A',
        displayData: { value: 'A' }
      },
      {
        slotIndex: 1,
        uid: 'AA000002',
        assignedValue: 'A',
        displayData: { value: 'A' }
      },
      {
        slotIndex: 2,
        uid: 'AA000003',
        assignedValue: 'B',
        displayData: { value: 'B' }
      },
      {
        slotIndex: 3,
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

  describe('recordScanResult bookkeeping (ADR-A/B)', () => {
    it('initialize siembra los contadores running de finalSummary', () => {
      const strategy = new MemoryStrategy();
      const state = strategy.initialize({ sessionDoc: buildSessionDoc() });
      expect(state.currentStreak).toBe(0);
      expect(state.peakStreak).toBe(0);
      expect(state.totalMatches).toBe(0);
      expect(state.totalMatchTimeMs).toBe(0);
      expect(state.firstMatchAtAttempt).toBeNull();
    });

    it('un acierto incrementa streak/peakStreak y registra firstMatchAtAttempt', () => {
      const strategy = new MemoryStrategy();
      const state = strategy.initialize({ sessionDoc: buildSessionDoc() });
      // Simulamos 1er intento (processScan habría incrementado attempts a 1).
      state.attempts = 1;
      strategy.recordScanResult({ isCorrect: true, timeElapsed: 1500, strategyState: state });
      expect(state.currentStreak).toBe(1);
      expect(state.peakStreak).toBe(1);
      expect(state.totalMatches).toBe(1);
      expect(state.totalMatchTimeMs).toBe(1500);
      expect(state.firstMatchAtAttempt).toBe(1);
    });

    it('una racha de 3 aciertos sin error mantiene peakStreak en 3', () => {
      const strategy = new MemoryStrategy();
      const state = strategy.initialize({ sessionDoc: buildSessionDoc() });
      [800, 1100, 950].forEach((t, i) => {
        state.attempts = i + 1;
        strategy.recordScanResult({ isCorrect: true, timeElapsed: t, strategyState: state });
      });
      expect(state.currentStreak).toBe(3);
      expect(state.peakStreak).toBe(3);
      expect(state.totalMatchTimeMs).toBe(2850);
    });

    it('un fallo rompe currentStreak pero conserva peakStreak', () => {
      const strategy = new MemoryStrategy();
      const state = strategy.initialize({ sessionDoc: buildSessionDoc() });
      state.attempts = 1;
      strategy.recordScanResult({ isCorrect: true, timeElapsed: 900, strategyState: state });
      state.attempts = 2;
      strategy.recordScanResult({ isCorrect: true, timeElapsed: 800, strategyState: state });
      state.attempts = 3;
      strategy.recordScanResult({ isCorrect: false, timeElapsed: 1500, strategyState: state });
      expect(state.currentStreak).toBe(0);
      expect(state.peakStreak).toBe(2);
    });

    it('firstMatchAtAttempt sólo se registra una vez', () => {
      const strategy = new MemoryStrategy();
      const state = strategy.initialize({ sessionDoc: buildSessionDoc() });
      // 2 fallos antes del primer acierto.
      state.attempts = 1;
      strategy.recordScanResult({ isCorrect: false, timeElapsed: 1500, strategyState: state });
      state.attempts = 2;
      strategy.recordScanResult({ isCorrect: false, timeElapsed: 1700, strategyState: state });
      // Primer acierto (3er intento).
      state.attempts = 3;
      strategy.recordScanResult({ isCorrect: true, timeElapsed: 1100, strategyState: state });
      // Segundo acierto.
      state.attempts = 4;
      strategy.recordScanResult({ isCorrect: true, timeElapsed: 900, strategyState: state });
      expect(state.firstMatchAtAttempt).toBe(3);
      expect(state.totalMatches).toBe(2);
    });

    it('ignora timeElapsed <= 0 al acumular totalMatchTimeMs', () => {
      const strategy = new MemoryStrategy();
      const state = strategy.initialize({ sessionDoc: buildSessionDoc() });
      state.attempts = 1;
      strategy.recordScanResult({ isCorrect: true, timeElapsed: 0, strategyState: state });
      expect(state.totalMatches).toBe(1);
      expect(state.totalMatchTimeMs).toBe(0);
    });

    it('es noop si strategyState es null', () => {
      const strategy = new MemoryStrategy();
      expect(() => strategy.recordScanResult({ isCorrect: true })).not.toThrow();
    });
  });
});
