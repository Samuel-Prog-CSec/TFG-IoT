const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GamePlay = require('../src/models/GamePlay');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('Data Export Endpoint (Art. 20 RGPD)', () => {
  let teacherToken, teacherUser, adminToken, adminUser;
  let otherTeacherToken, otherTeacherUser;
  let student;

  const mockReq = {
    headers: {
      'user-agent': 'jest-test',
      'accept-language': 'en',
      'accept-encoding': 'gzip'
    }
  };

  beforeEach(async () => {
    await User.deleteMany({});
    await GamePlay.deleteMany({});

    teacherUser = await User.create({
      name: 'Teacher Export',
      email: 'teacher.export@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved',
      lastLoginAt: new Date()
    });

    otherTeacherUser = await User.create({
      name: 'Other Teacher',
      email: 'other.teacher@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved',
      lastLoginAt: new Date()
    });

    adminUser = await User.create({
      name: 'Admin Export',
      email: 'admin.export@test.com',
      password: 'Password123',
      role: 'super_admin',
      status: 'active',
      accountStatus: 'approved',
      lastLoginAt: new Date()
    });

    student = await User.create({
      name: 'Alumno Export',
      role: 'student',
      status: 'active',
      createdBy: teacherUser._id,
      profile: { age: 6, classroom: '1A' },
      consent: {
        granted: true,
        grantedBy: 'Padre Test',
        grantedAt: new Date(),
        purposes: ['educational_tracking', 'performance_analytics'],
        policyVersion: '1.0'
      },
      studentMetrics: {
        totalGamesPlayed: 5,
        totalScore: 400,
        averageScore: 80,
        bestScore: 95,
        totalCorrectAnswers: 20,
        totalErrors: 5,
        averageResponseTime: 3500,
        lastPlayedAt: new Date()
      }
    });

    // Crear una partida asociada al estudiante (sessionId ficticio válido)
    const fakeSessionId = new mongoose.Types.ObjectId();

    await GamePlay.create({
      playerId: student._id,
      sessionId: fakeSessionId,
      score: 85,
      status: 'completed',
      metrics: {
        totalAttempts: 10,
        correctAttempts: 8,
        errorAttempts: 2,
        timeoutAttempts: 0,
        averageResponseTime: 3200,
        completionTime: 60000
      },
      events: [
        {
          timestamp: new Date(),
          eventType: 'correct',
          expectedValue: 'gato',
          actualValue: 'gato',
          pointsAwarded: 10,
          timeElapsed: 3000,
          roundNumber: 1
        }
      ],
      startedAt: new Date(),
      completedAt: new Date()
    });

    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;
    otherTeacherToken = (await generateTokenPair(otherTeacherUser, mockReq)).accessToken;
    adminToken = (await generateTokenPair(adminUser, mockReq)).accessToken;
  });

  describe('GET /api/users/:id/export-data', () => {
    it('permite al super_admin exportar datos completos de un alumno (ADR-032)', async () => {
      const res = await request(app)
        .get(`/api/users/${student._id}/export-data`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="student-data-/);
      expect(res.headers['content-type']).toMatch(/application\/json/);

      const data = res.body.data || res.body;

      // Verificar estructura de exportación
      expect(data.exportMetadata).toBeDefined();
      expect(data.exportMetadata.exportVersion).toBe('1.0');
      expect(data.exportMetadata.platformName).toBe('Eduplay');

      // Datos del estudiante
      expect(data.student).toBeDefined();
      expect(data.student.pseudoId).toBeDefined();
      expect(data.student.name).toBe('Alumno Export');
      expect(data.student.profile.age).toBe(6);
      expect(data.student.profile.classroom).toBe('1A');

      // Consentimiento
      expect(data.consent).toBeDefined();
      expect(data.consent.granted).toBe(true);
      expect(data.consent.grantedBy).toBe('Padre Test');

      // Métricas
      expect(data.metrics).toBeDefined();
      expect(data.metrics.totalGamesPlayed).toBe(5);
      expect(data.metrics.averageScore).toBe(80);

      // Historial de partidas
      expect(data.gameHistory).toHaveLength(1);
      expect(data.gameHistory[0].score).toBe(85);
      expect(data.gameHistory[0].events).toHaveLength(1);
    });

    it('prohíbe al profesor exportar datos — operación centralizada en super_admin (ADR-032)', async () => {
      const res = await request(app)
        .get(`/api/users/${student._id}/export-data`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.status).toBe(403);
    });

    it('permite al super_admin exportar datos de cualquier alumno', async () => {
      const res = await request(app)
        .get(`/api/users/${student._id}/export-data`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.status).toBe(200);
      expect(res.body.data || res.body).toHaveProperty('student');
    });

    it('prohíbe a cualquier profesor exportar datos, incluso de alumno ajeno', async () => {
      const res = await request(app)
        .get(`/api/users/${student._id}/export-data`)
        .set('Authorization', `Bearer ${otherTeacherToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.status).toBe(403);
    });

    it('retorna 404 para un estudiante inexistente', async () => {
      const fakeId = '507f1f77bcf86cd799439099';
      const res = await request(app)
        .get(`/api/users/${fakeId}/export-data`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      expect(res.status).toBe(404);
    });

    it('retorna 401 sin autenticación', async () => {
      const res = await request(app).get(`/api/users/${student._id}/export-data`);

      expect(res.status).toBe(401);
    });

    it('incluye pseudoId en los datos exportados', async () => {
      const res = await request(app)
        .get(`/api/users/${student._id}/export-data`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'jest-test')
        .set('Accept-Language', 'en')
        .set('Accept-Encoding', 'gzip');

      const data = res.body.data || res.body;
      expect(data.student.pseudoId).toMatch(/^[0-9a-f]{16}$/);
    });
  });
});
