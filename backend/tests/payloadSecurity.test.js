/**
 * @fileoverview Tests unitarios para payloadSecurity y securityPayloadGuard middleware.
 * Verifica detección de prototype pollution, NoSQL injection y funcionamiento del middleware.
 */

const { findDangerousPayloadPath } = require('../src/utils/payloadSecurity');
const { securityPayloadGuard } = require('../src/middlewares/securityPayloadGuard');

describe('findDangerousPayloadPath', () => {
  describe('prototype pollution detection', () => {
    it('detects __proto__ at top level', () => {
      const payload = JSON.parse('{"__proto__": {}}');
      const result = findDangerousPayloadPath(payload);

      expect(result).toBe('__proto__');
    });

    it('detects prototype in nested objects', () => {
      const result = findDangerousPayloadPath({ user: { prototype: 'x' } });

      expect(result).toBe('user.prototype');
    });

    it('detects constructor as a dangerous key', () => {
      const result = findDangerousPayloadPath({ constructor: { name: 'evil' } });

      expect(result).toBe('constructor');
    });

    it('is case-insensitive for dangerous keys', () => {
      const result = findDangerousPayloadPath({ CONSTRUCTOR: 'x' });

      expect(result).toBe('CONSTRUCTOR');
    });
  });

  describe('NoSQL injection detection', () => {
    it('detects keys starting with $', () => {
      const result = findDangerousPayloadPath({ $gt: 100 });

      expect(result).toBe('$gt');
    });

    it('detects nested $ operators', () => {
      const result = findDangerousPayloadPath({ filter: { age: { $ne: null } } });

      expect(result).toBe('filter.age.$ne');
    });
  });

  describe('safe payloads', () => {
    it('returns null for normal objects', () => {
      const result = findDangerousPayloadPath({
        name: 'John',
        email: 'john@test.com',
        age: 25
      });

      expect(result).toBeNull();
    });

    it('returns null for empty object', () => {
      expect(findDangerousPayloadPath({})).toBeNull();
    });

    it('returns null for non-object values', () => {
      expect(findDangerousPayloadPath('string')).toBeNull();
      expect(findDangerousPayloadPath(42)).toBeNull();
      expect(findDangerousPayloadPath(null)).toBeNull();
      expect(findDangerousPayloadPath(undefined)).toBeNull();
    });
  });

  describe('nested structures', () => {
    it('detects dangerous keys inside arrays', () => {
      const inner = JSON.parse('{"__proto__": {}}');
      const result = findDangerousPayloadPath([{ name: 'ok' }, inner]);

      expect(result).toBe('[1].__proto__');
    });

    it('detects deeply nested dangerous keys', () => {
      const result = findDangerousPayloadPath({
        level1: { level2: { level3: { $where: 'x' } } }
      });

      expect(result).toBe('level1.level2.level3.$where');
    });

    it('returns correct path notation for array items', () => {
      const result = findDangerousPayloadPath({
        items: [{ ok: true }, { $set: true }]
      });

      expect(result).toBe('items[1].$set');
    });
  });
});

describe('securityPayloadGuard middleware', () => {
  const buildReq = (overrides = {}) => ({
    body: {},
    query: {},
    params: {},
    ip: '127.0.0.1',
    method: 'POST',
    originalUrl: '/test',
    headers: { 'user-agent': 'test' },
    ...overrides
  });

  const res = {};

  it('calls next() for safe payloads', () => {
    const req = buildReq({ body: { name: 'test' } });
    const next = jest.fn();

    securityPayloadGuard(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('blocks request with dangerous body', () => {
    const req = buildReq({ body: JSON.parse('{"__proto__": {}}') });
    const next = jest.fn();

    securityPayloadGuard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400
      })
    );
  });

  it('blocks request with dangerous query parameter', () => {
    const req = buildReq({ query: { role: { $ne: null } } });
    const next = jest.fn();

    securityPayloadGuard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400
      })
    );
  });

  it('blocks request with dangerous params', () => {
    const req = buildReq({ params: { id: { $gt: '' } } });
    const next = jest.fn();

    securityPayloadGuard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400
      })
    );
  });

  it('inspects body, query, and params in order', () => {
    const req = buildReq({
      body: { safe: true },
      query: { safe: true },
      params: { constructor: 'evil' }
    });
    const next = jest.fn();

    securityPayloadGuard(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400
      })
    );
  });
});
