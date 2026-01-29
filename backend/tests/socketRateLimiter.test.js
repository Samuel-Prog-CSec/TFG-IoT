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

  test('bloquea temporalmente tras 3 violaciones consecutivas', async () => {
    let now = 2000;
    const limiter = createSocketRateLimiter({ nowProvider: () => now });
    const socket = createSocket();
    const handler = jest.fn();
    const wrapped = limiter.wrap(socket, 'start_play', handler);

    await wrapped({ playId: 'play-1' });
    await wrapped({ playId: 'play-1' });
    await wrapped({ playId: 'play-1' });
    await wrapped({ playId: 'play-1' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenLastCalledWith(
      'error',
      expect.objectContaining({ code: 'TEMP_BLOCKED', event: 'start_play' })
    );

    now += 60 * 1000 + 1;
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
});
