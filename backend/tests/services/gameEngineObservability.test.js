/**
 * @fileoverview Tests de la observabilidad de GameEngine para scans RFID:
 *   - Agrupación por UID/ventana del log "card_not_in_play"
 *   - Alerta de contención de locks
 *
 * No se inspecciona el logger directamente (pino está en modo `silent`
 * durante los tests). En su lugar verificamos el estado interno del
 * agrupador y el contador de métricas, más Sentry mock cuando aplica.
 */

const Sentry = require('@sentry/node');
const GameEngine = require('../../src/services/gameEngine/GameEngine');

const buildEngine = () => {
  const ioMock = {
    to: jest.fn().mockReturnValue({ emit: jest.fn() })
  };
  return new GameEngine(ioMock);
};

const findCounter = uid =>
  GameEngine.peekCardNotInPlayCountersForTests().find(([key]) => key === uid)?.[1];

describe('GameEngine — observabilidad', () => {
  beforeEach(() => {
    GameEngine.resetCardNotInPlayCountersForTests();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-20T10:00:00Z').getTime());
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('card_not_in_play — agrupación por ventana', () => {
    it('acumula contador en el primer scan sin emitir log inmediato', async () => {
      const engine = buildEngine();
      await engine.handleCardScan('AAAA0001');

      const entry = findCounter('AAAA0001');
      expect(entry).toBeDefined();
      expect(entry.count).toBe(1);
    });

    it('5 scans dentro de la ventana acumulan en el contador', async () => {
      const engine = buildEngine();
      for (let i = 0; i < 5; i++) {
        await engine.handleCardScan('BBBB0002');
      }
      expect(findCounter('BBBB0002').count).toBe(5);
    });

    it('al cruzar la ventana, el siguiente scan resetea el contador a 1', async () => {
      const engine = buildEngine();
      for (let i = 0; i < 3; i++) {
        await engine.handleCardScan('CCCC0003');
      }
      expect(findCounter('CCCC0003').count).toBe(3);

      jest.advanceTimersByTime(GameEngine.CARD_NOT_IN_PLAY_LOG_WINDOW_MS + 1_000);
      await engine.handleCardScan('CCCC0003');

      // Tras cruzar la ventana, el siguiente scan resetea (también emite log info,
      // pero en modo silent no podemos verificarlo; el reset es la prueba).
      expect(findCounter('CCCC0003').count).toBe(1);
    });

    it('UIDs distintos cuentan independientemente', async () => {
      const engine = buildEngine();
      await engine.handleCardScan('UID-X');
      await engine.handleCardScan('UID-Y');
      await engine.handleCardScan('UID-X');

      expect(findCounter('UID-X').count).toBe(2);
      expect(findCounter('UID-Y').count).toBe(1);
    });

    it('incrementa metrics.totalCardScans y metrics.ignoredCardScans en cada scan sin partida', async () => {
      const engine = buildEngine();
      await engine.handleCardScan('UID-Z');
      await engine.handleCardScan('UID-Z');

      expect(engine.metrics.totalCardScans).toBe(2);
      expect(engine.metrics.ignoredCardScans).toBe(2);
    });
  });

  describe('lock contention — alerta cada N conflictos', () => {
    it('expone la constante LOCK_CONTENTION_ALERT_THRESHOLD positiva', () => {
      expect(GameEngine.LOCK_CONTENTION_ALERT_THRESHOLD).toBeGreaterThan(0);
    });

    it('captura mensaje en Sentry al alcanzar un múltiplo del umbral', async () => {
      const captureSpy = jest.spyOn(Sentry, 'captureMessage').mockImplementation(() => {});
      const engine = buildEngine();

      // Posicionar contention justo debajo del umbral; el siguiente conflicto
      // lo cruza y dispara la alerta.
      engine.metrics.lockContention = GameEngine.LOCK_CONTENTION_ALERT_THRESHOLD - 1;

      // Dos operaciones serializadas sobre la misma partida → contención.
      await Promise.all([
        engine.executeWithPlayLock('p-x', 'op-A', () => Promise.resolve('A')),
        engine.executeWithPlayLock('p-x', 'op-B', () => Promise.resolve('B'))
      ]);

      expect(engine.metrics.lockContention).toBeGreaterThanOrEqual(
        GameEngine.LOCK_CONTENTION_ALERT_THRESHOLD
      );
      const sentryCalls = captureSpy.mock.calls.filter(c => c[0] === 'Lock contention spike RFID');
      expect(sentryCalls.length).toBeGreaterThanOrEqual(1);
      expect(sentryCalls[0][1]).toMatchObject({
        level: 'warning',
        tags: expect.objectContaining({ module: 'gameEngine' })
      });
    });

    it('no captura Sentry si contention queda lejos del umbral', async () => {
      const captureSpy = jest.spyOn(Sentry, 'captureMessage').mockImplementation(() => {});
      const engine = buildEngine();

      // Una sola operación, sin contención.
      await engine.executeWithPlayLock('p-y', 'op-A', () => Promise.resolve());

      expect(engine.metrics.lockContention).toBe(0);
      expect(captureSpy).not.toHaveBeenCalled();
    });
  });
});
