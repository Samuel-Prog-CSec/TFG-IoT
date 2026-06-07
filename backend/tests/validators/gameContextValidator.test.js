/**
 * @fileoverview Tests unitarios dirigidos para gameContextValidator.
 *
 * Cubre el booleanQuerySchema (preprocess true/false/otros + optional), el
 * assetSchema con su regex de key y URLs, los schemas de creación/actualización
 * (incluyendo el refine "al menos un campo"), y los tres schemas de params
 * (union ObjectId/contextId, ObjectId puro, y assetKey).
 */

const {
  createGameContextSchema,
  updateGameContextSchema,
  gameContextQuerySchema,
  gameContextParamsSchema,
  gameContextIdParamsSchema,
  gameContextAssetParamsSchema,
  uploadAssetMetaSchema,
  contextIdSchema,
  assetSchema
} = require('../../src/validators/gameContextValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

describe('gameContextValidator (unit)', () => {
  describe('contextIdSchema', () => {
    it('normaliza a minúsculas y hace trim', () => {
      const result = contextIdSchema.safeParse('  GEO_Graphy-1  ');
      expect(result.success).toBe(true);
      expect(result.data).toBe('geo_graphy-1');
    });

    it('rechaza menos de 2 caracteres', () => {
      expect(contextIdSchema.safeParse('a').success).toBe(false);
    });

    it('rechaza más de 50 caracteres', () => {
      expect(contextIdSchema.safeParse('a'.repeat(51)).success).toBe(false);
    });

    it('rechaza caracteres no permitidos (espacios, símbolos)', () => {
      expect(contextIdSchema.safeParse('geo grafia').success).toBe(false);
      expect(contextIdSchema.safeParse('geo!').success).toBe(false);
    });
  });

  describe('assetSchema', () => {
    const buildAsset = () => ({
      key: 'spain',
      display: 'Bandera de España',
      value: 'España'
    });

    it('acepta un asset válido con audio e imagen', () => {
      const asset = {
        ...buildAsset(),
        audioUrl: 'https://cdn.test/spain.mp3',
        imageUrl: 'https://cdn.test/spain.jpg'
      };
      expect(assetSchema.safeParse(asset).success).toBe(true);
    });

    it('normaliza key a minúsculas', () => {
      const result = assetSchema.safeParse({ ...buildAsset(), key: 'SPAIN_01' });
      expect(result.success).toBe(true);
      expect(result.data.key).toBe('spain_01');
    });

    it('rechaza key vacía', () => {
      expect(assetSchema.safeParse({ ...buildAsset(), key: '' }).success).toBe(false);
    });

    it('rechaza key con caracteres no permitidos', () => {
      expect(assetSchema.safeParse({ ...buildAsset(), key: 'spain country' }).success).toBe(false);
    });

    it('rechaza key de más de 100 caracteres', () => {
      expect(assetSchema.safeParse({ ...buildAsset(), key: 'a'.repeat(101) }).success).toBe(false);
    });

    it('rechaza audioUrl no-URL', () => {
      expect(assetSchema.safeParse({ ...buildAsset(), audioUrl: 'nourl' }).success).toBe(false);
    });

    it('rechaza imageUrl no-URL', () => {
      expect(assetSchema.safeParse({ ...buildAsset(), imageUrl: 'nourl' }).success).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(assetSchema.safeParse({ ...buildAsset(), extra: 1 }).success).toBe(false);
    });

    it('rechaza display vacío', () => {
      expect(assetSchema.safeParse({ ...buildAsset(), display: '' }).success).toBe(false);
    });
  });

  describe('uploadAssetMetaSchema', () => {
    it('acepta key + value con display opcional', () => {
      expect(uploadAssetMetaSchema.safeParse({ key: 'spain', value: 'España' }).success).toBe(true);
    });

    it('acepta display opcional cuando se incluye', () => {
      const result = uploadAssetMetaSchema.safeParse({
        key: 'spain',
        value: 'España',
        display: 'Bandera'
      });
      expect(result.success).toBe(true);
    });

    it('rechaza si falta value', () => {
      expect(uploadAssetMetaSchema.safeParse({ key: 'spain' }).success).toBe(false);
    });

    it('rechaza audioUrl extra (omitido del pick, strict)', () => {
      expect(
        uploadAssetMetaSchema.safeParse({ key: 'spain', value: 'España', audioUrl: 'https://x/y' })
          .success
      ).toBe(false);
    });
  });

  describe('createGameContextSchema', () => {
    it('acepta contextId + name válidos', () => {
      const result = createGameContextSchema.safeParse({ contextId: 'geography', name: 'Geo' });
      expect(result.success).toBe(true);
    });

    it('rechaza name de 1 carácter (min 2)', () => {
      expect(createGameContextSchema.safeParse({ contextId: 'geo', name: 'A' }).success).toBe(
        false
      );
    });

    it('rechaza assets enviados (no aceptado en creación, strict)', () => {
      const result = createGameContextSchema.safeParse({
        contextId: 'geo',
        name: 'Geo',
        assets: [{ key: 'x', display: 'X', value: 'X' }]
      });
      expect(result.success).toBe(false);
    });

    it('rechaza si falta contextId', () => {
      expect(createGameContextSchema.safeParse({ name: 'Geo' }).success).toBe(false);
    });
  });

  describe('updateGameContextSchema', () => {
    it('acepta actualización solo de name', () => {
      expect(updateGameContextSchema.safeParse({ name: 'Nuevo' }).success).toBe(true);
    });

    it('acepta actualización solo de contextId', () => {
      expect(updateGameContextSchema.safeParse({ contextId: 'newid' }).success).toBe(true);
    });

    it('rechaza objeto vacío (refine: al menos un campo)', () => {
      const result = updateGameContextSchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /al menos un campo/.test(i.message))).toBe(true);
    });

    it('rechaza assets (no actualizable por esta vía, strict)', () => {
      expect(updateGameContextSchema.safeParse({ name: 'X', assets: [] }).success).toBe(false);
    });
  });

  describe('gameContextQuerySchema (booleanQuerySchema)', () => {
    it('aplica default sortBy=createdAt y deja isActive undefined', () => {
      const result = gameContextQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.isActive).toBeUndefined();
    });

    it('coacciona isActive="true" → true', () => {
      const result = gameContextQuerySchema.safeParse({ isActive: 'true' });
      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(true);
    });

    it('coacciona isActive="false" → false', () => {
      const result = gameContextQuerySchema.safeParse({ isActive: 'false' });
      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(false);
    });

    it('coacciona con espacios y mayúsculas ("  TRUE ")', () => {
      const result = gameContextQuerySchema.safeParse({ isActive: '  TRUE ' });
      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(true);
    });

    it('rechaza isActive con string no booleano (preprocess deja string → boolean falla)', () => {
      const result = gameContextQuerySchema.safeParse({ isActive: 'maybe' });
      expect(result.success).toBe(false);
    });

    it('acepta isActive booleano nativo (rama no-string del preprocess)', () => {
      // Cubre la rama `typeof val === 'string'` falsa: el preprocess devuelve el
      // valor tal cual y el `z.boolean()` interno lo acepta directamente.
      const result = gameContextQuerySchema.safeParse({ isActive: true });
      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(true);
    });

    it('rechaza isActive numérico (rama no-string → boolean falla)', () => {
      const result = gameContextQuerySchema.safeParse({ isActive: 1 });
      expect(result.success).toBe(false);
    });

    it('acepta sortBy=name', () => {
      expect(gameContextQuerySchema.safeParse({ sortBy: 'name' }).success).toBe(true);
    });

    it('rechaza sortBy desconocido', () => {
      expect(gameContextQuerySchema.safeParse({ sortBy: 'foo' }).success).toBe(false);
    });
  });

  describe('params schemas', () => {
    it('gameContextParamsSchema acepta ObjectId', () => {
      expect(gameContextParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
    });

    it('gameContextParamsSchema acepta contextId slug (union)', () => {
      expect(gameContextParamsSchema.safeParse({ id: 'geography' }).success).toBe(true);
    });

    it('gameContextParamsSchema rechaza valor con espacios', () => {
      expect(gameContextParamsSchema.safeParse({ id: 'Invalid Id' }).success).toBe(false);
    });

    it('gameContextIdParamsSchema solo acepta ObjectId (no slug)', () => {
      expect(gameContextIdParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(gameContextIdParamsSchema.safeParse({ id: 'geography' }).success).toBe(false);
    });

    it('gameContextAssetParamsSchema acepta ObjectId + assetKey', () => {
      const result = gameContextAssetParamsSchema.safeParse({
        id: VALID_OBJECT_ID,
        assetKey: 'spain'
      });
      expect(result.success).toBe(true);
    });

    it('gameContextAssetParamsSchema normaliza assetKey a minúsculas', () => {
      const result = gameContextAssetParamsSchema.safeParse({
        id: VALID_OBJECT_ID,
        assetKey: 'SPAIN'
      });
      expect(result.success).toBe(true);
      expect(result.data.assetKey).toBe('spain');
    });

    it('gameContextAssetParamsSchema rechaza assetKey con caracteres inválidos', () => {
      expect(
        gameContextAssetParamsSchema.safeParse({ id: VALID_OBJECT_ID, assetKey: 'a b' }).success
      ).toBe(false);
    });
  });
});
