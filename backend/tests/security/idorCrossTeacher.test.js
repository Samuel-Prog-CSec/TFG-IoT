/**
 * @fileoverview Tests adversariales IDOR cross-teacher (T-905 B9).
 *
 * NOTA: este suite está temporalmente skipped porque crear recursos vía API
 * requiere validación de esquema completa (CardDeck necesita contextId,
 * cardMappings con UIDs válidos, etc.) que aumenta la fragilidad del test.
 * El comportamiento real está cubierto por:
 *   - `tests/cardDeck.test.js` (helpers de ownership)
 *   - `tests/repositoryWriteOps.test.js`
 *   - `tests/superAdminApproval.test.js`
 *
 * Pendiente Sprint 7 (B12 doc): refactorizar con factories de fixtures.
 */

// eslint-disable-next-line sonarjs/no-skipped-tests -- documentado al inicio del archivo: pendiente refactor con factories de fixtures (Sprint 7)
describe.skip('IDOR cross-teacher (B9) [pendiente refactor con factories]', () => {
  it('teacher B NO puede leer/borrar mazo de teacher A', () => {
    // pendiente
  });
});
