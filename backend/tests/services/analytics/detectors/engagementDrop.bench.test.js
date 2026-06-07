/**
 * @fileoverview Benchmark (opt-in) del refactor N+1 de `engagement_drop`.
 *
 * Mide nº de agregaciones y tiempo de pared comparando:
 *   - ANTES (N+1, cache frío simulado): por cada alumno, el `$facet` + doble
 *     `$lookup` individual para 30d y 90d → N×2 agregaciones.
 *   - DESPUÉS: `engagementDrop.run` → 2 agregaciones batch.
 *
 * Se ejecuta SOLO con `RUN_ENGAGEMENT_BENCH=1` para no penalizar la suite normal
 * ni el CI. Siembra datos transitorios en `rfid-games-test` y los limpia al
 * terminar (reutiliza el setup compartido: ioredis-mock + Mongo de test).
 *
 *   RUN_ENGAGEMENT_BENCH=1 npx cross-env NODE_ENV=test jest engagementDrop.bench --coverage=false
 */

const mongoose = require('mongoose');

const engagementService = require('../../../../src/services/analytics/engagementService');
const engagementDrop = require('../../../../src/services/analytics/detectors/engagementDrop');
const gamePlayRepository = require('../../../../src/repositories/gamePlayRepository');
const GamePlay = require('../../../../src/models/GamePlay');
const User = require('../../../../src/models/User');

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN = process.env.RUN_ENGAGEMENT_BENCH === '1';
const STUDENT_COUNT = Number.parseInt(process.env.BENCH_STUDENTS, 10) || 30;
const PLAYS_PER_STUDENT = Number.parseInt(process.env.BENCH_PLAYS, 10) || 40;

const describeMaybe = RUN ? describe : describe.skip;

const cleanup = () => Promise.all([User.deleteMany({}), GamePlay.deleteMany({})]);

describeMaybe('engagement_drop benchmark N+1 vs batch (opt-in)', () => {
  jest.setTimeout(180000);

  let students;

  beforeAll(async () => {
    await cleanup();

    students = await Promise.all(
      Array.from({ length: STUDENT_COUNT }, (_, i) =>
        User.create({
          name: `Bench ${i}`,
          role: 'student',
          status: 'active',
          createdBy: new mongoose.Types.ObjectId(),
          consent: { granted: true, grantedAt: new Date(), grantedBy: 'Tutor bench' }
        })
      )
    );

    // ~40 partidas por alumno, repartidas en 90 días, con algunos replays
    // (sesión compartida) y una mezcla de status, para que el pipeline ejercite
    // todos los componentes.
    const now = Date.now();
    const docs = [];
    for (const s of students) {
      const sharedSession = new mongoose.Types.ObjectId();
      for (let j = 0; j < PLAYS_PER_STUDENT; j++) {
        const daysAgo = Math.floor((j / PLAYS_PER_STUDENT) * 89) + 1; // 1..89
        const startedAt = new Date(now - daysAgo * DAY_MS);
        const r = j % 5;
        let status = 'completed';
        if (r === 3) {
          status = 'abandoned';
        } else if (r === 4) {
          status = 'in-progress';
        }
        const isCompleted = status === 'completed';
        docs.push({
          // Cada 7ª partida comparte sesión → genera replays.
          sessionId: j % 7 === 0 ? sharedSession : new mongoose.Types.ObjectId(),
          playerId: s._id,
          status,
          score: isCompleted ? 50 : 0,
          startedAt,
          completedAt: isCompleted ? new Date(startedAt.getTime() + 60_000) : undefined,
          metrics: { totalAttempts: 5 }
        });
      }
    }
    await GamePlay.insertMany(docs);
  });

  afterAll(cleanup);

  it('reporta agregaciones y tiempo: N+1 (cache frío) vs batch', async () => {
    // ── ANTES: N+1 con cache frío (llamamos a la versión NO cacheada para cada
    // alumno × 2 ventanas, replicando el camino que tenía el detector). ────────
    const beforeSpy = jest.spyOn(gamePlayRepository, 'aggregate');
    const t0 = process.hrtime.bigint();
    for (const s of students) {
      const sid = s._id.toString();
      // Secuencial a propósito: representa el peor caso de cache frío en serie.
      // (El detector original las hacía en Promise.all por alumno, pero el coste
      //  de agregaciones es el mismo: N×2.)
      await engagementService.computeStudentEngagement(sid, '30d');
      await engagementService.computeStudentEngagement(sid, '90d');
    }
    const beforeMs = Number(process.hrtime.bigint() - t0) / 1e6;
    const beforeAggs = beforeSpy.mock.calls.length;
    beforeSpy.mockRestore();

    // ── DESPUÉS: el detector con batch (2 agregaciones). ──────────────────────
    const afterSpy = jest.spyOn(gamePlayRepository, 'aggregate');
    const t1 = process.hrtime.bigint();
    await engagementDrop.run({ students });
    const afterMs = Number(process.hrtime.bigint() - t1) / 1e6;
    const afterAggs = afterSpy.mock.calls.length;
    afterSpy.mockRestore();

    console.log('\n──────── engagement_drop benchmark ────────');
    console.log(`Alumnos: ${STUDENT_COUNT} · Partidas/alumno: ~${PLAYS_PER_STUDENT}`);
    console.log(`ANTES  (N+1, cache frío): ${beforeAggs} agregaciones · ${beforeMs.toFixed(1)} ms`);
    console.log(`DESPUÉS (batch x2)      : ${afterAggs} agregaciones · ${afterMs.toFixed(1)} ms`);
    console.log(
      `Reducción agregaciones: ${beforeAggs}→${afterAggs} (${(beforeAggs / afterAggs).toFixed(1)}×)` +
        ` · Speedup tiempo: ${(beforeMs / afterMs).toFixed(1)}×`
    );
    console.log('───────────────────────────────────────────\n');

    // El batch debe usar exactamente 2 agregaciones y el N+1 exactamente N×2.
    expect(afterAggs).toBe(2);
    expect(beforeAggs).toBe(STUDENT_COUNT * 2);
  });
});
