/**
 * @fileoverview Tests de integración para recuperación de estado Redis.
 * Verifica que el gameEngine recupera correctamente partidas huérfanas
 * tras un reinicio del servidor.
 *
 * @module tests/redisStateRecovery
 */

// Mock de Redis ANTES de cualquier import que lo use
jest.mock('ioredis', () => {
  const RedisMock = require('ioredis-mock');
  return RedisMock;
});

const mongoose = require('mongoose');
const redisService = require('../src/services/redisService');
const { connectRedis, disconnectRedis, isRedisConnected } = require('../src/config/redis');
const GameEngine = require('../src/services/gameEngine');
const GamePlay = require('../src/models/GamePlay');
const GameSession = require('../src/models/GameSession');
const GameMechanic = require('../src/models/GameMechanic');
const GameContext = require('../src/models/GameContext');
const Card = require('../src/models/Card');
const CardDeck = require('../src/models/CardDeck');
const User = require('../src/models/User');

describe('Redis State Recovery - GameEngine.recoverActivePlays()', () => {
  let gameEngine;
  let mockIo;

  // Fixtures
  let teacher, student;
  let mechanic, context, deck;
  let card1, card2;
  let session, play;

  beforeAll(async () => {
    // Conectar Redis (mock)
    await connectRedis();

    // Crear mock de Socket.IO
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };

    // Instanciar GameEngine con mock de IO
    gameEngine = new GameEngine(mockIo);
  });

  afterAll(async () => {
    // Limpiar GameEngine
    if (gameEngine.cleanupInterval) {
      clearInterval(gameEngine.cleanupInterval);
    }

    await disconnectRedis();
  });

  beforeEach(async () => {
    // Limpiar colecciones
    await User.deleteMany({});
    await GameSession.deleteMany({});
    await GamePlay.deleteMany({});
    await GameMechanic.deleteMany({});
    await GameContext.deleteMany({});
    await Card.deleteMany({});
    await CardDeck.deleteMany({});

    // Limpiar Redis
    for (const namespace of Object.values(redisService.NAMESPACES)) {
      await redisService.flushNamespace(namespace);
    }

    // Limpiar estado en memoria del GameEngine
    gameEngine.activePlays.clear();
    gameEngine.cardUidToPlayId.clear();

    // Reset mocks
    mockIo.to.mockClear();
    mockIo.emit.mockClear();

    // Crear fixtures base
    teacher = await User.create({
      name: 'Test Teacher',
      email: 'recovery-test@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    student = await User.create({
      name: 'Test Student',
      role: 'student',
      createdBy: teacher._id,
      status: 'active'
    });

    mechanic = await GameMechanic.create({
      name: 'recovery-test-mechanic',
      displayName: 'Recovery Test',
      isActive: true,
      rules: {}
    });

    context = await GameContext.create({
      contextId: 'recovery-test-context',
      name: 'Recovery Test Context',
      createdBy: teacher._id,
      assets: [
        { key: 'item1', display: '1️⃣', value: 'One' },
        { key: 'item2', display: '2️⃣', value: 'Two' }
      ]
    });

    card1 = await Card.create({ uid: 'AA110001', type: 'NTAG', status: 'active' });
    card2 = await Card.create({ uid: 'AA110002', type: 'NTAG', status: 'active' });

    // Crear deck con las tarjetas
    deck = await CardDeck.create({
      name: 'Recovery Test Deck',
      contextId: context._id,
      createdBy: teacher._id,
      status: 'active',
      cardMappings: [
        {
          cardId: card1._id,
          uid: 'AA110001',
          assignedValue: 'One',
          displayData: { key: 'item1', display: '1️⃣', value: 'One' }
        },
        {
          cardId: card2._id,
          uid: 'AA110002',
          assignedValue: 'Two',
          displayData: { key: 'item2', display: '2️⃣', value: 'Two' }
        }
      ]
    });
  });

  /**
   * Helper para crear una sesión y partida en estado 'in-progress'
   */
  const createInProgressPlay = async () => {
    session = await GameSession.create({
      mechanicId: mechanic._id,
      deckId: deck._id,
      contextId: context._id,
      config: {
        numberOfCards: 2,
        numberOfRounds: 5,
        timeLimit: 15,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      cardMappings: [
        {
          cardId: card1._id,
          uid: 'AA110001',
          assignedValue: 'One',
          displayData: { key: 'item1', display: '1️⃣', value: 'One' }
        },
        {
          cardId: card2._id,
          uid: 'AA110002',
          assignedValue: 'Two',
          displayData: { key: 'item2', display: '2️⃣', value: 'Two' }
        }
      ],
      status: 'active',
      createdBy: teacher._id
    });

    play = await GamePlay.create({
      sessionId: session._id,
      playerId: student._id,
      status: 'in-progress',
      currentRound: 3,
      score: 20,
      events: [
        { eventType: 'round_start', roundNumber: 1, pointsAwarded: 0 },
        { eventType: 'correct', roundNumber: 1, pointsAwarded: 10 },
        { eventType: 'round_start', roundNumber: 2, pointsAwarded: 0 },
        { eventType: 'correct', roundNumber: 2, pointsAwarded: 10 }
      ],
      metrics: {
        totalAttempts: 2,
        correctAttempts: 2,
        errorAttempts: 0
      }
    });

    return { session, play };
  };

  /**
   * Helper para simular estado huérfano en Redis (sin pasar por gameEngine)
   */
  const simulateOrphanedRedisState = async (playDoc, sessionDoc) => {
    const playId = playDoc._id.toString();

    // Simular el estado que gameEngine.syncPlayToRedis() guardaría
    const redisState = {
      playDocId: playDoc._id.toString(),
      sessionDocId: sessionDoc._id.toString(),
      currentRound: playDoc.currentRound,
      score: playDoc.score,
      status: playDoc.status,
      paused: false,
      pausedAt: null,
      remainingTimeMs: null,
      awaitingResponse: true,
      createdAt: Date.now() - 60000, // Hace 1 minuto
      currentChallenge: JSON.stringify({ value: 'One', display: '1️⃣' })
    };

    await redisService.hset(redisService.NAMESPACES.PLAY, playId, redisState);

    // Simular mapeo de tarjetas
    for (const mapping of sessionDoc.cardMappings) {
      await redisService.set(redisService.NAMESPACES.CARD, mapping.uid, playId);
    }
  };

  // ===========================================================================
  // TESTS
  // ===========================================================================

  describe('Recuperación de partidas huérfanas', () => {
    it('debería recuperar partida huérfana y marcarla como abandoned', async () => {
      // Arrange: Crear partida in-progress y simular estado huérfano en Redis
      const { play, session } = await createInProgressPlay();
      await simulateOrphanedRedisState(play, session);

      // Verificar que la partida está en Redis
      const playId = play._id.toString();
      const redisStateBefore = await redisService.hgetall(redisService.NAMESPACES.PLAY, playId);
      expect(redisStateBefore).toBeTruthy();
      expect(redisStateBefore.playDocId).toBe(playId);

      // Act: Ejecutar recuperación
      const recoveredCount = await gameEngine.recoverActivePlays();

      // Assert: Verificar conteo
      expect(recoveredCount).toBe(1);

      // Assert: Verificar que la partida en MongoDB está abandonada
      const updatedPlay = await GamePlay.findById(play._id);
      expect(updatedPlay.status).toBe('abandoned');
      expect(updatedPlay.completedAt).toBeTruthy();

      // Assert: Verificar que se añadió evento de server_restart
      const restartEvent = updatedPlay.events.find(e => e.eventType === 'server_restart');
      expect(restartEvent).toBeTruthy();
      expect(restartEvent.roundNumber).toBe(play.currentRound);

      // Assert: Verificar que Redis fue limpiado
      const redisStateAfter = await redisService.hgetall(redisService.NAMESPACES.PLAY, playId);
      expect(redisStateAfter).toBeNull();

      // Assert: Verificar que las tarjetas fueron liberadas de Redis
      const card1InRedis = await redisService.get(redisService.NAMESPACES.CARD, 'AA110001');
      const card2InRedis = await redisService.get(redisService.NAMESPACES.CARD, 'AA110002');
      expect(card1InRedis).toBeNull();
      expect(card2InRedis).toBeNull();
    });

    it('debería emitir evento play_interrupted a clientes conectados', async () => {
      // Arrange
      const { play, session } = await createInProgressPlay();
      await simulateOrphanedRedisState(play, session);
      const playId = play._id.toString();

      // Act
      await gameEngine.recoverActivePlays();

      // Assert: Verificar que se emitió el evento
      expect(mockIo.to).toHaveBeenCalledWith(`play_${playId}`);
      expect(mockIo.emit).toHaveBeenCalledWith(
        'play_interrupted',
        expect.objectContaining({
          playId,
          reason: 'server_restart',
          message: expect.any(String),
          finalScore: play.score
        })
      );
    });

    it('debería recuperar múltiples partidas huérfanas', async () => {
      // Arrange: Crear 3 partidas huérfanas
      const plays = [];

      for (let i = 0; i < 3; i++) {
        // Crear nuevas tarjetas para cada partida (UIDs hexadecimales válidos de 8 chars)
        const uidA = `BB${i}00A0${i}`;
        const uidB = `BB${i}00B0${i}`;

        const cardA = await Card.create({
          uid: uidA,
          type: 'NTAG',
          status: 'active'
        });
        const cardB = await Card.create({
          uid: uidB,
          type: 'NTAG',
          status: 'active'
        });

        // Crear deck para esta sesión
        const testDeck = await CardDeck.create({
          name: `Test Deck ${i}`,
          contextId: context._id,
          createdBy: teacher._id,
          status: 'active',
          cardMappings: [
            { cardId: cardA._id, uid: uidA, assignedValue: 'A' },
            { cardId: cardB._id, uid: uidB, assignedValue: 'B' }
          ]
        });

        const sess = await GameSession.create({
          mechanicId: mechanic._id,
          deckId: testDeck._id,
          contextId: context._id,
          config: {
            numberOfCards: 2,
            numberOfRounds: 5,
            timeLimit: 15,
            pointsPerCorrect: 10,
            penaltyPerError: -2
          },
          cardMappings: [
            { cardId: cardA._id, uid: uidA, assignedValue: 'A' },
            { cardId: cardB._id, uid: uidB, assignedValue: 'B' }
          ],
          status: 'active',
          createdBy: teacher._id
        });

        const p = await GamePlay.create({
          sessionId: sess._id,
          playerId: student._id,
          status: 'in-progress',
          currentRound: 2,
          score: 10
        });

        await simulateOrphanedRedisState(p, sess);
        plays.push(p);
      }

      // Act
      const recoveredCount = await gameEngine.recoverActivePlays();

      // Assert
      expect(recoveredCount).toBe(3);

      // Verificar que todas están abandonadas
      for (const p of plays) {
        const updated = await GamePlay.findById(p._id);
        expect(updated.status).toBe('abandoned');
      }
    });

    it('debería manejar partida pausada como huérfana', async () => {
      // Arrange: Partida pausada
      const { session } = await createInProgressPlay();
      play.status = 'paused';
      await play.save();

      await simulateOrphanedRedisState(play, session);

      // Act
      const recoveredCount = await gameEngine.recoverActivePlays();

      // Assert
      expect(recoveredCount).toBe(1);

      const updatedPlay = await GamePlay.findById(play._id);
      expect(updatedPlay.status).toBe('abandoned');
    });
  });

  describe('Casos edge', () => {
    it('debería retornar 0 cuando no hay partidas en Redis', async () => {
      // Arrange: Redis vacío (ya limpiado en beforeEach)

      // Act
      const recoveredCount = await gameEngine.recoverActivePlays();

      // Assert
      expect(recoveredCount).toBe(0);
    });

    it('debería limpiar Redis si la partida no existe en MongoDB', async () => {
      // Arrange: Crear estado huérfano con playId que no existe en MongoDB
      const fakePlayId = new mongoose.Types.ObjectId().toString();
      const fakeSessionId = new mongoose.Types.ObjectId().toString();

      const redisState = {
        playDocId: fakePlayId,
        sessionDocId: fakeSessionId,
        currentRound: 1,
        score: 0,
        status: 'in-progress',
        paused: false,
        createdAt: Date.now()
      };

      await redisService.hset(redisService.NAMESPACES.PLAY, fakePlayId, redisState);

      // Act
      const recoveredCount = await gameEngine.recoverActivePlays();

      // Assert: No debería contar como recuperada (no existe en MongoDB)
      expect(recoveredCount).toBe(0);

      // Assert: Redis debería estar limpio
      const redisStateAfter = await redisService.hgetall(redisService.NAMESPACES.PLAY, fakePlayId);
      expect(redisStateAfter).toBeNull();
    });

    it('no debería afectar partidas ya completadas en MongoDB', async () => {
      // Arrange: Crear partida completada en MongoDB pero con estado en Redis
      const { play, session } = await createInProgressPlay();

      // Marcar como completada en MongoDB
      play.status = 'completed';
      play.completedAt = new Date();
      await play.save();

      // Simular estado viejo en Redis (como si Redis no se hubiera limpiado)
      await simulateOrphanedRedisState(play, session);

      // Act
      const recoveredCount = await gameEngine.recoverActivePlays();

      // Assert: No debería contar como recuperada (ya estaba completada)
      expect(recoveredCount).toBe(0);

      // Assert: La partida sigue completada, no abandonada
      const updatedPlay = await GamePlay.findById(play._id);
      expect(updatedPlay.status).toBe('completed');
    });

    it('debería manejar errores de Redis gracefully', async () => {
      // Arrange: Crear partida válida
      const { play, session } = await createInProgressPlay();
      await simulateOrphanedRedisState(play, session);

      // Forzar un estado corrupto en Redis
      const playId = play._id.toString();
      await redisService.set(redisService.NAMESPACES.PLAY, 'corrupted-key', 'not-valid-json');

      // Act: No debería lanzar error
      const recoveredCount = await gameEngine.recoverActivePlays();

      // Assert: Al menos la partida válida debería recuperarse
      expect(recoveredCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Limpieza de tarjetas en Redis', () => {
    it('debería liberar todas las tarjetas asociadas a la sesión', async () => {
      // Arrange
      const { play, session } = await createInProgressPlay();
      await simulateOrphanedRedisState(play, session);

      // Verificar que las tarjetas están en Redis antes
      const card1Before = await redisService.get(redisService.NAMESPACES.CARD, 'AA110001');
      const card2Before = await redisService.get(redisService.NAMESPACES.CARD, 'AA110002');
      expect(card1Before).toBe(play._id.toString());
      expect(card2Before).toBe(play._id.toString());

      // Act
      await gameEngine.recoverActivePlays();

      // Assert: Tarjetas liberadas
      const card1After = await redisService.get(redisService.NAMESPACES.CARD, 'AA110001');
      const card2After = await redisService.get(redisService.NAMESPACES.CARD, 'AA110002');
      expect(card1After).toBeNull();
      expect(card2After).toBeNull();
    });
  });
});
