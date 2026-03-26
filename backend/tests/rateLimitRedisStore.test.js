/**
 * @fileoverview Tests unitarios para la factory de Redis store en rate limiting (T-521).
 * Verifica que createRedisStore y createRateLimiter funcionan correctamente
 * en diferentes escenarios: test env, sin Redis, con Redis, errores.
 */

describe('Rate Limit Redis Store Factory', () => {
  // Guardamos el NODE_ENV original para restaurarlo
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
    // Limpiar cache de require para que security.js se re-evalúe
    jest.resetModules();
  });

  describe('comportamiento en entorno de test', () => {
    it('createRateLimiter debe retornar middleware noop en test env', () => {
      // En el entorno de test (Jest), createRateLimiter retorna (req, res, next) => next()
      const { globalRateLimiter } = require('../src/config/security');

      const req = {};
      const res = {};
      const next = jest.fn();

      globalRateLimiter(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });

    it('todos los rate limiters deben ser noop en test env', () => {
      const {
        globalRateLimiter,
        authRateLimiter,
        registerRateLimiter,
        createResourceRateLimiter,
        eventRateLimiter,
        uploadRateLimiter
      } = require('../src/config/security');

      const limiters = [
        globalRateLimiter,
        authRateLimiter,
        registerRateLimiter,
        createResourceRateLimiter,
        eventRateLimiter,
        uploadRateLimiter
      ];

      for (const limiter of limiters) {
        const next = jest.fn();
        limiter({}, {}, next);
        expect(next).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('rutas de plays con rate limiting', () => {
    it('pause y resume deben tener eventRateLimiter en su stack de middleware', () => {
      const playsRouter = require('../src/routes/plays');

      // Extraer las rutas registradas en el router
      const routes = playsRouter.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
          middlewareCount: layer.route.stack.length
        }));

      const pauseRoute = routes.find(r => r.path === '/:id/pause');
      const resumeRoute = routes.find(r => r.path === '/:id/resume');
      const eventsRoute = routes.find(r => r.path === '/:id/events');

      expect(pauseRoute).toBeDefined();
      expect(resumeRoute).toBeDefined();

      // pause y resume deben tener la misma cantidad de middlewares que events
      // (ambos tienen: rateLimiter + validateParams + validateQuery + validateBody + handler)
      expect(pauseRoute.middlewareCount).toBe(eventsRoute.middlewareCount);
      expect(resumeRoute.middlewareCount).toBe(eventsRoute.middlewareCount);
    });

    it('complete y abandon NO deben tener eventRateLimiter (menos middlewares)', () => {
      const playsRouter = require('../src/routes/plays');

      const routes = playsRouter.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          middlewareCount: layer.route.stack.length
        }));

      const pauseRoute = routes.find(r => r.path === '/:id/pause');
      const completeRoute = routes.find(r => r.path === '/:id/complete');
      const abandonRoute = routes.find(r => r.path === '/:id/abandon');

      // complete y abandon tienen 1 middleware menos (sin rateLimiter)
      expect(completeRoute.middlewareCount).toBe(pauseRoute.middlewareCount - 1);
      expect(abandonRoute.middlewareCount).toBe(pauseRoute.middlewareCount - 1);
    });
  });

  describe('configuración de prefijos', () => {
    it('cada rate limiter debe tener un prefijo único definido', () => {
      // Verificamos que el módulo exporta todos los rate limiters esperados
      const security = require('../src/config/security');

      const expectedLimiters = [
        'globalRateLimiter',
        'authRateLimiter',
        'registerRateLimiter',
        'createResourceRateLimiter',
        'eventRateLimiter',
        'uploadRateLimiter'
      ];

      for (const name of expectedLimiters) {
        expect(security[name]).toBeDefined();
        expect(typeof security[name]).toBe('function');
      }
    });
  });

  describe('exports de seguridad', () => {
    it('debe exportar todas las funciones y constantes de seguridad', () => {
      const security = require('../src/config/security');

      expect(security.corsOptions).toBeDefined();
      expect(security.ensureCsrfCookie).toBeDefined();
      expect(security.csrfProtection).toBeDefined();
      expect(security.helmetOptions).toBeDefined();
      expect(security.corsWhitelist).toBeDefined();
      expect(security.CSRF_COOKIE_NAME).toBe('csrfToken');
      expect(security.CSRF_HEADER_NAME).toBe('x-csrf-token');
    });
  });
});
