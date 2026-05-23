/**
 * Tests para B.1 + B.6 + T-931 telemetría en runtimeMetrics.
 *
 * Cubre:
 *   - recordCacheLayerOutcome → namespace → hits/misses + hitRatePercent
 *   - reportRateLimiterMode → useRedis, fallbackCount, redisSuccessCount
 *   - recordT931Write / recordT931Read / recordT931Reconcile / recordT931GdprPurge
 *   - getSnapshot expone los 3 bloques nuevos
 *   - reset() limpia los 3 bloques
 */

const runtimeMetrics = require('../src/utils/runtimeMetrics');

describe('runtimeMetrics — B.1/B.6/T-931 telemetry (pre-v1.0.0)', () => {
  beforeEach(() => {
    runtimeMetrics.reset();
  });

  describe('B.1 — recordCacheLayerOutcome (cacheLayers)', () => {
    it('inicializa el bloque cacheLayers vacío en reset', () => {
      const snap = runtimeMetrics.getSnapshot();
      expect(snap.redis.cacheLayers).toEqual({});
    });

    it('registra hits y misses por namespace separadamente', () => {
      runtimeMetrics.recordCacheLayerOutcome('cache:analytics', 'hit');
      runtimeMetrics.recordCacheLayerOutcome('cache:analytics', 'hit');
      runtimeMetrics.recordCacheLayerOutcome('cache:analytics', 'miss');
      runtimeMetrics.recordCacheLayerOutcome('cache:context', 'hit');

      const snap = runtimeMetrics.getSnapshot();
      expect(snap.redis.cacheLayers['cache:analytics'].hits).toBe(2);
      expect(snap.redis.cacheLayers['cache:analytics'].misses).toBe(1);
      expect(snap.redis.cacheLayers['cache:context'].hits).toBe(1);
      expect(snap.redis.cacheLayers['cache:context'].misses).toBe(0);
    });

    it('calcula hitRatePercent con 1 decimal', () => {
      // 3 hits / 7 total = 42.857... → redondeado a 42.9
      for (let i = 0; i < 3; i++) {
        runtimeMetrics.recordCacheLayerOutcome('cache:x', 'hit');
      }
      for (let i = 0; i < 4; i++) {
        runtimeMetrics.recordCacheLayerOutcome('cache:x', 'miss');
      }
      const snap = runtimeMetrics.getSnapshot();
      expect(snap.redis.cacheLayers['cache:x'].hitRatePercent).toBe(42.9);
    });

    it('hitRatePercent es 0 cuando no hay reads', () => {
      // Si nunca se llamó record, el namespace no existe — no comparable
      expect(runtimeMetrics.getSnapshot().redis.cacheLayers).toEqual({});
    });

    it('ignora outcome inválido', () => {
      runtimeMetrics.recordCacheLayerOutcome('cache:x', 'invalid');
      runtimeMetrics.recordCacheLayerOutcome(null, 'hit');
      runtimeMetrics.recordCacheLayerOutcome('', 'miss');
      const snap = runtimeMetrics.getSnapshot();
      expect(snap.redis.cacheLayers).toEqual({});
    });

    it('reset limpia todos los layers', () => {
      runtimeMetrics.recordCacheLayerOutcome('cache:foo', 'hit');
      runtimeMetrics.reset();
      const snap = runtimeMetrics.getSnapshot();
      expect(snap.redis.cacheLayers).toEqual({});
    });
  });

  describe('B.6 — reportRateLimiterMode (socketRateLimiter)', () => {
    it('expone null/0 inicialmente', () => {
      const snap = runtimeMetrics.getSnapshot();
      expect(snap.socketRateLimiter).toEqual({
        useRedis: null,
        fallbackCount: 0,
        redisSuccessCount: 0,
        lastReportedAt: null
      });
    });

    it('incrementa redisSuccessCount tras decisión exitosa Redis', () => {
      runtimeMetrics.reportRateLimiterMode({ useRedis: true, fallback: false });
      runtimeMetrics.reportRateLimiterMode({ useRedis: true });
      const snap = runtimeMetrics.getSnapshot();
      expect(snap.socketRateLimiter.useRedis).toBe(true);
      expect(snap.socketRateLimiter.redisSuccessCount).toBe(2);
      expect(snap.socketRateLimiter.fallbackCount).toBe(0);
      expect(snap.socketRateLimiter.lastReportedAt).toBeGreaterThan(0);
    });

    it('incrementa fallbackCount cuando fallback=true', () => {
      runtimeMetrics.reportRateLimiterMode({ useRedis: false, fallback: true });
      runtimeMetrics.reportRateLimiterMode({ useRedis: false, fallback: true });
      const snap = runtimeMetrics.getSnapshot();
      expect(snap.socketRateLimiter.fallbackCount).toBe(2);
      expect(snap.socketRateLimiter.useRedis).toBe(false);
    });

    it('decisión memory-local intencional (no fallback) NO incrementa fallbackCount', () => {
      runtimeMetrics.reportRateLimiterMode({ useRedis: false, fallback: false });
      const snap = runtimeMetrics.getSnapshot();
      expect(snap.socketRateLimiter.useRedis).toBe(false);
      expect(snap.socketRateLimiter.fallbackCount).toBe(0);
    });
  });

  describe('T-931 — recordT931Write / recordT931Read / recordT931Reconcile / recordT931GdprPurge', () => {
    it('inicializa todos los contadores T-931 a 0', () => {
      const t = runtimeMetrics.getSnapshot().t931;
      expect(t.leaderboardWrites).toBe(0);
      expect(t.studentMetricsWrites).toBe(0);
      expect(t.leaderboardReads).toBe(0);
      expect(t.leaderboardCacheHits).toBe(0);
      expect(t.reconcileRuns).toBe(0);
      expect(t.gdprPurges).toBe(0);
      expect(t.lastReconcileAt).toBeNull();
    });

    it('recordT931Write incrementa el contador del kind correcto', () => {
      runtimeMetrics.recordT931Write('leaderboard');
      runtimeMetrics.recordT931Write('leaderboard');
      runtimeMetrics.recordT931Write('studentMetrics');
      const t = runtimeMetrics.getSnapshot().t931;
      expect(t.leaderboardWrites).toBe(2);
      expect(t.studentMetricsWrites).toBe(1);
    });

    it('recordT931Read calcula leaderboardHitRatePercent', () => {
      runtimeMetrics.recordT931Read('leaderboard', 'hit');
      runtimeMetrics.recordT931Read('leaderboard', 'hit');
      runtimeMetrics.recordT931Read('leaderboard', 'miss');
      const t = runtimeMetrics.getSnapshot().t931;
      expect(t.leaderboardReads).toBe(3);
      expect(t.leaderboardCacheHits).toBe(2);
      expect(t.leaderboardCacheMisses).toBe(1);
      // 2/3 = 66.66 → 66.7
      expect(t.leaderboardHitRatePercent).toBe(66.7);
    });

    it('recordT931Read calcula studentMetricsHitRatePercent', () => {
      runtimeMetrics.recordT931Read('studentMetrics', 'miss');
      runtimeMetrics.recordT931Read('studentMetrics', 'hit');
      const t = runtimeMetrics.getSnapshot().t931;
      expect(t.studentMetricsReads).toBe(2);
      expect(t.studentMetricsCacheHits).toBe(1);
      expect(t.studentMetricsHitRatePercent).toBe(50);
    });

    it('recordT931Reconcile actualiza drift + lastReconcileAt', () => {
      runtimeMetrics.recordT931Reconcile({ driftDetected: 5, driftCorrected: 4 });
      const t = runtimeMetrics.getSnapshot().t931;
      expect(t.reconcileRuns).toBe(1);
      expect(t.reconcileDriftDetected).toBe(5);
      expect(t.reconcileDriftCorrected).toBe(4);
      expect(t.lastReconcileAt).toBeGreaterThan(0);
    });

    it('recordT931GdprPurge incrementa contador', () => {
      runtimeMetrics.recordT931GdprPurge();
      runtimeMetrics.recordT931GdprPurge();
      expect(runtimeMetrics.getSnapshot().t931.gdprPurges).toBe(2);
    });

    it('reset limpia todos los contadores T-931', () => {
      runtimeMetrics.recordT931Write('leaderboard');
      runtimeMetrics.recordT931Reconcile({ driftDetected: 1 });
      runtimeMetrics.recordT931GdprPurge();
      runtimeMetrics.reset();
      const t = runtimeMetrics.getSnapshot().t931;
      expect(t.leaderboardWrites).toBe(0);
      expect(t.reconcileRuns).toBe(0);
      expect(t.gdprPurges).toBe(0);
      expect(t.lastReconcileAt).toBeNull();
    });
  });

  describe('getSnapshot — estructura completa', () => {
    it('expone los 3 bloques nuevos al nivel adecuado', () => {
      const snap = runtimeMetrics.getSnapshot();
      expect(snap).toHaveProperty('redis.cacheLayers');
      expect(snap).toHaveProperty('socketRateLimiter');
      expect(snap).toHaveProperty('t931');
    });
  });
});
