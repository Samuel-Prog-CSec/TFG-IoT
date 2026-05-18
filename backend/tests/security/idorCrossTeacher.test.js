/**
 * @fileoverview Tests adversariales IDOR cross-teacher (T-905 B9, reactivado T-907).
 *
 * Verifica que la **autorización por ownership** se aplica end-to-end (a través de
 * la pila HTTP completa: routing → authenticate → handler → repository) en los
 * recursos sensibles del proyecto. Un `teacher B` autenticado y aprobado NUNCA
 * debe poder leer, modificar ni eliminar recursos creados por `teacher A`.
 *
 * Por qué este suite es necesario aunque haya tests de helpers de ownership:
 *   - `tests/cardDeck.test.js` solo cubre GET /api/decks/:id cross-teacher (1 caso).
 *   - `tests/repositoryWriteOps.test.js` cubre la capa repository (sin HTTP).
 *   - `tests/superAdminApproval.test.js` cubre autorización cross-rol, no ownership.
 *
 * Este test cierra el gap probando que cada verbo (GET/PUT/DELETE/POST acción) de
 * cada recurso devuelve **403** ante un actor que no es el propietario. Pequeño
 * cambio en una capa intermedia (un middleware de autorización mal aplicado, un
 * filtro `findById` sin populate de ownership) lo detecta inmediatamente.
 *
 * Historia: T-905 B9 lo dejó como `describe.skip` por fragilidad del setup manual.
 * T-907 reactivó con factories de fixtures en `tests/helpers/testFixtures.js`.
 *
 * @module tests/security/idorCrossTeacher
 */

const request = require('supertest');
const { app } = require('../../src/server');
const {
  clearActorCollections,
  createTeacher,
  createTokenFor,
  createMechanic,
  createContext,
  createDeckFor,
  createSessionFor,
  fingerprintHeaders,
  createTestCardMappings
} = require('../helpers/testFixtures');

describe('IDOR cross-teacher (B9)', () => {
  // Cabeceras de fingerprint requeridas por verifyAccessToken — supertest debe
  // mandarlas en cada request o el token se rechaza por fingerprint mismatch.
  const authHeaders = {
    'User-Agent': fingerprintHeaders['user-agent'],
    'Accept-Language': fingerprintHeaders['accept-language'],
    'Accept-Encoding': fingerprintHeaders['accept-encoding']
  };

  let teacherA;
  let teacherB;
  let tokenA;
  let tokenB;
  let context;
  let mechanic;

  beforeEach(async () => {
    await clearActorCollections();

    teacherA = await createTeacher({ suffix: 'A' });
    teacherB = await createTeacher({ suffix: 'B' });
    tokenA = await createTokenFor(teacherA);
    tokenB = await createTokenFor(teacherB);
    context = await createContext({ suffix: 'idor' });
    mechanic = await createMechanic();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // CardDeck — un teacher no puede tocar mazos de otro teacher
  // ─────────────────────────────────────────────────────────────────────────

  describe('CardDeck endpoints', () => {
    let deckOfA;

    beforeEach(async () => {
      deckOfA = await createDeckFor(teacherA, context, { name: 'Mazo Privado A' });
    });

    test('GET /api/decks/:id de otro teacher → 403', async () => {
      const res = await request(app)
        .get(`/api/decks/${deckOfA._id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('PUT /api/decks/:id de otro teacher → 403', async () => {
      const res = await request(app)
        .put(`/api/decks/${deckOfA._id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders)
        .send({ name: 'Mazo Secuestrado' });

      expect(res.statusCode).toBe(403);
    });

    test('DELETE /api/decks/:id de otro teacher → 403', async () => {
      const res = await request(app)
        .delete(`/api/decks/${deckOfA._id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders);

      expect(res.statusCode).toBe(403);
    });

    test('GET /api/decks/:id propio → 200 (control positivo)', async () => {
      // Sanity check: el dueño SÍ puede ver su mazo. Si esto falla, la
      // autorización es restrictiva de más (regresión opuesta a IDOR).
      const res = await request(app)
        .get(`/api/decks/${deckOfA._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set(authHeaders);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Mazo Privado A');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GameSession — todos los verbos/acciones cross-teacher devuelven 403
  // ─────────────────────────────────────────────────────────────────────────

  describe('GameSession endpoints', () => {
    let sessionOfA;
    let deckOfA;

    beforeEach(async () => {
      deckOfA = await createDeckFor(teacherA, context, { uidPrefix: 'BB00' });
      sessionOfA = await createSessionFor(teacherA, deckOfA, mechanic, context, {
        status: 'created'
      });
    });

    test('GET /api/sessions/:id de otro teacher → 403', async () => {
      const res = await request(app)
        .get(`/api/sessions/${sessionOfA._id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders);

      expect(res.statusCode).toBe(403);
    });

    test('PUT /api/sessions/:id de otro teacher → 403', async () => {
      const res = await request(app)
        .put(`/api/sessions/${sessionOfA._id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders)
        .send({
          config: {
            numberOfCards: 2,
            numberOfRounds: 3,
            timeLimit: 10,
            pointsPerCorrect: 5,
            penaltyPerError: -1
          }
        });

      expect(res.statusCode).toBe(403);
    });

    test('DELETE /api/sessions/:id de otro teacher → 403', async () => {
      const res = await request(app)
        .delete(`/api/sessions/${sessionOfA._id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders);

      expect(res.statusCode).toBe(403);
    });

    test('POST /api/sessions/:id/start de otro teacher → 403', async () => {
      const res = await request(app)
        .post(`/api/sessions/${sessionOfA._id}/start`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders)
        .send({});

      expect(res.statusCode).toBe(403);
    });

    test('POST /api/sessions/:id/end de otro teacher → 403', async () => {
      const res = await request(app)
        .post(`/api/sessions/${sessionOfA._id}/end`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders)
        .send({});

      expect(res.statusCode).toBe(403);
    });

    test('POST /api/sessions/:id/clone de otro teacher → 403', async () => {
      const res = await request(app)
        .post(`/api/sessions/${sessionOfA._id}/clone`)
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders)
        .send({});

      expect(res.statusCode).toBe(403);
    });

    test('GET /api/sessions/:id propio → 200 (control positivo)', async () => {
      const res = await request(app)
        .get(`/api/sessions/${sessionOfA._id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set(authHeaders);

      expect(res.statusCode).toBe(200);
      expect(String(res.body.data.createdBy)).toBe(String(teacherA._id));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Defensa en profundidad: el listado de B nunca contiene recursos de A
  // ─────────────────────────────────────────────────────────────────────────

  describe('Listados con filtro de ownership', () => {
    test('GET /api/decks no muestra mazos de otros teachers', async () => {
      await createDeckFor(teacherA, context, { name: 'Deck A1', uidPrefix: 'C100' });
      await createDeckFor(teacherA, context, { name: 'Deck A2', uidPrefix: 'C200' });
      await createDeckFor(teacherB, context, { name: 'Deck B1', uidPrefix: 'C300' });

      const res = await request(app)
        .get('/api/decks')
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders);

      expect(res.statusCode).toBe(200);
      const decks = res.body.data || [];
      expect(
        decks.every(d => String(d.createdBy?._id || d.createdBy) === String(teacherB._id))
      ).toBe(true);
      // Y debería ver al menos el suyo
      expect(decks.some(d => d.name === 'Deck B1')).toBe(true);
      // Y ninguno de A
      expect(decks.some(d => d.name === 'Deck A1' || d.name === 'Deck A2')).toBe(false);
    });

    test('GET /api/sessions no muestra sesiones de otros teachers', async () => {
      const deckA = await createDeckFor(teacherA, context, { uidPrefix: 'D100' });
      const deckB = await createDeckFor(teacherB, context, { uidPrefix: 'D200' });
      await createSessionFor(teacherA, deckA, mechanic, context, {
        cardMappings: createTestCardMappings(2, { uidPrefix: 'D100' }),
        status: 'created'
      });
      await createSessionFor(teacherB, deckB, mechanic, context, {
        cardMappings: createTestCardMappings(2, { uidPrefix: 'D200' }),
        status: 'created'
      });

      const res = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${tokenB}`)
        .set(authHeaders);

      expect(res.statusCode).toBe(200);
      const sessions = res.body.data || [];
      expect(
        sessions.every(s => String(s.createdBy?._id || s.createdBy) === String(teacherB._id))
      ).toBe(true);
    });
  });
});
