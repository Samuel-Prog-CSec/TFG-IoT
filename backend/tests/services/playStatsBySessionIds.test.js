/**
 * @fileoverview Tests de gamePlayService.getPlayStatsBySessionIds.
 *
 * Cubre el contrato del agregado de estadísticas por sesión que alimenta el
 * listado de sesiones (`getSessions`): conteo de partidas COMPLETADAS, media de
 * score, última actividad y las 7 puntuaciones más recientes en orden
 * cronológico ascendente. Sirve de red de seguridad para la migración del
 * acumulador `$push`+`$slice` a `$topN` (B6, ADR-202): el shape de salida debe
 * permanecer byte-idéntico.
 */

const mongoose = require('mongoose');
const GamePlay = require('../../src/models/GamePlay');
const gamePlayService = require('../../src/services/gamePlayService');

describe('gamePlayService.getPlayStatsBySessionIds', () => {
  const sessionId = new mongoose.Types.ObjectId();
  const otherSessionId = new mongoose.Types.ObjectId();
  const dayMs = 24 * 60 * 60 * 1000;
  const base = new Date('2026-01-01T08:00:00.000Z').getTime();

  beforeAll(async () => {
    const plays = [];
    // 10 partidas COMPLETADAS con completedAt distinto y creciente (score 50..59).
    for (let i = 0; i < 10; i += 1) {
      plays.push({
        sessionId,
        playerId: new mongoose.Types.ObjectId(),
        status: 'completed',
        score: 50 + i,
        maxScore: 100,
        completedAt: new Date(base + i * dayMs),
        metrics: {
          totalAttempts: 10,
          correctAttempts: 7,
          errorAttempts: 3,
          timeoutAttempts: 0,
          averageResponseTime: 2000,
          completionTime: 100
        }
      });
    }
    // 1 abandonada (debe ignorarse en playsCount y en recentScores).
    plays.push({
      sessionId,
      playerId: new mongoose.Types.ObjectId(),
      status: 'abandoned',
      score: 999,
      maxScore: 100,
      completedAt: new Date(base + 99 * dayMs),
      metrics: { totalAttempts: 1, correctAttempts: 0, errorAttempts: 1 }
    });
    // 1 completada en OTRA sesión (no debe mezclarse).
    plays.push({
      sessionId: otherSessionId,
      playerId: new mongoose.Types.ObjectId(),
      status: 'completed',
      score: 11,
      maxScore: 100,
      completedAt: new Date(base),
      metrics: { totalAttempts: 1, correctAttempts: 1, errorAttempts: 0 }
    });
    await GamePlay.insertMany(plays);
  });

  afterAll(async () => {
    await GamePlay.deleteMany({ sessionId: { $in: [sessionId, otherSessionId] } });
  });

  it('cuenta solo partidas completadas y agrega media/última actividad', async () => {
    const map = await gamePlayService.getPlayStatsBySessionIds([sessionId]);
    const stats = map[sessionId.toString()];

    expect(stats).toBeDefined();
    expect(stats.playsCount).toBe(10); // la abandonada NO cuenta
    expect(stats.averageScore).toBe(55); // Math.round(avg(50..59)=54.5)
    expect(new Date(stats.lastPlayedAt).getTime()).toBe(base + 9 * dayMs);
  });

  it('recentScores: las 7 más recientes, en orden cronológico ASCENDENTE', async () => {
    const map = await gamePlayService.getPlayStatsBySessionIds([sessionId]);
    const stats = map[sessionId.toString()];

    expect(stats.recentScores).toHaveLength(7);
    // Las 7 más recientes son i=3..9 → scores 53..59, en orden ascendente por fecha.
    expect(stats.recentScores.map(s => s.score)).toEqual([53, 54, 55, 56, 57, 58, 59]);
    const times = stats.recentScores.map(s => new Date(s.completedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // El score 999 de la abandonada nunca aparece.
    expect(stats.recentScores.some(s => s.score === 999)).toBe(false);
  });

  it('no mezcla sesiones y devuelve una entrada por cada sessionId', async () => {
    const map = await gamePlayService.getPlayStatsBySessionIds([sessionId, otherSessionId]);
    expect(map[sessionId.toString()].playsCount).toBe(10);
    expect(map[otherSessionId.toString()].playsCount).toBe(1);
    expect(map[otherSessionId.toString()].recentScores).toEqual([
      expect.objectContaining({ score: 11 })
    ]);
  });

  it('devuelve objeto vacío si no hay sessionIds', async () => {
    expect(await gamePlayService.getPlayStatsBySessionIds([])).toEqual({});
  });
});
