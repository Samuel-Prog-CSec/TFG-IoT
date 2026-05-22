/**
 * @fileoverview Test manual de validación del Socket.IO Redis adapter en escenario
 * multi-instancia (T-907 Fase C, PROP-122).
 *
 * Escenario:
 *   - 2 backends locales corriendo en puertos distintos (5000 y 5001).
 *   - Ambos comparten la misma instancia Redis (REDIS_URL=redis://localhost:6379).
 *   - El adapter Socket.IO Redis debe propagar mensajes cross-instance.
 *
 * Prueba:
 *   1. Conectar clientA al backend A (5000) y clientB al backend B (5001).
 *   2. Ambos hacen `join_room("multiinstance-room")`.
 *   3. clientA emite un mensaje al room. clientB debe recibirlo.
 *   4. clientB emite otro. clientA debe recibirlo.
 *   5. Si ambos reciben los eventos, el adapter está funcionando.
 *
 * Cómo ejecutar:
 *   Terminal 1: docker compose up -d mongo redis
 *   Terminal 2: cd backend && npm run dev:multi-1
 *   Terminal 3: cd backend && npm run dev:multi-2
 *   Terminal 4: cd backend && npm run test:multi-instance
 *
 * Salida esperada:
 *   ✓ clientA conectado a backend A (puerto 5000)
 *   ✓ clientB conectado a backend B (puerto 5001)
 *   ✓ clientB recibió mensaje emitido por clientA → adapter Redis OK
 *   ✓ clientA recibió mensaje emitido por clientB → adapter Redis OK
 *   ✓ TEST PASADO
 *
 * Requisitos:
 *   - JWT válido en `TEST_ACCESS_TOKEN` (env) o credenciales `TEST_EMAIL`/`TEST_PASSWORD`
 *     (default: maria@test.com / Test1234! — usuario del seeder).
 *   - Mongo y Redis disponibles (Docker compose).
 *
 * @module scripts/test-socket-multiinstance
 */

const { io: ioClient } = require('socket.io-client');
const http = require('node:http');

const BACKEND_A = process.env.MULTI_BACKEND_A || 'http://localhost:5000';
const BACKEND_B = process.env.MULTI_BACKEND_B || 'http://localhost:5001';
const TEST_EMAIL = process.env.TEST_EMAIL || 'maria@test.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Test1234!';
const TEST_ROOM = 'multiinstance-room-t907';
const TIMEOUT_MS = 15000;

const log = (icon, msg) => console.log(`${icon} ${msg}`);
const ok = msg => log('✅', msg);
const ko = msg => log('❌', msg);
const info = msg => log('ℹ️ ', msg);

/**
 * Realiza una petición HTTP POST simple sin dependencias externas.
 */
const postJson = (url, body) =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request(
      {
        host: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      },
      res => {
        let chunks = '';
        res.on('data', c => {
          chunks += c;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(chunks || '{}');
            resolve({ status: res.statusCode, body: parsed, headers: res.headers });
          } catch (err) {
            reject(new Error(`No se pudo parsear respuesta de ${url}: ${err.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });

/**
 * Inicia sesión contra el backend dado y devuelve { accessToken, csrfToken, cookie }.
 * Necesario porque el handshake Socket.IO valida el JWT.
 */
const login = async backend => {
  // Primero, pedir un csrf "vacio" — el backend lo genera automáticamente con ensureCsrfCookie
  // en cualquier GET. Hacemos un GET a /api/health para que Set-Cookie llegue.
  const healthUrl = `${backend}/api/health`;
  await new Promise((resolve, reject) => {
    http
      .get(healthUrl, res => {
        res.resume();
        res.on('end', resolve);
      })
      .on('error', reject);
  });

  // En entorno cross-fetch sin cookies persistentes, /api/auth/login está en `skipPaths` de
  // csrfProtection, por lo que no necesita header X-CSRF-Token. Solo necesitamos las credenciales.
  const loginRes = await postJson(`${backend}/api/auth/login`, {
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });

  if (loginRes.status !== 200) {
    throw new Error(
      `Login fallido en ${backend}: status=${loginRes.status} body=${JSON.stringify(loginRes.body)}`
    );
  }
  const token = loginRes.body?.data?.accessToken || loginRes.body?.accessToken;
  if (!token) {
    throw new Error(`No se obtuvo accessToken al loguear en ${backend}`);
  }
  return token;
};

const connect = (backend, token, label) =>
  new Promise((resolve, reject) => {
    const socket = ioClient(`${backend}/game`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: TIMEOUT_MS
    });
    const timer = setTimeout(() => {
      reject(new Error(`${label}: timeout al conectar a ${backend}`));
    }, TIMEOUT_MS);

    socket.once('connect', () => {
      clearTimeout(timer);
      ok(`${label} conectado a ${backend} (socket=${socket.id})`);
      resolve(socket);
    });
    socket.once('connect_error', err => {
      clearTimeout(timer);
      reject(new Error(`${label}: connect_error en ${backend} — ${err.message}`));
    });
  });

const joinRoom = (socket, room) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('test:join ack timeout')), 5000);
    // T-907 OP2: handler `test:join` añadido en socketHandlers.js solo fuera
    // de producción. Hace `socket.join(room)` y devuelve ack {ok, room, socketId}.
    socket.emit('test:join', { room }, ack => {
      clearTimeout(timer);
      if (ack?.ok === false) {
        return reject(new Error(`test:join rechazado: ${ack?.error}`));
      }
      resolve(ack);
    });
  });

const broadcastViaServer = (socket, room, event, data) => {
  // T-907 OP2: handler `test:broadcast` añadido en socketHandlers.js solo
  // fuera de producción. Recibe {room, event, data} y hace
  // `gameNsp.to(room).emit(event, data)` — el adapter Redis propaga el emit
  // a todas las instancias del cluster (es lo que estamos validando).
  socket.emit('test:broadcast', { room, event, data });
};

const waitForEvent = (socket, eventName) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout esperando '${eventName}' en ${socket.id}`)),
      TIMEOUT_MS
    );
    socket.once(eventName, payload => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const main = async () => {
  info(`Test multi-instancia adapter Socket.IO T-907 Fase C`);
  info(`Backend A: ${BACKEND_A}`);
  info(`Backend B: ${BACKEND_B}`);
  info(`Room compartido: ${TEST_ROOM}`);

  let socketA;
  let socketB;
  let exitCode = 0;

  try {
    info('1) Login contra backend A para obtener access token…');
    const tokenA = await login(BACKEND_A);
    ok('Login OK contra backend A');

    info(
      '2) Login contra backend B para obtener access token (usuario distinto requeriría seeder; usamos mismo user)'
    );
    // Mismo usuario: en producción el "single session enforcement" rechazaría la segunda
    // conexión. Aquí basta con que el handshake en la otra instancia sea válido. Si tu
    // backend hace enforce single-session, usa TEST_EMAIL_B/TEST_PASSWORD_B para un usuario
    // distinto (ej. carlos@test.com).
    const tokenB = process.env.TEST_EMAIL_B ? await login(BACKEND_B) : tokenA;

    info('3) Conectar clientes a las dos instancias…');
    socketA = await connect(BACKEND_A, tokenA, 'clientA');
    socketB = await connect(BACKEND_B, tokenB, 'clientB');

    info(`4) Unir ambos clientes al room ${TEST_ROOM}…`);
    await Promise.all([joinRoom(socketA, TEST_ROOM), joinRoom(socketB, TEST_ROOM)]);
    ok('Ambos clientes en el room (test:join ack OK en ambas instancias)');

    info('5) Backend A hace gameNsp.to(room).emit("test:ping") via test:broadcast…');
    const recvB = waitForEvent(socketB, 'test:ping');
    broadcastViaServer(socketA, TEST_ROOM, 'test:ping', { from: 'A', ts: Date.now() });
    const pingFromA = await recvB.catch(err => {
      throw new Error(
        `clientB no recibió ping de clientA → adapter Redis NO está cruzando instancias (${err.message})`
      );
    });
    ok(`clientB recibió ping de clientA → ${JSON.stringify(pingFromA).slice(0, 100)}`);

    info('6) Backend B hace gameNsp.to(room).emit("test:pong") via test:broadcast…');
    const recvA = waitForEvent(socketA, 'test:pong');
    broadcastViaServer(socketB, TEST_ROOM, 'test:pong', { from: 'B', ts: Date.now() });
    const pongFromB = await recvA.catch(err => {
      throw new Error(`clientA no recibió pong de clientB (${err.message})`);
    });
    ok(`clientA recibió pong de clientB → ${JSON.stringify(pongFromB).slice(0, 100)}`);

    info('');
    ok('TEST PASADO — el Socket.IO Redis adapter propaga mensajes entre instancias');
    ok('Conclusión: la plataforma puede escalar horizontalmente sin perder coordinación de rooms.');
  } catch (err) {
    ko(`TEST FALLIDO: ${err.message}`);
    exitCode = 1;
  } finally {
    if (socketA) {
      socketA.disconnect();
    }
    if (socketB) {
      socketB.disconnect();
    }
    setTimeout(() => process.exit(exitCode), 200);
  }
};

main().catch(err => {
  ko(err.message);
  process.exit(1);
});
