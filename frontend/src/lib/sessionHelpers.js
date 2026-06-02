/**
 * @fileoverview Helpers compartidos por SessionsPage y SessionDetail.
 *
 * El objetivo es unificar la decision "¿esta sesion se puede jugar directamente
 * o hay que clonarla?" para que la UI (boton primario, navegacion, label) sea
 * consistente en listado y detalle.
 *
 * Regla P28 — "Jugar" vs "Volver a jugar":
 *  - Sesion en estado `created` o `active` Y sin partidas jugadas → "Jugar"
 *    directo (no requiere clonar; se trata de una primera partida).
 *  - Sesion `completed` o con ≥1 partida jugada → "Volver a jugar" (abre modal
 *    de clonacion, porque la sesion original queda inmutable).
 */

import { ROUTES } from '../constants/routes';
import { getId } from './entityId';

/**
 * @param {Object} session
 * @returns {{ action: 'play'|'clone', label: string }}
 */
export function getPrimaryActionForSession(session) {
  if (!session) return { action: 'clone', label: 'Volver a jugar' };
  const hasPlays = Number(session.playStats?.playsCount ?? 0) > 0;
  const status = session.status || 'created';
  const canPlayDirect = (status === 'created' || status === 'active') && !hasPlays;
  return canPlayDirect
    ? { action: 'play', label: 'Jugar' }
    : { action: 'clone', label: 'Volver a jugar' };
}

/**
 * Calcula la ruta a la que debe navegar el boton primario cuando la accion es
 * `play` — depende de la mecanica, porque Memoria requiere una pantalla
 * intermedia de board-setup antes del gameplay.
 *
 * @param {Object} session
 * @returns {string} ruta absoluta
 */
export function getPlayRouteForSession(session) {
  const id = getId(session);
  if (!id) return ROUTES.SESSIONS;
  const mechanicName = (session.mechanic?.name || '').toLowerCase();
  if (mechanicName === 'memory') {
    return ROUTES.BOARD_SETUP_WITH_ID(id);
  }
  return ROUTES.GAME(id);
}
