/**
 * @fileoverview Tests unitarios del servicio de feature flags.
 * Verifica evaluación determinística, whitelist override, kill switch,
 * persistencia en Redis y invalidación de cache tras mutaciones.
 */

jest.mock('ioredis', () => require('ioredis-mock'));

const { connectRedis, disconnectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const featureFlagService = require('../src/services/featureFlagService');
const { fnv1a32, bucketPct } = require('../src/utils/fnv1a');

describe('Feature Flag Service', () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    await redisService.flushNamespace('feature');
    await redisService.flushNamespace('cache:flags');
  });

  describe('fnv1a32 + bucketPct', () => {
    it('es determinístico: mismo input → mismo output', () => {
      const a = fnv1a32('user-123');
      const b = fnv1a32('user-123');
      expect(a).toBe(b);
    });

    it('produce diferentes hashes para inputs distintos', () => {
      expect(fnv1a32('user-1')).not.toBe(fnv1a32('user-2'));
    });

    it('bucketPct siempre devuelve [0, 99]', () => {
      for (let i = 0; i < 200; i++) {
        const b = bucketPct(`user-${i}`);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(99);
      }
    });

    it('mismo userId siempre cae en el mismo bucket', () => {
      expect(bucketPct('stable-user-id')).toBe(bucketPct('stable-user-id'));
    });
  });

  describe('setFlag + getFlag', () => {
    it('crea una flag y la recupera con los mismos valores', async () => {
      await featureFlagService.setFlag('testFlag', {
        enabled: true,
        rolloutPct: 50,
        whitelist: ['uid-1', 'uid-2'],
        reason: 'Rollout gradual de prueba'
      });

      const flag = await featureFlagService.getFlag('testFlag');
      expect(flag).toMatchObject({
        name: 'testFlag',
        enabled: true,
        rolloutPct: 50,
        whitelist: ['uid-1', 'uid-2'],
        reason: 'Rollout gradual de prueba'
      });
      expect(flag.updatedAt).toBeTruthy();
    });

    it('clamp rolloutPct a [0, 100]', async () => {
      await featureFlagService.setFlag('negativePct', {
        enabled: true,
        rolloutPct: -10,
        whitelist: [],
        reason: ''
      });
      const f1 = await featureFlagService.getFlag('negativePct');
      expect(f1.rolloutPct).toBe(0);

      await featureFlagService.setFlag('tooHighPct', {
        enabled: true,
        rolloutPct: 150,
        whitelist: [],
        reason: ''
      });
      const f2 = await featureFlagService.getFlag('tooHighPct');
      expect(f2.rolloutPct).toBe(100);
    });

    it('getFlag devuelve null si no existe', async () => {
      const flag = await featureFlagService.getFlag('nonexistent');
      expect(flag).toBeNull();
    });
  });

  describe('isEnabled — kill switch', () => {
    it('devuelve false si la flag no existe', async () => {
      const enabled = await featureFlagService.isEnabled('missing', 'user-1');
      expect(enabled).toBe(false);
    });

    it('devuelve false si enabled === 0 aunque rolloutPct=100', async () => {
      await featureFlagService.setFlag('killed', {
        enabled: false,
        rolloutPct: 100,
        whitelist: ['user-1'],
        reason: 'Apagada por incidente'
      });
      const enabled = await featureFlagService.isEnabled('killed', 'user-1');
      expect(enabled).toBe(false);
    });

    it('devuelve true si rolloutPct=100 y enabled', async () => {
      await featureFlagService.setFlag('allOn', {
        enabled: true,
        rolloutPct: 100,
        whitelist: [],
        reason: ''
      });
      const enabled = await featureFlagService.isEnabled('allOn', 'user-1');
      expect(enabled).toBe(true);
    });

    it('devuelve false si rolloutPct=0 y no whitelist', async () => {
      await featureFlagService.setFlag('offByDefault', {
        enabled: true,
        rolloutPct: 0,
        whitelist: [],
        reason: ''
      });
      const enabled = await featureFlagService.isEnabled('offByDefault', 'user-1');
      expect(enabled).toBe(false);
    });
  });

  describe('isEnabled — whitelist override', () => {
    it('usuario en whitelist siempre recibe true aunque rolloutPct=0', async () => {
      await featureFlagService.setFlag('whitelistOnly', {
        enabled: true,
        rolloutPct: 0,
        whitelist: ['alice', 'bob'],
        reason: ''
      });

      expect(await featureFlagService.isEnabled('whitelistOnly', 'alice')).toBe(true);
      expect(await featureFlagService.isEnabled('whitelistOnly', 'bob')).toBe(true);
      expect(await featureFlagService.isEnabled('whitelistOnly', 'charlie')).toBe(false);
    });

    it('whitelist queda suprimida si enabled=0', async () => {
      await featureFlagService.setFlag('killedWithWhitelist', {
        enabled: false,
        rolloutPct: 0,
        whitelist: ['alice'],
        reason: ''
      });
      expect(await featureFlagService.isEnabled('killedWithWhitelist', 'alice')).toBe(false);
    });
  });

  describe('isEnabled — rollout determinístico', () => {
    it('mismo userId siempre recibe el mismo valor en repetidas evaluaciones', async () => {
      await featureFlagService.setFlag('gradual', {
        enabled: true,
        rolloutPct: 50,
        whitelist: [],
        reason: ''
      });

      const userId = 'consistent-user';
      const first = await featureFlagService.isEnabled('gradual', userId);
      const second = await featureFlagService.isEnabled('gradual', userId);
      const third = await featureFlagService.isEnabled('gradual', userId);
      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it('distribución aproximada respeta el rolloutPct para N usuarios', async () => {
      // Con rolloutPct=30, aprox 30% de usuarios deben recibir true
      await featureFlagService.setFlag('thirty', {
        enabled: true,
        rolloutPct: 30,
        whitelist: [],
        reason: ''
      });

      let count = 0;
      const N = 500;
      for (let i = 0; i < N; i++) {
        if (await featureFlagService.isEnabled('thirty', `user-${i}`)) {
          count++;
        }
      }
      // Tolerancia: ~30% ± 7% (hash uniforme sobre N=500 usuarios sintéticos)
      const pct = (count / N) * 100;
      expect(pct).toBeGreaterThanOrEqual(23);
      expect(pct).toBeLessThanOrEqual(37);
    });

    it('sin userId devuelve false excepto si rolloutPct=100', async () => {
      await featureFlagService.setFlag('partial', {
        enabled: true,
        rolloutPct: 50,
        whitelist: [],
        reason: ''
      });
      expect(await featureFlagService.isEnabled('partial', null)).toBe(false);

      await featureFlagService.setFlag('full', {
        enabled: true,
        rolloutPct: 100,
        whitelist: [],
        reason: ''
      });
      expect(await featureFlagService.isEnabled('full', null)).toBe(true);
    });
  });

  describe('listFlags', () => {
    it('devuelve todas las flags registradas ordenadas por nombre', async () => {
      await featureFlagService.setFlag('zeta', {
        enabled: true,
        rolloutPct: 100,
        whitelist: [],
        reason: ''
      });
      await featureFlagService.setFlag('alpha', {
        enabled: false,
        rolloutPct: 0,
        whitelist: [],
        reason: ''
      });
      await featureFlagService.setFlag('beta', {
        enabled: true,
        rolloutPct: 50,
        whitelist: ['x'],
        reason: 'r'
      });

      const flags = await featureFlagService.listFlags();
      expect(flags.map(f => f.name)).toEqual(['alpha', 'beta', 'zeta']);
    });

    it('devuelve [] si no hay flags registradas', async () => {
      const flags = await featureFlagService.listFlags();
      expect(flags).toEqual([]);
    });
  });

  describe('deleteFlag', () => {
    it('elimina una flag existente y la invalida del cache', async () => {
      await featureFlagService.setFlag('temporary', {
        enabled: true,
        rolloutPct: 100,
        whitelist: [],
        reason: ''
      });

      // Calentar cache
      await featureFlagService.isEnabled('temporary', 'user-1');

      await featureFlagService.deleteFlag('temporary');

      const f = await featureFlagService.getFlag('temporary');
      expect(f).toBeNull();

      // Tras la invalidación, isEnabled vuelve a false
      const enabled = await featureFlagService.isEnabled('temporary', 'user-1');
      expect(enabled).toBe(false);
    });
  });

  describe('evaluateAllForUser', () => {
    it('devuelve mapa de todas las flags evaluadas para un userId', async () => {
      await featureFlagService.setFlag('f1', {
        enabled: true,
        rolloutPct: 100,
        whitelist: [],
        reason: ''
      });
      await featureFlagService.setFlag('f2', {
        enabled: false,
        rolloutPct: 100,
        whitelist: [],
        reason: ''
      });
      await featureFlagService.setFlag('f3', {
        enabled: true,
        rolloutPct: 0,
        whitelist: ['alice'],
        reason: ''
      });

      const forAlice = await featureFlagService.evaluateAllForUser('alice');
      expect(forAlice).toEqual({ f1: true, f2: false, f3: true });

      const forBob = await featureFlagService.evaluateAllForUser('bob');
      expect(forBob).toEqual({ f1: true, f2: false, f3: false });
    });
  });

  describe('cache invalidation tras setFlag', () => {
    it('cambios en setFlag se reflejan inmediatamente en isEnabled', async () => {
      await featureFlagService.setFlag('toggle', {
        enabled: true,
        rolloutPct: 100,
        whitelist: [],
        reason: ''
      });
      expect(await featureFlagService.isEnabled('toggle', 'user-1')).toBe(true);

      await featureFlagService.setFlag('toggle', {
        enabled: false,
        rolloutPct: 100,
        whitelist: [],
        reason: ''
      });
      expect(await featureFlagService.isEnabled('toggle', 'user-1')).toBe(false);
    });
  });

  describe('listFlagsWithCatalog (PROP-81)', () => {
    const { FEATURE_FLAGS_CATALOG } = require('../src/config/featureFlagsCatalog');

    it('devuelve cada entrada del catálogo, marcando como unregistered las no creadas', async () => {
      const merged = await featureFlagService.listFlagsWithCatalog();

      // El orden del catálogo se preserva (estabilidad visual del panel admin).
      const catalogNames = FEATURE_FLAGS_CATALOG.map(f => f.name);
      const mergedNames = merged.slice(0, catalogNames.length).map(f => f.name);
      expect(mergedNames).toEqual(catalogNames);

      // Sin nada en Redis, todas son 'unregistered'.
      expect(merged.every(f => f.status === 'unregistered')).toBe(true);

      // Cada entrada expone descripción del catálogo y default rollout.
      const sample = merged.find(f => f.name === 'rfid-mode-distributed');
      expect(sample.description).toMatch(/RFID/);
      expect(sample.defaultEnabled).toBe(true);
    });

    it('marca como registered las flags presentes en Redis y preserva su estado', async () => {
      await featureFlagService.setFlag('rfid-mode-distributed', {
        enabled: false,
        rolloutPct: 25,
        whitelist: ['uid-admin'],
        reason: 'Rollback temporal'
      });

      const merged = await featureFlagService.listFlagsWithCatalog();
      const target = merged.find(f => f.name === 'rfid-mode-distributed');

      expect(target.status).toBe('registered');
      expect(target.enabled).toBe(false);
      expect(target.rolloutPct).toBe(25);
      expect(target.whitelist).toEqual(['uid-admin']);
      expect(target.description).toMatch(/RFID/);
    });

    it('flags en Redis fuera del catálogo aparecen al final con status orphan', async () => {
      await featureFlagService.setFlag('experimental-zzz', {
        enabled: true,
        rolloutPct: 100,
        whitelist: [],
        reason: 'Experimento ad-hoc'
      });

      const merged = await featureFlagService.listFlagsWithCatalog();
      const orphan = merged.find(f => f.name === 'experimental-zzz');

      expect(orphan).toBeDefined();
      expect(orphan.status).toBe('orphan');
      expect(orphan.enabled).toBe(true);
    });
  });
});
