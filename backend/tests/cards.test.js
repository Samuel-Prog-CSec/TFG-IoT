const request = require('supertest');
const { app } = require('../src/server');
const User = require('../src/models/User');
const Card = require('../src/models/Card');
const { generateTokenPair } = require('../src/middlewares/auth');

describe('Card Management Endpoints', () => {
  let teacherUser;
  let teacherToken;

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
    await Promise.all([User.deleteMany({}), Card.deleteMany({})]);

    teacherUser = await User.create({
      name: 'Cards Teacher',
      email: 'cards.teacher@test.com',
      password: 'Password123',
      role: 'teacher',
      status: 'active'
    });

    teacherToken = (await generateTokenPair(teacherUser, mockReq)).accessToken;
  });

  it('should create a card successfully', async () => {
    const res = await request(app)
      .post('/api/cards')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({ uid: 'aa000001', type: 'NTAG' });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uid).toBe('AA000001');
    expect(res.body.data.type).toBe('NTAG');
    expect(res.body.data.status).toBe('active');
  });

  it('should reject duplicate card uid', async () => {
    await Card.create({ uid: 'AA000001', type: 'NTAG', status: 'active' });

    const res = await request(app)
      .post('/api/cards')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({ uid: 'AA000001', type: 'NTAG' });

    expect(res.statusCode).toEqual(409);
  });

  it('should list cards with pagination wrapper', async () => {
    await Card.create({ uid: 'AA000001', type: 'NTAG', status: 'active' });
    await Card.create({ uid: 'AA000002', type: 'UNKNOWN', status: 'inactive' });

    const res = await request(app)
      .get('/api/cards?limit=30')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);

    const items = Array.isArray(res.body.data) ? res.body.data : res.body.data?.data;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(2);

    const pagination = res.body.pagination ?? res.body.data?.pagination;
    expect(pagination).toBeTruthy();
    expect(pagination).toHaveProperty('page');
    expect(typeof pagination.page).toBe('number');
    expect(pagination.page).toBeGreaterThanOrEqual(1);
    expect(pagination).toHaveProperty('total');
    expect(pagination.total).toBeGreaterThanOrEqual(2);
  });

  it('should get a card by UID', async () => {
    await Card.create({ uid: 'AA000001', type: 'NTAG', status: 'active' });

    const res = await request(app)
      .get('/api/cards/aa000001')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.uid).toBe('AA000001');
  });

  it('should update a card status', async () => {
    const card = await Card.create({ uid: 'AA000001', type: 'NTAG', status: 'active' });

    const res = await request(app)
      .put(`/api/cards/${card._id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({ status: 'inactive' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('inactive');
  });

  it('should soft delete a card (mark as lost)', async () => {
    const card = await Card.create({ uid: 'AA000001', type: 'NTAG', status: 'active' });

    const res = await request(app)
      .delete(`/api/cards/${card._id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders);

    expect(res.statusCode).toEqual(200);

    const updated = await Card.findById(card._id);
    expect(updated.status).toBe('lost');
  });

  it('should create cards in batch', async () => {
    const res = await request(app)
      .post('/api/cards/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({
        cards: [
          { uid: 'aa000001', type: 'NTAG' },
          { uid: 'aa000002', type: 'UNKNOWN' }
        ]
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(2);
  });

  it('should fail batch when contains duplicate uids', async () => {
    const res = await request(app)
      .post('/api/cards/batch')
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({
        cards: [
          { uid: 'aa000001', type: 'NTAG' },
          { uid: 'aa000001', type: 'NTAG' }
        ]
      });

    expect(res.statusCode).toEqual(400);
  });
});
