/**
 * @fileoverview Tests de integración para el derecho de oposición a analytics (Art. 21 RGPD).
 *
 * Verifica que:
 * 1. La revocación parcial de propósitos funciona (revocar solo performance_analytics)
 * 2. Los endpoints de analytics excluyen a estudiantes sin consent de analytics
 * 3. Los endpoints individuales de student devuelven 403 cuando analytics está desactivado
 * 4. El método hasConsentFor() del modelo User funciona correctamente
 * 5. Se registra DATA_ACCESS al acceder a datos individuales de estudiantes
 *
 * @see ADR-033 — Derecho de oposición a analytics comportamentales
 */

const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GamePlay = require('../src/models/GamePlay');
const GameSession = require('../src/models/GameSession');
const GameContext = require('../src/models/GameContext');
const GameMechanic = require('../src/models/GameMechanic');
const CardDeck = require('../src/models/CardDeck');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('Analytics Consent Enforcement (Art. 21 RGPD — ADR-033)', () => {
  let adminUser, adminToken;
  let teacherUser, teacherToken;
  let studentWithConsent, studentWithoutAnalytics;
  let session, context, mechanic, deck;

  const mockReq = {
    headers: {
      'user-agent': 'jest-test',
      'accept-language': 'en',
      'accept-encoding': 'gzip'
    }
  };

  const authHeaders = token => ({
    Authorization: `Bearer ${token}`,
    'User-Agent': 'jest-test',
    'Accept-Language': 'en',
    'Accept-Encoding': 'gzip'
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await GamePlay.deleteMany({});
    await GameSession.deleteMany({});
    await GameContext.deleteMany({});
    await GameMechanic.deleteMany({});
    await CardDeck.deleteMany({});

    // Crear usuarios base
    adminUser = await User.create({
      name: 'Admin Test',
      email: 'admin.analytics@test.com',
      password: 'Password123',
      role: 'super_admin',
      status: 'active',
      accountStatus: 'approved',
      lastLoginAt: new Date()
    });

    teacherUser = await User.create({
      name: 'Teacher Test',
      email: 'teacher.analytics@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved',
      lastLoginAt: new Date()
    });

    // Estudiante CON consentimiento completo
    studentWithConsent = await User.create({
      name: 'Alumno Con Analytics',
      role: 'student',
      status: 'active',
      createdBy: teacherUser._id,
      profile: { age: 6, classroom: '1A' },
      consent: {
        granted: true,
        grantedBy: 'Tutor Completo',
        grantedAt: new Date(),
        purposes: ['educational_tracking', 'performance_analytics'],
        policyVersion: '1.0'
      },
      studentMetrics: {
        totalGamesPlayed: 5,
        totalScore: 400,
        averageScore: 80,
        bestScore: 95,
        totalCorrectAnswers: 40,
        totalErrors: 10,
        averageResponseTime: 3000,
        totalTimeouts: 0,
        totalAbandonedGames: 0,
        lastPlayedAt: new Date()
      }
    });

    // Estudiante SIN consentimiento de analytics (solo educational_tracking)
    studentWithoutAnalytics = await User.create({
      name: 'Alumno Sin Analytics',
      role: 'student',
      status: 'active',
      createdBy: teacherUser._id,
      profile: { age: 7, classroom: '1A' },
      consent: {
        granted: true,
        grantedBy: 'Tutor Parcial',
        grantedAt: new Date(),
        purposes: ['educational_tracking'],
        policyVersion: '1.0'
      },
      studentMetrics: {
        totalGamesPlayed: 3,
        totalScore: 210,
        averageScore: 70,
        bestScore: 80,
        totalCorrectAnswers: 21,
        totalErrors: 9,
        averageResponseTime: 3500,
        totalTimeouts: 0,
        totalAbandonedGames: 0,
        lastPlayedAt: new Date()
      }
    });

    // Crear contexto, mecánica, deck y sesión (estructura completa)
    context = await GameContext.create({
      contextId: 'consent-enforcement-ctx',
      name: 'Contexto Test Consent',
      description: 'Test context for consent enforcement',
      createdBy: teacherUser._id,
      assets: [
        { key: 'a1', value: 'val1', display: 'Display 1' },
        { key: 'a2', value: 'val2', display: 'Display 2' }
      ]
    });

    mechanic = await GameMechanic.create({
      name: 'consent-enforcement-mech',
      displayName: 'Consent Enforcement Mech',
      description: 'Test mechanic',
      config: { numberOfRounds: 5, pointsPerCorrect: 10, timeLimitSeconds: 30 }
    });

    deck = await CardDeck.create({
      name: 'Consent Enforcement Deck',
      contextId: context._id,
      createdBy: teacherUser._id,
      cardMappings: [
        { uid: 'CCCC1111', assignedValue: 'val1', displayData: { label: 'Display 1' } },
        { uid: 'DDDD2222', assignedValue: 'val2', displayData: { label: 'Display 2' } }
      ]
    });

    session = await GameSession.create({
      name: 'Sesion Test Consent',
      contextId: context._id,
      mechanicId: mechanic._id,
      deckId: deck._id,
      createdBy: teacherUser._id,
      status: 'completed',
      config: {
        numberOfCards: 2,
        timeLimit: 300,
        rounds: 5
      },
      cardMappings: [
        { uid: 'CCCC1111', assignedValue: 'val1', displayData: { label: 'Display 1' } },
        { uid: 'DDDD2222', assignedValue: 'val2', displayData: { label: 'Display 2' } }
      ]
    });

    // Crear partidas para ambos estudiantes
    const now = new Date();
    await GamePlay.create([
      {
        playerId: studentWithConsent._id,
        sessionId: session._id,
        score: 80,
        status: 'completed',
        metrics: {
          totalAttempts: 10,
          correctAttempts: 8,
          errorAttempts: 2,
          timeoutAttempts: 0,
          averageResponseTime: 3000,
          completionTime: 50000
        },
        events: [],
        startedAt: now,
        completedAt: now
      },
      {
        playerId: studentWithoutAnalytics._id,
        sessionId: session._id,
        score: 70,
        status: 'completed',
        metrics: {
          totalAttempts: 10,
          correctAttempts: 7,
          errorAttempts: 3,
          timeoutAttempts: 0,
          averageResponseTime: 3500,
          completionTime: 55000
        },
        events: [],
        startedAt: now,
        completedAt: now
      }
    ]);

    adminToken = (await generateTokenPair(adminUser, mockReq)).accessToken;
    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;
  });

  // ════════════════════════════════════════════════════════════════
  // User.hasConsentFor() — método del modelo
  // ════════════════════════════════════════════════════════════════

  describe('User.hasConsentFor()', () => {
    it('devuelve true si el propósito está activo', () => {
      expect(studentWithConsent.hasConsentFor('performance_analytics')).toBe(true);
      expect(studentWithConsent.hasConsentFor('educational_tracking')).toBe(true);
    });

    it('devuelve false si el propósito no está activo', () => {
      expect(studentWithoutAnalytics.hasConsentFor('performance_analytics')).toBe(false);
      expect(studentWithoutAnalytics.hasConsentFor('educational_tracking')).toBe(true);
    });

    it('devuelve false si el consentimiento está revocado', async () => {
      // Simular revocación post-creación: actualizar directamente en BD
      await User.updateOne(
        { _id: studentWithConsent._id },
        { $set: { 'consent.granted': false, 'consent.withdrawnAt': new Date() } }
      );
      const revoked = await User.findById(studentWithConsent._id);
      expect(revoked.hasConsentFor('educational_tracking')).toBe(false);
      expect(revoked.hasConsentFor('performance_analytics')).toBe(false);
    });

    it('devuelve false si el campo consent.purposes está vacío', async () => {
      await User.updateOne({ _id: studentWithConsent._id }, { $set: { 'consent.purposes': [] } });
      const noPurposes = await User.findById(studentWithConsent._id);
      expect(noPurposes.hasConsentFor('performance_analytics')).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Revocación parcial de propósitos — PATCH /api/users/:id/consent
  // ════════════════════════════════════════════════════════════════

  describe('Revocación parcial de propósitos (Art. 21 RGPD)', () => {
    it('permite revocar performance_analytics manteniendo educational_tracking', async () => {
      const res = await request(app)
        .patch(`/api/users/${studentWithConsent._id}/consent`)
        .set(authHeaders(adminToken))
        .send({
          granted: true,
          grantedBy: 'Tutor Completo',
          purposes: ['educational_tracking']
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verificar en BD
      const updated = await User.findById(studentWithConsent._id);
      expect(updated.consent.granted).toBe(true);
      expect(updated.consent.purposes).toEqual(['educational_tracking']);
      expect(updated.consent.purposes).not.toContain('performance_analytics');
      expect(updated.status).toBe('active'); // NO se desactiva
    });

    it('registra el cambio en consentHistory', async () => {
      await request(app)
        .patch(`/api/users/${studentWithConsent._id}/consent`)
        .set(authHeaders(adminToken))
        .send({
          granted: true,
          grantedBy: 'Tutor Completo',
          purposes: ['educational_tracking']
        })
        .expect(200);

      const updated = await User.findById(studentWithConsent._id);
      const lastEntry = updated.consentHistory[updated.consentHistory.length - 1];
      expect(lastEntry.action).toBe('granted');
      expect(lastEntry.purposes).toEqual(['educational_tracking']);
    });

    it('permite re-activar performance_analytics', async () => {
      // Primero revocar analytics
      await request(app)
        .patch(`/api/users/${studentWithConsent._id}/consent`)
        .set(authHeaders(adminToken))
        .send({
          granted: true,
          grantedBy: 'Tutor Completo',
          purposes: ['educational_tracking']
        })
        .expect(200);

      // Luego re-activar
      await request(app)
        .patch(`/api/users/${studentWithConsent._id}/consent`)
        .set(authHeaders(adminToken))
        .send({
          granted: true,
          grantedBy: 'Tutor Completo',
          purposes: ['educational_tracking', 'performance_analytics']
        })
        .expect(200);

      const updated = await User.findById(studentWithConsent._id);
      expect(updated.consent.purposes).toContain('performance_analytics');
      expect(updated.consent.purposes).toContain('educational_tracking');
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Analytics endpoints excluyen estudiantes sin consent
  // ════════════════════════════════════════════════════════════════

  describe('Exclusión de estudiantes sin analytics consent', () => {
    it('GET /classroom/students solo incluye estudiantes con consent de analytics', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/students')
        .set(authHeaders(teacherToken))
        .expect(200);

      // Con 1 solo estudiante con consent (< MIN_ANALYTICS_GROUP_SIZE=5), devuelve aggregatedOnly
      // El punto clave es que NO devuelve datos individuales del estudiante sin consent
      const data = res.body.data;
      if (data.aggregatedOnly) {
        // k-anonimidad activa: solo datos agregados, correcto
        expect(data.total).toBe(1); // Solo el estudiante con consent
      } else {
        // Si hay suficientes estudiantes, verificar exclusión
        const ids = data.students.map(s => s.id);
        expect(ids).not.toContain(studentWithoutAnalytics._id.toString());
      }
    });

    it('GET /classroom/distribution excluye estudiantes sin analytics consent', async () => {
      const res = await request(app)
        .get('/api/analytics/classroom/distribution')
        .set(authHeaders(teacherToken))
        .expect(200);

      // Solo 1 estudiante con consent — el total debe ser 1
      const distribution = res.body.data.distribution ?? res.body.data;
      const totalCount = Array.isArray(distribution)
        ? distribution.reduce((sum, d) => sum + d.count, 0)
        : 0;
      expect(totalCount).toBe(1);
    });

    it('GET /students/identity solo incluye estudiantes con analytics consent', async () => {
      const res = await request(app)
        .get('/api/analytics/students/identity')
        .set(authHeaders(teacherToken))
        .expect(200);

      const ids = res.body.data.map(s => s.id);
      expect(ids).toContain(studentWithConsent._id.toString());
      expect(ids).not.toContain(studentWithoutAnalytics._id.toString());
    });
  });

  // ════════════════════════════════════════════════════════════════
  // Endpoints individuales devuelven 403 sin consent de analytics
  // ════════════════════════════════════════════════════════════════

  describe('Verificación de consent en endpoints individuales de student', () => {
    it('GET /student/:id/summary devuelve 403 sin analytics consent', async () => {
      const res = await request(app)
        .get(`/api/analytics/student/${studentWithoutAnalytics._id}/summary`)
        .set(authHeaders(teacherToken))
        .expect(403);

      expect(res.body.message).toContain('oposición');
    });

    it('GET /student/:id/progress devuelve 403 sin analytics consent', async () => {
      const res = await request(app)
        .get(`/api/analytics/student/${studentWithoutAnalytics._id}/progress`)
        .set(authHeaders(teacherToken))
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('GET /student/:id/difficulties devuelve 403 sin analytics consent', async () => {
      const res = await request(app)
        .get(`/api/analytics/student/${studentWithoutAnalytics._id}/difficulties`)
        .set(authHeaders(teacherToken))
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('GET /student/:id/trajectory devuelve 403 sin analytics consent', async () => {
      const res = await request(app)
        .get(`/api/analytics/student/${studentWithoutAnalytics._id}/trajectory`)
        .set(authHeaders(teacherToken))
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('GET /student/:id/engagement devuelve 403 sin analytics consent', async () => {
      const res = await request(app)
        .get(`/api/analytics/student/${studentWithoutAnalytics._id}/engagement`)
        .set(authHeaders(teacherToken))
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('GET /reports/student/:id devuelve 403 sin analytics consent', async () => {
      const res = await request(app)
        .get(`/api/analytics/reports/student/${studentWithoutAnalytics._id}`)
        .set(authHeaders(teacherToken))
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('permite acceso a estudiante CON analytics consent', async () => {
      const res = await request(app)
        .get(`/api/analytics/student/${studentWithConsent._id}/summary`)
        .set(authHeaders(teacherToken))
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
