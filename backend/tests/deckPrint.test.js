/**
 * @fileoverview Tests de integración del endpoint POST /api/decks/:id/print.
 * Verifica la respuesta binaria (application/pdf + attachment), el conteo de páginas,
 * los guards de tamaño (Zod), la exclusión de cartas sin imagen y auth/ownership.
 * La descarga de imágenes se mockea (sin red) mediante `deckPrintService.fetchImageBuffer`.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { app } = require('../src/server');
const User = require('../src/models/User');
const CardDeck = require('../src/models/CardDeck');
const deckPrintService = require('../src/services/deckPrintService');
const { generateTokenPair } = require('../src/middlewares/auth');

// Parser binario: supertest no bufferiza application/pdf por defecto.
const binaryParser = (res, callback) => {
  const chunks = [];
  res.on('data', chunk => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

const fingerprintHeaders = {
  'User-Agent': 'jest-test',
  'Accept-Language': 'en',
  'Accept-Encoding': 'gzip'
};
const mockReq = {
  headers: { 'user-agent': 'jest-test', 'accept-language': 'en', 'accept-encoding': 'gzip' }
};

describe('POST /api/decks/:id/print', () => {
  let teacher;
  let teacherToken;
  let otherToken;
  let deck;
  let redPng;

  beforeAll(async () => {
    redPng = await sharp({
      create: { width: 120, height: 80, channels: 3, background: { r: 200, g: 30, b: 30 } }
    })
      .png()
      .toBuffer();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), CardDeck.deleteMany({})]);

    teacher = await User.create({
      name: 'Print Teacher',
      email: 'print.teacher@test.com',
      password: 'Password123',
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });
    teacherToken = (await generateTokenPair(teacher, mockReq)).accessToken;

    const otherTeacher = await User.create({
      name: 'Other Teacher',
      email: 'other.teacher@test.com',
      password: 'Password123',
      role: 'teacher',
      accountStatus: 'approved',
      status: 'active'
    });
    otherToken = (await generateTokenPair(otherTeacher, mockReq)).accessToken;

    // El endpoint lee las imágenes desde displayData del mazo (snapshot), no del
    // contexto; basta un contextId cualquiera. Una carta es solo-audio (sin imagen).
    deck = await CardDeck.create({
      name: 'Mazo Imprimible',
      contextId: new mongoose.Types.ObjectId(),
      createdBy: teacher._id,
      cardMappings: [
        {
          uid: 'AA000001',
          assignedValue: 'España',
          displayData: { imageUrl: 'https://example.test/es.webp', dominantColor: '#c81e1e' }
        },
        {
          uid: 'AA000002',
          assignedValue: 'Francia',
          displayData: { imageUrl: 'https://example.test/fr.webp', dominantColor: '#0055a4' }
        },
        {
          uid: 'AA000003',
          assignedValue: 'Solo audio',
          displayData: { audioUrl: 'https://example.test/a.mp3' }
        }
      ]
    });

    jest.spyOn(deckPrintService, 'fetchImageBuffer').mockResolvedValue(redPng);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('genera un PDF (200, application/pdf, attachment) excluyendo la carta sin imagen', async () => {
    const res = await request(app)
      .post(`/api/decks/${deck._id}/print`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({})
      .buffer()
      .parse(binaryParser);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('mazo-imprimible-cartas.pdf');
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');

    const doc = await PDFDocument.load(res.body);
    expect(doc.getPageCount()).toBe(1); // 2 cartas con imagen, 9/página
  });

  it('respeta la selección de cartas (cardUids)', async () => {
    const res = await request(app)
      .post(`/api/decks/${deck._id}/print`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({ cardUids: ['AA000001'] })
      .buffer()
      .parse(binaryParser);

    expect(res.statusCode).toBe(200);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('acepta opciones de tamaño y orientación', async () => {
    const res = await request(app)
      .post(`/api/decks/${deck._id}/print`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({ cardWidthMm: 55, cardHeightMm: 85, orientation: 'landscape', showLabel: true })
      .buffer()
      .parse(binaryParser);

    expect(res.statusCode).toBe(200);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('422 si ninguna carta seleccionada tiene imagen (solo-audio)', async () => {
    const res = await request(app)
      .post(`/api/decks/${deck._id}/print`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({ cardUids: ['AA000003'] });

    expect(res.statusCode).toBe(422);
  });

  it('400 si el tamaño está fuera de rango (guard Zod)', async () => {
    const tooSmall = await request(app)
      .post(`/api/decks/${deck._id}/print`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({ cardWidthMm: 5 });
    expect(tooSmall.statusCode).toBe(400);

    const tooBig = await request(app)
      .post(`/api/decks/${deck._id}/print`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({ cardHeightMm: 400 });
    expect(tooBig.statusCode).toBe(400);
  });

  it('403 si el mazo es de otro profesor', async () => {
    const res = await request(app)
      .post(`/api/decks/${deck._id}/print`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set(fingerprintHeaders)
      .send({});
    expect(res.statusCode).toBe(403);
  });

  it('404 si el mazo no existe', async () => {
    const res = await request(app)
      .post(`/api/decks/${new mongoose.Types.ObjectId()}/print`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .set(fingerprintHeaders)
      .send({});
    expect(res.statusCode).toBe(404);
  });

  it('401 sin autenticación', async () => {
    const res = await request(app)
      .post(`/api/decks/${deck._id}/print`)
      .set(fingerprintHeaders)
      .send({});
    expect(res.statusCode).toBe(401);
  });
});
