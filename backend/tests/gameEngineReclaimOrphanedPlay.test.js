/**
 * @fileoverview Test del reclamo de partidas huérfanas en conflicto de tarjetas
 * (GameEngine._reclaimOrphanedPlay). Una partida interrumpida (corte de red, el
 * docente cierra la pestaña) dejaba sus tarjetas reservadas hasta 1h, bloqueando
 * al docente que reintentaba con el mismo mazo. El reclamo libera esas tarjetas
 * SOLO si la partida en conflicto está huérfana (sin cliente conectado); una
 * partida realmente en curso (con cliente) NO se reclama.
 */

jest.mock('ioredis', () => require('ioredis-mock'));

const { connectRedis, disconnectRedis } = require('../src/config/redis');
const GameEngine = require('../src/services/gameEngine');

// Fabrica un io.in(room).fetchSockets() que resuelve la lista dada (o rechaza).
const buildSocketsProbe = ({ sockets, reject } = {}) =>
  jest.fn().mockReturnValue({
    fetchSockets: reject
      ? jest.fn().mockRejectedValue(reject)
      : jest.fn().mockResolvedValue(sockets || [])
  });

describe('GameEngine._reclaimOrphanedPlay', () => {
  let engine;
  let io;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(() => {
    io = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      in: buildSocketsProbe({ sockets: [] })
    };
    engine = new GameEngine(io);
    // endPlay real accede a playDoc.metrics y persistencia; lo mockeamos: aquí
    // solo verificamos la DECISIÓN de reclamar (o no), no la finalización.
    engine.endPlay = jest.fn().mockResolvedValue();
  });

  afterEach(async () => {
    await engine?.shutdown?.();
  });

  it('limpia una reserva colgada (entrada en el Map sin partida activa)', async () => {
    engine.cardUidToPlayId.set('uid-1', 'ghost-play');
    engine.cardUidToPlayId.set('uid-2', 'ghost-play');
    engine.cardUidToPlayId.set('uid-3', 'otra-play');

    await engine._reclaimOrphanedPlay('ghost-play');

    expect(engine.cardUidToPlayId.has('uid-1')).toBe(false);
    expect(engine.cardUidToPlayId.has('uid-2')).toBe(false);
    expect(engine.cardUidToPlayId.get('uid-3')).toBe('otra-play');
    expect(engine.endPlay).not.toHaveBeenCalled();
  });

  it('NO reclama una partida con cliente conectado (se está jugando)', async () => {
    engine.io.in = buildSocketsProbe({ sockets: [{ id: 'socket-vivo' }] });
    engine.activePlays.set('activa', {
      createdAt: Date.now() - 5 * 60 * 1000, // vieja, pero con cliente
      awaitingBoardReady: false
    });
    engine.cardUidToPlayId.set('uid-x', 'activa');

    await engine._reclaimOrphanedPlay('activa');

    expect(engine.endPlay).not.toHaveBeenCalled();
    expect(engine.activePlays.has('activa')).toBe(true);
  });

  it('reclama una partida huérfana (sin cliente y superada la gracia) vía endPlay', async () => {
    engine.io.in = buildSocketsProbe({ sockets: [] });
    engine.activePlays.set('huerfana', {
      createdAt: Date.now() - 60 * 1000, // 60s: supera la gracia (10s)
      awaitingBoardReady: true
    });
    engine.cardUidToPlayId.set('uid-y', 'huerfana');

    await engine._reclaimOrphanedPlay('huerfana');

    expect(engine.endPlay).toHaveBeenCalledWith('huerfana', { abandoned: true });
  });

  it('NO reclama una partida huérfana demasiado reciente (dentro de la gracia)', async () => {
    engine.io.in = buildSocketsProbe({ sockets: [] });
    engine.activePlays.set('reciente', {
      createdAt: Date.now() - 1000, // 1s: por debajo de la gracia (10s)
      awaitingBoardReady: true
    });
    engine.cardUidToPlayId.set('uid-z', 'reciente');

    await engine._reclaimOrphanedPlay('reciente');

    expect(engine.endPlay).not.toHaveBeenCalled();
  });

  it('ante fallo al listar sockets, NO reclama (conservador)', async () => {
    engine.io.in = buildSocketsProbe({ reject: new Error('adapter caído') });
    engine.activePlays.set('dudosa', {
      createdAt: Date.now() - 60 * 1000,
      awaitingBoardReady: true
    });
    engine.cardUidToPlayId.set('uid-w', 'dudosa');

    await engine._reclaimOrphanedPlay('dudosa');

    expect(engine.endPlay).not.toHaveBeenCalled();
  });
});
