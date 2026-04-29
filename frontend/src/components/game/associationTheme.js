/**
 * @fileoverview Heuristica compartida para resolver el tema visual de la
 * mecanica de asociacion a partir del valor del desafio.
 *
 * Extraido de AssociationGameplayPanel.jsx para cumplir la regla
 * react-refresh/only-export-components (los modulos de componentes solo
 * deben exportar componentes, no helpers).
 */

/**
 * Resuelve un tema visual basado en el valor del desafio.
 * Utilizado para contextualizar colores/iconos del ChallengeDisplay y del
 * backdrop, manteniendo la coherencia visual durante toda la partida.
 *
 * @param {string} challengeValue - Valor o clave del desafio actual.
 * @returns {'animals' | 'colors' | 'numbers' | 'geography' | 'default'}
 */
export function resolveAssociationTheme(challengeValue) {
  const challengeKey = (challengeValue || '').toLowerCase();

  if (challengeKey.includes('animal')) {
    return 'animals';
  }

  if (challengeKey.includes('color')) {
    return 'colors';
  }

  if (challengeKey.includes('número') || challengeKey.includes('numero')) {
    return 'numbers';
  }

  if (
    challengeKey.includes('pais') ||
    challengeKey.includes('país') ||
    challengeKey.includes('geograf') ||
    challengeKey.includes('europa')
  ) {
    return 'geography';
  }

  return 'default';
}
