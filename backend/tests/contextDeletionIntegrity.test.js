const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../src/server');
const User = require('../src/models/User');
const GameContext = require('../src/models/GameContext');
const CardDeck = require('../src/models/CardDeck');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('Context deletion integrity', () => {
  let teacher;
  let superAdmin;
  let superAdminToken;

  const mockReq = {
    headers: {
      'user-agent': 'jest-context-integrity',
      'accept-language': 'en',
      'accept-encoding': 'gzip'
    }
  };

  beforeEach(async () => {
    await User.deleteMany({});
    await CardDeck.deleteMany({});
    await GameContext.deleteMany({});

    teacher = await User.create({
      name: 'Teacher Context Integrity',
      email: 'teacher.context.integrity@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active',
      accountStatus: 'approved'
    });

    // Solo super_admin puede borrar contextos
    superAdmin = await User.create({
      name: 'Super Admin Context Integrity',
      email: 'superadmin.context.integrity@test.com',
      password: 'Password123',
      role: 'super_admin',
      status: 'active',
      accountStatus: 'approved'
    });

    superAdminToken = (await generateTokenPair(superAdmin, mockReq)).accessToken;
  });

  it('blocks context deletion when active deck dependencies exist', async () => {
    const context = await GameContext.create({
      contextId: `ctx-active-${Date.now()}`,
      name: 'Context Active Dependencies',
      assets: [{ key: 'asset1', display: 'A1', value: 'Valor 1' }]
    });

    await CardDeck.create({
      name: `Deck Active ${Date.now()}`,
      contextId: context._id,
      status: 'active',
      createdBy: teacher._id,
      cardMappings: [
        {
          cardId: new mongoose.Types.ObjectId(),
          uid: 'AA000001',
          assignedValue: 'Valor 1',
          displayData: { key: 'asset1', value: 'Valor 1' }
        },
        {
          cardId: new mongoose.Types.ObjectId(),
          uid: 'AA000002',
          assignedValue: 'Valor 2',
          displayData: { key: 'asset2', value: 'Valor 2' }
        }
      ]
    });

    const res = await request(app)
      .delete(`/api/contexts/${context._id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('User-Agent', 'jest-context-integrity')
      .set('Accept-Language', 'en')
      .set('Accept-Encoding', 'gzip');

    expect(res.statusCode).toBe(409);

    const stillExists = await GameContext.findById(context._id);
    expect(stillExists).toBeTruthy();
  });

  it('allows context deletion when dependencies are not active', async () => {
    const context = await GameContext.create({
      contextId: `ctx-archived-${Date.now()}`,
      name: 'Context Archived Dependencies',
      assets: [{ key: 'asset1', display: 'A1', value: 'Valor 1' }]
    });

    await CardDeck.create({
      name: `Deck Archived ${Date.now()}`,
      contextId: context._id,
      status: 'archived',
      createdBy: teacher._id,
      cardMappings: [
        {
          cardId: new mongoose.Types.ObjectId(),
          uid: 'BB000001',
          assignedValue: 'Valor 1',
          displayData: { key: 'asset1', value: 'Valor 1' }
        },
        {
          cardId: new mongoose.Types.ObjectId(),
          uid: 'BB000002',
          assignedValue: 'Valor 2',
          displayData: { key: 'asset2', value: 'Valor 2' }
        }
      ]
    });

    const res = await request(app)
      .delete(`/api/contexts/${context._id}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .set('User-Agent', 'jest-context-integrity')
      .set('Accept-Language', 'en')
      .set('Accept-Encoding', 'gzip');

    expect(res.statusCode).toBe(200);

    const deletedContext = await GameContext.findById(context._id);
    expect(deletedContext).toBeNull();
  });

  it('denies context deletion to teacher (only super_admin allowed)', async () => {
    const teacherToken = (await generateTokenPair(teacher, mockReq)).accessToken;
    const context = await GameContext.create({
      contextId: `ctx-teacher-deny-${Date.now()}`,
      name: 'Context Teacher Deny',
      assets: []
    });

    const res = await request(app)
      .delete(`/api/contexts/${context._id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set('User-Agent', 'jest-context-integrity')
      .set('Accept-Language', 'en')
      .set('Accept-Encoding', 'gzip');

    expect(res.statusCode).toBe(403);

    // El contexto debe seguir existiendo
    const stillExists = await GameContext.findById(context._id);
    expect(stillExists).toBeTruthy();
  });
});
