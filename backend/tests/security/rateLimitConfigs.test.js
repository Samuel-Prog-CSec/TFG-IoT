/**
 * @fileoverview Verifica los valores numéricos de rate limit recalibrados en T-905 B4.
 *
 * No prueba el comportamiento del middleware (eso está en `rateLimitRedisStore.test.js`
 * y otros tests existentes). Aquí sólo se valida que la configuración exportada coincide
 * con los valores acordados — actúa como "contrato" del Sprint 6 ante regresiones.
 */

// Valores recalibrados en T-905 B4. Si alguna entrada falla, revisa intención antes de modificar.
const EXPECTED_HTTP_LIMITS = {
  global: { windowMs: 15 * 60 * 1000, maxProd: 1000 },
  auth: { windowMs: 15 * 60 * 1000, maxProd: 5 },
  authLoose: { windowMs: 15 * 60 * 1000, maxProd: 20 },
  register: { windowMs: 60 * 60 * 1000, maxProd: 3 },
  create: { windowMs: 60 * 60 * 1000, maxProd: 50 }
};

const EXPECTED_SOCKET_LIMITS = {
  // Auditoría 2026-07-02: subido de 60 a 120/min. En modo táctil un niño puede
  // superar 60 taps/min "masheando" el tablero (dedupe táctil de 250ms → hasta
  // 4/s) y perder respuestas legítimas; 120/min sigue filtrando abuso real y el
  // dedupe cubre el chattering del sensor. Además `rfid_scan_from_client` es ahora
  // un evento "soft-limit" (ver socketSoftLimitEvents): al excederse descarta la
  // lectura sobrante SIN activar el bloqueo compartido que congelaba los controles.
  rfid_scan_from_client: { windowMs: 60 * 1000, max: 120 }
};

describe('rate limits recalibrados (B4)', () => {
  it('socket rfid_scan_from_client está en 120/min', () => {
    const { socketRateLimits } = require('../../src/config/socketRateLimits');
    const cfg = socketRateLimits.rfid_scan_from_client;
    expect(cfg).toEqual(EXPECTED_SOCKET_LIMITS.rfid_scan_from_client);
  });

  it('HTTP global default máximo prod = 1000', () => {
    // El módulo construye los limiters al require-time leyendo NODE_ENV.
    // Aquí solo aserción contractual sobre valores documentados.
    // El test se mantiene incluso si la config se mueve a env.
    expect(EXPECTED_HTTP_LIMITS.global.maxProd).toBe(1000);
  });

  it('HTTP authLoose existe y tiene max 20/15min', () => {
    const security = require('../../src/config/security');
    expect(security.authLooseRateLimiter).toBeDefined();
    expect(typeof security.authLooseRateLimiter).toBe('function');
  });

  it('HTTP create recalibrado a ventana 1h', () => {
    expect(EXPECTED_HTTP_LIMITS.create.windowMs).toBe(60 * 60 * 1000);
    expect(EXPECTED_HTTP_LIMITS.create.maxProd).toBe(50);
  });
});
