const mockAdminPing = jest.fn();
const mockIsRedisConnected = jest.fn();
const mockPingRedis = jest.fn();

jest.mock('mongoose', () => ({
  connection: {
    db: {
      admin: () => ({
        ping: mockAdminPing
      })
    },
    readyState: 1,
    host: 'localhost',
    name: 'test-db'
  }
}));

// Mock de Redis config
jest.mock('../src/config/redis', () => ({
  isRedisConnected: () => mockIsRedisConnected(),
  ping: () => mockPingRedis()
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('healthCheck utils', () => {
  beforeEach(() => {
    jest.resetModules();
    mockAdminPing.mockReset();
    mockIsRedisConnected.mockReset();
    mockPingRedis.mockReset();
    // Por defecto, Redis está conectado
    mockIsRedisConnected.mockReturnValue(true);
    mockPingRedis.mockResolvedValue({ connected: true, latency: 1 });
  });

  it('checkRFIDHealth returns not_initialized when no service', async () => {
    const { checkRFIDHealth } = require('../src/utils/healthCheck');

    const res = checkRFIDHealth(null);
    expect(res.status).toBe('not_initialized');
  });

  it('checkRFIDHealth returns stopped when service is stopped', async () => {
    const { checkRFIDHealth } = require('../src/utils/healthCheck');

    const res = checkRFIDHealth({
      getStatus: () => ({
        status: 'stopped',
        source: 'client'
      })
    });

    expect(res.status).toBe('stopped');
    expect(res.source).toBe('client');
  });

  it('checkRFIDHealth returns healthy when service is client_ready', async () => {
    const { checkRFIDHealth } = require('../src/utils/healthCheck');

    const res = checkRFIDHealth({
      getStatus: () => ({
        status: 'client_ready',
        source: 'client'
      })
    });

    expect(res.status).toBe('healthy');
  });

  it('checkRFIDHealth returns error on exception', async () => {
    const { checkRFIDHealth } = require('../src/utils/healthCheck');

    const res = checkRFIDHealth({
      getStatus: () => {
        throw new Error('boom');
      }
    });

    expect(res.status).toBe('error');
    expect(res.error).toBe('boom');
  });

  it('checkMongoDBHealth returns healthy on ping', async () => {
    mockAdminPing.mockResolvedValueOnce({ ok: 1 });

    const { checkMongoDBHealth } = require('../src/utils/healthCheck');

    const res = await checkMongoDBHealth();
    expect(res.status).toBe('healthy');
    expect(res.state).toBe('connected');
    expect(res).toHaveProperty('responseTime');
    expect(res.host).toBe('localhost');
    expect(res.database).toBe('test-db');
  });

  it('checkMongoDBHealth returns unhealthy on ping error', async () => {
    mockAdminPing.mockRejectedValueOnce(new Error('nope'));

    const { checkMongoDBHealth } = require('../src/utils/healthCheck');

    const res = await checkMongoDBHealth();
    expect(res.status).toBe('unhealthy');
    expect(res.state).toBe('error');
    expect(res.error).toBe('nope');
  });

  it('getMemoryUsage returns formatted MB values', async () => {
    const original = process.memoryUsage;
    process.memoryUsage = () => ({
      rss: 10 * 1024 * 1024,
      heapTotal: 20 * 1024 * 1024,
      heapUsed: 5 * 1024 * 1024,
      external: 1 * 1024 * 1024
    });

    const { getMemoryUsage } = require('../src/utils/healthCheck');
    const res = getMemoryUsage();

    expect(res.rss).toBe('10 MB');
    expect(res.heapTotal).toBe('20 MB');
    expect(res.heapUsed).toBe('5 MB');
    expect(res.external).toBe('1 MB');
    expect(res.heapUsedPercentage).toBe('25%');

    process.memoryUsage = original;
  });

  it('getUptime formats uptime correctly', async () => {
    const original = process.uptime;
    process.uptime = () => 3661; // 1h 1m 1s

    const { getUptime } = require('../src/utils/healthCheck');
    expect(getUptime()).toBe('1h 1m 1s');

    process.uptime = original;
  });

  it('getHealthStatus aggregates info', async () => {
    mockAdminPing.mockResolvedValueOnce({ ok: 1 });

    const { getHealthStatus } = require('../src/utils/healthCheck');

    const res = await getHealthStatus({
      getStatus: () => ({
        status: 'client_ready',
        source: 'client'
      })
    });

    expect(res.status).toBe('healthy');
    expect(res).toHaveProperty('issues');
    expect(res.issues).toHaveProperty('critical');
    expect(res.issues).toHaveProperty('degraded');
    expect(res.issues.critical).toEqual([]);
    expect(res.issues.degraded).toEqual([]);
    expect(res.services.mongodb.status).toBe('healthy');
    expect(res.services.rfid.status).toBe('healthy');
    expect(res.system).toHaveProperty('pid');
  });

  it('getHealthStatus returns degraded in non-production when Redis is down', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    mockAdminPing.mockResolvedValueOnce({ ok: 1 });
    mockIsRedisConnected.mockReturnValue(false);

    const { getHealthStatus } = require('../src/utils/healthCheck');

    const res = await getHealthStatus({
      getStatus: () => ({
        status: 'client_ready',
        source: 'client'
      })
    });

    expect(res.services.mongodb.status).toBe('healthy');
    expect(res.services.redis.status).toBe('disconnected');
    expect(res.status).toBe('degraded');
    expect(res.issues.critical).toEqual([]);
    expect(res.issues.degraded).toEqual(['redis']);

    process.env.NODE_ENV = originalEnv;
  });

  it('getHealthStatus returns unhealthy in production when Redis is down', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    mockAdminPing.mockResolvedValueOnce({ ok: 1 });
    mockIsRedisConnected.mockReturnValue(false);

    const { getHealthStatus } = require('../src/utils/healthCheck');

    const res = await getHealthStatus({
      getStatus: () => ({
        status: 'client_ready',
        source: 'client'
      })
    });

    expect(res.services.mongodb.status).toBe('healthy');
    expect(res.services.redis.status).toBe('disconnected');
    expect(res.status).toBe('unhealthy');
    expect(res.issues.critical).toEqual(['redis']);
    expect(res.issues.degraded).toEqual([]);

    process.env.NODE_ENV = originalEnv;
  });
});
