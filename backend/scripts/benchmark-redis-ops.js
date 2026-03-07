#!/usr/bin/env node

/**
 * @fileoverview Benchmark comparativo: operaciones secuenciales vs Lua atómicas vs pipeline.
 *
 * Mide el rendimiento real de las operaciones de card locks para documentar
 * la mejora introducida por T-066. Requiere Redis en ejecución.
 *
 * Uso:
 *   node scripts/benchmark-redis-ops.js [--cards=20] [--iterations=100]
 *
 * Resultados:
 *   Imprime tabla comparativa con latencia p50/p95/p99 y throughput.
 *
 * @module scripts/benchmark-redis-ops
 * @author Samuel Blanchart Pérez
 * @version 1.0.0
 */

const { connectRedis, disconnectRedis, getRedis, getKeyPrefix } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const logger = require('../src/utils/logger');

// Parsear argumentos
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace('--', '').split('=');
  acc[key] = Number(val) || val;
  return acc;
}, {});

const NUM_CARDS = args.cards || 20;
const ITERATIONS = args.iterations || 100;
const TTL_SECONDS = 90;
const PLAY_ID = 'bench-play-001';

/**
 * Genera UIDs de tarjetas para el benchmark.
 * @param {number} count
 * @returns {string[]}
 */
const generateCardUids = count =>
  Array.from({ length: count }, (_, i) => `BENCH_${String(i + 1).padStart(4, '0')}`);

/**
 * Calcula percentiles de un array de latencias.
 */
const percentiles = arr => {
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    min: sorted[0],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
    max: sorted[sorted.length - 1],
    avg: (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)
  };
};

/**
 * Benchmark: Reserva SECUENCIAL (setManyIfNotExists — patrón anterior).
 */
const benchmarkSequentialReserve = async cardUids => {
  const entries = cardUids.map(uid => ({ id: uid, value: PLAY_ID }));
  const latencies = [];

  for (let i = 0; i < ITERATIONS; i++) {
    // Limpiar antes de cada iteración
    await redisService.delMany(redisService.NAMESPACES.CARD, cardUids);

    const start = process.hrtime.bigint();
    await redisService.setManyIfNotExists(redisService.NAMESPACES.CARD, entries, TTL_SECONDS);
    const end = process.hrtime.bigint();

    latencies.push(Number(end - start) / 1e6); // ns → ms
  }

  // Limpiar
  await redisService.delMany(redisService.NAMESPACES.CARD, cardUids);
  return latencies;
};

/**
 * Benchmark: Reserva ATÓMICA Lua (reserveCardsAtomic — patrón nuevo).
 */
const benchmarkAtomicReserve = async cardUids => {
  const entries = cardUids.map(uid => ({ id: uid, value: PLAY_ID }));
  const latencies = [];

  for (let i = 0; i < ITERATIONS; i++) {
    await redisService.delMany(redisService.NAMESPACES.CARD, cardUids);

    const start = process.hrtime.bigint();
    await redisService.reserveCardsAtomic(redisService.NAMESPACES.CARD, entries, TTL_SECONDS);
    const end = process.hrtime.bigint();

    latencies.push(Number(end - start) / 1e6);
  }

  await redisService.delMany(redisService.NAMESPACES.CARD, cardUids);
  return latencies;
};

/**
 * Benchmark: Liberación SECUENCIAL (delManyIfValueMatches — patrón anterior).
 */
const benchmarkSequentialRelease = async cardUids => {
  const entries = cardUids.map(uid => ({ id: uid, expectedValue: PLAY_ID }));
  const latencies = [];

  for (let i = 0; i < ITERATIONS; i++) {
    // Pre-reservar
    for (const uid of cardUids) {
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, uid, PLAY_ID, TTL_SECONDS);
    }

    const start = process.hrtime.bigint();
    await redisService.delManyIfValueMatches(redisService.NAMESPACES.CARD, entries);
    const end = process.hrtime.bigint();

    latencies.push(Number(end - start) / 1e6);
  }

  return latencies;
};

/**
 * Benchmark: Liberación ATÓMICA Lua (releaseCardsAtomic — patrón nuevo).
 */
const benchmarkAtomicRelease = async cardUids => {
  const entries = cardUids.map(uid => ({ id: uid, expectedValue: PLAY_ID }));
  const latencies = [];

  for (let i = 0; i < ITERATIONS; i++) {
    for (const uid of cardUids) {
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, uid, PLAY_ID, TTL_SECONDS);
    }

    const start = process.hrtime.bigint();
    await redisService.releaseCardsAtomic(redisService.NAMESPACES.CARD, entries);
    const end = process.hrtime.bigint();

    latencies.push(Number(end - start) / 1e6);
  }

  return latencies;
};

/**
 * Benchmark: Renovación SECUENCIAL de lease (patrón anterior).
 */
const benchmarkSequentialRenew = async cardUids => {
  const latencies = [];

  for (let i = 0; i < ITERATIONS; i++) {
    // Preparar estado
    await redisService.hset(redisService.NAMESPACES.PLAY, PLAY_ID, { playDocId: PLAY_ID });
    for (const uid of cardUids) {
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, uid, PLAY_ID, 30);
    }

    const start = process.hrtime.bigint();
    // Patrón antiguo: expire play + expireManyIfValueMatches cards
    await redisService.expire(redisService.NAMESPACES.PLAY, PLAY_ID, TTL_SECONDS);
    const cardEntries = cardUids.map(uid => ({ id: uid, expectedValue: PLAY_ID }));
    await redisService.expireManyIfValueMatches(
      redisService.NAMESPACES.CARD,
      cardEntries,
      TTL_SECONDS
    );
    const end = process.hrtime.bigint();

    latencies.push(Number(end - start) / 1e6);
  }

  // Limpiar
  await redisService.del(redisService.NAMESPACES.PLAY, PLAY_ID);
  await redisService.delMany(redisService.NAMESPACES.CARD, cardUids);
  return latencies;
};

/**
 * Benchmark: Renovación ATÓMICA Lua (patrón nuevo).
 */
const benchmarkAtomicRenew = async cardUids => {
  const latencies = [];

  for (let i = 0; i < ITERATIONS; i++) {
    await redisService.hset(redisService.NAMESPACES.PLAY, PLAY_ID, { playDocId: PLAY_ID });
    for (const uid of cardUids) {
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, uid, PLAY_ID, 30);
    }

    const start = process.hrtime.bigint();
    await redisService.renewLeaseAtomic(
      redisService.NAMESPACES.PLAY,
      PLAY_ID,
      redisService.NAMESPACES.CARD,
      cardUids,
      TTL_SECONDS
    );
    const end = process.hrtime.bigint();

    latencies.push(Number(end - start) / 1e6);
  }

  await redisService.del(redisService.NAMESPACES.PLAY, PLAY_ID);
  await redisService.delMany(redisService.NAMESPACES.CARD, cardUids);
  return latencies;
};

/**
 * Benchmark: hgetall N+1 (patrón anterior recovery).
 */
const benchmarkSequentialHgetall = async playIds => {
  const latencies = [];

  for (let i = 0; i < ITERATIONS; i++) {
    // Preparar estado
    for (const id of playIds) {
      await redisService.hset(redisService.NAMESPACES.PLAY, id, { playDocId: id });
    }

    const start = process.hrtime.bigint();
    for (const id of playIds) {
      await redisService.hgetall(redisService.NAMESPACES.PLAY, id);
    }
    const end = process.hrtime.bigint();

    latencies.push(Number(end - start) / 1e6);
  }

  // Limpiar
  for (const id of playIds) {
    await redisService.hdel(redisService.NAMESPACES.PLAY, id, ['playDocId']);
  }
  return latencies;
};

/**
 * Benchmark: hgetallMany pipeline (patrón nuevo recovery).
 */
const benchmarkPipelineHgetall = async playIds => {
  const latencies = [];

  for (let i = 0; i < ITERATIONS; i++) {
    for (const id of playIds) {
      await redisService.hset(redisService.NAMESPACES.PLAY, id, { playDocId: id });
    }

    const start = process.hrtime.bigint();
    await redisService.hgetallMany(redisService.NAMESPACES.PLAY, playIds);
    const end = process.hrtime.bigint();

    latencies.push(Number(end - start) / 1e6);
  }

  for (const id of playIds) {
    await redisService.hdel(redisService.NAMESPACES.PLAY, id, ['playDocId']);
  }
  return latencies;
};

/**
 * Imprime la tabla de resultados.
 */
const printResults = (label, seqLatencies, atomicLatencies) => {
  const seq = percentiles(seqLatencies);
  const atomic = percentiles(atomicLatencies);
  const speedup = (seq.p50 / atomic.p50).toFixed(1);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'═'.repeat(70)}`);
  console.log(
    `  ${'Métrica'.padEnd(15)} | ${'Secuencial'.padEnd(15)} | ${'Atómico/Pipeline'.padEnd(15)} | Speedup`
  );
  console.log(`  ${'-'.repeat(15)} | ${'-'.repeat(15)} | ${'-'.repeat(15)} | -------`);
  console.log(
    `  ${'p50 (ms)'.padEnd(15)} | ${String(seq.p50).padEnd(15)} | ${String(atomic.p50).padEnd(15)} | ${speedup}x`
  );
  console.log(
    `  ${'p95 (ms)'.padEnd(15)} | ${String(seq.p95).padEnd(15)} | ${String(atomic.p95).padEnd(15)} |`
  );
  console.log(
    `  ${'p99 (ms)'.padEnd(15)} | ${String(seq.p99).padEnd(15)} | ${String(atomic.p99).padEnd(15)} |`
  );
  console.log(
    `  ${'avg (ms)'.padEnd(15)} | ${String(seq.avg).padEnd(15)} | ${String(atomic.avg).padEnd(15)} |`
  );
};

const main = async () => {
  console.log(`\n🔬 Benchmark Redis Operations — T-066`);
  console.log(`   Cards: ${NUM_CARDS} | Iterations: ${ITERATIONS}`);
  console.log(`   Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}\n`);

  try {
    await connectRedis();
    logger.level = 'error'; // Silenciar logs durante benchmark

    const cardUids = generateCardUids(NUM_CARDS);
    const playIds = Array.from({ length: 10 }, (_, i) => `bench-play-${i + 1}`);

    // 1. Reserve
    console.log('▶ Benchmark: Reserva de tarjetas...');
    const seqReserve = await benchmarkSequentialReserve(cardUids);
    const atomicReserve = await benchmarkAtomicReserve(cardUids);
    printResults(`RESERVA (${NUM_CARDS} cards)`, seqReserve, atomicReserve);

    // 2. Release
    console.log('\n▶ Benchmark: Liberación de tarjetas...');
    const seqRelease = await benchmarkSequentialRelease(cardUids);
    const atomicRelease = await benchmarkAtomicRelease(cardUids);
    printResults(`LIBERACIÓN (${NUM_CARDS} cards)`, seqRelease, atomicRelease);

    // 3. Renew Lease
    console.log('\n▶ Benchmark: Renovación de lease...');
    const seqRenew = await benchmarkSequentialRenew(cardUids);
    const atomicRenew = await benchmarkAtomicRenew(cardUids);
    printResults(`RENOVACIÓN LEASE (1 play + ${NUM_CARDS} cards)`, seqRenew, atomicRenew);

    // 4. Recovery hgetall
    console.log('\n▶ Benchmark: Recovery hgetall...');
    const seqHgetall = await benchmarkSequentialHgetall(playIds);
    const pipelineHgetall = await benchmarkPipelineHgetall(playIds);
    printResults(`RECOVERY HGETALL (${playIds.length} plays)`, seqHgetall, pipelineHgetall);

    console.log(`\n${'═'.repeat(70)}`);
    console.log('  ✅ Benchmark completado');
    console.log(`${'═'.repeat(70)}\n`);
  } catch (error) {
    console.error('Error en benchmark:', error);
  } finally {
    await disconnectRedis();
    process.exit(0);
  }
};

main();
