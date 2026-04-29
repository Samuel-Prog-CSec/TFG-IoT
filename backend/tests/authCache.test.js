/**
 * @fileoverview Tests unitarios para el cache de slim-user en middleware de autenticación.
 * Verifica fetchUserForAuth e invalidateUserCache con ioredis-mock como backend real.
 */

jest.mock('ioredis', () => require('ioredis-mock'));

const { connectRedis, disconnectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const userRepository = require('../src/repositories/userRepository');
const { fetchUserForAuth, invalidateUserCache } = require('../src/middlewares/auth');
const runtimeMetrics = require('../src/utils/runtimeMetrics');

describe('Auth slim-user cache', () => {
  const USER_ID = '65a1b2c3d4e5f67890abcdef';
  let findByIdSpy;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    runtimeMetrics.reset();
    await redisService.flushNamespace('auth:user');

    findByIdSpy = jest.spyOn(userRepository, 'findById').mockResolvedValue({
      _id: USER_ID,
      email: 'teacher@test.com',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved',
      currentSessionId: 'sid-123',
      toObject: () => ({
        _id: USER_ID,
        email: 'teacher@test.com',
        role: 'teacher',
        status: 'active',
        accountStatus: 'approved',
        currentSessionId: 'sid-123'
      })
    });
  });

  afterEach(() => {
    findByIdSpy?.mockRestore?.();
  });

  describe('fetchUserForAuth', () => {
    it('MISS en la primera llamada, HIT en la segunda (mismo userId)', async () => {
      const first = await fetchUserForAuth(USER_ID);
      expect(first.email).toBe('teacher@test.com');
      expect(findByIdSpy).toHaveBeenCalledTimes(1);

      // Dar tiempo a la escritura fire-and-forget del cache
      await new Promise(resolve => setTimeout(resolve, 30));

      const second = await fetchUserForAuth(USER_ID);
      expect(second.email).toBe('teacher@test.com');
      expect(findByIdSpy).toHaveBeenCalledTimes(1); // No refetch

      const snap = runtimeMetrics.getSnapshot();
      expect(snap.redis.authUserCacheMisses).toBe(1);
      expect(snap.redis.authUserCacheHits).toBe(1);
    });

    it('devuelve null cuando el usuario no existe y no popula el cache', async () => {
      findByIdSpy.mockResolvedValueOnce(null);

      const result = await fetchUserForAuth(USER_ID);

      expect(result).toBeNull();
      await new Promise(resolve => setTimeout(resolve, 30));
      // El namespace no debe contener una entrada para USER_ID
      const cached = await redisService.get('auth:user', USER_ID);
      expect(cached).toBeNull();
    });

    it('nunca cachea la password (defensa en profundidad)', async () => {
      findByIdSpy.mockResolvedValueOnce({
        _id: USER_ID,
        email: 'x@x.com',
        role: 'teacher',
        status: 'active',
        password: 'HASH-secreto',
        toObject: () => ({
          _id: USER_ID,
          email: 'x@x.com',
          role: 'teacher',
          status: 'active',
          password: 'HASH-secreto'
        })
      });

      await fetchUserForAuth(USER_ID);
      await new Promise(resolve => setTimeout(resolve, 30));

      const rawCached = await redisService.get('auth:user', USER_ID);
      expect(rawCached).not.toBeNull();
      const parsed = JSON.parse(rawCached);
      expect(parsed.password).toBeUndefined();
    });
  });

  describe('invalidateUserCache', () => {
    it('elimina la entrada cacheada para ese usuario', async () => {
      // Populate cache
      await fetchUserForAuth(USER_ID);
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(await redisService.get('auth:user', USER_ID)).not.toBeNull();

      await invalidateUserCache(USER_ID);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(await redisService.get('auth:user', USER_ID)).toBeNull();
    });

    it('convierte ObjectId-like a string antes de invalidar', async () => {
      await fetchUserForAuth(USER_ID);
      await new Promise(resolve => setTimeout(resolve, 30));

      const idLike = { toString: () => USER_ID };
      await invalidateUserCache(idLike);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(await redisService.get('auth:user', USER_ID)).toBeNull();
    });

    it('no lanza si el userId es falsy', async () => {
      await expect(invalidateUserCache(null)).resolves.toBeUndefined();
      await expect(invalidateUserCache(undefined)).resolves.toBeUndefined();
    });

    it('tras invalidar, el siguiente fetchUserForAuth vuelve a ir a Mongo', async () => {
      await fetchUserForAuth(USER_ID);
      await new Promise(resolve => setTimeout(resolve, 30));
      findByIdSpy.mockClear();

      await invalidateUserCache(USER_ID);
      await new Promise(resolve => setTimeout(resolve, 10));

      await fetchUserForAuth(USER_ID);
      expect(findByIdSpy).toHaveBeenCalledTimes(1);
    });
  });
});
