/**
 * Tests para B.11 — studentMetrics Hash + GDPR purge cross-layer.
 *
 * Cubre:
 *   - recordPlayCompletion → HINCRBY atómico en student:metrics:<id>
 *   - getStudentMetricsMaterialized → HGETALL con normalización
 *   - getStudentMetricsMaterialized miss devuelve null
 *   - Acumulación de plays (sumScoresHundredths, sumResponseTimeMs, samples)
 *   - Campos Secuencia (maxSequenceLengthAchieved, sequencesCompleted)
 *   - purgeStudentMaterialization elimina Hash
 */

jest.mock('ioredis', () => require('ioredis-mock'));

const mongoose = require('mongoose');
const materializedAnalytics = require('../src/services/analytics/materializedAnalyticsService');
const { connectRedis, disconnectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const runtimeMetrics = require('../src/utils/runtimeMetrics');

describe('materializedAnalyticsService — studentMetrics Hash (B.11)', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    runtimeMetrics.reset();
    await redisService.flushNamespace('student:metrics');
    await redisService.flushNamespace('leaderboard');
  });

  describe('recordPlayCompletion → Hash student:metrics', () => {
    it('incrementa contadores HINCRBY tras una partida', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const contextId = new mongoose.Types.ObjectId();
      const mechanicId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();

      await materializedAnalytics.recordPlayCompletion({
        teacherId,
        contextId,
        mechanicId,
        studentId,
        score: 75,
        // maxScore=100 → el % normalizado (ADR-201) coincide con el score sembrado.
        maxScore: 100,
        correctAttempts: 7,
        errorAttempts: 2,
        timeoutAttempts: 1,
        averageResponseTime: 1500,
        mechanicName: 'memory'
      });

      const metrics = await materializedAnalytics.getStudentMetricsMaterialized(
        studentId.toString()
      );
      expect(metrics).toBeDefined();
      expect(metrics.totalGamesPlayed).toBe(1);
      expect(metrics.totalCorrectAnswers).toBe(7);
      expect(metrics.totalErrors).toBe(2);
      expect(metrics.totalTimeouts).toBe(1);
      expect(metrics.averageScore).toBe(75);
      expect(metrics.averageResponseTime).toBe(1500);
      expect(metrics.lastPlayedAt).toBeInstanceOf(Date);
    });

    it('acumula 10 partidas correctamente', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      const ctx = new mongoose.Types.ObjectId();
      const mech = new mongoose.Types.ObjectId();

      // Scores: 50, 60, 70, 80, 90, 50, 60, 70, 80, 90 → avg 70
      for (const score of [50, 60, 70, 80, 90, 50, 60, 70, 80, 90]) {
        await materializedAnalytics.recordPlayCompletion({
          teacherId,
          contextId: ctx,
          mechanicId: mech,
          studentId,
          score,
          maxScore: 100,
          correctAttempts: 1,
          errorAttempts: 0,
          timeoutAttempts: 0,
          averageResponseTime: 1000,
          mechanicName: 'association'
        });
      }

      const m = await materializedAnalytics.getStudentMetricsMaterialized(studentId.toString());
      expect(m.totalGamesPlayed).toBe(10);
      expect(m.totalCorrectAnswers).toBe(10);
      expect(m.averageScore).toBe(70); // (50+60+70+80+90)*2/10 = 70
    });

    it('campos Secuencia: maxSequenceLengthAchieved + sequencesCompleted', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();

      await materializedAnalytics.recordPlayCompletion({
        teacherId,
        contextId: new mongoose.Types.ObjectId(),
        mechanicId: new mongoose.Types.ObjectId(),
        studentId,
        score: 90,
        mechanicName: 'sequence',
        maxSequenceLengthAchieved: 7,
        sequencesCompleted: 4
      });

      const m = await materializedAnalytics.getStudentMetricsMaterialized(studentId.toString());
      expect(m.maxSequenceLengthAchieved).toBe(7);
      expect(m.sequencesCompleted).toBe(4);
    });

    it('mechanicName != "sequence" no toca campos Secuencia', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();

      await materializedAnalytics.recordPlayCompletion({
        teacherId,
        contextId: new mongoose.Types.ObjectId(),
        mechanicId: new mongoose.Types.ObjectId(),
        studentId,
        score: 80,
        mechanicName: 'memory',
        maxSequenceLengthAchieved: 999, // debe ignorarse
        sequencesCompleted: 5
      });

      const m = await materializedAnalytics.getStudentMetricsMaterialized(studentId.toString());
      expect(m.maxSequenceLengthAchieved).toBe(0);
      expect(m.sequencesCompleted).toBe(0);
    });
  });

  describe('getStudentMetricsMaterialized — lectura', () => {
    it('devuelve null si el Hash no existe (miss)', async () => {
      const result = await materializedAnalytics.getStudentMetricsMaterialized(
        new mongoose.Types.ObjectId().toString()
      );
      expect(result).toBeNull();
    });

    it('devuelve null si studentId es falsy', async () => {
      expect(await materializedAnalytics.getStudentMetricsMaterialized(null)).toBeNull();
      expect(await materializedAnalytics.getStudentMetricsMaterialized('')).toBeNull();
    });

    it('incrementa contador hit en runtimeMetrics tras hit real', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      await materializedAnalytics.recordPlayCompletion({
        teacherId,
        contextId: new mongoose.Types.ObjectId(),
        mechanicId: new mongoose.Types.ObjectId(),
        studentId,
        score: 50
      });

      await materializedAnalytics.getStudentMetricsMaterialized(studentId.toString());

      const snap = runtimeMetrics.getSnapshot().t931;
      expect(snap.studentMetricsReads).toBe(1);
      expect(snap.studentMetricsCacheHits).toBe(1);
    });

    it('incrementa miss en runtimeMetrics tras miss', async () => {
      await materializedAnalytics.getStudentMetricsMaterialized(
        new mongoose.Types.ObjectId().toString()
      );
      const snap = runtimeMetrics.getSnapshot().t931;
      expect(snap.studentMetricsReads).toBe(1);
      expect(snap.studentMetricsCacheMisses).toBe(1);
    });
  });

  describe('purgeStudentMaterialization — GDPR Art. 17', () => {
    it('elimina el Hash student:metrics tras purge', async () => {
      const teacherId = new mongoose.Types.ObjectId();
      const studentId = new mongoose.Types.ObjectId();
      await materializedAnalytics.recordPlayCompletion({
        teacherId,
        contextId: new mongoose.Types.ObjectId(),
        mechanicId: new mongoose.Types.ObjectId(),
        studentId,
        score: 50
      });

      // Pre-condición: existe
      const before = await materializedAnalytics.getStudentMetricsMaterialized(
        studentId.toString()
      );
      expect(before).not.toBeNull();

      const result = await materializedAnalytics.purgeStudentMaterialization({
        studentId,
        teacherId
      });
      expect(result.hashDeleted).toBe(true);

      // Post: ya no existe
      const after = await materializedAnalytics.getStudentMetricsMaterialized(studentId.toString());
      expect(after).toBeNull();
    });

    it('incrementa contador gdprPurges en runtimeMetrics', async () => {
      const studentId = new mongoose.Types.ObjectId();
      await materializedAnalytics.purgeStudentMaterialization({ studentId });
      expect(runtimeMetrics.getSnapshot().t931.gdprPurges).toBe(1);
    });

    it('no falla si studentId no existe (idempotente)', async () => {
      // redisService.del() retorna true incluso si la key no existía
      // (DEL en Redis es naturalmente idempotente). Lo que sí debe
      // garantizar el método es que no lanza ni rompe el flujo.
      const result = await materializedAnalytics.purgeStudentMaterialization({
        studentId: new mongoose.Types.ObjectId()
      });
      expect(result).toBeDefined();
      expect(typeof result.hashDeleted).toBe('boolean');
      expect(result.leaderboardEntriesRemoved).toBe(0);
    });

    it('no-op si studentId es falsy', async () => {
      const result = await materializedAnalytics.purgeStudentMaterialization({});
      expect(result.hashDeleted).toBe(false);
      expect(result.leaderboardEntriesRemoved).toBe(0);
    });
  });
});
