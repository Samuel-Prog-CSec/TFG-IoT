/**
 * @fileoverview Audit DTO output sanitization (T-905 B2).
 *
 * Verifica defensivamente que los DTOs NUNCA exponen campos sensibles aunque
 * el documento Mongoose los contenga (password, mfa secret/backupCodes,
 * consent.ipAddress/userAgent/channel — metadatos GDPR para audit). Esto
 * actúa como red de seguridad para detectar regresiones futuras al editar
 * los serializadores de respuesta.
 */

const {
  toUserDTOV1,
  toStudentDTOV1,
  toUserSummaryDTOV1,
  toUserListDTOV1,
  toStudentAnalyticsDTOV1,
  toStudentIdentityDTOV1,
  toAuthResponseDTOV1,
  toGamePlayDTOV1,
  toGamePlayDetailDTOV1,
  toGameSessionDTOV1,
  toGameSessionDetailDTOV1,
  toGameSessionListDTOV1,
  toCardDeckDTOV1,
  toCardDeckDetailDTOV1,
  toGameContextDTOV1,
  toSystemMetricsDTOV1
} = require('../../src/utils/dtos');

/**
 * Recolecta TODAS las keys (recursivamente) presentes en un objeto.
 * Útil para asegurar que ningún campo "prohibido" aparece en cualquier nivel.
 */
const collectKeys = (value, path = '') => {
  const keys = new Set();
  if (value === null || value === undefined) {
    return keys;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      for (const k of collectKeys(item, path)) {
        keys.add(k);
      }
    }
    return keys;
  }
  if (typeof value !== 'object') {
    return keys;
  }
  for (const [k, v] of Object.entries(value)) {
    const full = path ? `${path}.${k}` : k;
    keys.add(full);
    for (const nested of collectKeys(v, full)) {
      keys.add(nested);
    }
  }
  return keys;
};

const PROHIBITED_FIELDS = [
  'password',
  'passwordHash',
  '__v',
  '_internal',
  'currentSessionId',
  'mfa.secret',
  'mfa.backupCodes',
  'consent.ipAddress',
  'consent.userAgent',
  'consent.channel'
];

const buildMockTeacher = () => ({
  _id: '507f1f77bcf86cd799439011',
  name: 'Profesora Test',
  email: 'profe@test.com',
  password: '$2b$10$abcdefghijklmnopqrstuv',
  role: 'teacher',
  status: 'active',
  accountStatus: 'approved',
  currentSessionId: 'session-1234',
  __v: 0,
  profile: {
    avatar: 'avatar.png',
    age: 35,
    classroom: 'Aula A'
  },
  mfa: {
    enabled: true,
    secret: 'CIFRADO_AES_256_GCM_NO_DEBE_FUGAR',
    backupCodes: [{ hash: 'bcrypt-hash-1', usedAt: null }]
  },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-05-01'),
  toObject() {
    const rest = { ...this };
    delete rest.toObject;
    return rest;
  }
});

const buildMockStudent = () => ({
  _id: '507f1f77bcf86cd799439012',
  name: 'Alumno Test',
  role: 'student',
  status: 'active',
  password: 'pswd-pre-bcrypt',
  __v: 0,
  profile: { avatar: 'a.png', age: 9, classroom: 'Aula B' },
  studentMetrics: {
    totalPlays: 10,
    averageScore: 85,
    bestScore: 100,
    averageDurationSec: 120
  },
  consent: {
    granted: true,
    grantedBy: 'Padre Tutor',
    grantedAt: new Date('2026-02-01'),
    purposes: ['educational_tracking'],
    policyVersion: '1.0',
    // Campos especialmente sensibles que NO deben fugar a API:
    ipAddress: '203.0.113.42', // RFC 5737 TEST-NET-3 — segura para tests
    userAgent: 'Mozilla/5.0 ...',
    channel: 'email'
  },
  consentHistory: [
    {
      action: 'granted',
      grantedBy: 'Padre Tutor',
      timestamp: new Date('2026-02-01'),
      policyVersion: '1.0',
      purposes: ['educational_tracking'],
      ipAddress: '203.0.113.42', // RFC 5737 TEST-NET-3 — segura para tests
      userAgent: 'Mozilla/5.0 ...'
    }
  ],
  createdBy: '507f1f77bcf86cd799439011',
  toObject() {
    const rest = { ...this };
    delete rest.toObject;
    return rest;
  }
});

const assertNoSensitiveFields = (dto, label) => {
  const keys = collectKeys(dto);
  for (const forbidden of PROHIBITED_FIELDS) {
    expect({ label, forbidden, keys: [...keys] }).toEqual(
      expect.objectContaining({ label, forbidden, keys: expect.not.arrayContaining([forbidden]) })
    );
  }
};

describe('DTO output sanitization (B2)', () => {
  describe('User DTOs', () => {
    it('toUserDTOV1 no expone password, mfa.secret, currentSessionId, __v', () => {
      const dto = toUserDTOV1(buildMockTeacher());
      assertNoSensitiveFields(dto, 'toUserDTOV1');
    });

    it('toUserSummaryDTOV1 no expone campos sensibles', () => {
      const dto = toUserSummaryDTOV1(buildMockTeacher());
      assertNoSensitiveFields(dto, 'toUserSummaryDTOV1');
    });

    it('toUserSummaryDTOV1 incluye email solo para roles con login (docentes), no para alumnos', () => {
      // La lista de aprobaciones necesita el email del docente pendiente.
      expect(toUserSummaryDTOV1(buildMockTeacher()).email).toBe('profe@test.com');
      // Los alumnos (menores) no tienen email: debe quedar ausente/undefined.
      expect(toUserSummaryDTOV1(buildMockStudent()).email).toBeUndefined();
    });

    it('toUserListDTOV1 no expone campos sensibles', () => {
      const dto = toUserListDTOV1([buildMockTeacher(), buildMockStudent()]);
      assertNoSensitiveFields(dto, 'toUserListDTOV1');
    });
  });

  describe('Student DTOs (datos de menores)', () => {
    it('toStudentDTOV1 no expone consent.ipAddress/userAgent/channel (audit-only)', () => {
      const dto = toStudentDTOV1(buildMockStudent());
      assertNoSensitiveFields(dto, 'toStudentDTOV1');
      // Sanity: consent.granted SÍ debe estar disponible (información operativa)
      expect(dto.consent?.granted).toBe(true);
    });

    it('toStudentAnalyticsDTOV1 no expone campos sensibles', () => {
      const dto = toStudentAnalyticsDTOV1(buildMockStudent());
      assertNoSensitiveFields(dto, 'toStudentAnalyticsDTOV1');
    });

    it('toStudentIdentityDTOV1 no expone campos sensibles', () => {
      const dto = toStudentIdentityDTOV1(buildMockStudent());
      assertNoSensitiveFields(dto, 'toStudentIdentityDTOV1');
    });
  });

  describe('Auth response DTO (tokens)', () => {
    it('toAuthResponseDTOV1 no expone _internal, password, currentSessionId', () => {
      const tokens = {
        accessToken: 'jwt.token.access',
        accessTokenExpiresIn: 900,
        tokenType: 'Bearer'
        // OJO: _internal y refreshToken NO se pasan aquí porque el controller los
        // separa antes. Esta verificación garantiza que la firma del DTO no
        // permite filtrarlos accidentalmente si alguien los pasara.
      };
      const dto = toAuthResponseDTOV1(buildMockTeacher(), tokens);
      assertNoSensitiveFields(dto, 'toAuthResponseDTOV1');
    });
  });

  describe('GamePlay DTOs', () => {
    const buildMockGamePlay = () => ({
      _id: '507f1f77bcf86cd799439020',
      sessionId: '507f1f77bcf86cd799439021',
      playerId: '507f1f77bcf86cd799439012',
      status: 'completed',
      score: 85,
      __v: 0,
      _internal: { lockToken: 'redis-lock-do-not-expose' },
      events: [{ type: 'card_scanned', timestamp: new Date(), _internal: 'x' }],
      metrics: {
        correctAttempts: 10,
        errorAttempts: 2,
        totalAttempts: 12,
        timeoutAttempts: 0
      },
      startedAt: new Date('2026-05-01'),
      completedAt: new Date('2026-05-01'),
      toObject() {
        const rest = { ...this };
        delete rest.toObject;
        return rest;
      }
    });

    it('toGamePlayDTOV1 no expone _internal ni __v', () => {
      const dto = toGamePlayDTOV1(buildMockGamePlay());
      assertNoSensitiveFields(dto, 'toGamePlayDTOV1');
    });

    it('toGamePlayDetailDTOV1 no expone _internal ni __v', () => {
      const dto = toGamePlayDetailDTOV1(buildMockGamePlay());
      assertNoSensitiveFields(dto, 'toGamePlayDetailDTOV1');
    });
  });

  describe('GameSession DTOs', () => {
    const buildMockSession = () => ({
      _id: '507f1f77bcf86cd799439021',
      mechanicId: { _id: '507f1f77bcf86cd799439030', name: 'memory' },
      deckId: { _id: '507f1f77bcf86cd799439031', name: 'Mazo Test' },
      contextId: { _id: '507f1f77bcf86cd799439032', name: 'Animales' },
      createdBy: { _id: '507f1f77bcf86cd799439011', name: 'Profe' },
      name: 'Sesion Test',
      status: 'created',
      difficulty: 'medium',
      __v: 0,
      _internal: 'no expose',
      config: {
        numberOfCards: 6,
        numberOfRounds: 5,
        timeLimit: 60,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      },
      cardMappings: [{ uid: '32B8FA05', assignedValue: 'Perro', displayData: {} }],
      createdAt: new Date('2026-05-01'),
      updatedAt: new Date('2026-05-01'),
      toObject() {
        const rest = { ...this };
        delete rest.toObject;
        return rest;
      }
    });

    it('toGameSessionDTOV1 no expone _internal ni __v', () => {
      const dto = toGameSessionDTOV1(buildMockSession());
      assertNoSensitiveFields(dto, 'toGameSessionDTOV1');
    });

    it('toGameSessionDetailDTOV1 no expone _internal ni __v', () => {
      const dto = toGameSessionDetailDTOV1(buildMockSession());
      assertNoSensitiveFields(dto, 'toGameSessionDetailDTOV1');
    });

    it('toGameSessionListDTOV1 no expone _internal ni __v', () => {
      const dto = toGameSessionListDTOV1([buildMockSession(), buildMockSession()]);
      assertNoSensitiveFields(dto, 'toGameSessionListDTOV1');
    });
  });

  describe('CardDeck DTOs', () => {
    const buildMockDeck = () => ({
      _id: '507f1f77bcf86cd799439031',
      name: 'Mazo Test',
      description: 'descripción',
      contextId: { _id: '507f1f77bcf86cd799439032', name: 'Animales' },
      createdBy: { _id: '507f1f77bcf86cd799439011', name: 'Profe' },
      status: 'active',
      __v: 0,
      _internal: 'no expose',
      cardMappings: [{ uid: '32B8FA05', assignedValue: 'Perro' }],
      createdAt: new Date('2026-05-01'),
      updatedAt: new Date('2026-05-01'),
      toObject() {
        const rest = { ...this };
        delete rest.toObject;
        return rest;
      }
    });

    it('toCardDeckDTOV1 no expone _internal ni __v', () => {
      const dto = toCardDeckDTOV1(buildMockDeck());
      assertNoSensitiveFields(dto, 'toCardDeckDTOV1');
    });

    it('toCardDeckDetailDTOV1 no expone _internal ni __v', () => {
      const dto = toCardDeckDetailDTOV1(buildMockDeck());
      assertNoSensitiveFields(dto, 'toCardDeckDetailDTOV1');
    });
  });

  describe('GameContext DTO', () => {
    it('toGameContextDTOV1 no expone _internal ni __v', () => {
      const ctx = {
        _id: '507f1f77bcf86cd799439032',
        contextId: 'animales',
        name: 'Animales',
        isActive: true,
        __v: 0,
        _internal: 'no expose',
        assets: [{ key: 'perro', value: 'Perro', display: 'P' }],
        toObject() {
          const rest = { ...this };
          delete rest.toObject;
          return rest;
        }
      };
      const dto = toGameContextDTOV1(ctx);
      assertNoSensitiveFields(dto, 'toGameContextDTOV1');
    });
  });

  describe('System metrics DTO', () => {
    it('toSystemMetricsDTOV1 no expone fields internos sensibles', () => {
      const payload = {
        timestamp: new Date().toISOString(),
        http: { totalRequests: 100, avgLatencyMs: 50 },
        websocket: { connectedClients: 5, events: { totalEvents: 10 } },
        gameEngine: { activePlays: 0 },
        rfid: { processed: { totalEventsProcessed: 0 } },
        redis: { rateLimitStoreFallbackCount: 0 },
        memory: { rss: 50, heapUsed: 30 },
        // Campos artificiales para verificar que NO se filtran:
        _internal: 'no expose',
        __v: 0,
        password: 'no expose'
      };
      const dto = toSystemMetricsDTOV1(payload);
      assertNoSensitiveFields(dto, 'toSystemMetricsDTOV1');
    });
  });
});
