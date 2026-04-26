const { createSocketRateLimiter } = require('../src/middlewares/socketRateLimiter');

const createSocket = (overrides = {}) => ({
  id: overrides.id || 'socket-1',
  data: overrides.data || {},
  emit: overrides.emit || jest.fn()
});

describe('socketRateLimiter', () => {
  test('permite tráfico normal en start_play', async () => {
    const now = 1000;
    const limiter = createSocketRateLimiter({ nowProvider: () => now });
    const socket = createSocket();
    const handler = jest.fn();
    const wrapped = limiter.wrap(socket, 'start_play', handler);

    await wrapped({ playId: 'play-1' });
    await wrapped({ playId: 'play-1' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'RATE_LIMITED', event: 'start_play' })
    );
  });

  test('bloquea temporalmente tras 5 violaciones consecutivas', async () => {
    let now = 2000;
    const limiter = createSocketRateLimiter({ nowProvider: () => now });
    const socket = createSocket();
    const handler = jest.fn();
    const wrapped = limiter.wrap(socket, 'start_play', handler);

    // 1 evento pasa + 5 violaciones = bloqueo tras la 5a violación
    await wrapped({ playId: 'play-1' });
    await wrapped({ playId: 'play-1' });
    await wrapped({ playId: 'play-1' });
    await wrapped({ playId: 'play-1' });
    await wrapped({ playId: 'play-1' });
    await wrapped({ playId: 'play-1' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenLastCalledWith(
      'error',
      expect.objectContaining({ code: 'TEMP_BLOCKED', event: 'start_play' })
    );

    // Bloqueo de 15s (socketBlockConfig.blockDurationMs)
    now += 15 * 1000 + 1;
    await wrapped({ playId: 'play-1' });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  test('rechaza payloads demasiado grandes', async () => {
    const now = 3000;
    const limiter = createSocketRateLimiter({ nowProvider: () => now });
    const socket = createSocket({ data: { userId: 'user-1' } });
    const handler = jest.fn();
    const wrapped = limiter.wrap(socket, 'rfid_scan_from_client', handler);

    const oversizedPayload = {
      uid: '32B8FA05',
      sensorId: 'sensor-1',
      payload: 'x'.repeat(9 * 1024)
    };

    await wrapped(oversizedPayload);

    expect(handler).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE', event: 'rfid_scan_from_client' })
    );
  });

  test('dedupe bloquea eventos RFID duplicados en cooldown', async () => {
    let now = 4000;
    const limiter = createSocketRateLimiter({ nowProvider: () => now });
    const socket = createSocket({ data: { userId: 'user-2' } });
    const handler = jest.fn();
    const wrapped = limiter.wrap(socket, 'rfid_scan_from_client', handler);

    await wrapped({ uid: '32B8FA05', sensorId: 'sensor-1' });
    now += 500;
    await wrapped({ uid: '32B8FA05', sensorId: 'sensor-1' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ code: 'DUPLICATE_RFID_EVENT', event: 'rfid_scan_from_client' })
    );
  });

  describe('PROP-90 / ADR-090: dedupe diferenciado por source', () => {
    test('touch_memory_flip permite dos scans del mismo UID a 300ms de distancia', async () => {
      let now = 5000;
      const limiter = createSocketRateLimiter({ nowProvider: () => now });
      const socket = createSocket({ data: { userId: 'user-touch' } });
      const handler = jest.fn();
      const wrapped = limiter.wrap(socket, 'rfid_scan_from_client', handler);

      await wrapped({
        uid: 'AAAAAA01',
        sensorId: 'touch_fallback_sensor',
        source: 'touch_memory_flip'
      });
      now += 300;
      await wrapped({
        uid: 'AAAAAA01',
        sensorId: 'touch_fallback_sensor',
        source: 'touch_memory_flip'
      });

      // Con cooldown 250ms para touch_memory_flip, 300ms ya está fuera de la ventana.
      expect(handler).toHaveBeenCalledTimes(2);
    });

    test('touch_memory_flip bloquea dos scans del mismo UID a 200ms de distancia', async () => {
      let now = 6000;
      const limiter = createSocketRateLimiter({ nowProvider: () => now });
      const socket = createSocket({ data: { userId: 'user-touch-2' } });
      const handler = jest.fn();
      const wrapped = limiter.wrap(socket, 'rfid_scan_from_client', handler);

      await wrapped({
        uid: 'BBBBBB02',
        sensorId: 'touch_fallback_sensor',
        source: 'touch_memory_flip'
      });
      now += 200;
      await wrapped({
        uid: 'BBBBBB02',
        sensorId: 'touch_fallback_sensor',
        source: 'touch_memory_flip'
      });

      // 200ms está dentro del cooldown 250ms → segundo scan dedupe.
      expect(handler).toHaveBeenCalledTimes(1);
      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ code: 'DUPLICATE_RFID_EVENT' })
      );
    });

    test('web_serial_hardware mantiene el cooldown largo (1200ms) para protección anti-chattering', async () => {
      let now = 7000;
      const limiter = createSocketRateLimiter({ nowProvider: () => now });
      const socket = createSocket({ data: { userId: 'user-hw' } });
      const handler = jest.fn();
      const wrapped = limiter.wrap(socket, 'rfid_scan_from_client', handler);

      await wrapped({ uid: 'CCCCCC03', sensorId: 'sensor-hw', source: 'web_serial_hardware' });
      now += 800;
      await wrapped({ uid: 'CCCCCC03', sensorId: 'sensor-hw', source: 'web_serial_hardware' });

      // 800ms < 1200ms cooldown hardware → segundo scan dedupe.
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('source ausente cae en defaultCooldownMs (1200ms)', async () => {
      let now = 8000;
      const limiter = createSocketRateLimiter({ nowProvider: () => now });
      const socket = createSocket({ data: { userId: 'user-default' } });
      const handler = jest.fn();
      const wrapped = limiter.wrap(socket, 'rfid_scan_from_client', handler);

      await wrapped({ uid: 'DDDDDD04', sensorId: 'sensor-default' });
      now += 500;
      await wrapped({ uid: 'DDDDDD04', sensorId: 'sensor-default' });

      // Sin source explícito → defaultCooldownMs 1200ms → 500ms dedupe.
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('mismo UID con sources distintos NO se ahogan entre sí', async () => {
      let now = 9000;
      const limiter = createSocketRateLimiter({ nowProvider: () => now });
      const socket = createSocket({ data: { userId: 'user-mixed' } });
      const handler = jest.fn();
      const wrapped = limiter.wrap(socket, 'rfid_scan_from_client', handler);

      await wrapped({ uid: 'EEEEEE05', sensorId: 'touch', source: 'touch_memory_flip' });
      now += 100;
      // Cambio de source: el dedupeKey es distinto → ambos deben pasar.
      await wrapped({ uid: 'EEEEEE05', sensorId: 'touch', source: 'touch_fallback' });

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});
