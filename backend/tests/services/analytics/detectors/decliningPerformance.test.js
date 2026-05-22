/**
 * @fileoverview Tests del detector `decliningPerformance` (T-941).
 *
 * Foco crítico:
 *  - Regresión BUG-T941-1: divide-by-zero cuando previousAvg=0 generaba
 *    falsa alerta crítica con Infinity%. Ahora se filtra antes del cálculo.
 *  - Generación correcta de warning vs critical según umbrales 10% / 20%.
 *  - No genera finding si el periodo previo tiene <2 partidas.
 */

const detector = require('../../../../src/services/analytics/detectors/decliningPerformance');
const gamePlayRepository = require('../../../../src/repositories/gamePlayRepository');

describe('decliningPerformance detector', () => {
  const teacherId = '64f000000000000000000001';
  const studentId = '64f000000000000000000002';

  const students = [
    {
      _id: studentId,
      name: 'Alumno X',
      studentMetrics: { lastPlayedAt: new Date(), averageScore: 50 }
    }
  ];

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('NO genera alerta cuando previousAvg=0 (fix divide-by-zero T-941)', async () => {
    jest.spyOn(gamePlayRepository, 'aggregate').mockResolvedValue([
      {
        _id: { playerId: studentId, period: 'previous' },
        avgScore: 0,
        count: 3,
        lastCompletedAt: new Date('2026-05-01')
      },
      {
        _id: { playerId: studentId, period: 'current' },
        avgScore: 30,
        count: 3,
        lastCompletedAt: new Date('2026-05-10')
      }
    ]);

    const findings = await detector.run({ teacherId, students });
    expect(findings).toHaveLength(0);
  });

  it('genera warning si caída entre 10% y 20%', async () => {
    jest.spyOn(gamePlayRepository, 'aggregate').mockResolvedValue([
      {
        _id: { playerId: studentId, period: 'previous' },
        avgScore: 80,
        count: 4,
        lastCompletedAt: new Date('2026-05-01')
      },
      {
        _id: { playerId: studentId, period: 'current' },
        avgScore: 70,
        count: 4,
        lastCompletedAt: new Date('2026-05-08')
      }
    ]);

    const findings = await detector.run({ teacherId, students });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].data.declinePercent).toBeCloseTo(12.5, 1);
  });

  it('genera critical si caída > 20%', async () => {
    jest.spyOn(gamePlayRepository, 'aggregate').mockResolvedValue([
      {
        _id: { playerId: studentId, period: 'previous' },
        avgScore: 80,
        count: 4,
        lastCompletedAt: new Date('2026-05-01')
      },
      {
        _id: { playerId: studentId, period: 'current' },
        avgScore: 50,
        count: 4,
        lastCompletedAt: new Date('2026-05-08')
      }
    ]);

    const findings = await detector.run({ teacherId, students });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('NO genera si menos de 2 partidas en alguno de los periodos', async () => {
    jest.spyOn(gamePlayRepository, 'aggregate').mockResolvedValue([
      {
        _id: { playerId: studentId, period: 'previous' },
        avgScore: 80,
        count: 1, // insuficiente
        lastCompletedAt: new Date('2026-05-01')
      },
      {
        _id: { playerId: studentId, period: 'current' },
        avgScore: 50,
        count: 4,
        lastCompletedAt: new Date('2026-05-08')
      }
    ]);

    const findings = await detector.run({ teacherId, students });
    expect(findings).toHaveLength(0);
  });

  it('devuelve [] si no hay students', async () => {
    const findings = await detector.run({ teacherId, students: [] });
    expect(findings).toEqual([]);
  });
});
