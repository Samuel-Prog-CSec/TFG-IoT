/**
 * @fileoverview Tests unitarios para sessionValidationHelpers.
 * Verifica los lookups uid-based tras la eliminación de cardId (ADR-012).
 */

const {
  validateConfigAgainstMechanicRules,
  ensureMemoryBoardLayoutIsComplete,
  normalizeBoardLayout,
  buildBoardLayoutFromMappings,
  validateBoardLayoutAgainstMappings,
  normalizeAssociationChallengePlan,
  buildAssociationFallbackPlan,
  validateAssociationChallengePlanAgainstMappings,
  repairAssociationChallengePlanAgainstMappings
} = require('../src/controllers/helpers/sessionValidationHelpers');
const { createTestCardMappings } = require('./helpers/testFixtures');

// --- Helpers ---

const buildMechanic = (name, limits = {}, behavior = {}) => ({
  name,
  rules: { limits, behavior }
});

// ============================================================
// validateConfigAgainstMechanicRules
// ============================================================

describe('validateConfigAgainstMechanicRules', () => {
  const mechanic = buildMechanic('memory', {
    minCards: 4,
    maxCards: 20,
    minTimeLimit: 30,
    maxTimeLimit: 300,
    minRounds: 1,
    maxRounds: 10
  });

  it('no lanza si config está dentro de límites', () => {
    expect(() =>
      validateConfigAgainstMechanicRules({
        mechanic,
        config: { numberOfCards: 8, timeLimit: 60, numberOfRounds: 3 }
      })
    ).not.toThrow();
  });

  it('lanza si numberOfCards está bajo el mínimo', () => {
    expect(() =>
      validateConfigAgainstMechanicRules({
        mechanic,
        config: { numberOfCards: 2 }
      })
    ).toThrow(/numberOfCards.*>=/);
  });

  it('lanza si numberOfCards excede el máximo', () => {
    expect(() =>
      validateConfigAgainstMechanicRules({
        mechanic,
        config: { numberOfCards: 25 }
      })
    ).toThrow(/numberOfCards.*<=/);
  });

  it('lanza si timeLimit no es numérico', () => {
    expect(() =>
      validateConfigAgainstMechanicRules({
        mechanic,
        config: { timeLimit: 'abc' }
      })
    ).toThrow(/numérico/);
  });

  it('ignora campos no presentes en config', () => {
    expect(() =>
      validateConfigAgainstMechanicRules({
        mechanic,
        config: { numberOfCards: 8 }
      })
    ).not.toThrow();
  });

  it('no lanza si config está vacío', () => {
    expect(() => validateConfigAgainstMechanicRules({ mechanic, config: {} })).not.toThrow();
  });

  it('no lanza si limits no están definidos', () => {
    expect(() =>
      validateConfigAgainstMechanicRules({
        mechanic: buildMechanic('memory'),
        config: { numberOfCards: 100 }
      })
    ).not.toThrow();
  });
});

// ============================================================
// normalizeBoardLayout
// ============================================================

describe('normalizeBoardLayout', () => {
  it('normaliza array de items conservando uid', () => {
    const layout = [
      { slotIndex: 0, uid: 'AA000001', assignedValue: 'A', displayData: { x: 1 }, extra: true },
      { slotIndex: 1, uid: 'AA000002', assignedValue: 'B' }
    ];
    const result = normalizeBoardLayout(layout);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      slotIndex: 0,
      uid: 'AA000001',
      assignedValue: 'A',
      displayData: { x: 1 }
    });
    expect(result[1].displayData).toEqual({});
  });

  it('devuelve array vacío para input no-array', () => {
    expect(normalizeBoardLayout(null)).toEqual([]);
    expect(normalizeBoardLayout(undefined)).toEqual([]);
    expect(normalizeBoardLayout('string')).toEqual([]);
  });
});

// ============================================================
// buildBoardLayoutFromMappings
// ============================================================

describe('buildBoardLayoutFromMappings', () => {
  it('genera layout con slotIndex secuencial y uid de cada mapping', () => {
    const mappings = createTestCardMappings(3);
    const layout = buildBoardLayoutFromMappings(mappings);

    expect(layout).toHaveLength(3);
    layout.forEach((slot, i) => {
      expect(slot.slotIndex).toBe(i);
      expect(slot.uid).toBe(mappings[i].uid);
      expect(slot.assignedValue).toBe(mappings[i].assignedValue);
    });
  });

  it('devuelve array vacío para input no-array', () => {
    expect(buildBoardLayoutFromMappings(null)).toEqual([]);
    expect(buildBoardLayoutFromMappings(undefined)).toEqual([]);
  });

  it('no incluye campo cardId en el layout generado', () => {
    const layout = buildBoardLayoutFromMappings(createTestCardMappings(2));
    const json = JSON.stringify(layout);

    expect(json).not.toContain('"cardId"');
  });
});

// ============================================================
// validateBoardLayoutAgainstMappings (uid-based lookups)
// ============================================================

describe('validateBoardLayoutAgainstMappings', () => {
  const mappings = createTestCardMappings(3, { values: ['A', 'B', 'C'] });

  it('no lanza si todos los UIDs del layout están en los mappings', () => {
    const layout = mappings.map((m, i) => ({
      slotIndex: i,
      uid: m.uid,
      assignedValue: m.assignedValue
    }));

    expect(() => validateBoardLayoutAgainstMappings(layout, mappings)).not.toThrow();
  });

  it('lanza si un UID del layout no existe en los mappings', () => {
    const layout = [{ slotIndex: 0, uid: 'DEADBEEF', assignedValue: 'X' }];

    expect(() => validateBoardLayoutAgainstMappings(layout, mappings)).toThrow(
      /no pertenece al mazo/
    );
  });

  it('lanza si assignedValue no coincide con el mapping', () => {
    const layout = [{ slotIndex: 0, uid: mappings[0].uid, assignedValue: 'WRONG_VALUE' }];

    expect(() => validateBoardLayoutAgainstMappings(layout, mappings)).toThrow(
      /assignedValue inconsistente/
    );
  });

  it('no lanza si boardLayout está vacío', () => {
    expect(() => validateBoardLayoutAgainstMappings([], mappings)).not.toThrow();
    expect(() => validateBoardLayoutAgainstMappings(null, mappings)).not.toThrow();
  });
});

// ============================================================
// ensureMemoryBoardLayoutIsComplete
// ============================================================

describe('ensureMemoryBoardLayoutIsComplete', () => {
  const memoryMechanic = buildMechanic('memory', {}, { matchingGroupSize: 2 });

  it('no lanza para mecánica distinta de memory', () => {
    expect(() =>
      ensureMemoryBoardLayoutIsComplete({
        mechanic: buildMechanic('association'),
        boardLayout: [],
        cardMappings: []
      })
    ).not.toThrow();
  });

  it('lanza si boardLayout está vacío para memory', () => {
    expect(() =>
      ensureMemoryBoardLayoutIsComplete({
        mechanic: memoryMechanic,
        boardLayout: [],
        cardMappings: createTestCardMappings(4)
      })
    ).toThrow(/obligatorio para sesiones de memoria/);
  });

  it('lanza si boardLayout.length !== cardMappings.length', () => {
    const mappings = createTestCardMappings(4, { values: ['A', 'A', 'B', 'B'] });
    const layout = buildBoardLayoutFromMappings(mappings.slice(0, 2));

    expect(() =>
      ensureMemoryBoardLayoutIsComplete({
        mechanic: memoryMechanic,
        boardLayout: layout,
        cardMappings: mappings
      })
    ).toThrow(/exactamente/);
  });

  it('lanza si un valor no aparece exactamente groupSize veces', () => {
    const mappings = [
      { uid: 'AA000001', assignedValue: 'A', displayData: {} },
      { uid: 'AA000002', assignedValue: 'A', displayData: {} },
      { uid: 'AA000003', assignedValue: 'A', displayData: {} },
      { uid: 'AA000004', assignedValue: 'B', displayData: {} }
    ];
    const layout = buildBoardLayoutFromMappings(mappings);

    expect(() =>
      ensureMemoryBoardLayoutIsComplete({
        mechanic: memoryMechanic,
        boardLayout: layout,
        cardMappings: mappings
      })
    ).toThrow(/debe aparecer 2 veces/);
  });

  it('acepta layout correcto con pares', () => {
    const mappings = [
      { uid: 'AA000001', assignedValue: 'A', displayData: {} },
      { uid: 'AA000002', assignedValue: 'A', displayData: {} },
      { uid: 'AA000003', assignedValue: 'B', displayData: {} },
      { uid: 'AA000004', assignedValue: 'B', displayData: {} }
    ];
    const layout = buildBoardLayoutFromMappings(mappings);

    expect(() =>
      ensureMemoryBoardLayoutIsComplete({
        mechanic: memoryMechanic,
        boardLayout: layout,
        cardMappings: mappings
      })
    ).not.toThrow();
  });
});

// ============================================================
// normalizeAssociationChallengePlan
// ============================================================

describe('normalizeAssociationChallengePlan', () => {
  it('ordena por roundNumber y usa uid', () => {
    const plan = [
      { roundNumber: 3, uid: 'AA000003', assignedValue: 'C' },
      { roundNumber: 1, uid: 'AA000001', assignedValue: 'A' },
      { roundNumber: 2, uid: 'AA000002', assignedValue: 'B' }
    ];
    const result = normalizeAssociationChallengePlan(plan);

    expect(result.map(r => r.roundNumber)).toEqual([1, 2, 3]);
    expect(result[0].uid).toBe('AA000001');
  });

  it('filtra rondas con roundNumber inválido', () => {
    const plan = [
      { roundNumber: 1, uid: 'AA000001', assignedValue: 'A' },
      { roundNumber: 0, uid: 'AA000002', assignedValue: 'B' },
      { roundNumber: -1, uid: 'AA000003', assignedValue: 'C' },
      { roundNumber: NaN, uid: 'AA000004', assignedValue: 'D' }
    ];
    const result = normalizeAssociationChallengePlan(plan);

    expect(result).toHaveLength(1);
    expect(result[0].roundNumber).toBe(1);
  });

  it('coerce roundNumber string a número', () => {
    const plan = [{ roundNumber: '2', uid: 'AA000001', assignedValue: 'A' }];
    const result = normalizeAssociationChallengePlan(plan);

    expect(result[0].roundNumber).toBe(2);
  });

  it('devuelve array vacío para input no-array', () => {
    expect(normalizeAssociationChallengePlan(null)).toEqual([]);
    expect(normalizeAssociationChallengePlan(undefined)).toEqual([]);
  });
});

// ============================================================
// buildAssociationFallbackPlan
// ============================================================

describe('buildAssociationFallbackPlan', () => {
  it('genera plan cíclico usando uid de mappings', () => {
    const mappings = createTestCardMappings(2, { values: ['España', 'Francia'] });
    const plan = buildAssociationFallbackPlan({ cardMappings: mappings, numberOfRounds: 4 });

    expect(plan).toHaveLength(4);
    expect(plan[0].uid).toBe(mappings[0].uid);
    expect(plan[1].uid).toBe(mappings[1].uid);
    expect(plan[2].uid).toBe(mappings[0].uid);
    expect(plan[3].uid).toBe(mappings[1].uid);
    expect(plan.map(p => p.roundNumber)).toEqual([1, 2, 3, 4]);
  });

  it('devuelve array vacío si no hay mappings', () => {
    expect(buildAssociationFallbackPlan({ cardMappings: [], numberOfRounds: 3 })).toEqual([]);
  });

  it('devuelve array vacío si numberOfRounds es inválido', () => {
    const mappings = createTestCardMappings(2);
    expect(buildAssociationFallbackPlan({ cardMappings: mappings, numberOfRounds: 0 })).toEqual([]);
    expect(buildAssociationFallbackPlan({ cardMappings: mappings, numberOfRounds: -1 })).toEqual(
      []
    );
    expect(buildAssociationFallbackPlan({ cardMappings: mappings, numberOfRounds: NaN })).toEqual(
      []
    );
  });

  it('no incluye cardId en el plan generado', () => {
    const plan = buildAssociationFallbackPlan({
      cardMappings: createTestCardMappings(2),
      numberOfRounds: 2
    });
    const json = JSON.stringify(plan);

    expect(json).not.toContain('"cardId"');
  });
});

// ============================================================
// validateAssociationChallengePlanAgainstMappings (uid lookups)
// ============================================================

describe('validateAssociationChallengePlanAgainstMappings', () => {
  const mappings = createTestCardMappings(3, { values: ['A', 'B', 'C'] });

  it('valida plan correcto sin lanzar', () => {
    const plan = [
      { roundNumber: 1, uid: mappings[0].uid, assignedValue: 'A' },
      { roundNumber: 2, uid: mappings[1].uid, assignedValue: 'B' },
      { roundNumber: 3, uid: mappings[2].uid, assignedValue: 'C' }
    ];

    expect(() =>
      validateAssociationChallengePlanAgainstMappings({
        associationChallengePlan: plan,
        cardMappings: mappings,
        numberOfRounds: 3
      })
    ).not.toThrow();
  });

  it('lanza si un UID no existe en los mappings', () => {
    const plan = [{ roundNumber: 1, uid: 'DEADBEEF', assignedValue: 'X' }];

    expect(() =>
      validateAssociationChallengePlanAgainstMappings({
        associationChallengePlan: plan,
        cardMappings: mappings,
        numberOfRounds: 1
      })
    ).toThrow(/no disponible en el mazo/);
  });

  it('lanza si assignedValue no coincide con el mapping', () => {
    const plan = [{ roundNumber: 1, uid: mappings[0].uid, assignedValue: 'WRONG' }];

    expect(() =>
      validateAssociationChallengePlanAgainstMappings({
        associationChallengePlan: plan,
        cardMappings: mappings,
        numberOfRounds: 1
      })
    ).toThrow(/assignedValue inconsistente/);
  });

  it('lanza si numberOfRounds no coincide con plan.length', () => {
    const plan = [{ roundNumber: 1, uid: mappings[0].uid, assignedValue: 'A' }];

    expect(() =>
      validateAssociationChallengePlanAgainstMappings({
        associationChallengePlan: plan,
        cardMappings: mappings,
        numberOfRounds: 3
      })
    ).toThrow(/exactamente 3 retos/);
  });

  it('lanza si plan está vacío', () => {
    expect(() =>
      validateAssociationChallengePlanAgainstMappings({
        associationChallengePlan: [],
        cardMappings: mappings,
        numberOfRounds: 2
      })
    ).toThrow(/obligatorio/);
  });

  it('lanza si cardMappings está vacío', () => {
    expect(() =>
      validateAssociationChallengePlanAgainstMappings({
        associationChallengePlan: [{ roundNumber: 1, uid: 'AA000001', assignedValue: 'A' }],
        cardMappings: [],
        numberOfRounds: 1
      })
    ).toThrow(/No hay tarjetas disponibles/);
  });

  it('lanza si rondas no son consecutivas', () => {
    const plan = [
      { roundNumber: 1, uid: mappings[0].uid, assignedValue: 'A' },
      { roundNumber: 3, uid: mappings[1].uid, assignedValue: 'B' }
    ];

    expect(() =>
      validateAssociationChallengePlanAgainstMappings({
        associationChallengePlan: plan,
        cardMappings: mappings,
        numberOfRounds: 2
      })
    ).toThrow(/rondas consecutivas/);
  });
});

// ============================================================
// repairAssociationChallengePlanAgainstMappings
// ============================================================

describe('repairAssociationChallengePlanAgainstMappings', () => {
  const mappings = createTestCardMappings(3, { values: ['A', 'B', 'C'] });

  it('repara plan donde UIDs coinciden', () => {
    const plan = [
      { roundNumber: 1, uid: mappings[0].uid, assignedValue: 'A' },
      { roundNumber: 2, uid: mappings[1].uid, assignedValue: 'B' }
    ];

    const result = repairAssociationChallengePlanAgainstMappings({
      associationChallengePlan: plan,
      cardMappings: mappings,
      numberOfRounds: 2
    });

    expect(result.repairedPlan).toHaveLength(2);
    expect(result.unresolvedRounds).toEqual([]);
  });

  it('resuelve por assignedValue si UID no existe', () => {
    const plan = [
      { roundNumber: 1, uid: 'DEADBEEF', assignedValue: 'A' },
      { roundNumber: 2, uid: mappings[1].uid, assignedValue: 'B' }
    ];

    const result = repairAssociationChallengePlanAgainstMappings({
      associationChallengePlan: plan,
      cardMappings: mappings,
      numberOfRounds: 2
    });

    expect(result.repairedPlan).toHaveLength(2);
    expect(result.repairedPlan[0].uid).toBe(mappings[0].uid);
    expect(result.unresolvedRounds).toEqual([]);
    expect(result.changed).toBe(true);
  });

  it('marca rondas no resolubles', () => {
    const plan = [{ roundNumber: 1, uid: 'DEADBEEF', assignedValue: 'NOT_EXISTS' }];

    const result = repairAssociationChallengePlanAgainstMappings({
      associationChallengePlan: plan,
      cardMappings: mappings,
      numberOfRounds: 1
    });

    expect(result.repairedPlan).toHaveLength(0);
    expect(result.unresolvedRounds).toEqual([1]);
  });

  it('preserva displayData del plan original si tiene contenido', () => {
    const customDisplayData = { thumbnailUrl: 'https://example.com/img.jpg' };
    const plan = [
      { roundNumber: 1, uid: mappings[0].uid, assignedValue: 'A', displayData: customDisplayData }
    ];

    const result = repairAssociationChallengePlanAgainstMappings({
      associationChallengePlan: plan,
      cardMappings: mappings,
      numberOfRounds: 1
    });

    expect(result.repairedPlan[0].displayData).toEqual(customDisplayData);
  });

  it('usa displayData del mapping si el original está vacío', () => {
    const plan = [{ roundNumber: 1, uid: mappings[0].uid, assignedValue: 'A', displayData: {} }];

    const result = repairAssociationChallengePlanAgainstMappings({
      associationChallengePlan: plan,
      cardMappings: mappings,
      numberOfRounds: 1
    });

    expect(result.repairedPlan[0].displayData).toEqual(mappings[0].displayData);
  });

  it('changed es false si el plan no necesitó reparación', () => {
    const plan = [
      {
        roundNumber: 1,
        uid: mappings[0].uid,
        assignedValue: 'A',
        displayData: mappings[0].displayData
      }
    ];

    const result = repairAssociationChallengePlanAgainstMappings({
      associationChallengePlan: plan,
      cardMappings: mappings,
      numberOfRounds: 1
    });

    expect(result.changed).toBe(false);
  });
});
