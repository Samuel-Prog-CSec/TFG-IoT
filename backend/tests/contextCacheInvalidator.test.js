/**
 * @fileoverview Tests del helper `contextCacheInvalidator`.
 *
 * Verifica que las operaciones CREATE/UPDATE/DELETE de contextos invalidan
 * correctamente las keys byId:<mongoId> + byId:<slug> + todas las keys list:*.
 */

jest.mock('ioredis', () => require('ioredis-mock'));

const { connectRedis, disconnectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const {
  buildListCacheKey,
  invalidateContextEntityCaches,
  invalidateContextListCaches,
  invalidateContextCaches,
  CONTEXT_NAMESPACE
} = require('../src/utils/cacheInvalidators/contextCacheInvalidator');

describe('contextCacheInvalidator', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    await redisService.flushNamespace(CONTEXT_NAMESPACE);
  });

  describe('buildListCacheKey', () => {
    it('produce la misma key para los mismos params', () => {
      const a = buildListCacheKey({ page: 1, limit: 20 });
      const b = buildListCacheKey({ page: 1, limit: 20 });
      expect(a).toBe(b);
    });

    it('produce keys distintas para filtros distintos', () => {
      const a = buildListCacheKey({ page: 1, limit: 20, search: 'geo' });
      const b = buildListCacheKey({ page: 1, limit: 20, search: 'historia' });
      expect(a).not.toBe(b);
    });

    it('usa defaults cuando no hay params', () => {
      const k = buildListCacheKey({});
      expect(k).toContain('list:');
      expect(k).toContain('p1');
      expect(k).toContain('l20');
    });

    it('normaliza search a minúsculas y elimina espacios', () => {
      expect(buildListCacheKey({ search: '  GeoGrafia  ' })).toBe(
        buildListCacheKey({ search: 'geografia' })
      );
    });
  });

  describe('invalidateContextEntityCaches', () => {
    it('elimina byId:<mongoId> y byId:<slug>', async () => {
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'byId:abc123', 'cached-a', 60);
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'byId:geography', 'cached-b', 60);

      await invalidateContextEntityCaches('abc123', 'geography');

      expect(await redisService.get(CONTEXT_NAMESPACE, 'byId:abc123')).toBeNull();
      expect(await redisService.get(CONTEXT_NAMESPACE, 'byId:geography')).toBeNull();
    });

    it('no falla si mongoId y slug son el mismo valor', async () => {
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'byId:repeated', 'cached', 60);
      await expect(invalidateContextEntityCaches('repeated', 'repeated')).resolves.toBeUndefined();
      expect(await redisService.get(CONTEXT_NAMESPACE, 'byId:repeated')).toBeNull();
    });
  });

  describe('invalidateContextListCaches', () => {
    it('elimina solo las keys list:* y conserva byId:*', async () => {
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'list:p1:l20:scr:od:q:a', 'L1', 60);
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'list:p2:l20:scr:od:q:a', 'L2', 60);
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'byId:abc', 'entity', 60);

      const deleted = await invalidateContextListCaches();
      expect(deleted).toBeGreaterThanOrEqual(2);

      expect(await redisService.get(CONTEXT_NAMESPACE, 'list:p1:l20:scr:od:q:a')).toBeNull();
      expect(await redisService.get(CONTEXT_NAMESPACE, 'list:p2:l20:scr:od:q:a')).toBeNull();
      // La key byId no se toca
      expect(await redisService.get(CONTEXT_NAMESPACE, 'byId:abc')).toBe('entity');
    });

    it('devuelve 0 si no hay listas cacheadas', async () => {
      const deleted = await invalidateContextListCaches();
      expect(deleted).toBe(0);
    });
  });

  describe('invalidateContextCaches', () => {
    it('invalida entidad + todas las listas en una sola llamada', async () => {
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'byId:ctxMongo', 'entity-m', 60);
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'byId:animals', 'entity-s', 60);
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'list:p1:default', 'list-1', 60);
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'list:p2:default', 'list-2', 60);

      const result = await invalidateContextCaches('ctxMongo', 'animals');

      expect(result.entities).toBe(2);
      expect(result.lists).toBeGreaterThanOrEqual(2);

      expect(await redisService.get(CONTEXT_NAMESPACE, 'byId:ctxMongo')).toBeNull();
      expect(await redisService.get(CONTEXT_NAMESPACE, 'byId:animals')).toBeNull();
      expect(await redisService.get(CONTEXT_NAMESPACE, 'list:p1:default')).toBeNull();
      expect(await redisService.get(CONTEXT_NAMESPACE, 'list:p2:default')).toBeNull();
    });

    it('funciona cuando el contexto recién se crea (no hay entidad previa cacheada)', async () => {
      await redisService.setWithTTL(CONTEXT_NAMESPACE, 'list:default', 'cached', 60);
      const result = await invalidateContextCaches('newId', 'newSlug');
      expect(result.entities).toBe(2);
      expect(result.lists).toBeGreaterThanOrEqual(1);
    });
  });
});
