/**
 * @fileoverview Regresión OBS-2: `disconnectUserSockets` no debe auto-expulsar
 * al socket que se conecta JUSTO DESPUÉS de la llamada. En el login, la sesión
 * nueva se crea (y se llama a esta función para tirar la sesión del dispositivo
 * anterior) ANTES de que el cliente reciba la respuesta y conecte su socket
 * nuevo; ese socket entra en la room `user_<id>` dentro de la ventana de gracia
 * y, con el comportamiento anterior (re-consultar la room al desconectar), se
 * auto-expulsaba (churn connect→disconnect→reconnect). Debe desconectar solo
 * los sockets que YA estaban (dispositivo anterior). (QA 2026-06-27.)
 */

const { disconnectUserSockets, DISCONNECT_GRACE_MS } = require('../src/utils/socketUtils');

describe('disconnectUserSockets — snapshot anti auto-kick (OBS-2)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('no desconecta un socket que entra en la room DESPUÉS de la llamada', async () => {
    const oldSocket = { id: 'old', disconnect: jest.fn() };
    const newSocket = { id: 'new', disconnect: jest.fn() };
    // Estado de la room: al momento de la llamada solo está el dispositivo anterior.
    const roomSockets = [oldSocket];
    const emit = jest.fn();
    // Namespace `/game`: en este test no tiene sockets del usuario (solo el
    // namespace por defecto). `disconnectUserSockets` ahora recorre ambos
    // namespaces (WS-2), así que el mock debe exponer `io.of('/game')`.
    const gameEmit = jest.fn();
    const gameNsp = {
      name: '/game',
      in: () => ({ fetchSockets: async () => [] }),
      to: () => ({ emit: gameEmit })
    };
    const io = {
      name: '/',
      in: () => ({ fetchSockets: async () => roomSockets.slice() }),
      to: () => ({
        emit,
        // Modela el comportamiento real de socket.io: `disconnectSockets()`
        // desconecta los sockets ACTUALES de la room (no un snapshot previo).
        disconnectSockets: () => roomSockets.forEach(s => s.disconnect(true))
      }),
      of: () => gameNsp
    };

    await disconnectUserSockets(io, 'u1', 'NEW_LOGIN');
    // El socket nuevo (el del login recién hecho) conecta DESPUÉS de la llamada.
    roomSockets.push(newSocket);
    jest.advanceTimersByTime(DISCONNECT_GRACE_MS + 50);
    await Promise.resolve();

    expect(oldSocket.disconnect).toHaveBeenCalledWith(true);
    expect(newSocket.disconnect).not.toHaveBeenCalled();
    // Se sigue avisando (session_invalidated) al dispositivo anterior.
    expect(emit).toHaveBeenCalled();
  });
});
