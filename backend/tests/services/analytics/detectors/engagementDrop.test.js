/**
 * @fileoverview Tests del detector `engagement_drop` y del batch de engagement
 * que lo alimenta (refactor de rendimiento N+1 → 2 agregaciones).
 *
 * Dos focos:
 *
 *  1. IGUALDAD BYTE-IDÉNTICA (el más importante): `computeStudentEngagementBatch`
 *     debe devolver, por alumno y ventana (30d/90d), EXACTAMENTE el mismo
 *     `engagementScore` que el cómputo individual `computeStudentEngagement`.
 *     Si divergen, el batch está mal y habría regresión en el detector.
 *
 *  2. REGRESIÓN DEL DETECTOR: `engagementDrop.run` produce los mismos findings
 *     (umbral, severidad, textos, forma de `data`) ejercitando el camino batch,
 *     y dispara solo 2 agregaciones (no N×2).
 *
 * Usa la Mongo de test (setup compartido). Los documentos se limpian en
 * `beforeEach`/`afterAll`.
 */

const mongoose = require('mongoose');

const engagementService = require('../../../../src/services/analytics/engagementService');
const engagementDrop = require('../../../../src/services/analytics/detectors/engagementDrop');
const gamePlayRepository = require('../../../../src/repositories/gamePlayRepository');
const GamePlay = require('../../../../src/models/GamePlay');
const User = require('../../../../src/models/User');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Crea un alumno mínimo (solo necesitamos `_id` para el detector/batch).
 */
const createStudent = (name = 'Alumno') =>
  User.create({
    name: `${name} ${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    role: 'student',
    status: 'active',
    createdBy: new mongoose.Types.ObjectId(),
    consent: { granted: true, grantedAt: new Date(), grantedBy: 'Tutor test' }
  });

/**
 * Inserta partidas para un alumno. Cada entrada de `plays` define el desfase en
 * días respecto a "ahora" (daysAgo), el status y opcionalmente el sessionId
 * (para forzar replays compartiendo sesión).
 *
 * @param {object} args
 * @param {import('mongoose').Types.ObjectId} args.playerId
 * @param {Array<{ daysAgo: number, status: string, sessionId?: any }>} args.plays
 */
const seedPlays = async ({ playerId, plays }) => {
  const now = Date.now();
  const docs = plays.map(p => {
    const startedAt = new Date(now - p.daysAgo * DAY_MS);
    const isCompleted = p.status === 'completed';
    return {
      sessionId: p.sessionId || new mongoose.Types.ObjectId(),
      playerId,
      status: p.status,
      score: isCompleted ? 50 : 0,
      startedAt,
      // completedAt solo para completadas (igual que en producción).
      completedAt: isCompleted ? new Date(startedAt.getTime() + 60_000) : undefined,
      metrics: { totalAttempts: 5 }
    };
  });
  await GamePlay.insertMany(docs);
};

/**
 * Score individual SIN caché para una ventana (usa la versión no cacheada
 * exportada a propósito para tests).
 */
const individualScore = (studentId, timeRange) =>
  engagementService
    .computeStudentEngagement(studentId.toString(), timeRange)
    .then(r => r.engagementScore);

const cleanup = () => Promise.all([User.deleteMany({}), GamePlay.deleteMany({})]);

describe('engagementService.computeStudentEngagementBatch — igualdad byte-idéntica', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  afterEach(() => jest.restoreAllMocks());

  it('da el MISMO score que computeStudentEngagement por alumno (30d y 90d)', async () => {
    // Alumno A: activo y regular dentro de 30d, con replays (2 partidas misma sesión).
    const sharedSessionA = new mongoose.Types.ObjectId();
    const a = await createStudent('Activo');
    await seedPlays({
      playerId: a._id,
      plays: [
        { daysAgo: 2, status: 'completed', sessionId: sharedSessionA },
        { daysAgo: 3, status: 'completed', sessionId: sharedSessionA }, // replay
        { daysAgo: 6, status: 'completed' },
        { daysAgo: 9, status: 'abandoned' },
        { daysAgo: 12, status: 'in-progress' },
        { daysAgo: 18, status: 'paused' }
      ]
    });

    // Alumno B: la mayoría de su actividad cae FUERA de 30d pero DENTRO de 90d,
    // de modo que el score de 30d y el de 90d difieran de verdad.
    const sharedSessionB = new mongoose.Types.ObjectId();
    const b = await createStudent('Decae');
    await seedPlays({
      playerId: b._id,
      plays: [
        { daysAgo: 5, status: 'completed' },
        { daysAgo: 40, status: 'completed', sessionId: sharedSessionB },
        { daysAgo: 41, status: 'completed', sessionId: sharedSessionB }, // replay solo en 90d
        { daysAgo: 55, status: 'completed' },
        { daysAgo: 70, status: 'abandoned' },
        { daysAgo: 80, status: 'completed' }
      ]
    });

    // Alumno C: SIN partidas en ninguna ventana (borde: dataset vacío → 10).
    const c = await createStudent('Vacio');

    const ids = [a._id, b._id, c._id];

    const [batch30, batch90] = await Promise.all([
      engagementService.computeStudentEngagementBatch(
        ids.map(id => id.toString()),
        '30d'
      ),
      engagementService.computeStudentEngagementBatch(
        ids.map(id => id.toString()),
        '90d'
      )
    ]);

    for (const id of ids) {
      const sid = id.toString();
      const [ind30, ind90] = await Promise.all([
        individualScore(id, '30d'),
        individualScore(id, '90d')
      ]);

      expect(batch30.get(sid)).toBe(ind30);
      expect(batch90.get(sid)).toBe(ind90);
    }

    // Sanidad: el borde vacío vale exactamente 10 (componente intervalo=100×0.1).
    expect(batch30.get(c._id.toString())).toBe(10);
    expect(batch90.get(c._id.toString())).toBe(10);

    // Sanidad: B realmente difiere entre ventanas (no es un test trivial).
    expect(batch30.get(b._id.toString())).not.toBe(batch90.get(b._id.toString()));
  });

  it('una corrida del batch ejecuta UNA sola agregación por ventana', async () => {
    const students = await Promise.all([
      createStudent('S1'),
      createStudent('S2'),
      createStudent('S3')
    ]);
    for (const s of students) {
      await seedPlays({ playerId: s._id, plays: [{ daysAgo: 3, status: 'completed' }] });
    }

    const aggSpy = jest.spyOn(gamePlayRepository, 'aggregate');
    await engagementService.computeStudentEngagementBatch(
      students.map(s => s._id.toString()),
      '30d'
    );
    expect(aggSpy).toHaveBeenCalledTimes(1);
  });

  it('devuelve un Map vacío si no hay studentIds', async () => {
    const result = await engagementService.computeStudentEngagementBatch([], '30d');
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});

describe('engagementDrop detector — camino batch (regresión)', () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  afterEach(() => jest.restoreAllMocks());

  it('devuelve [] si no hay students', async () => {
    const findings = await engagementDrop.run({ students: [] });
    expect(findings).toEqual([]);
  });

  it('genera warning cuando el engagement de 30d cae >25% respecto a 90d', async () => {
    // Mockeamos el batch para controlar el escenario de forma determinista:
    // previousScore(90d)=80 ≥20, currentScore(30d)=40 → caída 50% > 25%.
    const student = { _id: new mongoose.Types.ObjectId() };
    const sid = student._id.toString();

    jest
      .spyOn(engagementService, 'computeStudentEngagementBatch')
      .mockImplementation((ids, range) =>
        Promise.resolve(new Map([[sid, range === '90d' ? 80 : 40]]))
      );

    const referenceDate = new Date('2026-06-01T00:00:00Z');
    const findings = await engagementDrop.run({ students: [student], referenceDate });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      studentId: sid,
      type: 'engagement_drop',
      severity: 'warning',
      detectedAt: referenceDate,
      data: { currentScore: 40, previousScore: 80, dropPercent: 50 }
    });
    expect(findings[0].description).toContain('50%');
  });

  it('NO genera si previousScore < 20 (datos insuficientes)', async () => {
    const student = { _id: new mongoose.Types.ObjectId() };
    const sid = student._id.toString();
    jest
      .spyOn(engagementService, 'computeStudentEngagementBatch')
      .mockImplementation((ids, range) =>
        Promise.resolve(new Map([[sid, range === '90d' ? 15 : 5]]))
      );

    const findings = await engagementDrop.run({ students: [student] });
    expect(findings).toHaveLength(0);
  });

  it('NO genera si la caída es <= umbral (25%)', async () => {
    const student = { _id: new mongoose.Types.ObjectId() };
    const sid = student._id.toString();
    // 80 → 64 = caída exacta del 20% (≤ 25) → sin alerta.
    jest
      .spyOn(engagementService, 'computeStudentEngagementBatch')
      .mockImplementation((ids, range) =>
        Promise.resolve(new Map([[sid, range === '90d' ? 80 : 64]]))
      );

    const findings = await engagementDrop.run({ students: [student] });
    expect(findings).toHaveLength(0);
  });

  it('run() dispara exactamente 2 agregaciones (batch 30d + 90d), no N×2', async () => {
    // 3 alumnos con partidas reales: con el N+1 previo habrían sido 6 agregaciones
    // (y además con $facet+$lookup). Ahora deben ser 2.
    const students = await Promise.all([
      createStudent('D1'),
      createStudent('D2'),
      createStudent('D3')
    ]);
    for (const s of students) {
      await seedPlays({
        playerId: s._id,
        plays: [
          { daysAgo: 2, status: 'completed' },
          { daysAgo: 50, status: 'completed' }
        ]
      });
    }

    const aggSpy = jest.spyOn(gamePlayRepository, 'aggregate');
    await engagementDrop.run({ students });
    expect(aggSpy).toHaveBeenCalledTimes(2);
  });

  it('integración real: detecta caída con datos sembrados (sin mocks)', async () => {
    // Alumno con mucha actividad reciente que se concentra en 90d pero apenas
    // en 30d → el score de 30d cae respecto al de 90d. Forzamos previousScore≥20.
    const student = await createStudent('Real');

    // 90d: actividad densa y regular (muchos días activos, replays) → score alto.
    const plays = [];
    const sharedSession = new mongoose.Types.ObjectId();
    // Bloque DENTRO de 90d pero FUERA de 30d (días 31..70): regularidad alta.
    for (let d = 31; d <= 70; d++) {
      plays.push({ daysAgo: d, status: 'completed' });
    }
    plays.push({ daysAgo: 35, status: 'completed', sessionId: sharedSession });
    plays.push({ daysAgo: 36, status: 'completed', sessionId: sharedSession }); // replay
    // Bloque DENTRO de 30d: muy poca actividad → score 30d bajo.
    plays.push({ daysAgo: 1, status: 'completed' });
    await seedPlays({ playerId: student._id, plays });

    const ind30 = await individualScore(student._id, '30d');
    const ind90 = await individualScore(student._id, '90d');

    const findings = await engagementDrop.run({ students: [student] });

    // El detector debe coincidir con lo que dictan los scores individuales.
    const expectDrop = ind90 >= 20 && ((ind90 - ind30) / ind90) * 100 > 25;
    if (expectDrop) {
      expect(findings).toHaveLength(1);
      expect(findings[0].data.previousScore).toBe(Math.round(ind90));
      expect(findings[0].data.currentScore).toBe(Math.round(ind30));
    } else {
      expect(findings).toHaveLength(0);
    }
  });
});
