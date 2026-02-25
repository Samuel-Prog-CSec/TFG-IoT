const { io: ioClient } = require('socket.io-client');
const User = require('../src/models/User');
const GameSession = require('../src/models/GameSession');
const GamePlay = require('../src/models/GamePlay');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const Card = require('../src/models/Card');
const CardDeck = require('../src/models/CardDeck');
const userRepository = require('../src/repositories/userRepository');
const gamePlayRepository = require('../src/repositories/gamePlayRepository');
const { generateTokenPair } = require('../src/middlewares/auth');
const { disconnectUserSockets } = require('../src/utils/socketUtils');
const { server, io } = require('../src/server');

const fingerprintHeaders = {
  'user-agent': 'jest-socket-test',
  'accept-language': 'en',
  'accept-encoding': 'gzip'
};

const mockReq = {
  headers: {
    'user-agent': 'jest-socket-test',
    'accept-language': 'en',
    'accept-encoding': 'gzip'
  }
};

const waitForEvent = (socket, eventName, timeoutMs = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout esperando evento: ${eventName}`));
    }, timeoutMs);

    socket.once(eventName, payload => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const waitForMode = (socket, expectedMode, timeoutMs = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('rfid_mode_changed', onModeChanged);
      reject(new Error(`Timeout esperando modo RFID: ${expectedMode}`));
    }, timeoutMs);

    const onModeChanged = payload => {
      if (payload?.mode !== expectedMode) {
        return;
      }

      clearTimeout(timer);
      socket.off('rfid_mode_changed', onModeChanged);
      resolve(payload);
    };

    socket.on('rfid_mode_changed', onModeChanged);
  });

const connectSocket = (port, token, options = {}) =>
  new Promise((resolve, reject) => {
    const origin = options.origin;
    const extraHeaders = origin ? { ...fingerprintHeaders, origin } : { ...fingerprintHeaders };
    const transports = options.transports || ['websocket'];

    const socket = ioClient(`http://localhost:${port}`, {
      auth: token ? { token } : {},
      transports,
      forceNew: true,
      reconnection: false,
      transportOptions: {
        websocket: {
          extraHeaders
        },
        polling: {
          extraHeaders
        }
      }
    });

    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', error => {
      socket.close();
      reject(error);
    });
  });

describe('Socket.IO auth & ownership', () => {
  let port;
  let teacherOwner;
  let teacherOwnerToken;
  let teacherOtherToken;
  let studentToken;
  let playId;

  beforeAll(async () => {
    process.env.RFID_SOURCE = 'client';
    await User.deleteMany({});
    await GameSession.deleteMany({});
    await GamePlay.deleteMany({});
    await GameMechanic.deleteMany({});
    await GameContext.deleteMany({});
    await Card.deleteMany({});
    await CardDeck.deleteMany({});

    teacherOwner = await User.create({
      name: 'Socket Owner',
      email: 'socket-owner@test.com',
      password: 'password',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    const teacherOther = await User.create({
      name: 'Socket Other',
      email: 'socket-other@test.com',
      password: 'password',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    const student = await User.create({
      name: 'Socket Student',
      role: 'student',
      createdBy: teacherOwner._id,
      status: 'active'
    });

    teacherOwnerToken = (await generateTokenPair(teacherOwner, mockReq)).accessToken;
    teacherOtherToken = (await generateTokenPair(teacherOther, mockReq)).accessToken;
    studentToken = (await generateTokenPair(student, mockReq)).accessToken;

    const mechanic = await GameMechanic.create({
      name: 'socket-mechanic',
      displayName: 'Socket Mechanic',
      isActive: true,
      rules: {}
    });

    const context = await GameContext.create({
      contextId: 'socket-context',
      name: 'Socket Context',
      assets: [
        { key: 'asset1', display: 'A1', value: 'A' },
        { key: 'asset2', display: 'A2', value: 'B' }
      ],
      createdBy: teacherOwner._id
    });

    const card1 = await Card.create({ uid: 'CC000001', type: 'NTAG', status: 'active' });
    const card2 = await Card.create({ uid: 'CC000002', type: 'NTAG', status: 'active' });

    const deck = await CardDeck.create({
      name: 'Socket Deck',
      description: 'Deck for socket tests',
      contextId: context._id,
      createdBy: teacherOwner._id,
      status: 'active',
      cardMappings: [
        {
          cardId: card1._id,
          uid: 'CC000001',
          assignedValue: 'A',
          displayData: { key: 'asset1', display: 'A1', value: 'A' }
        },
        {
          cardId: card2._id,
          uid: 'CC000002',
          assignedValue: 'B',
          displayData: { key: 'asset2', display: 'A2', value: 'B' }
        }
      ]
    });

    const session = await GameSession.create({
      mechanicId: mechanic._id,
      deckId: deck._id,
      contextId: context._id,
      sensorId: 'sensor-allowed',
      config: {
        numberOfCards: 2,
        numberOfRounds: 1,
        timeLimit: 3,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      cardMappings: deck.cardMappings.map(mapping => ({
        cardId: mapping.cardId,
        uid: mapping.uid,
        assignedValue: mapping.assignedValue,
        displayData: mapping.displayData
      })),
      createdBy: teacherOwner._id
    });

    const play = await GamePlay.create({
      sessionId: session._id,
      playerId: student._id
    });

    playId = play._id.toString();

    if (!server.listening) {
      await new Promise(resolve => server.listen(0, resolve));
    }
    port = server.address().port;
  });

  afterEach(() => {
    io.sockets.sockets.forEach(socket => socket.disconnect(true));
  });

  afterAll(async () => {
    if (server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('rechaza conexión WebSocket sin token', async () => {
    await expect(connectSocket(port, null)).rejects.toThrow('Token requerido');
  });

  test('rechaza conexión WebSocket con Origin no permitido', async () => {
    await expect(
      connectSocket(port, teacherOwnerToken, {
        origin: 'http://evil.example.com',
        transports: ['polling']
      })
    ).rejects.toThrow();
  });

  test('bloquea join_play si no es owner de la sesión', async () => {
    const socket = await connectSocket(port, teacherOtherToken);

    socket.emit('join_play', { playId });
    const errorPayload = await waitForEvent(socket, 'error');

    expect(errorPayload).toEqual(expect.objectContaining({ code: 'FORBIDDEN' }));

    socket.disconnect();
  });

  test('desconecta sockets cuando se invalida la sesión', async () => {
    const socket = await connectSocket(port, teacherOwnerToken);

    disconnectUserSockets(io, teacherOwner._id.toString(), 'NEW_LOGIN');

    const invalidatedPayload = await waitForEvent(socket, 'session_invalidated');
    expect(invalidatedPayload).toEqual(expect.objectContaining({ reason: 'NEW_LOGIN' }));

    const disconnectReason = await waitForEvent(socket, 'disconnect');
    expect(disconnectReason).toBeTruthy();
  });

  test('rechaza RFID client event con UID inválido', async () => {
    const socket = await connectSocket(port, teacherOwnerToken);

    socket.emit('join_card_registration');

    socket.emit('rfid_scan_from_client', {
      uid: 'INVALID',
      type: 'NTAG',
      sensorId: 'sensor-1',
      timestamp: Date.now(),
      source: 'web_serial'
    });

    const errorPayload = await waitForEvent(socket, 'error');
    expect(errorPayload).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));

    socket.disconnect();
  });

  test('rechaza RFID client event fuera de modo permitido', async () => {
    const socket = await connectSocket(port, teacherOwnerToken);

    socket.emit('rfid_scan_from_client', {
      uid: 'CC0000AA',
      type: 'NTAG',
      sensorId: 'sensor-1',
      timestamp: Date.now(),
      source: 'web_serial'
    });

    const errorPayload = await waitForEvent(socket, 'error');
    expect(errorPayload).toEqual(expect.objectContaining({ code: 'RFID_MODE_INVALID' }));

    socket.disconnect();
  });

  test('acepta y enruta RFID client event en modo card_assignment', async () => {
    const tempTeacher = await User.create({
      name: 'Socket Assignment Teacher',
      email: `socket-assignment-${Date.now()}@test.com`,
      password: 'password',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    const tempTeacherToken = (await generateTokenPair(tempTeacher, mockReq)).accessToken;
    const socket = await connectSocket(port, tempTeacherToken);

    const modeReady = waitForMode(socket, 'card_assignment');
    socket.emit('join_card_assignment');
    await modeReady;

    const eventPromise = Promise.race([
      waitForEvent(socket, 'rfid_event', 3000),
      waitForEvent(socket, 'error', 3000).then(errorPayload => {
        throw new Error(`Error socket inesperado: ${errorPayload?.code || 'UNKNOWN'}`);
      })
    ]);
    socket.emit('rfid_scan_from_client', {
      uid: 'CC0000AE',
      type: 'NTAG',
      sensorId: 'sensor-assign',
      timestamp: Date.now(),
      source: 'web_serial'
    });

    const routedEvent = await eventPromise;
    expect(routedEvent).toEqual(
      expect.objectContaining({
        event: 'card_detected',
        uid: 'CC0000AE'
      })
    );

    socket.disconnect();
  });

  test('rechaza RFID client event con timestamp fuera de ventana permitida', async () => {
    const tempTeacher = await User.create({
      name: 'Socket Timestamp Teacher',
      email: `socket-timestamp-${Date.now()}@test.com`,
      password: 'password',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });
    const tempToken = (await generateTokenPair(tempTeacher, mockReq)).accessToken;

    const socket = await connectSocket(port, tempToken);

    socket.emit('join_card_registration');

    socket.emit('rfid_scan_from_client', {
      uid: 'CC0000AD',
      type: 'NTAG',
      sensorId: 'sensor-1',
      timestamp: Date.now() - 31000,
      source: 'web_serial'
    });

    const errorPayload = await waitForEvent(socket, 'error');
    expect(errorPayload).toEqual(expect.objectContaining({ code: 'VALIDATION_ERROR' }));

    socket.disconnect();
  });

  test('rechaza RFID client event con sensorId no autorizado', async () => {
    const tempTeacher = await User.create({
      name: 'Socket Sensor Teacher',
      email: `socket-sensor-${Date.now()}@test.com`,
      password: 'password',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });
    const tempToken = (await generateTokenPair(tempTeacher, mockReq)).accessToken;
    const socket = await connectSocket(port, tempToken);

    socket.emit('join_card_registration');
    await new Promise(resolve => setTimeout(resolve, 50));

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout esperando primer rfid_event'));
      }, 2000);

      socket.once('rfid_event', () => {
        clearTimeout(timer);
        resolve();
      });

      socket.once('error', payload => {
        clearTimeout(timer);
        reject(new Error(`RFID error: ${payload?.code || 'UNKNOWN'}`));
      });

      socket.emit('rfid_scan_from_client', {
        uid: 'CC0000AB',
        type: 'NTAG',
        sensorId: 'sensor-allowed',
        timestamp: Date.now(),
        source: 'web_serial'
      });
    });

    await new Promise(resolve => setTimeout(resolve, 3200));

    const errorPromise = waitForEvent(socket, 'error');
    socket.emit('rfid_scan_from_client', {
      uid: 'CC0000AC',
      type: 'NTAG',
      sensorId: 'sensor-blocked',
      timestamp: Date.now(),
      source: 'web_serial'
    });

    const errorPayload = await errorPromise;
    expect(errorPayload).toEqual(expect.objectContaining({ code: 'RFID_SENSOR_MISMATCH' }));

    socket.disconnect();
  });

  test('bloquea join_card_registration para estudiantes', async () => {
    const socket = await connectSocket(port, studentToken);

    socket.emit('join_card_registration');
    const errorPayload = await waitForEvent(socket, 'error');

    expect(errorPayload).toEqual(expect.objectContaining({ code: 'FORBIDDEN' }));

    socket.disconnect();
  });

  test('usa caché TTL para revalidación auth en eventos sensibles consecutivos', async () => {
    const cacheTeacher = await User.create({
      name: 'Socket Cache Teacher',
      email: `socket-cache-${Date.now()}@test.com`,
      password: 'password',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });
    const cacheTeacherToken = (await generateTokenPair(cacheTeacher, mockReq)).accessToken;

    const socket = await connectSocket(port, cacheTeacherToken);

    const findByIdSpy = jest.spyOn(userRepository, 'findById');
    findByIdSpy.mockClear();

    socket.emit('join_card_registration');
    await new Promise(resolve => setTimeout(resolve, 80));

    socket.emit('leave_card_registration');
    await new Promise(resolve => setTimeout(resolve, 80));

    // Primer evento => miss (consulta DB), segundo => hit cache (sin consulta extra)
    expect(findByIdSpy).toHaveBeenCalledTimes(1);

    findByIdSpy.mockRestore();
    socket.disconnect();
  });

  test('usa caché TTL para ownership en comandos consecutivos del mismo play', async () => {
    const socket = await connectSocket(port, teacherOwnerToken);

    const findByIdSpy = jest.spyOn(gamePlayRepository, 'findById');
    findByIdSpy.mockClear();

    socket.emit('join_play', { playId });
    await new Promise(resolve => setTimeout(resolve, 80));

    socket.emit('leave_play', { playId });
    await new Promise(resolve => setTimeout(resolve, 80));

    expect(findByIdSpy).toHaveBeenCalledTimes(1);

    findByIdSpy.mockRestore();
    socket.disconnect();
  });

  test('aplica política single-owner por usuario en modo RFID', async () => {
    const firstSocket = await connectSocket(port, teacherOwnerToken);
    const secondSocket = await connectSocket(port, teacherOwnerToken);

    firstSocket.emit('join_card_registration');
    await new Promise(resolve => setTimeout(resolve, 80));

    secondSocket.emit('join_card_registration');
    await new Promise(resolve => setTimeout(resolve, 80));

    const errorPromise = waitForEvent(firstSocket, 'error');
    firstSocket.emit('rfid_scan_from_client', {
      uid: 'CC0000EF',
      type: 'NTAG',
      sensorId: 'sensor-allowed',
      timestamp: Date.now(),
      source: 'web_serial'
    });

    const errorPayload = await errorPromise;
    expect(errorPayload).toEqual(expect.objectContaining({ code: 'RFID_SOCKET_NOT_ACTIVE' }));

    firstSocket.disconnect();
    secondSocket.disconnect();
  });

  test('mantiene validación de sensor en gameplay tras pause/resume', async () => {
    const socket = await connectSocket(port, teacherOwnerToken);

    socket.emit('join_play', { playId });
    await new Promise(resolve => setTimeout(resolve, 80));

    socket.emit('start_play', { playId });
    await new Promise(resolve => setTimeout(resolve, 120));

    socket.emit('pause_play', { playId });
    await new Promise(resolve => setTimeout(resolve, 120));

    socket.emit('resume_play', { playId });
    await new Promise(resolve => setTimeout(resolve, 120));

    const errorPromise = waitForEvent(socket, 'error');
    socket.emit('rfid_scan_from_client', {
      uid: 'CC000001',
      type: 'NTAG',
      sensorId: 'sensor-not-allowed',
      timestamp: Date.now(),
      source: 'web_serial'
    });

    const errorPayload = await errorPromise;
    expect(errorPayload).toEqual(expect.objectContaining({ code: 'RFID_SENSOR_UNAUTHORIZED' }));

    socket.disconnect();
  });
});
