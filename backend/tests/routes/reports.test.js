/**
 * @fileoverview Tests de endpoints /api/reports (T-942 Fase B).
 *
 * Cubre autorización por rol y ownership entre dos docentes.
 */

const request = require('supertest');
const { app } = require('../../src/server');
const User = require('../../src/models/User');
const ReportTemplate = require('../../src/models/ReportTemplate');
const GeneratedReport = require('../../src/models/GeneratedReport');
const { generateTokenPair } = require('../../src/middlewares/auth');

const mockReq = {
  headers: {
    'user-agent': 'jest-test',
    'accept-language': 'en',
    'accept-encoding': 'gzip'
  }
};

const fingerprintHeaders = {
  'User-Agent': 'jest-test',
  'Accept-Language': 'en',
  'Accept-Encoding': 'gzip'
};

const seedSystemTemplate = () =>
  ReportTemplate.create({
    key: 'end-of-term',
    name: 'Fin de trimestre',
    description: 'Resumen completo del trimestre',
    icon: 'GraduationCap',
    defaults: { reportType: 'classroom', period: '90d', format: 'detailed' },
    isSystem: true
  });

describe('Reports Endpoints (T-942 Fase B)', () => {
  let teacher;
  let otherTeacher;
  let superAdmin;
  let teacherToken;
  let otherTeacherToken;
  let superAdminToken;

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      ReportTemplate.deleteMany({}),
      GeneratedReport.deleteMany({})
    ]);

    teacher = await User.create({
      name: 'Maria Test',
      email: 'maria-reports@test.com',
      password: 'Password123',
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });
    otherTeacher = await User.create({
      name: 'Carlos Test',
      email: 'carlos-reports@test.com',
      password: 'Password123',
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });
    superAdmin = await User.create({
      name: 'Admin Test',
      email: 'admin-reports@test.com',
      password: 'Admin1234!',
      role: 'super_admin',
      accountStatus: 'approved',
      status: 'active'
    });

    [teacherToken, otherTeacherToken, superAdminToken] = await Promise.all([
      generateTokenPair(teacher, mockReq).then(t => t.accessToken),
      generateTokenPair(otherTeacher, mockReq).then(t => t.accessToken),
      generateTokenPair(superAdmin, mockReq).then(t => t.accessToken)
    ]);
  });

  describe('GET /api/reports/templates', () => {
    it('lista plantillas con system primero', async () => {
      await seedSystemTemplate();
      await ReportTemplate.create({
        key: 'custom-tpl',
        name: 'Alfabéticamente primero',
        defaults: { reportType: 'student', period: '7d', format: 'summary' }
      });

      const res = await request(app)
        .get('/api/reports/templates')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].key).toBe('end-of-term'); // system primero
    });

    it('responde 401 sin auth', async () => {
      const res = await request(app).get('/api/reports/templates');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/reports/templates', () => {
    const newTemplateBody = {
      key: 'monthly-summary',
      name: 'Resumen mensual',
      description: 'Plantilla custom',
      icon: 'CalendarDays',
      defaults: { reportType: 'classroom', period: '30d', format: 'summary' }
    };

    it('crea una plantilla cuando el caller es super_admin', async () => {
      const res = await request(app)
        .post('/api/reports/templates')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set(fingerprintHeaders)
        .send(newTemplateBody);

      expect(res.statusCode).toBe(201);
      expect(res.body.data.isSystem).toBe(false);
      expect(res.body.data.key).toBe('monthly-summary');
    });

    it('responde 403 cuando un teacher intenta crear plantillas', async () => {
      const res = await request(app)
        .post('/api/reports/templates')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send(newTemplateBody);

      expect(res.statusCode).toBe(403);
    });

    it('responde 409 si la clave ya existe', async () => {
      await seedSystemTemplate();
      const res = await request(app)
        .post('/api/reports/templates')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set(fingerprintHeaders)
        .send({ ...newTemplateBody, key: 'end-of-term' });

      expect(res.statusCode).toBe(409);
    });
  });

  describe('DELETE /api/reports/templates/:id', () => {
    it('rechaza el borrado de una plantilla isSystem=true', async () => {
      const tpl = await seedSystemTemplate();
      const res = await request(app)
        .delete(`/api/reports/templates/${tpl._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set(fingerprintHeaders);
      expect(res.statusCode).toBe(409);
    });

    it('borra una plantilla custom (super_admin) y devuelve 204', async () => {
      const tpl = await ReportTemplate.create({
        key: 'temporal',
        name: 'Plantilla custom borrable',
        defaults: { reportType: 'classroom', period: '30d', format: 'summary' }
      });
      const res = await request(app)
        .delete(`/api/reports/templates/${tpl._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .set(fingerprintHeaders);
      expect(res.statusCode).toBe(204);
      expect(await ReportTemplate.findById(tpl._id)).toBeNull();
    });
  });

  describe('GET /api/reports/recent', () => {
    it('solo devuelve los informes del docente autenticado', async () => {
      await GeneratedReport.create({
        teacherId: teacher._id,
        reportType: 'classroom',
        period: '30d',
        format: 'summary',
        title: 'Mi informe',
        payload: { ok: true },
        payloadSize: 0
      });
      await GeneratedReport.create({
        teacherId: otherTeacher._id,
        reportType: 'classroom',
        period: '30d',
        format: 'summary',
        title: 'Informe ajeno',
        payload: { ok: true },
        payloadSize: 0
      });

      const res = await request(app)
        .get('/api/reports/recent')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].title).toBe('Mi informe');
      expect(res.body.data.items[0].payload).toBeUndefined(); // payload excluido
      expect(res.body.data.pagination.total).toBe(1);
    });
  });

  describe('GET /api/reports/:id', () => {
    it('owner accede al informe con payload completo', async () => {
      const report = await GeneratedReport.create({
        teacherId: teacher._id,
        reportType: 'classroom',
        period: '30d',
        format: 'summary',
        title: 'Mi informe completo',
        payload: { stats: { total: 5 } },
        payloadSize: 0
      });

      const res = await request(app)
        .get(`/api/reports/${report._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.payload.stats.total).toBe(5);
    });

    it('responde 403 si otro docente intenta abrir el informe', async () => {
      const report = await GeneratedReport.create({
        teacherId: teacher._id,
        reportType: 'classroom',
        period: '30d',
        format: 'summary',
        title: 'Solo de María',
        payload: { ok: true },
        payloadSize: 0
      });

      const res = await request(app)
        .get(`/api/reports/${report._id}`)
        .set('Authorization', `Bearer ${otherTeacherToken}`)
        .set(fingerprintHeaders);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/reports', () => {
    it('persiste un informe y recalcula payloadSize', async () => {
      const payload = {
        kpis: { totalStudents: 12, avgScore: 78 },
        topStudents: ['Ana', 'Luis']
      };

      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send({
          reportType: 'classroom',
          period: '30d',
          format: 'summary',
          title: 'Informe de aula',
          payload
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.data.payloadSize).toBeGreaterThan(0);
      expect(res.body.data.payloadSize).toBe(Buffer.byteLength(JSON.stringify(payload), 'utf8'));
      expect(res.body.data.teacherId).toBe(teacher._id.toString());
    });

    it('rechaza body sin studentId cuando reportType=student', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders)
        .send({
          reportType: 'student',
          period: '7d',
          format: 'summary',
          title: 'Informe individual',
          payload: { ok: true }
        });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/reports/:id', () => {
    it('owner borra su propio informe y devuelve 204', async () => {
      const report = await GeneratedReport.create({
        teacherId: teacher._id,
        reportType: 'classroom',
        period: '30d',
        format: 'summary',
        title: 'A borrar',
        payload: { ok: true },
        payloadSize: 0
      });

      const res = await request(app)
        .delete(`/api/reports/${report._id}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .set(fingerprintHeaders);
      expect(res.statusCode).toBe(204);
      expect(await GeneratedReport.findById(report._id)).toBeNull();
    });

    it('responde 403 cuando otro docente intenta borrarlo', async () => {
      const report = await GeneratedReport.create({
        teacherId: teacher._id,
        reportType: 'classroom',
        period: '30d',
        format: 'summary',
        title: 'A blindar',
        payload: { ok: true },
        payloadSize: 0
      });

      const res = await request(app)
        .delete(`/api/reports/${report._id}`)
        .set('Authorization', `Bearer ${otherTeacherToken}`)
        .set(fingerprintHeaders);
      expect(res.statusCode).toBe(403);
      expect(await GeneratedReport.findById(report._id)).not.toBeNull();
    });
  });
});
