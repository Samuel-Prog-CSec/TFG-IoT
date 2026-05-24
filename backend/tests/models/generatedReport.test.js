/**
 * @fileoverview Tests del modelo GeneratedReport (T-942 Fase B).
 *
 * Cubre:
 * - TTL index sobre `generatedAt` (30 días, expireAfterSeconds).
 * - Hook pre-save: cap 100 por teacherId (drop-oldest).
 * - Hook pre-save: payloadSize recalculado del payload real.
 * - Ownership-friendly: filtros por teacherId devuelven solo los del owner.
 */

const mongoose = require('mongoose');

require('../../src/server'); // registra modelos

const GeneratedReport = require('../../src/models/GeneratedReport');

const teacherIdA = new mongoose.Types.ObjectId();
const teacherIdB = new mongoose.Types.ObjectId();

const buildReport = (overrides = {}) => ({
  teacherId: teacherIdA,
  reportType: 'classroom',
  period: '30d',
  format: 'summary',
  title: 'Informe de aula 30d',
  payload: { totalStudents: 10, avgScore: 75 },
  payloadSize: 0,
  ...overrides
});

describe('GeneratedReport model', () => {
  beforeAll(async () => {
    // Dropear la colección para garantizar que los índices del schema (TTL +
    // compuestos) se crean limpios — si una corrida anterior dejó un índice
    // sin `expireAfterSeconds`, `syncIndexes` falla por conflicto. Esto es
    // seguro: la colección se llena dentro de cada test.
    try {
      await GeneratedReport.collection.drop();
    } catch (err) {
      if (!/ns not found/i.test(err.message || '')) {
        throw err;
      }
    }
    await GeneratedReport.syncIndexes();
  });

  beforeEach(async () => {
    await GeneratedReport.deleteMany({});
  });

  afterAll(async () => {
    await GeneratedReport.deleteMany({});
  });

  it('declara el TTL index de 30 días sobre generatedAt', async () => {
    const indexes = await GeneratedReport.collection.indexes();
    const ttlIndex = indexes.find(
      idx => idx.key && idx.key.generatedAt === 1 && idx.expireAfterSeconds !== undefined
    );
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex.expireAfterSeconds).toBe(60 * 60 * 24 * 30);
  });

  it('calcula payloadSize en bytes desde el payload real en pre-save', async () => {
    const doc = await GeneratedReport.create(buildReport());
    const expectedSize = Buffer.byteLength(JSON.stringify(doc.payload), 'utf8');
    expect(doc.payloadSize).toBe(expectedSize);
    expect(doc.payloadSize).toBeGreaterThan(0);
  });

  it('respeta el cap MAX_REPORTS_PER_TEACHER haciendo drop del más antiguo', async () => {
    const cap = GeneratedReport.MAX_REPORTS_PER_TEACHER;
    expect(cap).toBe(100);

    // Insertamos `cap` informes con generatedAt creciente para forzar orden FIFO.
    // Usamos `insertMany` para velocidad (skip pre-save hooks de Mongoose en
    // batch) y luego una creación adicional con `.create()` que sí dispara el
    // hook y debe sacrificar el más antiguo.
    const baseTime = Date.now() - cap * 1000;
    const docsToInsert = [];
    for (let i = 0; i < cap; i += 1) {
      docsToInsert.push(
        buildReport({
          title: `Informe ${i + 1}`,
          generatedAt: new Date(baseTime + i * 1000),
          payloadSize: 30
        })
      );
    }
    await GeneratedReport.insertMany(docsToInsert);
    expect(await GeneratedReport.countDocuments({ teacherId: teacherIdA })).toBe(cap);

    const oldest = await GeneratedReport.findOne({ teacherId: teacherIdA })
      .sort({ generatedAt: 1 })
      .lean();
    expect(oldest.title).toBe('Informe 1');

    // Crear uno nuevo dispara el hook pre-save y debe borrar el más viejo.
    await GeneratedReport.create(
      buildReport({
        title: 'Informe nuevo',
        generatedAt: new Date()
      })
    );

    const count = await GeneratedReport.countDocuments({ teacherId: teacherIdA });
    expect(count).toBe(cap);

    const stillExistsOldest = await GeneratedReport.exists({
      teacherId: teacherIdA,
      title: 'Informe 1'
    });
    expect(stillExistsOldest).toBeNull();

    const newestExists = await GeneratedReport.exists({
      teacherId: teacherIdA,
      title: 'Informe nuevo'
    });
    expect(newestExists).not.toBeNull();
  }, 60_000); // generoso porque insertMany de 100 docs puede tardar

  it('aísla informes por teacherId (filtro por ownership)', async () => {
    await GeneratedReport.create(buildReport({ title: 'A1' }));
    await GeneratedReport.create(buildReport({ title: 'A2' }));
    await GeneratedReport.create(buildReport({ teacherId: teacherIdB, title: 'B1' }));

    const ownedByA = await GeneratedReport.find({ teacherId: teacherIdA });
    const ownedByB = await GeneratedReport.find({ teacherId: teacherIdB });
    expect(ownedByA).toHaveLength(2);
    expect(ownedByB).toHaveLength(1);
    expect(ownedByB[0].title).toBe('B1');
  });
});
