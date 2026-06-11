/**
 * @fileoverview Tests del parser defensivo del WebSerialService.
 *
 * Cubre 3 mejoras críticas frente al firmware actual (rfid_scanner/, inmutable):
 *  1. Filtro explícito del banner de boot ("RFID Scanner v1.0...") sin emitir error.
 *  2. Validación estricta del UID (8 ó 14 hex mayúsculas).
 *  3. Timeout de línea — buffer estancado se descarta tras 2s sin nuevos bytes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock del socket para evitar instanciar conexiones reales.
vi.mock('../socket', () => ({
  socketService: {
    emitGameFireAndForget: vi.fn(),
    isGameSocketConnected: vi.fn(() => false)
  }
}));

let WebSerialServiceCtor;
let webSerialServiceModule;

beforeEach(async () => {
  vi.resetModules();
  webSerialServiceModule = await import('../webSerialService');
  // El módulo no exporta la clase directamente, sólo el singleton.
  // Reutilizamos el singleton pero reseteamos su estado interno entre tests.
  WebSerialServiceCtor = webSerialServiceModule.webSerialService.constructor;
});

const buildSvc = () => new WebSerialServiceCtor();

describe('WebSerialService — parser defensivo', () => {
  describe('boot banner', () => {
    it('descarta la línea del banner sin emitir `error`', () => {
      const svc = buildSvc();
      const errSpy = vi.fn();
      const initSpy = vi.fn();
      const bannerSpy = vi.fn();
      svc.on('error', errSpy);
      svc.on('device_init', initSpy);
      svc.on('device_banner', bannerSpy);

      svc.buffer =
        'RFID Scanner v1.0 - Ready for MERN integration\n' +
        '{"event":"init","status":"success","version":"0xB2"}\n';
      svc.processBuffer();

      expect(initSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success', version: '0xB2' })
      );
      expect(bannerSpy).toHaveBeenCalledTimes(1);
      expect(errSpy).not.toHaveBeenCalled();
    });

    it('emite `device_banner` una única vez por sesión', () => {
      const svc = buildSvc();
      const bannerSpy = vi.fn();
      svc.on('device_banner', bannerSpy);

      svc.buffer = 'RFID Scanner v1.0 - Ready\n';
      svc.processBuffer();
      svc.buffer = 'RFID Scanner v1.0 - Ready\n';
      svc.processBuffer();

      expect(bannerSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('validación de UID', () => {
    it('acepta UIDs de 8 caracteres hex mayúsculas', () => {
      const svc = buildSvc();
      const scanSpy = vi.fn();
      const errSpy = vi.fn();
      svc.on('scan', scanSpy);
      svc.on('device_error', errSpy);

      svc.handleRawEvent({ event: 'card_detected', uid: '32B8FA05', type: 'MIFARE 1KB' });

      expect(scanSpy).toHaveBeenCalledTimes(1);
      expect(errSpy).not.toHaveBeenCalled();
    });

    it('acepta UIDs de 14 caracteres hex (NTAG)', () => {
      const svc = buildSvc();
      const scanSpy = vi.fn();
      svc.on('scan', scanSpy);

      svc.handleRawEvent({ event: 'card_detected', uid: '04E1B2A3C4D5E6', type: 'NTAG' });

      expect(scanSpy).toHaveBeenCalledTimes(1);
    });

    it('rechaza UID con caracteres no hex', () => {
      const svc = buildSvc();
      const scanSpy = vi.fn();
      const errSpy = vi.fn();
      svc.on('scan', scanSpy);
      svc.on('device_error', errSpy);

      svc.handleRawEvent({ event: 'card_detected', uid: 'ZZ!!1234', type: 'MIFARE 1KB' });

      expect(scanSpy).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'invalid_uid' })
      );
    });

    it('rechaza UID con longitud no estándar (10 chars)', () => {
      const svc = buildSvc();
      const scanSpy = vi.fn();
      const errSpy = vi.fn();
      svc.on('scan', scanSpy);
      svc.on('device_error', errSpy);

      svc.handleRawEvent({ event: 'card_detected', uid: 'AABBCCDDEE', type: 'MIFARE 1KB' });

      expect(scanSpy).not.toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'invalid_uid' })
      );
    });

    it('normaliza UID a mayúsculas y valida correctamente', () => {
      const svc = buildSvc();
      const scanSpy = vi.fn();
      svc.on('scan', scanSpy);

      svc.handleRawEvent({ event: 'card_detected', uid: '32b8fa05', type: 'MIFARE 1KB' });

      expect(scanSpy).toHaveBeenCalledWith(
        expect.objectContaining({ uid: '32B8FA05' })
      );
    });
  });

  describe('init handshake', () => {
    it('trata `status:"starting"` como inicialización, no error', () => {
      const svc = buildSvc();

      svc.handleRawEvent({ event: 'init', status: 'starting', version: 'rfid_v1.1' });

      expect(svc.deviceState).not.toBe('error');
      expect(svc.deviceState).toBe('initializing');

      // El init "starting" arma un timeout real (INIT_TIMEOUT_MS); lo limpiamos
      // para no dejar un timer colgando entre tests.
      if (svc.initTimeoutId) clearTimeout(svc.initTimeoutId);
    });
  });

  describe('reenvío de firma HMAC (T-905 B8)', () => {
    it('adjunta counter y hmac al payload cuando llegan bien formados', () => {
      const svc = buildSvc();
      const scanSpy = vi.fn();
      svc.on('scan', scanSpy);

      svc.handleRawEvent({
        event: 'card_detected',
        uid: '32B8FA05',
        type: 'MIFARE 1KB',
        counter: 7,
        hmac: 'a'.repeat(64)
      });

      expect(scanSpy).toHaveBeenCalledWith(
        expect.objectContaining({ uid: '32B8FA05', counter: 7, hmac: 'a'.repeat(64) })
      );
    });

    it('omite counter/hmac si el firmware no los envía (compat)', () => {
      const svc = buildSvc();
      const scanSpy = vi.fn();
      svc.on('scan', scanSpy);

      svc.handleRawEvent({ event: 'card_detected', uid: '32B8FA05', type: 'MIFARE 1KB' });

      const payload = scanSpy.mock.calls[0][0];
      expect(payload).not.toHaveProperty('counter');
      expect(payload).not.toHaveProperty('hmac');
    });

    it('omite la firma si solo llega uno de los dos campos (parcial inválido)', () => {
      const svc = buildSvc();
      const scanSpy = vi.fn();
      svc.on('scan', scanSpy);

      svc.handleRawEvent({ event: 'card_detected', uid: '32B8FA05', type: 'MIFARE 1KB', counter: 3 });

      const payload = scanSpy.mock.calls[0][0];
      expect(payload).not.toHaveProperty('counter');
      expect(payload).not.toHaveProperty('hmac');
    });
  });

  describe('timeout de línea', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('descarta el buffer estancado tras LINE_TIMEOUT_MS sin bytes nuevos', () => {
      const svc = buildSvc();
      const errSpy = vi.fn();
      svc.on('error', errSpy);

      // Simular buffer parcial sin newline.
      svc.buffer = '{"event":"card_de';
      svc.lastByteAt = Date.now();
      svc._armLineTimeoutWatchdog();

      // Nada pasa antes del timeout.
      vi.advanceTimersByTime(1500);
      expect(errSpy).not.toHaveBeenCalled();
      expect(svc.buffer.length).toBeGreaterThan(0);

      // Pasados 2s sin bytes, descarta el buffer y emite error.
      vi.advanceTimersByTime(1000);
      expect(svc.buffer).toBe('');
      expect(errSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'line_timeout' })
      );
    });

    it('si llegan bytes nuevos durante la espera, no descarta', () => {
      const svc = buildSvc();
      const errSpy = vi.fn();
      svc.on('error', errSpy);

      svc.buffer = '{"event":"';
      svc.lastByteAt = Date.now();
      svc._armLineTimeoutWatchdog();

      vi.advanceTimersByTime(1500);
      svc.lastByteAt = Date.now(); // simulamos byte recién llegado
      vi.advanceTimersByTime(1500);

      expect(errSpy).not.toHaveBeenCalled();
      expect(svc.buffer.length).toBeGreaterThan(0);
    });
  });
});
