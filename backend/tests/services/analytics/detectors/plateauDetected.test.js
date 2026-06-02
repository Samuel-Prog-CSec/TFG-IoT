/**
 * @fileoverview Tests del detector `plateauDetected` — implementación nueva T-941.
 *
 * Antes de T-941, `plateau_detected` figuraba en ALERT_TYPES pero ningún
 * detector lo implementaba. Estos tests verifican que la tarea pendiente está resuelta.
 */

const detector = require('../../../../src/services/analytics/detectors/plateauDetected');
const gamePlayRepository = require('../../../../src/repositories/gamePlayRepository');

describe('plateauDetected detector (T-941)', () => {
  const studentId = '64f000000000000000000010';
  const students = [
    {
      _id: studentId,
      name: 'Alumno meseta',
      studentMetrics: { lastPlayedAt: new Date(), averageScore: 65 }
    }
  ];

  afterEach(() => jest.restoreAllMocks());

  it('genera alerta info cuando stdDev ≤ 5 en 5 partidas (meseta)', async () => {
    jest.spyOn(gamePlayRepository, 'aggregate').mockResolvedValue([
      {
        _id: studentId,
        recent: [65, 67, 64, 66, 65],
        lastCompletedAt: new Date('2026-05-10')
      }
    ]);

    const findings = await detector.run({ students });
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('plateau_detected');
    expect(findings[0].severity).toBe('info');
    expect(findings[0].data.gamesAnalyzed).toBe(5);
    expect(findings[0].data.averageScore).toBeCloseTo(65, 0);
  });

  it('NO genera cuando hay variación alta (stdDev > 5)', async () => {
    jest.spyOn(gamePlayRepository, 'aggregate').mockResolvedValue([
      {
        _id: studentId,
        recent: [50, 70, 40, 80, 60],
        lastCompletedAt: new Date('2026-05-10')
      }
    ]);

    const findings = await detector.run({ students });
    expect(findings).toHaveLength(0);
  });

  it('NO genera cuando hay menos de 5 partidas', async () => {
    jest.spyOn(gamePlayRepository, 'aggregate').mockResolvedValue([
      {
        _id: studentId,
        recent: [65, 65, 65],
        lastCompletedAt: new Date('2026-05-10')
      }
    ]);

    const findings = await detector.run({ students });
    expect(findings).toHaveLength(0);
  });
});
