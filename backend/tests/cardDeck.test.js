/**
 * @fileoverview Tests para CardDeck (mazos de tarjetas RFID).
 * Prueba endpoints CRUD y validaciones de los mazos.
 * @module tests/cardDeck
 */

const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const Card = require('../src/models/Card');
const CardDeck = require('../src/models/CardDeck');
const GameContext = require('../src/models/GameContext');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('CardDeck Management Endpoints', () => {
  let teacherUser;
  let teacherToken;
  let testContext;
  let testCards;

  const fingerprintHeaders = {
    'User-Agent': 'jest-test',
    'Accept-Language': 'en',
    'Accept-Encoding': 'gzip'
  };

  const mockReq = {
    headers: {
      'user-agent': 'jest-test',
      'accept-language': 'en',
      'accept-encoding': 'gzip'
    }
  };

  beforeEach(async () => {
    // Limpiar colecciones
    await Promise.all([
      User.deleteMany({}),
      Card.deleteMany({}),
      CardDeck.deleteMany({}),
      GameContext.deleteMany({})
    ]);

    // Crear profesor
    teacherUser = await User.create({
      name: 'Deck Teacher',
      email: 'deck.teacher@test.com',
      password: 'Password123',
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });

    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;

    // Crear contexto de prueba con assets
    testContext = await GameContext.create({
      contextId: 'geography-test',
      name: 'Geografía Test',
      assets: [
        { key: 'spain', value: 'España', display: '🇪🇸' },
        { key: 'france', value: 'Francia', display: '🇫🇷' },
        { key: 'germany', value: 'Alemania', display: '🇩🇪' },
        { key: 'italy', value: 'Italia', display: '🇮🇹' }
      ]
    });

    // Crear tarjetas de prueba
    testCards = await Card.insertMany([
      { uid: 'AA000001', type: 'NTAG', status: 'active' },
      { uid: 'AA000002', type: 'NTAG', status: 'active' },
      { uid: 'AA000003', type: 'MIFARE_1KB', status: 'active' },
      { uid: 'AA000004', type: 'MIFARE_1KB', status: 'active' }
    ]);
  });

  // ===========================================================================
  // POST /api/decks - Crear mazo
  // ===========================================================================

  describe('POST /api/decks', () => {
    it('should create a deck successfully', async () => {
      const deckData = {
        name: 'Mazo Europa',
        description: 'Países europeos',
        contextId: testContext._id.toString(),
        cardMappings: [
          { cardId: testCards[0]._id.toString(), uid: 'AA000001', assignedValue: 'España' },
          { cardId: testCards[1]._id.toString(), uid: 'AA000002', assignedValue: 'Francia' }
        ]
      };

      const res = await request(app)
        .post('/api/decks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send(deckData);

      expect(res.statusCode).toEqual(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Mazo Europa');
      expect(res.body.data.cardMappings).toHaveLength(2);
      expect(res.body.data.status).toBe('active');
    });

    it('should reject deck with less than 2 cards', async () => {
      const deckData = {
        name: 'Mazo Pequeño',
        contextId: testContext._id.toString(),
        cardMappings: [
          { cardId: testCards[0]._id.toString(), uid: 'AA000001', assignedValue: 'España' }
        ]
      };

      const res = await request(app)
        .post('/api/decks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send(deckData);

      expect(res.statusCode).toEqual(400);
    });

    it('should reject deck with duplicate UIDs', async () => {
      const deckData = {
        name: 'Mazo Duplicado',
        contextId: testContext._id.toString(),
        cardMappings: [
          { cardId: testCards[0]._id.toString(), uid: 'AA000001', assignedValue: 'España' },
          { cardId: testCards[1]._id.toString(), uid: 'AA000001', assignedValue: 'Francia' }
        ]
      };

      const res = await request(app)
        .post('/api/decks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send(deckData);

      expect(res.statusCode).toEqual(400);
    });

    it('should reject deck with assignedValue not in context', async () => {
      const deckData = {
        name: 'Mazo Inválido',
        contextId: testContext._id.toString(),
        cardMappings: [
          { cardId: testCards[0]._id.toString(), uid: 'AA000001', assignedValue: 'España' },
          { cardId: testCards[1]._id.toString(), uid: 'AA000002', assignedValue: 'Portugal' } // No existe en contexto
        ]
      };

      const res = await request(app)
        .post('/api/decks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send(deckData);

      expect(res.statusCode).toEqual(400);
      expect(res.body.message).toContain('assignedValue');
    });

    it('should reject duplicate deck name for same teacher', async () => {
      // Crear primer mazo
      await CardDeck.create({
        name: 'Mazo Único',
        contextId: testContext._id,
        cardMappings: [
          { cardId: testCards[0]._id, uid: 'AA000001', assignedValue: 'España' },
          { cardId: testCards[1]._id, uid: 'AA000002', assignedValue: 'Francia' }
        ],
        createdBy: teacherUser._id
      });

      // Intentar crear otro con el mismo nombre
      const res = await request(app)
        .post('/api/decks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send({
          name: 'Mazo Único',
          contextId: testContext._id.toString(),
          cardMappings: [
            { cardId: testCards[2]._id.toString(), uid: 'AA000003', assignedValue: 'Alemania' },
            { cardId: testCards[3]._id.toString(), uid: 'AA000004', assignedValue: 'Italia' }
          ]
        });

      expect(res.statusCode).toEqual(409);
    });
  });

  // ===========================================================================
  // GET /api/decks - Listar mazos
  // ===========================================================================

  describe('GET /api/decks', () => {
    beforeEach(async () => {
      await CardDeck.create({
        name: 'Mazo A',
        contextId: testContext._id,
        cardMappings: [
          { cardId: testCards[0]._id, uid: 'AA000001', assignedValue: 'España' },
          { cardId: testCards[1]._id, uid: 'AA000002', assignedValue: 'Francia' }
        ],
        createdBy: teacherUser._id
      });

      await CardDeck.create({
        name: 'Mazo B',
        contextId: testContext._id,
        cardMappings: [
          { cardId: testCards[2]._id, uid: 'AA000003', assignedValue: 'Alemania' },
          { cardId: testCards[3]._id, uid: 'AA000004', assignedValue: 'Italia' }
        ],
        createdBy: teacherUser._id
      });
    });

    it('should list decks with pagination', async () => {
      const res = await request(app)
        .get('/api/decks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);

      // Verificar paginación
      const items = Array.isArray(res.body.data) ? res.body.data : res.body.data?.data;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBe(2);
    });

    it('should filter by status', async () => {
      // Archivar un mazo
      await CardDeck.updateOne({ name: 'Mazo B' }, { status: 'archived' });

      const res = await request(app)
        .get('/api/decks?status=active')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toEqual(200);
      const items = Array.isArray(res.body.data) ? res.body.data : res.body.data?.data;
      expect(items.length).toBe(1);
      expect(items[0].name).toBe('Mazo A');
    });

    it('should search by name', async () => {
      const res = await request(app)
        .get('/api/decks?search=Mazo B')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toEqual(200);
      const items = Array.isArray(res.body.data) ? res.body.data : res.body.data?.data;
      expect(items.length).toBe(1);
      expect(items[0].name).toBe('Mazo B');
    });
  });

  // ===========================================================================
  // GET /api/decks/:id - Obtener mazo por ID
  // ===========================================================================

  describe('GET /api/decks/:id', () => {
    let testDeck;

    beforeEach(async () => {
      testDeck = await CardDeck.create({
        name: 'Mazo Detalle',
        contextId: testContext._id,
        cardMappings: [
          { cardId: testCards[0]._id, uid: 'AA000001', assignedValue: 'España' },
          { cardId: testCards[1]._id, uid: 'AA000002', assignedValue: 'Francia' }
        ],
        createdBy: teacherUser._id
      });
    });

    it('should get deck by ID', async () => {
      const res = await request(app)
        .get(`/api/decks/${testDeck._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Mazo Detalle');
      expect(res.body.data.cardMappings).toHaveLength(2);
    });

    it('should return 404 for non-existent deck', async () => {
      const res = await request(app)
        .get('/api/decks/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toEqual(404);
    });

    it('should deny access to another teacher deck', async () => {
      // Crear otro profesor
      const otherTeacher = await User.create({
        name: 'Other Teacher',
        email: 'other.teacher@test.com',
        password: 'Password123',
        role: 'teacher',
        accountStatus: 'approved',
        status: 'active'
      });
      const otherToken = (await generateTokenPair(otherTeacher, mockReq)).accessToken;

      const res = await request(app)
        .get(`/api/decks/${testDeck._id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toEqual(403);
    });
  });

  // ===========================================================================
  // PUT /api/decks/:id - Actualizar mazo
  // ===========================================================================

  describe('PUT /api/decks/:id', () => {
    let testDeck;

    beforeEach(async () => {
      testDeck = await CardDeck.create({
        name: 'Mazo Original',
        contextId: testContext._id,
        cardMappings: [
          { cardId: testCards[0]._id, uid: 'AA000001', assignedValue: 'España' },
          { cardId: testCards[1]._id, uid: 'AA000002', assignedValue: 'Francia' }
        ],
        createdBy: teacherUser._id
      });
    });

    it('should update deck name', async () => {
      const res = await request(app)
        .put(`/api/decks/${testDeck._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send({ name: 'Mazo Actualizado' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Mazo Actualizado');
    });

    it('should update deck status to archived', async () => {
      const res = await request(app)
        .put(`/api/decks/${testDeck._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send({ status: 'archived' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.status).toBe('archived');
    });

    it('should update cardMappings', async () => {
      const res = await request(app)
        .put(`/api/decks/${testDeck._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send({
          cardMappings: [
            { cardId: testCards[2]._id.toString(), uid: 'AA000003', assignedValue: 'Alemania' },
            { cardId: testCards[3]._id.toString(), uid: 'AA000004', assignedValue: 'Italia' }
          ]
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.cardMappings).toHaveLength(2);
      expect(res.body.data.cardMappings[0].assignedValue).toBe('Alemania');
    });
  });

  // ===========================================================================
  // DELETE /api/decks/:id - Eliminar (archivar) mazo
  // ===========================================================================

  describe('DELETE /api/decks/:id', () => {
    let testDeck;

    beforeEach(async () => {
      testDeck = await CardDeck.create({
        name: 'Mazo a Eliminar',
        contextId: testContext._id,
        cardMappings: [
          { cardId: testCards[0]._id, uid: 'AA000001', assignedValue: 'España' },
          { cardId: testCards[1]._id, uid: 'AA000002', assignedValue: 'Francia' }
        ],
        createdBy: teacherUser._id
      });
    });

    it('should archive (soft delete) a deck', async () => {
      const res = await request(app)
        .delete(`/api/decks/${testDeck._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);

      // Verificar que está archivado, no eliminado
      const updatedDeck = await CardDeck.findById(testDeck._id);
      expect(updatedDeck).toBeTruthy();
      expect(updatedDeck.status).toBe('archived');
    });

    it('should return 404 for non-existent deck', async () => {
      const res = await request(app)
        .delete('/api/decks/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toEqual(404);
    });
  });

  // ===========================================================================
  // Zod Validation Tests
  // ===========================================================================

  describe('Zod Validation', () => {
    it('should reject invalid ObjectId format for contextId', async () => {
      const res = await request(app)
        .post('/api/decks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send({
          name: 'Mazo Test',
          contextId: 'invalid-id',
          cardMappings: [
            { cardId: testCards[0]._id.toString(), uid: 'AA000001', assignedValue: 'España' },
            { cardId: testCards[1]._id.toString(), uid: 'AA000002', assignedValue: 'Francia' }
          ]
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject name too short', async () => {
      const res = await request(app)
        .post('/api/decks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send({
          name: 'A', // Mínimo 2 caracteres
          contextId: testContext._id.toString(),
          cardMappings: [
            { cardId: testCards[0]._id.toString(), uid: 'AA000001', assignedValue: 'España' },
            { cardId: testCards[1]._id.toString(), uid: 'AA000002', assignedValue: 'Francia' }
          ]
        });

      expect(res.statusCode).toEqual(400);
    });

    it('should reject invalid UID format in cardMappings', async () => {
      const res = await request(app)
        .post('/api/decks')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send({
          name: 'Mazo Test',
          contextId: testContext._id.toString(),
          cardMappings: [
            { cardId: testCards[0]._id.toString(), uid: 'INVALID', assignedValue: 'España' },
            { cardId: testCards[1]._id.toString(), uid: 'AA000002', assignedValue: 'Francia' }
          ]
        });

      expect(res.statusCode).toEqual(400);
    });

    it('should reject invalid params ObjectId', async () => {
      const res = await request(app)
        .get('/api/decks/not-an-objectid')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toEqual(400);
      expect(res.body.errors).toBeDefined();
    });
  });
});
