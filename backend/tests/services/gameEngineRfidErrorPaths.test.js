/**
 * @fileoverview Tests de los paths de error fatales en GameEngine durante
 * el procesamiento de escaneos RFID.
 *
 * Cubre el caso histórico en el que un fallo de BD durante `addEvent` o
 * `addEventAtomic` se silenciaba con `logger.error` y la partida quedaba
 * en estado inconsistente (cliente esperando `validation_result` que nunca
 * llega; score divergente entre memoria y BD).
 *
 * El fix introduce `_emitFatalScanError` que: notifica a Sentry, emite
 * `play_interrupted` al cliente y cierra la partida de forma graceful.
 */

const GameEngine = require('../../src/services/gameEngine/GameEngine');

const buildMockIo = () => {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return { io: { to }, to, emit };
};

const collectEmittedEvents = ioMock =>
  ioMock.to.mock.results.flatMap(result => result.value.emit.mock.calls.map(call => call[0]));

describe('GameEngine — error paths fatales', () => {
  let engine;
  let ioMock;

  beforeEach(() => {
    ioMock = buildMockIo();
    engine = new GameEngine(ioMock.io);
    // Stubs de métodos pesados para aislar el path bajo test.
    engine.endPlay = jest.fn().mockResolvedValue();
    engine.checkpointPlayIfNeeded = jest.fn().mockResolvedValue();
  });

  describe('_emitFatalScanError', () => {
    it('emite play_interrupted con reason internal_error y cierra la partida', async () => {
      const playState = { playDoc: { score: 42 } };
      const err = new Error('mongo down');

      await engine._emitFatalScanError('p-1', playState, err, 'processResponse');

      expect(ioMock.to).toHaveBeenCalledWith('play_p-1');
      expect(ioMock.emit).toHaveBeenCalledWith(
        'play_interrupted',
        expect.objectContaining({
          playId: 'p-1',
          reason: 'internal_error',
          finalScore: 42
        })
      );
      expect(engine.endPlay).toHaveBeenCalledWith('p-1');
    });

    it('finalScore = 0 cuando playState es nulo', async () => {
      await engine._emitFatalScanError('p-2', null, new Error('x'), 'ctx');
      expect(ioMock.emit).toHaveBeenCalledWith(
        'play_interrupted',
        expect.objectContaining({ finalScore: 0 })
      );
    });

    it('aún cierra la partida si el emit falla', async () => {
      ioMock.to.mockReturnValue({
        emit: jest.fn().mockImplementation(() => {
          throw new Error('emit broke');
        })
      });
      await engine._emitFatalScanError('p-3', { playDoc: { score: 0 } }, new Error('x'), 'ctx');
      expect(engine.endPlay).toHaveBeenCalledWith('p-3');
    });

    it('captura excepción de endPlay sin escalar', async () => {
      engine.endPlay = jest.fn().mockRejectedValue(new Error('end failed'));

      await expect(
        engine._emitFatalScanError('p-4', { playDoc: { score: 10 } }, new Error('x'), 'ctx')
      ).resolves.toBeUndefined();
    });
  });

  describe('processResponse — fallo de addEventAtomic', () => {
    it('emite play_interrupted (no validation_result) si addEventAtomic rechaza', async () => {
      const playState = {
        playDoc: {
          _id: { toString: () => 'p-resp' },
          score: 25,
          currentRound: 1,
          status: 'in-progress',
          addEventAtomic: jest.fn().mockRejectedValue(new Error('mongo down'))
        },
        sessionDoc: {
          config: { pointsPerCorrect: 10, penaltyPerError: -2, numberOfRounds: 5 }
        },
        currentChallenge: {
          uid: 'AABBCCDD',
          assignedValue: 'A',
          displayData: { value: 'A' }
        },
        roundStartTime: Date.now() - 1000,
        nextRoundTimer: null
      };
      engine.activePlays.set('p-resp', playState);

      const scannedCard = { uid: 'AABBCCDD', assignedValue: 'A' };
      await engine.processResponse('p-resp', playState, scannedCard);

      expect(playState.playDoc.addEventAtomic).toHaveBeenCalled();
      const eventNames = collectEmittedEvents(ioMock);
      expect(eventNames).toContain('play_interrupted');
      expect(eventNames).not.toContain('validation_result');
      expect(engine.endPlay).toHaveBeenCalledWith('p-resp');
    });
  });

  describe('processMemoryScan — fallo en first_pick (addEvent)', () => {
    // WS-9: el evento `card_scanned` del primer volteo es telemetría PURA (0 puntos,
    // no afecta el score). Su fallo NO debe interrumpir la partida (antes
    // `_emitFatalScanError` la mataba por un evento sin impacto en la puntuación,
    // desproporcionado). Además el `memory_turn_state` (voltear la carta) se emite
    // ANTES del write, así que el niño ve su carta pese al fallo de telemetría.
    it('degrada el fallo (log/Sentry) SIN interrumpir la partida y voltea la carta', async () => {
      // emitMemoryTurnState delega en stateHelpers; lo stubbeamos para verificar que
      // el volteo se emitió antes de intentar (y fallar) el write telemétrico.
      engine.emitMemoryTurnState = jest.fn();
      const playState = {
        playDoc: {
          _id: { toString: () => 'p-mem' },
          score: 0,
          currentRound: 1,
          addEvent: jest.fn().mockRejectedValue(new Error('mongo first_pick fail'))
        },
        sessionDoc: { config: { numberOfRounds: 10 } },
        strategyState: { boardLayout: [] },
        mechanicStrategy: {
          processScan: jest.fn().mockReturnValue({ type: 'first_pick' })
        },
        roundStartTime: null
      };
      engine.activePlays.set('p-mem', playState);

      const scannedCard = { uid: 'CARD1234', assignedValue: 'X' };
      await engine.processMemoryScan('p-mem', playState, scannedCard);

      // El write telemétrico se intentó y falló…
      expect(playState.playDoc.addEvent).toHaveBeenCalled();
      // …pero la carta se volteó igualmente (emit ANTES del write)…
      expect(engine.emitMemoryTurnState).toHaveBeenCalledWith(
        'p-mem',
        playState,
        expect.objectContaining({ phase: 'first_pick' })
      );
      // …y la partida NO se interrumpió ni se cerró.
      expect(collectEmittedEvents(ioMock)).not.toContain('play_interrupted');
      expect(engine.endPlay).not.toHaveBeenCalled();
    });
  });

  describe('processMemoryScan — fallo en resolved (addEventAtomic)', () => {
    it('captura el error y dispara play_interrupted, no validation_result', async () => {
      const playState = {
        playDoc: {
          _id: { toString: () => 'p-mem-res' },
          score: 0,
          currentRound: 2,
          addEventAtomic: jest.fn().mockRejectedValue(new Error('mongo resolve fail'))
        },
        sessionDoc: { config: { numberOfRounds: 10 } },
        strategyState: { boardLayout: [] },
        mechanicStrategy: {
          processScan: jest.fn().mockReturnValue({
            type: 'resolved',
            isCorrect: true,
            pointsAwarded: 5,
            selectedUids: ['UID-A', 'UID-B']
          })
        },
        roundStartTime: Date.now() - 500,
        playEndsAt: Date.now() + 60_000
      };
      engine.activePlays.set('p-mem-res', playState);
      // Stub para evitar dependencias de timer
      engine.scheduleMemoryPlayTimeout = jest.fn();
      engine.getMemoryRemainingTimeMs = jest.fn().mockReturnValue(60_000);
      engine.scheduleTransientTimer = jest.fn();
      engine.emitMemoryTurnState = jest.fn();
      engine.isMemoryPlay = jest.fn().mockReturnValue(true);

      const scannedCard = { uid: 'UID-B', assignedValue: 'B' };
      await engine.processMemoryScan('p-mem-res', playState, scannedCard);

      expect(playState.playDoc.addEventAtomic).toHaveBeenCalled();
      const eventNames = collectEmittedEvents(ioMock);
      expect(eventNames).toContain('play_interrupted');
      expect(eventNames).not.toContain('validation_result');
      expect(engine.endPlay).toHaveBeenCalledWith('p-mem-res');
    });
  });

  describe('handleCardScan — feedback de tarjeta desconocida (uid_unknown)', () => {
    it('emite scan_ignored uid_unknown al room de la partida cuando el UID no pertenece a ninguna partida activa', async () => {
      // cardUidToPlayId vacío → rama !playId. Con expectedPlayId (modo gameplay)
      // damos feedback inmediato en vez de dejar que el cliente espere el timeout.
      await engine.handleCardScan('DEADBEEF', 'p-expected');

      expect(ioMock.to).toHaveBeenCalledWith('play_p-expected');
      expect(ioMock.emit).toHaveBeenCalledWith(
        'scan_ignored',
        expect.objectContaining({ uid: 'DEADBEEF', reason: 'uid_unknown' })
      );
    });

    it('no emite nada si no hay expectedPlayId (idle / sin partida asociada)', async () => {
      await engine.handleCardScan('DEADBEEF', null);
      expect(ioMock.to).not.toHaveBeenCalled();
    });
  });
});
