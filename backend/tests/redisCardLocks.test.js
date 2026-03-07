/**
 * @fileoverview Tests de integración para operaciones atómicas de card locks distribuidos.
 *
 * Verifica que reserveCardsAtomic, releaseCardsAtomic y renewLeaseAtomic
 * funcionan correctamente a través del fallback secuencial (ioredis-mock no soporta EVAL).
 * En producción, las mismas operaciones se ejecutan como Lua scripts atómicos.
 *
 * También verifica las funciones pipeline: existsMany, hgetallMany.
 *
 * @module tests/redisCardLocks
 */

// Mock de Redis ANTES de cualquier import que lo use
jest.mock('ioredis', () => {
  const RedisMock = require('ioredis-mock');
  return RedisMock;
});

const redisService = require('../src/services/redisService');
const { connectRedis, disconnectRedis } = require('../src/config/redis');

describe('Redis Card Locks - Operaciones Atómicas (fallback secuencial)', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    // Limpiar namespaces relevantes
    await redisService.flushNamespace(redisService.NAMESPACES.CARD);
    await redisService.flushNamespace(redisService.NAMESPACES.PLAY);
  });

  // ===========================================================================
  // reserveCardsAtomic
  // ===========================================================================
  describe('reserveCardsAtomic', () => {
    it('debería reservar todas las cards cuando están libres', async () => {
      const entries = [
        { id: 'CARD_UID_001', value: 'play-123' },
        { id: 'CARD_UID_002', value: 'play-123' },
        { id: 'CARD_UID_003', value: 'play-123' }
      ];

      const result = await redisService.reserveCardsAtomic(
        redisService.NAMESPACES.CARD,
        entries,
        90
      );

      expect(result.ok).toBe(true);
      expect(result.conflicts).toEqual([]);

      // Verificar que las keys se escribieron
      const val1 = await redisService.get(redisService.NAMESPACES.CARD, 'CARD_UID_001');
      const val2 = await redisService.get(redisService.NAMESPACES.CARD, 'CARD_UID_002');
      const val3 = await redisService.get(redisService.NAMESPACES.CARD, 'CARD_UID_003');
      expect(val1).toBe('play-123');
      expect(val2).toBe('play-123');
      expect(val3).toBe('play-123');
    });

    it('debería detectar conflictos cuando alguna card ya está reservada', async () => {
      // Pre-reservar una card
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, 'CARD_UID_002', 'play-other', 90);

      const entries = [
        { id: 'CARD_UID_001', value: 'play-123' },
        { id: 'CARD_UID_002', value: 'play-123' },
        { id: 'CARD_UID_003', value: 'play-123' }
      ];

      const result = await redisService.reserveCardsAtomic(
        redisService.NAMESPACES.CARD,
        entries,
        90
      );

      expect(result.ok).toBe(false);
      expect(result.conflicts).toContain('CARD_UID_002');
    });

    it('debería hacer rollback de cards ya adquiridas al encontrar conflicto', async () => {
      // Pre-reservar la última card
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, 'CARD_UID_003', 'play-other', 90);

      const entries = [
        { id: 'CARD_UID_001', value: 'play-123' },
        { id: 'CARD_UID_002', value: 'play-123' },
        { id: 'CARD_UID_003', value: 'play-123' }
      ];

      await redisService.reserveCardsAtomic(redisService.NAMESPACES.CARD, entries, 90);

      // Las cards adquiridas parcialmente deberían haberse limpiado (rollback)
      const val1 = await redisService.get(redisService.NAMESPACES.CARD, 'CARD_UID_001');
      const val2 = await redisService.get(redisService.NAMESPACES.CARD, 'CARD_UID_002');
      // En el fallback secuencial, setManyIfNotExists hace rollback
      expect(val1).toBeNull();
      expect(val2).toBeNull();
    });

    it('debería retornar ok:true con entradas vacías', async () => {
      const result = await redisService.reserveCardsAtomic(redisService.NAMESPACES.CARD, [], 90);

      expect(result.ok).toBe(true);
      expect(result.conflicts).toEqual([]);
    });
  });

  // ===========================================================================
  // releaseCardsAtomic
  // ===========================================================================
  describe('releaseCardsAtomic', () => {
    it('debería liberar cards cuyo valor coincide con el playId', async () => {
      // Reservar cards
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, 'CARD_UID_001', 'play-123', 90);
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, 'CARD_UID_002', 'play-123', 90);

      const entries = [
        { id: 'CARD_UID_001', expectedValue: 'play-123' },
        { id: 'CARD_UID_002', expectedValue: 'play-123' }
      ];

      const result = await redisService.releaseCardsAtomic(redisService.NAMESPACES.CARD, entries);

      expect(result.ok).toBe(true);
      expect(result.deletedCount).toBe(2);

      // Verificar que se eliminaron
      const val1 = await redisService.get(redisService.NAMESPACES.CARD, 'CARD_UID_001');
      const val2 = await redisService.get(redisService.NAMESPACES.CARD, 'CARD_UID_002');
      expect(val1).toBeNull();
      expect(val2).toBeNull();
    });

    it('debería NO liberar cards cuyo owner es distinto', async () => {
      // Card pertenece a otra partida
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, 'CARD_UID_001', 'play-other', 90);
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, 'CARD_UID_002', 'play-123', 90);

      const entries = [
        { id: 'CARD_UID_001', expectedValue: 'play-123' },
        { id: 'CARD_UID_002', expectedValue: 'play-123' }
      ];

      const result = await redisService.releaseCardsAtomic(redisService.NAMESPACES.CARD, entries);

      expect(result.ok).toBe(true);
      expect(result.deletedCount).toBe(1);

      // CARD_UID_001 no debería haberse eliminado (owner distinto)
      const val1 = await redisService.get(redisService.NAMESPACES.CARD, 'CARD_UID_001');
      expect(val1).toBe('play-other');
    });

    it('debería retornar ok:true con entradas vacías', async () => {
      const result = await redisService.releaseCardsAtomic(redisService.NAMESPACES.CARD, []);

      expect(result.ok).toBe(true);
      expect(result.deletedCount).toBe(0);
    });
  });

  // ===========================================================================
  // renewLeaseAtomic
  // ===========================================================================
  describe('renewLeaseAtomic', () => {
    it('debería renovar play key y card keys del owner', async () => {
      // Simular play en Redis
      await redisService.hset(redisService.NAMESPACES.PLAY, 'play-123', {
        playDocId: 'play-123',
        sessionDocId: 'session-456'
      });

      // Simular card locks
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, 'CARD_UID_001', 'play-123', 30);
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, 'CARD_UID_002', 'play-123', 30);

      const result = await redisService.renewLeaseAtomic(
        redisService.NAMESPACES.PLAY,
        'play-123',
        redisService.NAMESPACES.CARD,
        ['CARD_UID_001', 'CARD_UID_002'],
        90
      );

      expect(result.ok).toBe(true);
      expect(result.playRenewed).toBe(true);
      expect(result.cardsRenewed).toBe(2);
      expect(result.cardsSkipped).toBe(0);
    });

    it('debería saltar cards cuyo owner es distinto', async () => {
      await redisService.hset(redisService.NAMESPACES.PLAY, 'play-123', {
        playDocId: 'play-123'
      });

      await redisService.setWithTTL(redisService.NAMESPACES.CARD, 'CARD_UID_001', 'play-123', 30);
      await redisService.setWithTTL(redisService.NAMESPACES.CARD, 'CARD_UID_002', 'play-other', 30);

      const result = await redisService.renewLeaseAtomic(
        redisService.NAMESPACES.PLAY,
        'play-123',
        redisService.NAMESPACES.CARD,
        ['CARD_UID_001', 'CARD_UID_002'],
        90
      );

      expect(result.ok).toBe(true);
      expect(result.cardsRenewed).toBe(1);
      expect(result.cardsSkipped).toBe(1);
    });

    it('debería manejar play key inexistente', async () => {
      const result = await redisService.renewLeaseAtomic(
        redisService.NAMESPACES.PLAY,
        'nonexistent-play',
        redisService.NAMESPACES.CARD,
        [],
        90
      );

      expect(result.ok).toBe(true);
      expect(result.playRenewed).toBe(false);
    });
  });
});

describe('Redis Pipeline Operations', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    await redisService.flushNamespace(redisService.NAMESPACES.CARD);
    await redisService.flushNamespace(redisService.NAMESPACES.PLAY);
  });

  // ===========================================================================
  // existsMany
  // ===========================================================================
  describe('existsMany', () => {
    it('debería verificar existencia de múltiples keys en batch', async () => {
      await redisService.set(redisService.NAMESPACES.CARD, 'UID_001', 'play-1');
      await redisService.set(redisService.NAMESPACES.CARD, 'UID_003', 'play-2');

      const result = await redisService.existsMany(redisService.NAMESPACES.CARD, [
        'UID_001',
        'UID_002',
        'UID_003'
      ]);

      expect(result).toBeInstanceOf(Map);
      expect(result.get('UID_001')).toBe(true);
      expect(result.get('UID_002')).toBe(false);
      expect(result.get('UID_003')).toBe(true);
    });

    it('debería retornar Map vacío con ids vacíos', async () => {
      const result = await redisService.existsMany(redisService.NAMESPACES.CARD, []);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });

  // ===========================================================================
  // hgetallMany
  // ===========================================================================
  describe('hgetallMany', () => {
    it('debería leer múltiples hashes en batch', async () => {
      await redisService.hset(redisService.NAMESPACES.PLAY, 'play-1', {
        playDocId: 'play-1',
        sessionDocId: 'session-1'
      });
      await redisService.hset(redisService.NAMESPACES.PLAY, 'play-2', {
        playDocId: 'play-2',
        sessionDocId: 'session-2'
      });

      const result = await redisService.hgetallMany(redisService.NAMESPACES.PLAY, [
        'play-1',
        'play-2',
        'play-nonexistent'
      ]);

      expect(result).toBeInstanceOf(Map);
      expect(result.get('play-1')).toBeTruthy();
      expect(result.get('play-1').playDocId).toBe('play-1');
      expect(result.get('play-2')).toBeTruthy();
      expect(result.get('play-2').sessionDocId).toBe('session-2');
      expect(result.get('play-nonexistent')).toBeNull();
    });

    it('debería retornar Map vacío con ids vacíos', async () => {
      const result = await redisService.hgetallMany(redisService.NAMESPACES.PLAY, []);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });
});
