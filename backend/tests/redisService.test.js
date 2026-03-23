/**
 * Tests para RedisService
 * Usa ioredis-mock para simular Redis sin dependencia externa
 */

// Mock de Redis
jest.mock('ioredis', () => {
  const RedisMock = require('ioredis-mock');
  return RedisMock;
});

const redisService = require('../src/services/redisService');
const { connectRedis, disconnectRedis, isRedisConnected } = require('../src/config/redis');

describe('RedisService', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  afterEach(async () => {
    // Limpiar todos los namespaces después de cada test
    for (const namespace of Object.values(redisService.NAMESPACES)) {
      await redisService.flushNamespace(namespace);
    }
  });

  describe('Conexión', () => {
    it('debería estar conectado después de connectRedis', () => {
      expect(isRedisConnected()).toBe(true);
    });
  });

  describe('Operaciones básicas (String)', () => {
    it('setWithTTL y get deberían almacenar y recuperar valores', async () => {
      await redisService.setWithTTL(
        redisService.NAMESPACES.BLACKLIST,
        'test-key',
        'test-value',
        3600
      );

      const result = await redisService.get(redisService.NAMESPACES.BLACKLIST, 'test-key');

      expect(result).toBe('test-value');
    });

    it('exists debería retornar true para keys existentes', async () => {
      await redisService.set(redisService.NAMESPACES.SECURITY, 'exists-key', 'value');

      const exists = await redisService.exists(redisService.NAMESPACES.SECURITY, 'exists-key');

      expect(exists).toBe(true);
    });

    it('exists debería retornar false para keys inexistentes', async () => {
      const exists = await redisService.exists(redisService.NAMESPACES.SECURITY, 'non-existent');

      expect(exists).toBe(false);
    });

    it('del debería eliminar una key', async () => {
      await redisService.set(redisService.NAMESPACES.BLACKLIST, 'to-delete', 'value');
      expect(await redisService.exists(redisService.NAMESPACES.BLACKLIST, 'to-delete')).toBe(true);

      await redisService.del(redisService.NAMESPACES.BLACKLIST, 'to-delete');

      expect(await redisService.exists(redisService.NAMESPACES.BLACKLIST, 'to-delete')).toBe(false);
    });

    it('ttl debería retornar el tiempo restante', async () => {
      await redisService.setWithTTL(redisService.NAMESPACES.REFRESH, 'ttl-key', 'value', 3600);

      const ttl = await redisService.ttl(redisService.NAMESPACES.REFRESH, 'ttl-key');

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(3600);
    });
  });

  describe('Operaciones Hash', () => {
    it('hset y hgetall deberían manejar objetos', async () => {
      const data = {
        playerId: 'player-123',
        score: '50',
        currentRound: '3'
      };

      await redisService.hset(redisService.NAMESPACES.PLAY, 'play-1', data);

      const result = await redisService.hgetall(redisService.NAMESPACES.PLAY, 'play-1');

      // ioredis-mock puede convertir valores a números, aceptamos ambos formatos
      expect(result.playerId).toBe('player-123');
      expect(String(result.score)).toBe('50');
      expect(String(result.currentRound)).toBe('3');
    });

    it('hget debería obtener un campo específico', async () => {
      await redisService.hset(redisService.NAMESPACES.PLAY, 'play-2', {
        playerId: 'player-456',
        score: '100'
      });

      const score = await redisService.hget(redisService.NAMESPACES.PLAY, 'play-2', 'score');

      expect(score).toBe('100');
    });

    it('hdel debería eliminar campos específicos', async () => {
      await redisService.hset(redisService.NAMESPACES.PLAY, 'play-3', {
        field1: 'value1',
        field2: 'value2'
      });

      await redisService.hdel(redisService.NAMESPACES.PLAY, 'play-3', 'field1');

      const result = await redisService.hgetall(redisService.NAMESPACES.PLAY, 'play-3');
      expect(result).toEqual({ field2: 'value2' });
    });
  });

  describe('Operaciones Set', () => {
    it('sadd y smembers deberían manejar conjuntos', async () => {
      await redisService.sadd(redisService.NAMESPACES.TOKEN_FAMILY, 'family-1', 'token-a');
      await redisService.sadd(redisService.NAMESPACES.TOKEN_FAMILY, 'family-1', 'token-b');
      await redisService.sadd(redisService.NAMESPACES.TOKEN_FAMILY, 'family-1', 'token-c');

      const members = await redisService.smembers(redisService.NAMESPACES.TOKEN_FAMILY, 'family-1');

      expect(members.sort()).toEqual(['token-a', 'token-b', 'token-c'].sort());
    });

    it('sismember debería verificar membresía', async () => {
      await redisService.sadd(redisService.NAMESPACES.TOKEN_FAMILY, 'family-2', 'member-1');

      const isMember = await redisService.sismember(
        redisService.NAMESPACES.TOKEN_FAMILY,
        'family-2',
        'member-1'
      );
      const isNotMember = await redisService.sismember(
        redisService.NAMESPACES.TOKEN_FAMILY,
        'family-2',
        'member-2'
      );

      expect(isMember).toBe(true);
      expect(isNotMember).toBe(false);
    });

    it('srem debería eliminar un miembro del set', async () => {
      await redisService.sadd(redisService.NAMESPACES.TOKEN_FAMILY, 'family-3', 'to-remove');

      await redisService.srem(redisService.NAMESPACES.TOKEN_FAMILY, 'family-3', 'to-remove');

      const isMember = await redisService.sismember(
        redisService.NAMESPACES.TOKEN_FAMILY,
        'family-3',
        'to-remove'
      );
      expect(isMember).toBe(false);
    });
  });

  describe('Scan y estadísticas', () => {
    // NOTA: ioredis-mock no soporta bien SCAN, estos tests se saltan
    it('scanByNamespace debería encontrar keys del namespace', async () => {
      await redisService.set(redisService.NAMESPACES.BLACKLIST, 'scan-1', 'v1');
      await redisService.set(redisService.NAMESPACES.BLACKLIST, 'scan-2', 'v2');
      await redisService.set(redisService.NAMESPACES.SECURITY, 'other', 'v3');

      const keys = await redisService.scanByNamespace(redisService.NAMESPACES.BLACKLIST);

      expect(keys).toHaveLength(2);
      expect(keys.every(k => k.includes('blacklist'))).toBe(true);
    });

    // NOTA: flushNamespace usa scanByNamespace internamente
    it('flushNamespace debería limpiar solo el namespace especificado', async () => {
      await redisService.set(redisService.NAMESPACES.BLACKLIST, 'flush-1', 'v1');
      await redisService.set(redisService.NAMESPACES.SECURITY, 'keep-1', 'v2');

      await redisService.flushNamespace(redisService.NAMESPACES.BLACKLIST);

      expect(await redisService.exists(redisService.NAMESPACES.BLACKLIST, 'flush-1')).toBe(false);
      expect(await redisService.exists(redisService.NAMESPACES.SECURITY, 'keep-1')).toBe(true);
    });

    it('getStats debería retornar estadísticas', async () => {
      await redisService.set(redisService.NAMESPACES.BLACKLIST, 'stat-1', 'v');
      await redisService.set(redisService.NAMESPACES.PLAY, 'stat-2', 'v');

      const stats = await redisService.getStats();

      expect(stats).toHaveProperty('connected');
      // getStats retorna 'namespaces' no 'keysByNamespace'
      expect(stats).toHaveProperty('namespaces');
      expect(typeof stats.namespaces.blacklist).toBe('number');
    });
  });

  describe('Manejo de errores', () => {
    it('debería manejar keys inexistentes gracefully', async () => {
      const result = await redisService.get(redisService.NAMESPACES.BLACKLIST, 'non-existent');
      expect(result).toBeNull();
    });

    it('hgetall debería retornar null para hash inexistente', async () => {
      const result = await redisService.hgetall(redisService.NAMESPACES.PLAY, 'non-existent-hash');
      // ioredis-mock retorna {} para hash vacío, mientras ioredis real retorna null
      expect(result === null || Object.keys(result).length === 0).toBe(true);
    });
  });
});

describe('Token Operations (integración con auth)', () => {
  const {
    revokeToken,
    isTokenRevoked,
    storeRefreshToken,
    getRefreshTokenInfo,
    markRefreshTokenAsUsed,
    isRefreshTokenUsed,
    deleteRefreshToken,
    revokeAllUserTokens,
    checkSecurityFlag
  } = require('../src/middlewares/auth');

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  afterEach(async () => {
    for (const namespace of Object.values(redisService.NAMESPACES)) {
      await redisService.flushNamespace(namespace);
    }
  });

  describe('Token Blacklist', () => {
    it('revokeToken debería añadir token a blacklist', async () => {
      const jti = 'test-jti-123';
      // revokeToken espera timestamp en milisegundos, no segundos
      const expiresAt = Date.now() + 3600000; // 1 hora en ms

      await revokeToken(jti, expiresAt);

      const isRevoked = await isTokenRevoked(jti);
      expect(isRevoked).toBe(true);
    });

    it('isTokenRevoked debería retornar false para tokens no revocados', async () => {
      const isRevoked = await isTokenRevoked('non-existent-jti');
      expect(isRevoked).toBe(false);
    });
  });

  describe('Refresh Token Storage', () => {
    it('storeRefreshToken debería almacenar info del token', async () => {
      const jti = 'refresh-jti-456';
      const userId = 'user-789';
      const familyId = 'family-abc';

      await storeRefreshToken(jti, userId, familyId);

      const info = await getRefreshTokenInfo(jti);
      expect(info).toBeTruthy();
      expect(info.userId).toBe(userId);
      expect(info.familyId).toBe(familyId);
    });

    it('deleteRefreshToken debería eliminar el token', async () => {
      const jti = 'to-delete-jti';

      await storeRefreshToken(jti, 'user', 'family');
      await deleteRefreshToken(jti);

      const info = await getRefreshTokenInfo(jti);
      // Debería ser null o vacío después de eliminar
      expect(info === null || Object.keys(info).length === 0).toBe(true);
    });
  });

  describe('Token Rotation y Theft Detection', () => {
    it('markRefreshTokenAsUsed debería marcar el token', async () => {
      const jti = 'used-jti';
      const familyId = 'family-123';

      await markRefreshTokenAsUsed(jti, familyId);

      // isRefreshTokenUsed retorna {used, familyId, usedAt}
      const result = await isRefreshTokenUsed(jti);
      expect(result.used).toBe(true);
      expect(result.familyId).toBe(familyId);
    });

    it('isRefreshTokenUsed debería retornar used=false para tokens no usados', async () => {
      const result = await isRefreshTokenUsed('never-used-jti');
      expect(result.used).toBe(false);
    });
  });

  describe('Security Flags', () => {
    it('revokeAllUserTokens debería crear flag de seguridad', async () => {
      const userId = 'security-user';
      const now = Math.floor(Date.now() / 1000);

      await revokeAllUserTokens(userId, 'token_theft');

      // Token emitido antes del flag debería estar revocado
      // checkSecurityFlag retorna {revoked, reason}
      const result = await checkSecurityFlag(userId, now - 10);
      expect(result.revoked).toBe(true);
      expect(result.reason).toBe('SESSION_REVOKED_SECURITY');
    });

    it('token emitido después del flag debería ser válido', async () => {
      const userId = 'security-user-2';

      await revokeAllUserTokens(userId, 'manual_revoke');

      // Token "nuevo" emitido después del flag
      const futureIat = Math.floor(Date.now() / 1000) + 5;
      const result = await checkSecurityFlag(userId, futureIat);
      expect(result.revoked).toBe(false);
    });
  });
});
