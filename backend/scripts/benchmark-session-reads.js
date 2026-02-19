/**
 * @fileoverview Benchmark reproducible para lecturas de sesiones.
 * Compara latencia baseline (sin lean) vs optimizada (con lean)
 * para GET /api/sessions y GET /api/sessions/:id.
 */

const mongoose = require('mongoose');
const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GameSession = require('../src/models/GameSession');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const Card = require('../src/models/Card');
const CardDeck = require('../src/models/CardDeck');
const { generateTokenPair } = require('../src/middlewares/auth');

const BENCH_ITERATIONS = Number.parseInt(process.env.SESSION_READ_BENCH_ITERATIONS, 10) || 120;
const WARMUP_ITERATIONS = Number.parseInt(process.env.SESSION_READ_BENCH_WARMUP, 10) || 20;
const BENCH_SESSIONS_COUNT = Number.parseInt(process.env.SESSION_READ_BENCH_SESSIONS, 10) || 60;
const BENCH_LIST_LIMIT = Number.parseInt(process.env.SESSION_READ_BENCH_LIMIT, 10) || 100;

const mockReq = {
  headers: {
    'user-agent': 'benchmark-script',
    'accept-language': 'es',
    'accept-encoding': 'gzip'
  }
};

const fingerprintHeaders = {
  'User-Agent': 'benchmark-script',
  'Accept-Language': 'es',
  'Accept-Encoding': 'gzip'
};

const toMs = nanoseconds => Number(nanoseconds) / 1_000_000;

const calculateStats = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const avg = count > 0 ? sum / count : 0;
  const p50 = sorted[Math.floor(count * 0.5)] || 0;
  const p95 = sorted[Math.floor(count * 0.95)] || 0;
  const p99 = sorted[Math.floor(count * 0.99)] || 0;
  return {
    count,
    avgMs: Number(avg.toFixed(2)),
    p50Ms: Number(p50.toFixed(2)),
    p95Ms: Number(p95.toFixed(2)),
    p99Ms: Number(p99.toFixed(2))
  };
};

const runSeries = async ({ endpoint, token, iterations, query }) => {
  const samples = [];

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = process.hrtime.bigint();
    const response = await request(app)
      .get(endpoint)
      .query(query || {})
      .set('Authorization', `Bearer ${token}`)
      .set(fingerprintHeaders);

    if (response.statusCode !== 200) {
      throw new Error(
        `Benchmark falló en ${endpoint} (iteración ${index + 1}) con status ${response.statusCode}`
      );
    }

    const endedAt = process.hrtime.bigint();
    samples.push(toMs(endedAt - startedAt));
  }

  return calculateStats(samples);
};

const runModeBenchmark = async ({ modeName, leanEnabled, token, sessionId }) => {
  process.env.SESSION_READ_LEAN_ENABLED = leanEnabled ? 'true' : 'false';

  await runSeries({
    endpoint: '/api/sessions',
    token,
    iterations: WARMUP_ITERATIONS,
    query: { page: 1, limit: BENCH_LIST_LIMIT }
  });

  await runSeries({
    endpoint: `/api/sessions/${sessionId}`,
    token,
    iterations: WARMUP_ITERATIONS
  });

  const listStats = await runSeries({
    endpoint: '/api/sessions',
    token,
    iterations: BENCH_ITERATIONS,
    query: { page: 1, limit: BENCH_LIST_LIMIT }
  });

  const detailStats = await runSeries({
    endpoint: `/api/sessions/${sessionId}`,
    token,
    iterations: BENCH_ITERATIONS
  });

  return {
    mode: modeName,
    leanEnabled,
    list: listStats,
    detail: detailStats
  };
};

const calculateImprovement = (baselineMs, optimizedMs) => {
  if (baselineMs <= 0) {
    return 0;
  }
  return Number((((baselineMs - optimizedMs) / baselineMs) * 100).toFixed(2));
};

const createBenchmarkFixture = async benchmarkId => {
  const uidPrefix = benchmarkId
    .replaceAll(/[^0-9a-f]/gi, '')
    .toUpperCase()
    .padEnd(6, 'A')
    .slice(0, 6);

  const teacher = await User.create({
    name: `Bench Teacher ${benchmarkId}`,
    email: `bench-session-${benchmarkId}@test.com`,
    password: 'Password123!',
    role: 'teacher',
    status: 'active',
    accountStatus: 'approved'
  });

  const mechanic = await GameMechanic.create({
    name: `bench-mechanic-${benchmarkId}`,
    displayName: 'Bench Mechanic',
    isActive: true,
    rules: {}
  });

  const assets = Array.from({ length: 20 }, (_, index) => ({
    key: `asset_${benchmarkId}_${index + 1}`,
    display: `Asset ${index + 1}`,
    value: `VALUE_${index + 1}`
  }));

  const context = await GameContext.create({
    contextId: `bench-context-${benchmarkId}`,
    name: `Bench Context ${benchmarkId}`,
    description: 'Contexto para benchmark de lectura de sesiones',
    assets,
    createdBy: teacher._id
  });

  if (!context?._id) {
    throw new Error('No se pudo crear contexto para benchmark de sesiones');
  }

  const cards = await Card.insertMany(
    Array.from({ length: 20 }, (_, index) => ({
      uid: `${uidPrefix}${String(index + 1).padStart(2, '0')}`,
      type: 'NTAG',
      status: 'active'
    }))
  );

  const cardMappings = cards.map((card, index) => ({
    cardId: card._id,
    uid: card.uid,
    assignedValue: `VALUE_${index + 1}`,
    displayData: {
      key: `asset_${benchmarkId}_${index + 1}`,
      display: `Asset ${index + 1}`,
      value: `VALUE_${index + 1}`
    }
  }));

  const deck = await CardDeck.create({
    name: `Bench Deck ${benchmarkId}`,
    description: 'Mazo para benchmark de lecturas',
    contextId: context._id,
    createdBy: teacher._id,
    status: 'active',
    cardMappings
  });

  const sessionDocs = Array.from({ length: BENCH_SESSIONS_COUNT }, () => ({
    mechanicId: mechanic._id,
    deckId: deck._id,
    contextId: context._id,
    config: {
      numberOfCards: 20,
      numberOfRounds: 8,
      timeLimit: 20,
      pointsPerCorrect: 10,
      penaltyPerError: -2
    },
    cardMappings,
    status: 'created',
    createdBy: teacher._id
  }));

  const createdSessions = await GameSession.insertMany(sessionDocs);

  const token = (await generateTokenPair(teacher, mockReq)).accessToken;

  return {
    teacherId: teacher._id,
    sessionId: createdSessions[0]._id.toString(),
    token,
    benchmarkId
  };
};

const cleanupFixture = async ({ benchmarkId, teacherId }) => {
  const uidPrefix = benchmarkId
    .replaceAll(/[^0-9a-f]/gi, '')
    .toUpperCase()
    .padEnd(6, 'A')
    .slice(0, 6);

  await GameSession.deleteMany({ createdBy: teacherId });

  await CardDeck.deleteMany({ name: new RegExp(`^Bench Deck ${benchmarkId}$`) });
  await GameContext.deleteMany({ contextId: `bench-context-${benchmarkId}` });
  await GameMechanic.deleteMany({ name: `bench-mechanic-${benchmarkId}` });
  await Card.deleteMany({ uid: new RegExp(`^${uidPrefix}`) });
  await User.deleteMany({ email: `bench-session-${benchmarkId}@test.com` });
};

const main = async () => {
  const benchmarkId = Date.now().toString(36);
  const mongoUri = process.env.MONGO_URI || process.env.TEST_MONGO_URI;

  if (!mongoUri) {
    throw new Error('Define MONGO_URI o TEST_MONGO_URI para ejecutar benchmark-session-reads');
  }

  await mongoose.connect(mongoUri);

  try {
    const fixture = await createBenchmarkFixture(benchmarkId);

    const baseline = await runModeBenchmark({
      modeName: 'baseline_no_lean',
      leanEnabled: false,
      token: fixture.token,
      sessionId: fixture.sessionId
    });

    const optimized = await runModeBenchmark({
      modeName: 'optimized_lean',
      leanEnabled: true,
      token: fixture.token,
      sessionId: fixture.sessionId
    });

    const report = {
      generatedAt: new Date().toISOString(),
      iterations: BENCH_ITERATIONS,
      warmupIterations: WARMUP_ITERATIONS,
      baseline,
      optimized,
      improvement: {
        list: {
          avgPercent: calculateImprovement(baseline.list.avgMs, optimized.list.avgMs),
          p95Percent: calculateImprovement(baseline.list.p95Ms, optimized.list.p95Ms)
        },
        detail: {
          avgPercent: calculateImprovement(baseline.detail.avgMs, optimized.detail.avgMs),
          p95Percent: calculateImprovement(baseline.detail.p95Ms, optimized.detail.p95Ms)
        }
      }
    };

    console.log(JSON.stringify(report, null, 2));

    await cleanupFixture({ benchmarkId, teacherId: fixture.teacherId });
  } finally {
    await mongoose.disconnect();
  }
};

(async () => {
  try {
    await main();
  } catch (error) {
    console.error('[benchmark-session-reads] Error:', error.message);
    process.exitCode = 1;
  }
})();
