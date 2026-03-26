/**
 * @fileoverview Tests unitarios para DTOs de CardDeck y GameSession
 * tras la eliminación del modelo Card (ADR-012).
 * Verifica que los mapping DTOs usan uid como identificador primario
 * y que no contienen campo cardId.
 */

const {
  toCardDeckDTOV1,
  toCardDeckDetailDTOV1,
  toCardDeckListDTOV1,
  toGameSessionDTOV1,
  toGameSessionDetailDTOV1,
  toGameSessionListDTOV1
} = require('../src/utils/dtos');
const { createTestCardMappings } = require('./helpers/testFixtures');

// --- Helpers para construir documentos fake ---

const fakeObjectId = (suffix = '1') => `64f${suffix.padStart(21, '0')}`;

const buildDeckDoc = (overrides = {}) => ({
  _id: fakeObjectId('d1'),
  name: 'Mazo Test',
  description: 'Descripción del mazo',
  contextId: { _id: fakeObjectId('c1'), name: 'Contexto A', status: 'active' },
  status: 'active',
  cardMappings: createTestCardMappings(3),
  createdBy: { _id: fakeObjectId('u1'), name: 'María', email: 'maria@test.com' },
  createdAt: new Date('2026-03-01'),
  updatedAt: new Date('2026-03-15'),
  ...overrides
});

const buildSessionDoc = (overrides = {}) => {
  const mappings = createTestCardMappings(4);
  return {
    _id: fakeObjectId('s1'),
    mechanicId: { _id: fakeObjectId('m1'), name: 'memory', displayName: 'Memoria' },
    deckId: { _id: fakeObjectId('d1'), name: 'Mazo Test', status: 'active' },
    contextId: { _id: fakeObjectId('c1'), name: 'Contexto A', status: 'active' },
    createdBy: { _id: fakeObjectId('u1'), name: 'María', email: 'maria@test.com' },
    config: {
      numberOfCards: 4,
      numberOfRounds: 2,
      timeLimit: 60,
      pointsPerCorrect: 10,
      penaltyPerError: 5
    },
    cardMappings: mappings,
    boardLayout: mappings.map((m, i) => ({
      slotIndex: i,
      uid: m.uid,
      assignedValue: m.assignedValue,
      displayData: m.displayData
    })),
    associationChallengePlan: [
      {
        roundNumber: 1,
        uid: mappings[0].uid,
        assignedValue: mappings[0].assignedValue,
        displayData: mappings[0].displayData
      },
      {
        roundNumber: 2,
        uid: mappings[1].uid,
        assignedValue: mappings[1].assignedValue,
        displayData: mappings[1].displayData
      }
    ],
    requiresAssociationPlanConfiguration: false,
    status: 'draft',
    difficulty: 'medium',
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-15'),
    ...overrides
  };
};

// ============================================================
// CARD DECK DTOs
// ============================================================

describe('CardDeck DTOs (post-ADR-012, sin cardId)', () => {
  describe('toCardDeckDTOV1', () => {
    it('devuelve null para input null/undefined', () => {
      expect(toCardDeckDTOV1(null)).toBeNull();
      expect(toCardDeckDTOV1(undefined)).toBeNull();
    });

    it('transforma un deck con cardMappings correctamente', () => {
      const dto = toCardDeckDTOV1(buildDeckDoc());

      expect(dto).toMatchObject({
        id: expect.any(String),
        name: 'Mazo Test',
        description: 'Descripción del mazo',
        status: 'active',
        cardsCount: 3
      });
    });

    it('no incluye campo cardId en ningún nivel', () => {
      const dto = toCardDeckDTOV1(buildDeckDoc());
      const json = JSON.stringify(dto);

      expect(json).not.toContain('"cardId"');
    });

    it('calcula cardsCount desde cardMappings.length', () => {
      const dto5 = toCardDeckDTOV1(buildDeckDoc({ cardMappings: createTestCardMappings(5) }));
      expect(dto5.cardsCount).toBe(5);

      const dtoEmpty = toCardDeckDTOV1(buildDeckDoc({ cardMappings: [] }));
      expect(dtoEmpty.cardsCount).toBe(0);
    });

    it('maneja cardMappings undefined gracefully', () => {
      const dto = toCardDeckDTOV1(buildDeckDoc({ cardMappings: undefined }));
      expect(dto.cardsCount).toBe(0);
    });

    it('resuelve context y creator poblados', () => {
      const dto = toCardDeckDTOV1(buildDeckDoc());

      expect(dto.context).toMatchObject({ name: 'Contexto A' });
      expect(dto.creator).toMatchObject({ name: 'María', email: 'maria@test.com' });
    });

    it('maneja context/creator no poblados (solo ObjectId)', () => {
      const dto = toCardDeckDTOV1(
        buildDeckDoc({
          contextId: fakeObjectId('c2'),
          createdBy: fakeObjectId('u2')
        })
      );

      expect(dto.contextId).toBe(fakeObjectId('c2'));
      expect(dto.context).toBeUndefined();
      expect(dto.createdBy).toBe(fakeObjectId('u2'));
      expect(dto.creator).toBeUndefined();
    });
  });

  describe('toCardDeckDetailDTOV1', () => {
    it('devuelve null para input null', () => {
      expect(toCardDeckDetailDTOV1(null)).toBeNull();
    });

    it('incluye cardMappings expandidos con uid', () => {
      const dto = toCardDeckDetailDTOV1(buildDeckDoc());

      expect(dto.cardMappings).toHaveLength(3);
      dto.cardMappings.forEach(mapping => {
        expect(mapping).toHaveProperty('uid');
        expect(mapping).toHaveProperty('assignedValue');
        expect(mapping).toHaveProperty('displayData');
        expect(mapping).not.toHaveProperty('cardId');
      });
    });

    it('preserva uid y assignedValue de cada mapping', () => {
      const mappings = createTestCardMappings(2, { values: ['España', 'Francia'] });
      const dto = toCardDeckDetailDTOV1(buildDeckDoc({ cardMappings: mappings }));

      expect(dto.cardMappings[0].uid).toBe(mappings[0].uid);
      expect(dto.cardMappings[0].assignedValue).toBe('España');
      expect(dto.cardMappings[1].assignedValue).toBe('Francia');
    });

    it('incluye todos los campos del DTO resumen', () => {
      const dto = toCardDeckDetailDTOV1(buildDeckDoc());

      expect(dto).toHaveProperty('id');
      expect(dto).toHaveProperty('name');
      expect(dto).toHaveProperty('cardsCount');
      expect(dto).toHaveProperty('cardMappings');
    });
  });

  describe('toCardDeckListDTOV1', () => {
    it('transforma array de decks', () => {
      const decks = [buildDeckDoc(), buildDeckDoc({ _id: fakeObjectId('d2'), name: 'Mazo 2' })];
      const list = toCardDeckListDTOV1(decks);

      expect(list).toHaveLength(2);
      expect(list[0].name).toBe('Mazo Test');
      expect(list[1].name).toBe('Mazo 2');
    });

    it('filtra valores null del resultado', () => {
      const list = toCardDeckListDTOV1([buildDeckDoc(), null, undefined]);
      expect(list).toHaveLength(1);
    });

    it('devuelve array vacío para input no-array', () => {
      expect(toCardDeckListDTOV1(null)).toEqual([]);
      expect(toCardDeckListDTOV1(undefined)).toEqual([]);
      expect(toCardDeckListDTOV1('not-array')).toEqual([]);
    });
  });
});

// ============================================================
// GAME SESSION DTOs
// ============================================================

describe('GameSession DTOs (post-ADR-012, sin cardId)', () => {
  describe('toGameSessionDTOV1', () => {
    it('devuelve null para input null/undefined', () => {
      expect(toGameSessionDTOV1(null)).toBeNull();
      expect(toGameSessionDTOV1(undefined)).toBeNull();
    });

    it('no incluye cardId en boardLayout ni associationChallengePlan', () => {
      const dto = toGameSessionDTOV1(buildSessionDoc());
      const json = JSON.stringify(dto);

      expect(json).not.toContain('"cardId"');
    });

    it('incluye boardLayout con uid en cada slot', () => {
      const dto = toGameSessionDTOV1(buildSessionDoc());

      expect(dto.boardLayout).toHaveLength(4);
      dto.boardLayout.forEach((slot, i) => {
        expect(slot).toHaveProperty('slotIndex', i);
        expect(slot).toHaveProperty('uid');
        expect(slot).toHaveProperty('assignedValue');
        expect(slot).toHaveProperty('displayData');
      });
    });

    it('incluye associationChallengePlan con uid por ronda', () => {
      const dto = toGameSessionDTOV1(buildSessionDoc());

      expect(dto.associationChallengePlan).toHaveLength(2);
      dto.associationChallengePlan.forEach(item => {
        expect(item).toHaveProperty('roundNumber');
        expect(item).toHaveProperty('uid');
        expect(item).toHaveProperty('assignedValue');
      });
    });

    it('calcula cardMappingsCount desde array length', () => {
      const dto = toGameSessionDTOV1(buildSessionDoc());
      expect(dto.cardMappingsCount).toBe(4);
    });

    it('usa config.numberOfCards como fallback si cardMappings no es array', () => {
      const dto = toGameSessionDTOV1(buildSessionDoc({ cardMappings: undefined }));
      expect(dto.cardMappingsCount).toBe(4);
    });

    it('preserva config completo', () => {
      const dto = toGameSessionDTOV1(buildSessionDoc());

      expect(dto.config).toEqual({
        numberOfCards: 4,
        numberOfRounds: 2,
        timeLimit: 60,
        pointsPerCorrect: 10,
        penaltyPerError: 5
      });
    });

    it('maneja boardLayout/associationChallengePlan vacíos', () => {
      const dto = toGameSessionDTOV1(
        buildSessionDoc({
          boardLayout: undefined,
          associationChallengePlan: undefined
        })
      );

      expect(dto.boardLayout).toEqual([]);
      expect(dto.associationChallengePlan).toEqual([]);
    });

    it('resuelve mechanic/deck/context/creator poblados', () => {
      const dto = toGameSessionDTOV1(buildSessionDoc());

      expect(dto.mechanic).toMatchObject({ displayName: 'Memoria' });
      expect(dto.deck).toMatchObject({ name: 'Mazo Test' });
      expect(dto.context).toMatchObject({ name: 'Contexto A' });
      expect(dto.creator).toMatchObject({ name: 'María' });
    });
  });

  describe('toGameSessionDetailDTOV1', () => {
    it('devuelve null para input null', () => {
      expect(toGameSessionDetailDTOV1(null)).toBeNull();
    });

    it('incluye cardMappings expandidos con uid, sin cardId', () => {
      const dto = toGameSessionDetailDTOV1(buildSessionDoc());

      expect(dto.cardMappings).toHaveLength(4);
      dto.cardMappings.forEach(mapping => {
        expect(mapping).toHaveProperty('uid');
        expect(mapping).toHaveProperty('assignedValue');
        expect(mapping).toHaveProperty('displayData');
        expect(mapping).not.toHaveProperty('cardId');
      });
    });

    it('contiene todos los campos del DTO resumen más cardMappings', () => {
      const dto = toGameSessionDetailDTOV1(buildSessionDoc());

      expect(dto).toHaveProperty('boardLayout');
      expect(dto).toHaveProperty('associationChallengePlan');
      expect(dto).toHaveProperty('cardMappings');
      expect(dto).toHaveProperty('config');
    });
  });

  describe('toGameSessionListDTOV1', () => {
    it('transforma array de sesiones', () => {
      const sessions = [buildSessionDoc(), buildSessionDoc({ _id: fakeObjectId('s2') })];
      const list = toGameSessionListDTOV1(sessions);

      expect(list).toHaveLength(2);
    });

    it('filtra null/undefined', () => {
      const list = toGameSessionListDTOV1([buildSessionDoc(), null]);
      expect(list).toHaveLength(1);
    });

    it('devuelve array vacío para input inválido', () => {
      expect(toGameSessionListDTOV1(null)).toEqual([]);
      expect(toGameSessionListDTOV1(undefined)).toEqual([]);
    });
  });
});
