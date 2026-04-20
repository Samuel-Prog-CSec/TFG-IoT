/**
 * @fileoverview Verifica que los endpoints de analyticsController cachean su resultado
 * en Redis bajo el namespace cache:analytics con la key esperada. Si el handler
 * pierde el wrap de cacheGet en el futuro, este test falla porque no se crearán
 * las keys esperadas en Redis.
 *
 * Usa ioredis-mock + spyOn de analyticsService para aislar del flujo real.
 */

const { connectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const analyticsService = require('../src/services/analyticsService');
const consentService = require('../src/services/consentService');
const ownershipHelpers = require('../src/utils/ownershipHelpers');
const controller = require('../src/controllers/analyticsController');

const TEACHER_ID = '65a1b2c3d4e5f6789012abcd';

const buildReq = (overrides = {}) => ({
  user: { _id: { toString: () => TEACHER_ID } },
  params: {},
  query: {},
  ...overrides
});

const buildRes = () => {
  const res = { status: null, json: null };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('analyticsController cache coverage', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  beforeEach(async () => {
    await redisService.flushNamespace('cache:analytics');

    jest.spyOn(consentService, 'requireConsent').mockResolvedValue(undefined);
    jest.spyOn(ownershipHelpers, 'ensureStudentBelongsToTeacher').mockResolvedValue(undefined);

    jest.spyOn(analyticsService, 'getStudentProgress').mockResolvedValue({ type: 'progress' });
    jest.spyOn(analyticsService, 'getStudentDifficulties').mockResolvedValue({ type: 'diff' });
    jest.spyOn(analyticsService, 'getClassroomSummary').mockResolvedValue({ type: 'summary' });
    jest
      .spyOn(analyticsService, 'getClassroomComparison')
      .mockResolvedValue({ type: 'comparison' });
    jest.spyOn(analyticsService, 'getClassroomDifficulties').mockResolvedValue({ type: 'cdiff' });
    jest.spyOn(analyticsService, 'getClassroomStudents').mockResolvedValue([]);
    jest.spyOn(analyticsService, 'getClassroomDistribution').mockResolvedValue({ type: 'dist' });
    jest.spyOn(analyticsService, 'getClassroomTrends').mockResolvedValue({ type: 'trends' });
    jest.spyOn(analyticsService, 'getStudentSummary').mockResolvedValue({ type: 'ssum' });
    jest.spyOn(analyticsService, 'getClassroomHeatmap').mockResolvedValue({ type: 'heat' });
    jest.spyOn(analyticsService, 'getTopContextsAndMechanics').mockResolvedValue({ type: 'rank' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const cases = [
    {
      name: 'getStudentProgress',
      req: { params: { id: 'stu-1' }, query: { timeRange: '7d' } },
      expectedKey: 'student:progress:stu-1:7d',
      serviceMethod: 'getStudentProgress'
    },
    {
      name: 'getStudentDifficulties',
      req: { params: { id: 'stu-2' } },
      expectedKey: 'student:difficulties:stu-2',
      serviceMethod: 'getStudentDifficulties'
    },
    {
      name: 'getClassroomSummary',
      req: {},
      expectedKey: `summary:${TEACHER_ID}`,
      serviceMethod: 'getClassroomSummary'
    },
    {
      name: 'getClassroomComparison',
      req: { query: { timeRange: '30d' } },
      expectedKey: `comparison:${TEACHER_ID}:30d`,
      serviceMethod: 'getClassroomComparison'
    },
    {
      name: 'getClassroomDifficulties',
      req: {},
      expectedKey: `difficulties:${TEACHER_ID}`,
      serviceMethod: 'getClassroomDifficulties'
    },
    {
      name: 'getClassroomDistribution',
      req: {},
      expectedKey: `distribution:${TEACHER_ID}`,
      serviceMethod: 'getClassroomDistribution'
    },
    {
      name: 'getClassroomTrends',
      req: { query: { timeRange: '7d' } },
      expectedKey: `trends:${TEACHER_ID}:7d`,
      serviceMethod: 'getClassroomTrends'
    },
    {
      name: 'getStudentSummary',
      req: { params: { id: 'stu-3' }, query: { timeRange: '7d' } },
      expectedKey: 'student:summary:stu-3:7d',
      serviceMethod: 'getStudentSummary'
    },
    {
      name: 'getClassroomHeatmap',
      req: {},
      expectedKey: `heatmap:${TEACHER_ID}:default`,
      serviceMethod: 'getClassroomHeatmap'
    },
    {
      name: 'getClassroomRankings',
      req: { query: { timeRange: '7d', limit: '3' } },
      expectedKey: `rankings:${TEACHER_ID}:7d:3`,
      serviceMethod: 'getTopContextsAndMechanics'
    }
  ];

  for (const { name, req, expectedKey, serviceMethod } of cases) {
    it(`${name} cachea el resultado bajo cache:analytics:${expectedKey}`, async () => {
      const r = buildReq(req);
      const res = buildRes();

      await controller[name](r, res);
      // Fire-and-forget de cacheGet: esperar a que la escritura se propague
      await new Promise(resolve => setTimeout(resolve, 50));

      const cached = await redisService.get('cache:analytics', expectedKey);
      expect(cached).not.toBeNull();

      // Segunda llamada: no debe volver a ejecutar el servicio (cache HIT)
      analyticsService[serviceMethod].mockClear();
      await controller[name](buildReq(req), buildRes());
      expect(analyticsService[serviceMethod]).not.toHaveBeenCalled();
    });
  }

  it('getClassroomStudents cachea bajo una key que incluye todos los filtros', async () => {
    const req = buildReq({ query: { sort: 'score', order: 'desc', tier: 'good' } });
    const res = buildRes();
    await controller.getClassroomStudents(req, res);
    await new Promise(resolve => setTimeout(resolve, 50));

    const scanned = await redisService.scanByNamespace('cache:analytics');
    const matchingKey = scanned.find(k => k.includes('students:') && k.includes(TEACHER_ID));
    expect(matchingKey).toBeDefined();
    expect(matchingKey).toContain('score');
    expect(matchingKey).toContain('desc');
    expect(matchingKey).toContain('good');
  });
});
