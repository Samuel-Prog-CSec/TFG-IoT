/**
 * @fileoverview Tests de integración para gestión de consentimiento parental
 * y borrado efectivo (Art. 7, 8, 17 RGPD — ADR-031/032).
 *
 * Cubre: PATCH /api/users/:id/consent y DELETE /api/users/:id/data
 */

const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GamePlay = require('../src/models/GamePlay');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('Gestión de Consentimiento Parental (RGPD)', () => {
  let adminUser, adminToken;
  let teacherUser, teacherToken;
  let student;

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

    adminUser = await User.create({
      name: 'Admin Consent Test',
      email: 'admin.consent@test.com',
      password: 'Password123',
      role: 'super_admin',
      status: 'active',
      accountStatus: 'approved',
      lastLoginAt: new Date()
    });

    teacherUser = await User.create({
      name: 'Teacher Consent Test',
      email: 'teacher.consent@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved',
      lastLoginAt: new Date()
    });

    student = await User.create({
      name: 'Alumno Consent Test',
      role: 'student',
      status: 'active',
      createdBy: teacherUser._id,
      profile: { age: 6, classroom: '1A' },
      consent: {
        granted: true,
        grantedBy: 'Tutor Original',
        grantedAt: new Date(),
        purposes: ['educational_tracking', 'performance_analytics'],
        policyVersion: '1.0'
      }
    });

    // Crear partidas asociadas al estudiante
    const fakeSessionId = require('mongoose').Types.ObjectId.createFromTime(Date.now() / 1000);
    await GamePlay.create([
      {
        playerId: student._id,
        sessionId: fakeSessionId,
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
        startedAt: new Date(),
        completedAt: new Date()
      },
      {
        playerId: student._id,
        sessionId: fakeSessionId,
        score: 90,
        status: 'completed',
        metrics: {
          totalAttempts: 10,
          correctAttempts: 9,
          errorAttempts: 1,
          timeoutAttempts: 0,
          averageResponseTime: 2500,
          completionTime: 45000
        },
        events: [],
        startedAt: new Date(),
        completedAt: new Date()
      }
    ]);

    adminToken = (await generateTokenPair(adminUser, mockReq)).accessToken;
    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;
  });

  // ────────────────────────────────────────────────────────────
  // PATCH /api/users/:id/consent
  // ────────────────────────────────────────────────────────────

  describe('PATCH /api/users/:id/consent', () => {
    it('permite al super_admin revocar consentimiento', async () => {
      const res = await request(app)
        .patch(`/api/users/${student._id}/consent`)
        .set(authHeaders(adminToken))
        .send({ granted: false });

      expect(res.status).toBe(200);

      const body = res.body.data || res.body;
      expect(body.consent.granted).toBe(false);
      expect(body.status).toBe('inactive');

      // Verificar en BD
      const updated = await User.findById(student._id);
      expect(updated.status).toBe('inactive');
      expect(updated.consent.granted).toBe(false);
      expect(updated.consent.withdrawnAt).toBeTruthy();
    });

    it('registra entrada en consentHistory al revocar', async () => {
      await request(app)
        .patch(`/api/users/${student._id}/consent`)
        .set(authHeaders(adminToken))
        .send({ granted: false });

      const updated = await User.findById(student._id);
      expect(updated.consentHistory).toBeDefined();
      expect(updated.consentHistory.length).toBeGreaterThanOrEqual(1);

      const lastEntry = updated.consentHistory[updated.consentHistory.length - 1];
      expect(lastEntry.action).toBe('withdrawn');
      expect(lastEntry.grantedBy).toBe('Tutor Original');
      expect(lastEntry.timestamp).toBeTruthy();
    });

    it('permite re-otorgar consentimiento tras revocación', async () => {
      // Primero revocar
      await request(app)
        .patch(`/api/users/${student._id}/consent`)
        .set(authHeaders(adminToken))
        .send({ granted: false });

      // Luego re-otorgar
      const res = await request(app)
        .patch(`/api/users/${student._id}/consent`)
        .set(authHeaders(adminToken))
        .send({ granted: true, grantedBy: 'Nuevo Tutor' });

      expect(res.status).toBe(200);

      const body = res.body.data || res.body;
      expect(body.consent.granted).toBe(true);
      expect(body.consent.grantedBy).toBe('Nuevo Tutor');
    });

    it('registra historial completo de cambios de consentimiento', async () => {
      // Revocar
      await request(app)
        .patch(`/api/users/${student._id}/consent`)
        .set(authHeaders(adminToken))
        .send({ granted: false });

      // Re-otorgar
      await request(app)
        .patch(`/api/users/${student._id}/consent`)
        .set(authHeaders(adminToken))
        .send({ granted: true, grantedBy: 'Nuevo Tutor' });

      const updated = await User.findById(student._id);
      expect(updated.consentHistory.length).toBeGreaterThanOrEqual(2);

      const actions = updated.consentHistory.map(e => e.action);
      expect(actions).toContain('withdrawn');
      expect(actions).toContain('granted');
    });

    it('prohíbe a un profesor modificar consentimiento — solo super_admin (ADR-032)', async () => {
      const res = await request(app)
        .patch(`/api/users/${student._id}/consent`)
        .set(authHeaders(teacherToken))
        .send({ granted: false });

      expect(res.status).toBe(403);
    });

    it('rechaza re-otorgar sin nombre de tutor (validator refine)', async () => {
      const res = await request(app)
        .patch(`/api/users/${student._id}/consent`)
        .set(authHeaders(adminToken))
        .send({ granted: true });

      expect(res.status).toBe(400);
    });

    it('retorna 404 para estudiante inexistente', async () => {
      const fakeId = '507f1f77bcf86cd799439099';
      const res = await request(app)
        .patch(`/api/users/${fakeId}/consent`)
        .set(authHeaders(adminToken))
        .send({ granted: false });

      expect(res.status).toBe(404);
    });

    it('retorna 401 sin autenticación', async () => {
      const res = await request(app)
        .patch(`/api/users/${student._id}/consent`)
        .send({ granted: false });

      expect(res.status).toBe(401);
    });
  });

  // ────────────────────────────────────────────────────────────
  // DELETE /api/users/:id/data — Art. 17 RGPD
  // ────────────────────────────────────────────────────────────

  describe('DELETE /api/users/:id/data — Art. 17 RGPD', () => {
    it('elimina usuario y todas sus partidas (cascada completa)', async () => {
      const playsBefore = await GamePlay.countDocuments({ playerId: student._id });
      expect(playsBefore).toBe(2);

      const res = await request(app)
        .delete(`/api/users/${student._id}/data`)
        .set(authHeaders(adminToken))
        .send({ confirmDeletion: true });

      expect(res.status).toBe(200);

      const body = res.body.data || res.body;
      expect(body.deleted).toBe(true);
      expect(body.summary.gamePlaysDeleted).toBeGreaterThanOrEqual(2);

      // Verificar borrado completo en BD
      const deletedUser = await User.findById(student._id);
      expect(deletedUser).toBeNull();

      const playsAfter = await GamePlay.countDocuments({ playerId: student._id });
      expect(playsAfter).toBe(0);
    });

    it('rechaza sin confirmDeletion: true', async () => {
      const res = await request(app)
        .delete(`/api/users/${student._id}/data`)
        .set(authHeaders(adminToken))
        .send({ confirmDeletion: false });

      expect(res.status).toBe(400);

      // El estudiante sigue existiendo
      const exists = await User.findById(student._id);
      expect(exists).toBeTruthy();
    });

    it('prohíbe a un profesor eliminar datos — solo super_admin (ADR-032)', async () => {
      const res = await request(app)
        .delete(`/api/users/${student._id}/data`)
        .set(authHeaders(teacherToken))
        .send({ confirmDeletion: true });

      expect(res.status).toBe(403);
    });

    it('retorna 404 para estudiante inexistente', async () => {
      const fakeId = '507f1f77bcf86cd799439099';
      const res = await request(app)
        .delete(`/api/users/${fakeId}/data`)
        .set(authHeaders(adminToken))
        .send({ confirmDeletion: true });

      expect(res.status).toBe(404);
    });

    it('retorna 401 sin autenticación', async () => {
      const res = await request(app)
        .delete(`/api/users/${student._id}/data`)
        .send({ confirmDeletion: true });

      expect(res.status).toBe(401);
    });
  });
});
