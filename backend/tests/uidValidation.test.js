/**
 * @fileoverview Tests unitarios para la validación de UIDs RFID y schemas
 * de cardMappings tras ADR-012 (tarjetas fungibles, sin cardId).
 */

const {
  uidSchema,
  cardDeckMappingSchema,
  createCardDeckSchema,
  updateCardDeckSchema
} = require('../src/validators/cardDeckValidator');

// ============================================================
// uidSchema
// ============================================================

describe('uidSchema — validación de UID RFID', () => {
  describe('UIDs válidos (8 hex)', () => {
    it.each([
      ['AA000001', 'hex estándar'],
      ['32B8FA05', 'hex mixto'],
      ['FFFFFFFF', 'todos F'],
      ['00000000', 'todos 0'],
      ['ABCDEF12', 'A-F + dígitos']
    ])('acepta %s (%s)', uid => {
      expect(uidSchema.parse(uid)).toBe(uid);
    });
  });

  describe('UIDs válidos (14 hex)', () => {
    it.each([
      ['AA00000000BB01', '14 caracteres hex'],
      ['04A23BC5F12680', 'UID NFC largo típico'],
      ['00000000000000', 'todos 0 (14)'],
      ['FFFFFFFFFFFFFF', 'todos F (14)']
    ])('acepta %s (%s)', uid => {
      expect(uidSchema.parse(uid)).toBe(uid);
    });
  });

  describe('auto-uppercase', () => {
    it('convierte minúsculas a mayúsculas', () => {
      expect(uidSchema.parse('aa000001')).toBe('AA000001');
      expect(uidSchema.parse('abcdef12')).toBe('ABCDEF12');
    });

    it('convierte mixto a mayúsculas', () => {
      expect(uidSchema.parse('aA00bb01')).toBe('AA00BB01');
    });
  });

  describe('trim', () => {
    it('elimina espacios alrededor', () => {
      expect(uidSchema.parse('  AA000001  ')).toBe('AA000001');
    });
  });

  describe('UIDs inválidos', () => {
    it.each([
      ['AA00001', 'demasiado corto (7)'],
      ['AA0000012', 'longitud incorrecta (9)'],
      ['AA000000000000A', 'demasiado largo (15)'],
      ['AA0000000000A', 'longitud 13 (entre 8 y 14)'],
      ['GHIJKLMN', 'letras no-hex (8)'],
      ['ZZZZZZZZ', 'letras inválidas'],
      ['AA0000G1', 'una letra no-hex'],
      ['', 'vacío'],
      ['  ', 'solo espacios']
    ])('rechaza %s (%s)', uid => {
      expect(() => uidSchema.parse(uid)).toThrow();
    });
  });
});

// ============================================================
// cardDeckMappingSchema
// ============================================================

describe('cardDeckMappingSchema — mapping sin cardId', () => {
  const validMapping = {
    uid: 'AA000001',
    assignedValue: 'España',
    displayData: { display: '🇪🇸' }
  };

  it('acepta mapping válido con los 3 campos', () => {
    const result = cardDeckMappingSchema.parse(validMapping);

    expect(result).toEqual(validMapping);
    expect(result).not.toHaveProperty('cardId');
  });

  it('acepta displayData vacío (default {})', () => {
    const result = cardDeckMappingSchema.parse({
      uid: 'AA000001',
      assignedValue: 'España'
    });

    expect(result.displayData).toEqual({});
  });

  it('acepta displayData con campos anidados', () => {
    const mapping = {
      uid: 'AA000001',
      assignedValue: 'España',
      displayData: {
        display: '🇪🇸',
        thumbnailUrl: 'https://example.com/img.jpg',
        audioUrl: 'https://example.com/audio.mp3',
        nested: { key: 'value' }
      }
    };
    const result = cardDeckMappingSchema.parse(mapping);

    expect(result.displayData.nested).toEqual({ key: 'value' });
  });

  it('rechaza si falta uid', () => {
    expect(() =>
      cardDeckMappingSchema.parse({ assignedValue: 'España', displayData: {} })
    ).toThrow();
  });

  it('rechaza si falta assignedValue', () => {
    expect(() => cardDeckMappingSchema.parse({ uid: 'AA000001', displayData: {} })).toThrow();
  });

  it('rechaza assignedValue vacío', () => {
    expect(() => cardDeckMappingSchema.parse({ uid: 'AA000001', assignedValue: '' })).toThrow();
  });

  it('rechaza assignedValue > 200 caracteres', () => {
    expect(() =>
      cardDeckMappingSchema.parse({ uid: 'AA000001', assignedValue: 'x'.repeat(201) })
    ).toThrow();
  });

  it('rechaza campos extra (strict mode)', () => {
    expect(() =>
      cardDeckMappingSchema.parse({ ...validMapping, cardId: '64f000000000000000000001' })
    ).toThrow();
  });

  it('trim en assignedValue', () => {
    const result = cardDeckMappingSchema.parse({
      uid: 'AA000001',
      assignedValue: '  España  '
    });
    expect(result.assignedValue).toBe('España');
  });
});

// ============================================================
// createCardDeckSchema — refinements de unicidad
// ============================================================

describe('createCardDeckSchema — unicidad de UIDs y assignedValues', () => {
  const contextId = '64f000000000000000000001';

  const buildPayload = mappings => ({
    name: 'Mazo Test',
    contextId,
    cardMappings: mappings
  });

  it('acepta mappings con UIDs y valores únicos', () => {
    const result = createCardDeckSchema.parse(
      buildPayload([
        { uid: 'AA000001', assignedValue: 'España' },
        { uid: 'AA000002', assignedValue: 'Francia' }
      ])
    );

    expect(result.cardMappings).toHaveLength(2);
  });

  it('rechaza UIDs duplicados', () => {
    expect(() =>
      createCardDeckSchema.parse(
        buildPayload([
          { uid: 'AA000001', assignedValue: 'España' },
          { uid: 'AA000001', assignedValue: 'Francia' }
        ])
      )
    ).toThrow(/UIDs.*únicos/i);
  });

  it('permite assignedValues duplicados (mazos de memoria necesitan parejas)', () => {
    expect(() =>
      createCardDeckSchema.parse(
        buildPayload([
          { uid: 'AA000001', assignedValue: 'España' },
          { uid: 'AA000002', assignedValue: 'España' }
        ])
      )
    ).not.toThrow();
  });

  it('rechaza menos de 2 mappings', () => {
    expect(() =>
      createCardDeckSchema.parse(buildPayload([{ uid: 'AA000001', assignedValue: 'España' }]))
    ).toThrow();
  });

  it('rechaza más de 20 mappings', () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({
      uid: `AA00${(i + 1).toString(16).toUpperCase().padStart(4, '0')}`,
      assignedValue: `Valor${i + 1}`
    }));

    expect(() => createCardDeckSchema.parse(buildPayload(tooMany))).toThrow();
  });

  it('acepta mezcla de UIDs 8-char y 14-char en mismo mazo', () => {
    const result = createCardDeckSchema.parse(
      buildPayload([
        { uid: 'AA000001', assignedValue: 'España' },
        { uid: '04A23BC5F12680', assignedValue: 'Francia' }
      ])
    );

    expect(result.cardMappings[0].uid).toBe('AA000001');
    expect(result.cardMappings[1].uid).toBe('04A23BC5F12680');
  });

  it('no acepta campo cardId en mappings (strict)', () => {
    expect(() =>
      createCardDeckSchema.parse(
        buildPayload([
          { uid: 'AA000001', assignedValue: 'España', cardId: '64f000000000000000000001' },
          { uid: 'AA000002', assignedValue: 'Francia' }
        ])
      )
    ).toThrow();
  });
});

// ============================================================
// updateCardDeckSchema — validaciones parciales
// ============================================================

describe('updateCardDeckSchema — update parcial sin cardId', () => {
  it('acepta update solo de nombre', () => {
    const result = updateCardDeckSchema.parse({ name: 'Nuevo nombre' });
    expect(result.name).toBe('Nuevo nombre');
  });

  it('rechaza body vacío', () => {
    expect(() => updateCardDeckSchema.parse({})).toThrow(/al menos un campo/i);
  });

  it('valida unicidad de UIDs si cardMappings está presente', () => {
    expect(() =>
      updateCardDeckSchema.parse({
        cardMappings: [
          { uid: 'AA000001', assignedValue: 'A' },
          { uid: 'AA000001', assignedValue: 'B' }
        ]
      })
    ).toThrow(/UIDs.*únicos/i);
  });

  it('no valida unicidad de UIDs si cardMappings no está presente', () => {
    const result = updateCardDeckSchema.parse({ status: 'archived' });
    expect(result.status).toBe('archived');
  });
});
