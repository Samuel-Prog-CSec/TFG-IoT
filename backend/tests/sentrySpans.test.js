/**
 * @fileoverview Tests del aspecto observabilidad (T-904 Fase A).
 *
 * Verifica que las funciones críticas (Sentry.startSpan) están envueltas en
 * los puntos previstos y que el callback recibe los atributos correctos.
 *
 * Estrategia: como `tests/setup.js` ya carga `server.js` (que requiere
 * `@sentry/node` real), tenemos que forzar `jest.resetModules` y volver a
 * cargar los módulos bajo test después de instalar el mock. Si no, los
 * módulos quedan con la referencia real cacheada en sus closures.
 */

describe('utils/sentrySpans — instrumentación T-904 Fase A', () => {
  let Sentry;
  let sequenceFlow;
  let analyticsService;
  let startSpanCalls;

  beforeEach(() => {
    jest.resetModules();
    startSpanCalls = [];
    jest.doMock('@sentry/node', () => ({
      startSpan: jest.fn((options, fn) => {
        startSpanCalls.push(options);
        return fn();
      }),
      captureException: jest.fn(),
      captureMessage: jest.fn(),
      setupExpressErrorHandler: jest.fn(),
      init: jest.fn(),
      flush: jest.fn(() => Promise.resolve(true))
    }));
    jest.doMock('@sentry/profiling-node', () => ({
      nodeProfilingIntegration: () => ({})
    }));
    Sentry = require('@sentry/node');
    sequenceFlow = require('../src/services/gameEngine/sequenceFlow');
    analyticsService = require('../src/services/analyticsService');
  });

  afterEach(() => {
    jest.dontMock('@sentry/node');
    jest.dontMock('@sentry/profiling-node');
  });

  describe('sequenceFlow.handleSequenceRoundTimeout', () => {
    it('envuelve la ejecución en un span con op=gameplay.sequence', async () => {
      const fakeEngine = { activePlays: new Map() };
      await sequenceFlow.handleSequenceRoundTimeout(fakeEngine, 'play123');

      expect(Sentry.startSpan).toHaveBeenCalledTimes(1);
      const spanOpts = startSpanCalls[0];
      expect(spanOpts).toMatchObject({
        name: 'gameplay.sequence.roundTimeout',
        op: 'gameplay.sequence',
        attributes: { 'play.id': 'play123' }
      });
    });
  });

  describe('sequenceFlow.processSequenceScan', () => {
    it('envuelve en span con play.id, round.number y card.uid', async () => {
      const fakeEngine = {
        io: { to: () => ({ emit: () => {} }) },
        metrics: { totalRoundResponses: 0 }
      };
      const fakePlayState = {
        playDoc: {
          currentRound: 3,
          score: 0,
          addEventAtomic: jest.fn(() => Promise.resolve())
        },
        sessionDoc: {},
        roundStartTime: Date.now(),
        mechanicStrategy: {
          processScan: () => ({ type: 'ignored', reason: 'test' })
        },
        strategyState: {}
      };
      const cardMapping = { uid: 'UID-AABB', assignedValue: 'Perro' };

      await sequenceFlow.processSequenceScan(fakeEngine, 'play999', fakePlayState, cardMapping);

      expect(Sentry.startSpan).toHaveBeenCalledTimes(1);
      const spanOpts = startSpanCalls[0];
      expect(spanOpts.name).toBe('gameplay.sequence.processScan');
      expect(spanOpts.op).toBe('gameplay.sequence');
      expect(spanOpts.attributes['play.id']).toBe('play999');
      expect(spanOpts.attributes['round.number']).toBe(3);
      expect(spanOpts.attributes['card.uid']).toBe('UID-AABB');
    });
  });

  describe('analyticsService — span helper', () => {
    it('getClassroomSummary lanza un span analytics.classroomSummary con teacher.id', async () => {
      await expect(analyticsService.getClassroomSummary('not-an-objectid')).rejects.toBeDefined();

      const opts = startSpanCalls.find(o => o.name === 'analytics.classroomSummary');
      expect(opts).toBeDefined();
      expect(opts.op).toBe('analytics');
      expect(opts.attributes['teacher.id']).toBe('not-an-objectid');
    });

    it('getStudentSummary lanza un span analytics.studentSummary con timeRange', async () => {
      await expect(
        analyticsService.getStudentSummary('not-an-objectid', '7d')
      ).rejects.toBeDefined();

      const opts = startSpanCalls.find(o => o.name === 'analytics.studentSummary');
      expect(opts).toBeDefined();
      expect(opts.op).toBe('analytics');
      expect(opts.attributes['analytics.timeRange']).toBe('7d');
    });
  });
});
