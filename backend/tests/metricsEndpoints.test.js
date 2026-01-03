const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');

describe('System Endpoints (/health, /api/metrics)', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('GET /api/metrics', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/metrics');
      expect(res.statusCode).toBe(401);
    });

    it('should return metrics for an authenticated teacher', async () => {
      await User.create({
        name: 'Metrics Super Admin',
        email: 'metrics-superadmin@test.com',
        password: 'Admin1234!',
        role: 'super_admin',
        accountStatus: 'approved',
        status: 'active'
      });

      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'metrics-superadmin@test.com',
        password: 'Admin1234!'
      });

      expect(loginRes.statusCode).toBe(200);
      const accessToken = loginRes.body?.data?.accessToken;
      expect(accessToken).toBeTruthy();

      const res = await request(app)
        .get('/api/metrics')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('http');
      expect(res.body.http).toHaveProperty('avgLatencyMs');
      expect(res.body).toHaveProperty('websocket');
      expect(res.body.websocket).toHaveProperty('connectedClients');
      expect(res.body).toHaveProperty('gameEngine');
      expect(res.body.gameEngine).toHaveProperty('activePlays');
      expect(res.body).toHaveProperty('rfid');
      expect(res.body.rfid).toHaveProperty('processed');
      expect(res.body.rfid.processed).toHaveProperty('totalEventsProcessed');
      expect(res.body.rfid).toHaveProperty('service');
      expect(res.body.rfid.service).toHaveProperty('metrics');
    });
  });

  describe('GET /health', () => {
    it('should respond with health payload (200 or 503 depending on dependencies)', async () => {
      const res = await request(app).get('/health');
      expect([200, 503]).toContain(res.statusCode);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('services');
      expect(res.body.services).toHaveProperty('mongodb');
      expect(res.body.services).toHaveProperty('redis');
      expect(res.body.services).toHaveProperty('rfid');
    });
  });
});
