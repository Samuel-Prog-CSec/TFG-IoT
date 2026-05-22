/**
 * @fileoverview Tests del detector `pendingTeachersAging` (T-942).
 */

const detector = require('../../../../src/services/analytics/systemDetectors/pendingTeachersAging');
const userRepository = require('../../../../src/repositories/userRepository');

describe('pendingTeachersAging detector', () => {
  afterEach(() => jest.restoreAllMocks());

  const buildTeacher = (createdAt, email = 'pending@test.com') => ({
    _id: '64f000000000000000000099',
    name: 'Pending Teacher',
    email,
    createdAt
  });

  it('NO genera si no hay teachers pending', async () => {
    jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
    const findings = await detector.run({ now: new Date() });
    expect(findings).toHaveLength(0);
  });

  it('NO genera si el más antiguo lleva menos de 48 horas', async () => {
    jest
      .spyOn(userRepository, 'findOne')
      .mockResolvedValue(buildTeacher(new Date(Date.now() - 5 * 60 * 60 * 1000)));
    const findings = await detector.run({ now: new Date() });
    expect(findings).toHaveLength(0);
  });

  it('genera warning entre 48h y 7 días', async () => {
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    jest.spyOn(userRepository, 'findOne').mockResolvedValue(buildTeacher(fiveDaysAgo));
    jest
      .spyOn(userRepository, 'find')
      .mockResolvedValue([
        buildTeacher(fiveDaysAgo),
        buildTeacher(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), 'p2@test.com')
      ]);

    const findings = await detector.run({ now });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].type).toBe('pending_teachers_aging');
    expect(findings[0].data.totalPending).toBe(2);
    expect(findings[0].data.oldestAgeHours).toBeGreaterThanOrEqual(48);
  });

  it('genera critical si supera 7 días', async () => {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    jest.spyOn(userRepository, 'findOne').mockResolvedValue(buildTeacher(tenDaysAgo));
    jest.spyOn(userRepository, 'find').mockResolvedValue([buildTeacher(tenDaysAgo)]);

    const findings = await detector.run({ now });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('critical');
  });

  it('retorna [] si la query lanza', async () => {
    jest.spyOn(userRepository, 'findOne').mockRejectedValue(new Error('boom'));
    const findings = await detector.run({ now: new Date() });
    expect(findings).toEqual([]);
  });
});
