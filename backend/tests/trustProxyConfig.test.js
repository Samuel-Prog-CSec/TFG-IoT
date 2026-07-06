const { resolveTrustProxyHops } = require('../src/utils/trustProxyConfig');

describe('resolveTrustProxyHops', () => {
  it('devuelve 1 por defecto si no hay TRUST_PROXY_HOPS', () => {
    expect(resolveTrustProxyHops({})).toBe(1);
  });

  it('respeta TRUST_PROXY_HOPS cuando es un entero válido', () => {
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
  });

  it('ignora valores no numéricos y usa el default', () => {
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: 'abc' })).toBe(1);
  });

  it('ignora valores <= 0 y usa el default', () => {
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '0' })).toBe(1);
  });
});
