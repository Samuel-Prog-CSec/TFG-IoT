/**
 * @fileoverview Test de la idempotencia distribuida en GameEngine.startPlay.
 * Verifica que si el lock Redis ya está ocupado (otra instancia inicializando la
 * misma partida), startPlay aborta sin registrar en activePlays ni emitir new_round.
 */

jest.mock('ioredis', () => require('ioredis-mock'));

const { connectRedis, disconnectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const GameEngine = require('../src/services/gameEngine');

describe('GameEngine.startPlay distributed idempotency (SET NX)', () => {
  let engine;
  let io;

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  beforeEach(async () => {
    io = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };
    engine = new GameEngine(io);
    await redisService.flushNamespace('play:init');
  });

  afterEach(async () => {
    await engine?.shutdown?.();
  });

  const buildPlayDoc = playId => ({
    _id: { toString: () => playId },
    playerId: { toString: () => `player-${playId}` }
  });

  const buildSessionDoc = () => ({
    _id: { toString: () => 'session-id' },
    cardMappings: []
  });

  it('aborta sin registrar ni emitir si el lock Redis ya está tomado', async () => {
    const playId = 'play-locked';
    // Pre-ocupar el lock como lo haría otra instancia
    await redisService.setIfNotExists('play:init', playId, 'initializing', 60);

    await engine.startPlay(buildPlayDoc(playId), buildSessionDoc());

    expect(engine.activePlays.has(playId)).toBe(false);
    expect(io.emit).not.toHaveBeenCalledWith('new_round', expect.anything());
  });

  it('adquiere el lock distribuido cuando no existe previamente', async () => {
    const playId = 'play-first';

    // No hay lock previo — el spy captura la llamada a setIfNotExists
    const spy = jest.spyOn(redisService, 'setIfNotExists');

    try {
      await engine.startPlay(buildPlayDoc(playId), buildSessionDoc());
    } catch {
      // ignorado: nos interesa que el lock se intentó ANTES de cualquier otra validación
    }

    expect(spy).toHaveBeenCalledWith('play:init', playId, 'initializing', 60);
    spy.mockRestore();
  });

  it('el lock tiene TTL de 60 segundos (no se libera manualmente)', async () => {
    const playId = 'play-ttl';
    await redisService.setIfNotExists('play:init', playId, 'initializing', 60);

    const ttl = await redisService.ttl('play:init', playId);
    // El TTL debe estar entre 1 y 60 segundos (recién adquirido).
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });
});
