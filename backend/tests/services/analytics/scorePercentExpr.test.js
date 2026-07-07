/**
 * @fileoverview Regresión OBS-5: `SCORE_PERCENT_EXPR` debe acotar el porcentaje
 * a ≥0. Una partida cuyo `score` crudo quedó negativo (penalizaciones acumuladas
 * vía `$inc` durante la partida, que saltan el clamp `min:0` del modelo) no debe
 * arrastrar las medias de analytics por debajo de 0. (Detectado en QA 2026-06-27.)
 */

const GamePlay = require('../../../src/models/GamePlay');
const { SCORE_PERCENT_EXPR } = require('../../../src/services/analytics/analyticsHelpers');

describe('SCORE_PERCENT_EXPR — suelo a 0 (OBS-5)', () => {
  beforeEach(async () => {
    await GamePlay.deleteMany({});
  });

  // Inserta saltando el schema (los $inc en runtime también saltan el clamp) y
  // proyecta el porcentaje normalizado de cada documento.
  const projectPercent = async doc => {
    await GamePlay.collection.insertOne(doc);
    const [out] = await GamePlay.aggregate([{ $project: { pct: SCORE_PERCENT_EXPR } }]);
    return out.pct;
  };

  it('no produce porcentaje negativo para un score crudo negativo', async () => {
    const pct = await projectPercent({ score: -8, maxScore: 60, status: 'completed' });
    expect(pct).toBe(0);
  });

  it('calcula el porcentaje normal para un score válido', async () => {
    const pct = await projectPercent({ score: 30, maxScore: 60, status: 'completed' });
    expect(pct).toBe(50);
  });

  it('devuelve 0 cuando maxScore es 0 (sin división por cero)', async () => {
    const pct = await projectPercent({ score: 10, maxScore: 0, status: 'completed' });
    expect(pct).toBe(0);
  });
});
