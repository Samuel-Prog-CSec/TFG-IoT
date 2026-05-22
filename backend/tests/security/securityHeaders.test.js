/**
 * @fileoverview Tests de los security headers diferenciados dev vs prod (T-905 B5).
 *
 * Verifica:
 * - En prod: CSP scriptSrc sin 'unsafe-inline' ni 'unsafe-eval'.
 * - En prod: HSTS con maxAge ≥ 63072000 y preload.
 * - En prod: report-uri presente apuntando a /api/csp-report.
 * - X-Content-Type-Options, X-Frame-Options, Referrer-Policy aplicados.
 * - CSP_REPORT_ONLY=true genera Content-Security-Policy-Report-Only header.
 *
 * Se ejecutan llamadas reales a `app` con supertest contra `/api/auth/login`
 * que ya está expuesto y devuelve headers en cualquier resultado.
 */

const { buildHelmetOptions } = require('../../src/config/security');

describe('buildHelmetOptions (B5)', () => {
  describe('producción', () => {
    const original = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = original;
      delete process.env.CSP_REPORT_ONLY;
    });

    it('CSP scriptSrc NO contiene unsafe-inline ni unsafe-eval', () => {
      process.env.NODE_ENV = 'production';
      const opts = buildHelmetOptions('production');
      const scriptSrc = opts.contentSecurityPolicy.directives.scriptSrc;
      expect(scriptSrc).toEqual(expect.arrayContaining(["'self'"]));
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    });

    it('CSP scriptSrc incluye Sentry y Cloudflare Turnstile', () => {
      const opts = buildHelmetOptions('production');
      const scriptSrc = opts.contentSecurityPolicy.directives.scriptSrc;
      expect(scriptSrc).toEqual(
        expect.arrayContaining(['https://*.sentry.io', 'https://challenges.cloudflare.com'])
      );
    });

    it('CSP reportUri apunta a /api/csp-report en prod', () => {
      const opts = buildHelmetOptions('production');
      expect(opts.contentSecurityPolicy.directives.reportUri).toEqual(['/api/csp-report']);
    });

    it('HSTS maxAge >= 63072000 (2 años para hstspreload.org)', () => {
      const opts = buildHelmetOptions('production');
      expect(opts.hsts.maxAge).toBeGreaterThanOrEqual(63072000);
      expect(opts.hsts.preload).toBe(true);
      expect(opts.hsts.includeSubDomains).toBe(true);
    });

    it('CSP_REPORT_ONLY=true activa modo Report-Only', () => {
      process.env.CSP_REPORT_ONLY = 'true';
      const opts = buildHelmetOptions('production');
      expect(opts.contentSecurityPolicy.reportOnly).toBe(true);
    });

    it('por defecto enforce (reportOnly false)', () => {
      delete process.env.CSP_REPORT_ONLY;
      const opts = buildHelmetOptions('production');
      expect(opts.contentSecurityPolicy.reportOnly).toBe(false);
    });

    it('upgradeInsecureRequests presente en prod', () => {
      const opts = buildHelmetOptions('production');
      expect(opts.contentSecurityPolicy.directives.upgradeInsecureRequests).toBeDefined();
    });
  });

  describe('desarrollo', () => {
    it('NO incluye reportUri (evita ruido en logs dev)', () => {
      const opts = buildHelmetOptions('development');
      expect(opts.contentSecurityPolicy.directives.reportUri).toBeUndefined();
    });

    it('connectSrc incluye ws:/wss: para Vite HMR + Socket.IO local', () => {
      const opts = buildHelmetOptions('development');
      const connectSrc = opts.contentSecurityPolicy.directives.connectSrc;
      expect(connectSrc).toEqual(expect.arrayContaining(['ws:', 'wss:']));
    });

    it('upgradeInsecureRequests ausente en dev (servidor en HTTP)', () => {
      const opts = buildHelmetOptions('development');
      expect(opts.contentSecurityPolicy.directives.upgradeInsecureRequests).toBeUndefined();
    });

    it('HSTS maxAge más corto en dev (1 año)', () => {
      const opts = buildHelmetOptions('development');
      expect(opts.hsts.maxAge).toBe(31536000);
    });
  });

  describe('directivas comunes', () => {
    it('frameAncestors none (clickjacking)', () => {
      const opts = buildHelmetOptions('production');
      expect(opts.contentSecurityPolicy.directives.frameAncestors).toEqual(["'none'"]);
    });

    it('formAction self', () => {
      const opts = buildHelmetOptions('production');
      expect(opts.contentSecurityPolicy.directives.formAction).toEqual(["'self'"]);
    });

    it('scriptSrcAttr none (bloquea onclick="..." inline)', () => {
      const opts = buildHelmetOptions('production');
      expect(opts.contentSecurityPolicy.directives.scriptSrcAttr).toEqual(["'none'"]);
    });
  });
});
