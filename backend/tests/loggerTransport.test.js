/**
 * @fileoverview Tests del switch del transport del logger (T-904 Fase B).
 * Verifica que el shipping a Loki sólo se activa con la combinación correcta
 * de env vars y dependencia instalada, y que degrada de forma elegante en
 * cualquier otro caso (sin crashear el proceso).
 */

const { __internals } = require('../src/utils/logger');
const { shouldShipToLoki, CONTROL_CHARS_REGEX, hasPinoLoki } = __internals;

describe('utils/logger — switch del transport Loki', () => {
  const originalEnv = process.env;
  let stderrSpy;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LOG_SHIPPING_ENABLED;
    delete process.env.LOG_SHIPPING_HOST;
    delete process.env.LOG_SHIPPING_TOKEN;
    delete process.env.LOG_SHIPPING_USER;
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.env = originalEnv;
    stderrSpy.mockRestore();
  });

  it('no envía a Loki cuando LOG_SHIPPING_ENABLED no está definido', () => {
    expect(shouldShipToLoki()).toBe(false);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('no envía a Loki cuando LOG_SHIPPING_ENABLED es "false"', () => {
    process.env.LOG_SHIPPING_ENABLED = 'false';
    expect(shouldShipToLoki()).toBe(false);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('emite warning a stderr y degrada cuando faltan credenciales', () => {
    process.env.LOG_SHIPPING_ENABLED = 'true';
    // No definimos HOST ni TOKEN.
    expect(shouldShipToLoki()).toBe(false);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy.mock.calls[0][0]).toMatch(/faltan LOG_SHIPPING_HOST o LOG_SHIPPING_TOKEN/);
  });

  it('emite warning cuando sólo HOST está definido (TOKEN ausente)', () => {
    process.env.LOG_SHIPPING_ENABLED = 'true';
    process.env.LOG_SHIPPING_HOST = 'https://logs.example.com';
    expect(shouldShipToLoki()).toBe(false);
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it('activa shipping cuando ENABLED=true + HOST + TOKEN + pino-loki instalado', () => {
    process.env.LOG_SHIPPING_ENABLED = 'true';
    process.env.LOG_SHIPPING_HOST = 'https://logs-prod-eu-west-0.grafana.net';
    process.env.LOG_SHIPPING_TOKEN = 'glc_dummy';
    process.env.LOG_SHIPPING_USER = '123456';

    // Si pino-loki está instalado (es dep), debe devolver true. Si por alguna
    // razón se quita la dep en el futuro, el helper también degrada — verificamos.
    const result = shouldShipToLoki();
    if (hasPinoLoki()) {
      expect(result).toBe(true);
    } else {
      expect(result).toBe(false);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringMatching(/pino-loki.*no está instalado/));
    }
  });
});

describe('utils/logger — CONTROL_CHARS_REGEX', () => {
  it('matchea chars de control U+0000-U+001F (saltos de línea, tabs, etc.)', () => {
    const samples = [
      String.fromCharCode(0), // NUL
      String.fromCharCode(9), // TAB
      String.fromCharCode(10), // LF
      String.fromCharCode(13), // CR
      String.fromCharCode(27), // ESC
      String.fromCharCode(127) // DEL
    ];
    for (const ch of samples) {
      // El regex tiene flag global; reset lastIndex para que cada test sea independiente.
      CONTROL_CHARS_REGEX.lastIndex = 0;
      expect(CONTROL_CHARS_REGEX.test(ch)).toBe(true);
    }
  });

  it('no matchea caracteres imprimibles habituales', () => {
    const harmless = ['a', 'Z', '0', ' ', '~', 'ñ', 'é', '中'];
    for (const ch of harmless) {
      CONTROL_CHARS_REGEX.lastIndex = 0;
      expect(CONTROL_CHARS_REGEX.test(ch)).toBe(false);
    }
  });

  it('replaceAll elimina inyección de saltos de línea de input de usuario', () => {
    const malicious = `User\nInjected\rPayload${String.fromCharCode(0)}END`;
    CONTROL_CHARS_REGEX.lastIndex = 0;
    expect(malicious.replaceAll(CONTROL_CHARS_REGEX, '')).toBe('UserInjectedPayloadEND');
  });
});
