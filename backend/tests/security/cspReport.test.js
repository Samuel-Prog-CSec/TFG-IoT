/**
 * @fileoverview Tests del endpoint /api/csp-report (T-905 B5).
 *
 * Verifica:
 * - Acepta JSON con formato `csp-report` clásico → 204.
 * - Acepta arrays formato Report-To (HTTP Reporting API) → 204.
 * - Rechaza JSON malformado → 400.
 * - Rechaza body vacío → 400.
 * - No requiere autenticación (el navegador no envía cookies/tokens aquí).
 * - No es bloqueado por CSRF (skip path explícito).
 */

const request = require('supertest');
const { app } = require('../../src/server');

describe('CSP report endpoint (B5)', () => {
  it('acepta payload csp-report clásico → 204', async () => {
    const payload = {
      'csp-report': {
        'document-uri': 'https://eduplay.test/dashboard',
        'violated-directive': "script-src 'self'",
        'effective-directive': 'script-src',
        'blocked-uri': 'https://evil.com/malicious.js',
        disposition: 'enforce'
      }
    };

    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify(payload));
    expect(res.statusCode).toBe(204);
  });

  it('acepta payload Report-To array → 204', async () => {
    const payload = [
      {
        type: 'csp-violation',
        body: {
          documentURL: 'https://eduplay.test/login',
          violatedDirective: 'script-src',
          blockedURL: 'https://untrusted.example.com'
        }
      }
    ];

    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/reports+json')
      .send(JSON.stringify(payload));
    expect(res.statusCode).toBe(204);
  });

  it('rechaza JSON malformado → 400', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send('{ not valid json');
    expect(res.statusCode).toBe(400);
  });

  it('rechaza body vacío → 400', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send('');
    expect(res.statusCode).toBe(400);
  });

  it('no requiere autenticación', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { 'document-uri': 'test' } }));
    // Sin Authorization header — debe aceptar igual
    expect(res.statusCode).toBe(204);
  });

  it('no es bloqueado por CSRF (skip path)', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      // SIN cookies CSRF ni header x-csrf-token — debe aceptar igual
      .send(JSON.stringify({ 'csp-report': { 'document-uri': 'test' } }));
    expect(res.statusCode).toBe(204);
  });
});
