/**
 * Tests para B.10 — Leaderboards ZSET en materializedAnalyticsService.
 *
 * Cubre:
 *   - recordPlayCompletion → ZINCRBY en 12 keys (2 dims × 2 metrics × 3 timeRanges)
 *   - getTopFromLeaderboard → ZREVRANGE con resolución score+plays
 *   - getTopFromLeaderboard miss devuelve null (caller fallback Mongo)
 *   - getTopFromLeaderboard con ZSET vacío devuelve [] (no miss)
 *   - timeRange inválido devuelve null sin tocar Redis
 *
 * Usa ioredis-mock que soporta ZINCRBY/ZREVRANGE/ZMSCORE.
 */

jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const materializedAnalytics = require('../src/services/analytics/materializedAnalyticsService');
const { connectRedis, disconnectRedis } = require('../src/config/redis');
const runtimeMetrics = require('../src/utils/runtimeMetrics');
const redisService = require('../src/services/redisService');

describe('materializedAnalyticsService — Leaderboards ZSET (B.10)', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    runtimeMetrics.reset();
    // Limpiar todas las keys leaderboard para empezar fresco
    await redisService.flushNamespace('leaderboard');
  });

  describe('recordPlayCompletion — escritura ZSET', () => {
    it('no-op si falta teacherId o studentId', async () => {
      await materializedAnalytics.recordPlayCompletion({ studentId: 'X' });
      await materializedAnalytics.recordPlayCompletion({ teacherId: 'Y' });
      const snap = runtimeMetrics.getSnapshot().t931;
      expect(snap.leaderboardWrites).toBe(0);
      expect(snap.studentMetricsWrites).toBe(0);
    });

    it('incrementa ZSET para context y mechanic en 3 timeRanges', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const contextId = new mongoose.Types.ObjectId();
      const mechanicId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();

      await materializedAnalytics.recordPlayCompletion({
        teacherId,
        contextId,
        mechanicId,
        studentId,
        score: 85,
        // maxScore=100 → el leaderboard acumula score/maxScore×100 = 85 (%). El
        // ZSET ahora guarda PORCENTAJE, no score crudo; con techo 100 coincide
        // numéricamente con el score, manteniendo las aserciones legibles.
        maxScore: 100,
        correctAttempts: 8,
        errorAttempts: 1,
        timeoutAttempts: 1,
        averageResponseTime: 1200,
        mechanicName: 'memory'
      });

      const snap = runtimeMetrics.getSnapshot().t931;
      expect(snap.leaderboardWrites).toBe(1);
      expect(snap.studentMetricsWrites).toBe(1);

      // Verificar que el ZSET de context plays 24h se incrementó
      const result = await materializedAnalytics.getTopFromLeaderboard(teacherId.toString(), {
        timeRange: '24h',
        dimension: 'context',
        metric: 'plays',
        limit: 5
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
      const entry = result.find(e => e.id === contextId.toString());
      expect(entry).toBeDefined();
      expect(entry.plays).toBe(1);
      expect(entry.score).toBe(85);
    });

    it('fija TTL en el Hash student:metrics y en los ZSET de leaderboard (C1 — anti fuga de memoria)', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const contextId = new mongoose.Types.ObjectId();
      const mechanicId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();

      await materializedAnalytics.recordPlayCompletion({
        teacherId,
        contextId,
        mechanicId,
        studentId,
        score: 70,
        correctAttempts: 7,
        errorAttempts: 3,
        averageResponseTime: 1500,
        mechanicName: 'memory'
      });

      // C1: el Hash student:metrics debe expirar (no vivir indefinidamente en
      // Upstash free-tier). Antes del fix no se fijaba EXPIRE → fuga lenta.
      const { getRedis } = require('../src/config/redis');
      const client = getRedis();
      const studentTtl = await client.ttl(`student:metrics:${studentId.toString()}`);
      expect(studentTtl).toBeGreaterThan(0);

      // Los ZSET de leaderboard también expiran (TTL 8d), no crecen sin cota.
      const lbTtl = await client.ttl(`leaderboard:context:score:${teacherId.toString()}:24h`);
      expect(lbTtl).toBeGreaterThan(0);
    });

    it('acumula plays y score tras múltiples partidas', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const contextId = new mongoose.Types.ObjectId();
      const mechanicId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();

      await materializedAnalytics.recordPlayCompletion({
        teacherId,
        contextId,
        mechanicId,
        studentId,
        score: 60,
        maxScore: 100,
        mechanicName: 'association'
      });
      await materializedAnalytics.recordPlayCompletion({
        teacherId,
        contextId,
        mechanicId,
        studentId,
        score: 40,
        maxScore: 100,
        mechanicName: 'association'
      });

      const result = await materializedAnalytics.getTopFromLeaderboard(teacherId.toString(), {
        timeRange: '30d',
        dimension: 'context',
        metric: 'plays',
        limit: 5
      });
      const entry = result.find(e => e.id === contextId.toString());
      expect(entry.plays).toBe(2);
      expect(entry.score).toBe(100); // 60 + 40
    });
  });

  describe('getTopFromLeaderboard — lectura ZSET', () => {
    it('devuelve null si el ZSET no existe (miss)', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const result = await materializedAnalytics.getTopFromLeaderboard(teacherId.toString(), {
        timeRange: '7d',
        dimension: 'context',
        metric: 'plays',
        limit: 5
      });
      expect(result).toBeNull();
    });

    it('devuelve null si timeRange no soportado', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const result = await materializedAnalytics.getTopFromLeaderboard(teacherId.toString(), {
        timeRange: '1h', // no soportado
        dimension: 'context',
        metric: 'plays',
        limit: 5
      });
      expect(result).toBeNull();
    });

    it('devuelve null si falta teacherId', async () => {
      const result = await materializedAnalytics.getTopFromLeaderboard(null, {
        timeRange: '7d',
        dimension: 'context',
        metric: 'plays'
      });
      expect(result).toBeNull();
    });

    it('ordena el top en orden descendente por la métrica primaria', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const ctx1 = new mongoose.Types.ObjectId();
      const ctx2 = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();

      // ctx2 con 3 plays score 30; ctx1 con 1 play score 80
      for (let i = 0; i < 3; i++) {
        await materializedAnalytics.recordPlayCompletion({
          teacherId,
          contextId: ctx2,
          mechanicId: new mongoose.Types.ObjectId(),
          studentId,
          score: 10,
          maxScore: 100
        });
      }
      await materializedAnalytics.recordPlayCompletion({
        teacherId,
        contextId: ctx1,
        mechanicId: new mongoose.Types.ObjectId(),
        studentId,
        score: 80,
        maxScore: 100
      });

      // Ordenado por plays DESC: ctx2 primero (3 plays > 1 play)
      const byPlays = await materializedAnalytics.getTopFromLeaderboard(teacherId.toString(), {
        timeRange: '7d',
        dimension: 'context',
        metric: 'plays',
        limit: 5
      });
      expect(byPlays[0].id).toBe(ctx2.toString());
      expect(byPlays[0].plays).toBe(3);
      expect(byPlays[0].score).toBe(30);
      expect(byPlays[1].id).toBe(ctx1.toString());
      expect(byPlays[1].plays).toBe(1);
      expect(byPlays[1].score).toBe(80);

      // Ordenado por score DESC: ctx1 primero
      const byScore = await materializedAnalytics.getTopFromLeaderboard(teacherId.toString(), {
        timeRange: '7d',
        dimension: 'context',
        metric: 'score',
        limit: 5
      });
      expect(byScore[0].id).toBe(ctx1.toString());
      expect(byScore[0].score).toBe(80);
    });

    it('respeta limit', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      const ctxIds = Array.from({ length: 5 }, () => new mongoose.Types.ObjectId());
      for (let i = 0; i < ctxIds.length; i++) {
        // i+1 plays con score 50
        for (let j = 0; j <= i; j++) {
          await materializedAnalytics.recordPlayCompletion({
            teacherId,
            contextId: ctxIds[i],
            mechanicId: new mongoose.Types.ObjectId(),
            studentId,
            score: 50
          });
        }
      }

      const top3 = await materializedAnalytics.getTopFromLeaderboard(teacherId.toString(), {
        timeRange: '7d',
        dimension: 'context',
        metric: 'plays',
        limit: 3
      });
      expect(top3.length).toBe(3);
    });
  });
});
