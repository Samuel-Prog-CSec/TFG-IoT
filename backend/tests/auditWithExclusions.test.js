/**
 * @fileoverview Tests unitarios para el helper Security gate.
 * Verifica el comportamiento del filtro de exclusiones GHSA contra fixtures
 * que reproducen la salida real de `npm audit --omit=dev --json`.
 *
 * Casos cubiertos:
 *   1. Audit limpio (sin vulnerabilities).
 *   2. Vuln directa con GHSA en `via[0].url` listado en `excluded`.
 *   3. Caso real del bug ip-address + express-rate-limit (cadena objeto+string).
 *   4. Vuln directa con GHSA fuera de la lista de exclusiones.
 *   5. Vuln con `via[0].source` numérico sin `url` — debe fallar seguro.
 *   6. Frontend con axios y los 3 GHSAs documentados como no alcanzables.
 *   7. Ciclo en el grafo de via — no debe colgarse.
 *   8. parseArgs maneja --key=value y --key value.
 */

const {
  extractGhsa,
  isCovered,
  analyzeVulnerabilities,
  parseArgs
} = require('../scripts/audit-with-exclusions');

describe('extractGhsa', () => {
  it('extrae GHSA del campo url cuando existe', () => {
    expect(extractGhsa({ url: 'https://github.com/advisories/GHSA-v2v4-37r5-5v8g' })).toBe(
      'GHSA-v2v4-37r5-5v8g'
    );
  });

  it('devuelve null si el url no contiene GHSA-', () => {
    expect(extractGhsa({ url: 'https://example.com/advisory/123' })).toBeNull();
  });

  it('devuelve null si solo hay source numérico (no GHSA-id)', () => {
    expect(extractGhsa({ source: 1234567, name: 'foo' })).toBeNull();
  });

  it('devuelve null para entradas no objeto', () => {
    expect(extractGhsa('ip-address')).toBeNull();
    expect(extractGhsa(null)).toBeNull();
    expect(extractGhsa(undefined)).toBeNull();
  });
});

describe('analyzeVulnerabilities — caso 1: audit limpio', () => {
  it('devuelve listas vacías cuando no hay vulnerabilities', () => {
    const { real, covered } = analyzeVulnerabilities({ vulnerabilities: {} }, new Set());
    expect(real).toEqual([]);
    expect(covered).toEqual([]);
  });

  it('tolera ausencia de la clave vulnerabilities', () => {
    const { real, covered } = analyzeVulnerabilities({}, new Set());
    expect(real).toEqual([]);
    expect(covered).toEqual([]);
  });
});

describe('analyzeVulnerabilities — caso 2: vuln directa cubierta', () => {
  it('considera cubierta una vuln cuyo único via objeto tiene GHSA excluido', () => {
    const data = {
      vulnerabilities: {
        'ip-address': {
          name: 'ip-address',
          severity: 'moderate',
          via: [
            {
              source: 99999,
              name: 'ip-address',
              url: 'https://github.com/advisories/GHSA-v2v4-37r5-5v8g',
              severity: 'moderate'
            }
          ]
        }
      }
    };
    const excluded = new Set(['GHSA-v2v4-37r5-5v8g']);
    const { real, covered } = analyzeVulnerabilities(data, excluded);
    expect(real).toEqual([]);
    expect(covered).toEqual(['ip-address']);
  });
});

describe('analyzeVulnerabilities — caso 3: cadena ip-address + express-rate-limit (bug original)', () => {
  it('cubre ambas vulns cuando la raíz está excluida', () => {
    const data = {
      vulnerabilities: {
        'ip-address': {
          name: 'ip-address',
          severity: 'moderate',
          via: [
            {
              source: 99999,
              name: 'ip-address',
              url: 'https://github.com/advisories/GHSA-v2v4-37r5-5v8g',
              severity: 'moderate'
            }
          ]
        },
        'express-rate-limit': {
          name: 'express-rate-limit',
          severity: 'moderate',
          via: ['ip-address']
        }
      }
    };
    const excluded = new Set(['GHSA-v2v4-37r5-5v8g']);
    const { real, covered } = analyzeVulnerabilities(data, excluded);
    expect(real).toEqual([]);
    expect(covered.sort()).toEqual(['express-rate-limit', 'ip-address']);
  });

  it('cuando la raíz NO está excluida, ambas vulns cuentan como reales', () => {
    const data = {
      vulnerabilities: {
        'ip-address': {
          name: 'ip-address',
          severity: 'moderate',
          via: [
            {
              url: 'https://github.com/advisories/GHSA-v2v4-37r5-5v8g',
              severity: 'moderate'
            }
          ]
        },
        'express-rate-limit': {
          name: 'express-rate-limit',
          severity: 'moderate',
          via: ['ip-address']
        }
      }
    };
    const excluded = new Set();
    const { real } = analyzeVulnerabilities(data, excluded);
    expect(real.sort()).toEqual(['express-rate-limit', 'ip-address']);
  });
});

describe('analyzeVulnerabilities — caso 4: vuln directa fuera de la lista', () => {
  it('marca como real una vuln cuyo GHSA no está en exclusiones', () => {
    const data = {
      vulnerabilities: {
        'unknown-pkg': {
          name: 'unknown-pkg',
          severity: 'high',
          via: [
            {
              url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
              severity: 'high'
            }
          ]
        }
      }
    };
    const excluded = new Set(['GHSA-v2v4-37r5-5v8g']);
    const { real, covered } = analyzeVulnerabilities(data, excluded);
    expect(real).toEqual(['unknown-pkg']);
    expect(covered).toEqual([]);
  });
});

describe('analyzeVulnerabilities — caso 5: defensive con source numérico sin url', () => {
  it('falla seguro: una vuln cuyo via no aporta GHSA-id no se considera cubierta', () => {
    const data = {
      vulnerabilities: {
        'mystery-pkg': {
          name: 'mystery-pkg',
          severity: 'moderate',
          via: [{ source: 12345, name: 'mystery-pkg', severity: 'moderate' }]
        }
      }
    };
    const excluded = new Set(['GHSA-anything']);
    const { real } = analyzeVulnerabilities(data, excluded);
    expect(real).toEqual(['mystery-pkg']);
  });
});

describe('analyzeVulnerabilities — caso 6: frontend axios + follow-redirects', () => {
  it('cubre los 3 GHSAs documentados de axios cuando están en exclusiones', () => {
    const data = {
      vulnerabilities: {
        axios: {
          name: 'axios',
          severity: 'high',
          via: [
            {
              url: 'https://github.com/advisories/GHSA-3p68-rc4w-qgx5',
              severity: 'high'
            },
            {
              url: 'https://github.com/advisories/GHSA-fvcv-3m26-pcqx',
              severity: 'moderate'
            }
          ]
        },
        'follow-redirects': {
          name: 'follow-redirects',
          severity: 'moderate',
          via: [
            {
              url: 'https://github.com/advisories/GHSA-r4q5-vmmm-2653',
              severity: 'moderate'
            }
          ]
        }
      }
    };
    const excluded = new Set(['GHSA-3p68-rc4w-qgx5', 'GHSA-fvcv-3m26-pcqx', 'GHSA-r4q5-vmmm-2653']);
    const { real, covered } = analyzeVulnerabilities(data, excluded);
    expect(real).toEqual([]);
    expect(covered.sort()).toEqual(['axios', 'follow-redirects']);
  });

  it('si falta una sola GHSA en exclusiones, axios cuenta como real', () => {
    const data = {
      vulnerabilities: {
        axios: {
          name: 'axios',
          severity: 'high',
          via: [
            { url: 'https://github.com/advisories/GHSA-3p68-rc4w-qgx5' },
            { url: 'https://github.com/advisories/GHSA-fvcv-3m26-pcqx' }
          ]
        }
      }
    };
    const excluded = new Set(['GHSA-3p68-rc4w-qgx5']);
    const { real } = analyzeVulnerabilities(data, excluded);
    expect(real).toEqual(['axios']);
  });
});

describe('isCovered — robustez contra ciclos', () => {
  it('no se cuelga ante ciclos en via', () => {
    const vulnerabilities = {
      a: { name: 'a', via: ['b'] },
      b: { name: 'b', via: ['a'] }
    };
    expect(() => isCovered('a', vulnerabilities, new Set())).not.toThrow();
  });
});

describe('parseArgs', () => {
  it('parsea --key value', () => {
    const result = parseArgs(['--workspace', 'backend', '--excluded', 'GHSA-a,GHSA-b']);
    expect(result).toEqual({ workspace: 'backend', excluded: 'GHSA-a,GHSA-b', label: '' });
  });

  it('parsea --key=value', () => {
    const result = parseArgs(['--workspace=frontend', '--label=Frontend']);
    expect(result).toEqual({ workspace: 'frontend', excluded: '', label: 'Frontend' });
  });

  it('ignora flags desconocidos', () => {
    const result = parseArgs(['--workspace', 'backend', '--unknown', 'foo']);
    expect(result.workspace).toBe('backend');
  });
});
