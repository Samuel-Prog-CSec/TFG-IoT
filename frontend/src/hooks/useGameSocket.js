/**
 * @fileoverview Hook para gestionar la conexión Socket.IO del juego,
 * incluyendo inicialización de la partida, listeners de eventos,
 * reconexión y estado del dispositivo RFID.
 *
 * @module hooks/useGameSocket
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { socketService, SOCKET_EVENTS, GAME_EVENTS } from '../services/socket';
import webSerialService from '../services/webSerialService';
import {
  sessionsAPI,
  usersAPI,
  playsAPI,
  extractData,
  extractErrorMessage,
  isAbortError
} from '../services/api';
import { getId } from '../lib/entityId';
import { toast } from 'sonner';

const SOCKET_ERROR_MESSAGES = {
  RFID_MODE_INVALID: 'El lector de tarjetas no está listo. Avisa al profesor.',
  RFID_SENSOR_UNAUTHORIZED: 'Este lector no está autorizado para esta sesión. Reconecta el lector configurado o continúa en modo táctil.',
  RFID_SENSOR_MISMATCH: 'El lector cambió durante la partida. Reconecta el lector original.',
  RFID_HMAC_INVALID: 'Lectura rechazada por seguridad (firma no válida). Reconecta el lector.',
  RFID_SENSOR_NOT_CONNECTED: 'El sensor RFID no está conectado. Conéctalo para continuar.',
  RFID_SENSOR_STALE: 'El sensor no responde. Comprueba que esté encendido.',
  RFID_DISABLED: 'El servicio RFID está desactivado por configuración del servidor.',
  RFID_CLIENT_CLOCK_SKEW:
    'La fecha y hora de este equipo están desincronizadas. Ajusta el reloj del ordenador (o sincronízalo por internet) para poder escanear tarjetas.',
  PLAY_NOT_ACTIVE: 'La partida ha terminado o fue interrumpida.',
  ROUND_BLOCKED: 'Espera un momento antes de pasar la siguiente tarjeta.',
  RFID_SOCKET_NOT_ACTIVE: 'El juego se abrió en otra ventana. Cierra las demás para continuar.',
  RFID_MODE_TAKEN_OVER: 'Otra ventana tomó el control del lector. Usa solo esta ventana.',
  FORBIDDEN: 'No tienes permisos para ejecutar esta acción.',
  AUTH_REQUIRED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  ENGINE_ERROR: 'Algo salió mal. Inténtalo de nuevo o avisa al profesor.',
  // Codigos de socketRateLimiter — mensajes user-friendly para audiencia infantil
  RATE_LIMITED: 'Espera un momento entre intentos.',
  TEMP_BLOCKED: 'Has ido demasiado rápido. Espera unos segundos antes de continuar.',
  PAYLOAD_TOO_LARGE: 'Hubo un problema con tu acción. Inténtalo de nuevo.',
  DUPLICATE_RFID_EVENT: 'Espera un momento antes del siguiente escaneo.'
};

// El backend emite `rfid_scan_error` con `{ code: 'RFID_HMAC_INVALID', reason }`
// donde `reason` discrimina el motivo real del rechazo. Resolvemos el mensaje
// por `reason` (más preciso) y caemos al mensaje por `code` si no viniera.
const RFID_SCAN_ERROR_REASONS = {
  COUNTER_REPLAY: 'Lectura rechazada: posible repetición de una lectura anterior. Reconecta el lector.',
  HMAC_INVALID: 'Lectura rechazada por seguridad (firma no válida). Reconecta el lector.'
};

const SCAN_IGNORED_MESSAGES = {
  // play_paused: NO toast — el banner de pausa ya es visible y el toast
  // duplicaría el mensaje. Solo se anuncia para lectores de pantalla.
  play_paused: null,
  not_awaiting_response: 'Escaneo fuera de turno. Espera a la siguiente ronda.',
  card_not_in_play: 'Tarjeta fuera de esta partida.',
  uid_unknown: 'Tarjeta no registrada en el sistema.'
};

const SCAN_IGNORED_TOAST_LEVEL = {
  // not_awaiting es informativo (timing); card_not_in_play y uid_unknown
  // son advertencias accionables (la tarjeta no debería estar aquí).
  not_awaiting_response: 'info',
  card_not_in_play: 'warning',
  uid_unknown: 'warning'
};

const SCAN_RESPONSE_TIMEOUT_MS = 3000;

// PROP-90 / ADR-090: cooldown de dedupe local diferenciado por fuente del scan.
// El sensor hardware necesita ~1200ms para protegerse del chattering del RC522,
// pero los taps táctiles deben permitir secuencias rápidas. Alineado con la
// política del backend (`socketRateLimits.rfidDedupeConfig` = 1200ms para las
// fuentes hardware): antes el cliente usaba 1300ms y era 100ms MÁS estricto,
// descartando scans rápidos (1200–1300ms) que el backend sí habría aceptado.
const DEDUPE_MS_BY_SOURCE = {
  web_serial_hardware: 1200,
  web_serial: 1200,
  touch_fallback: 250,
  touch_memory_flip: 250
};
const DEFAULT_DEDUPE_MS = 1200;

const REALTIME_STATUS_COPY = {
  connected: { label: 'Juego listo', announcement: 'El juego está conectado.' },
  reconnecting: { label: 'Reconectando…', announcement: 'Reconectando el juego.' },
  disconnected: { label: 'Sin conexión', announcement: 'Se perdió la conexión del juego.' },
  connecting: { label: 'Conectando…', announcement: 'Conectando el juego.' }
};

function resolveSocketError(payload) {
  const code = payload?.code;
  const fallbackMessage = payload?.message || 'No se pudo procesar la acción en tiempo real.';

  // PROP-92: el backend incluye `retryAfterMs` en RATE_LIMITED y TEMP_BLOCKED
  // (ver backend/src/middlewares/socketRateLimiter.js). Lo propagamos al
  // estado para que el componente <RateLimitBanner> pinte el countdown.
  // null si no es aplicable al código en cuestión.
  const retryAfterMs = Number.isFinite(payload?.retryAfterMs) && payload.retryAfterMs > 0
    ? payload.retryAfterMs
    : null;

  return {
    code: code || 'UNKNOWN',
    message: SOCKET_ERROR_MESSAGES[code] || fallbackMessage,
    retryAfterMs
  };
}

/**
 * @param {Object} options
 * @param {string} options.sessionId - ID de la sesión de juego
 * @param {number} options.retryKey - Clave de reintento (incrementar para re-inicializar)
 * @param {Object} options.user - Usuario autenticado (del AuthContext)
 * @param {string} options.searchParamsPlayerId - playerId extraído de searchParams
 * @param {Object} options.callbacks - Callbacks para manejar eventos del juego
 * @param {Function} options.callbacks.onNewRound
 * @param {Function} options.callbacks.onValidationResult
 * @param {Function} options.callbacks.onGameOver
 * @param {Function} options.callbacks.onPlayPaused
 * @param {Function} options.callbacks.onPlayResumed
 * @param {Function} options.callbacks.onPlayState
 * @param {Function} options.callbacks.onMemoryTurnState
 * @param {Function} options.callbacks.onPlayInterrupted
 * @param {Function} options.callbacks.onSrAnnouncement - Callback para anuncios de screen reader
 */
export function useGameSocket({
  sessionId,
  retryKey,
  user,
  searchParamsPlayerId,
  callbacks
}) {
  const {
    onNewRound,
    onValidationResult,
    onGameOver,
    onPlayPaused,
    onPlayResumed,
    onPlayState,
    onMemoryTurnState,
    onPlayInterrupted,
    onSrAnnouncement,
    onSequencePhaseMemorizing,
    onSequencePhaseReproducing,
    onSequenceCardResult,
    onSequenceRoundResult
  } = callbacks;

  // Estados propios del hook
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [realtimeError, setRealtimeError] = useState(null);
  const [bootstrappingPlay, setBootstrappingPlay] = useState(true);
  const [session, setSession] = useState(null);
  const [playId, setPlayId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState(null);
  const [rfidConnected, setRfidConnected] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  // Estado de "lector bloqueado": el sensor físico real está conectado pero el
  // backend rechaza sus escaneos (no autorizado, cambio de lector o firma HMAC
  // inválida/replay). Lo expone el hook para que la UI muestre un banner guiado
  // de reconexión. `null` = sin bloqueo. Forma: { code, message }.
  const [rfidBlocked, setRfidBlocked] = useState(null);

  // Refs internos
  const initCalledRef = useRef(false);
  const lastSocketErrorToastRef = useRef(0);
  const lastScanExpiredToastRef = useRef(0);
  const lastRetryAtRef = useRef(0);
  const previousRealtimeStatusRef = useRef('connecting');
  const playIdRef = useRef(null);
  const gameStateRef = useRef('waiting');
  const pendingScanTimeoutRef = useRef(null);

  // Ref a los últimos callbacks de gameplay. Los listeners de socket se registran
  // UNA sola vez (el efecto depende solo de [sessionId, retryKey]), pero estos
  // callbacks se recrean en cada render del padre (cierran sobre currentRound,
  // totalRounds, isMemoryMode...). Sin este ref, los `wrapped*` invocaban SIEMPRE
  // la versión del primer render: en Memoria reactivaba la lógica de Asociación
  // (doble conteo de fallos/racha) y los mensajes de "última ronda"/presión de
  // tiempo salían mal. Mismo patrón que useKeyboardShortcuts/useRefetchOnFocus.
  const gameplayCallbacksRef = useRef(null);
  // (F2) Incluir TAMBIÉN los callbacks de Secuencia: antes se omitían del ref, así
  // que sus listeners invocaban la versión del primer render (closures obsoletas de
  // currentRound/totalRounds) durante toda la partida — mensajes de ronda/última
  // ronda incorrectos en Secuencia.
  // (FE-2) Incluir onPlayInterrupted: el resumen de una partida interrumpida por el
  // servidor cierra sobre `score`/`correctAnswers` (deps INESTABLES en GameSession),
  // pero su listener se registraba con la versión del PRIMER render → el GameOver de
  // interrupción pintaba 0 aciertos/score inicial. Leerlo del ref lo mantiene fresco.
  // (Los otros handlers directos —onPlayPaused/Resumed/PlayState/SequencePhase*— son
  // seguros HOY solo porque sus deps son estables; es una regla implícita frágil: si
  // se añade una dep inestable a alguno, moverlo también a este ref.)
  gameplayCallbacksRef.current = {
    onNewRound,
    onValidationResult,
    onMemoryTurnState,
    onGameOver,
    onSequenceCardResult,
    onSequenceRoundResult,
    onPlayInterrupted
  };

  const RETRY_COOLDOWN_MS = 5000;

  // Sincronizar refs con valores actuales (el componente padre actualiza gameState)
  const syncGameState = useCallback((gs) => {
    gameStateRef.current = gs;
  }, []);

  // Mantener playIdRef sincronizado
  useEffect(() => {
    playIdRef.current = playId;
  }, [playId]);

  const resolvePlayerId = useCallback(async () => {
    if (searchParamsPlayerId) {
      return searchParamsPlayerId;
    }

    const teacherId = getId(user);
    if (!teacherId) {
      throw new Error('No se pudo determinar el profesor para crear la partida.');
    }

    const studentsRes = await usersAPI.getStudentsByTeacher(teacherId, {
      sortBy: 'createdAt',
      order: 'asc'
    });
    const students = extractData(studentsRes) || [];

    const firstStudentId = getId(students?.[0]);
    if (!firstStudentId) {
      throw new Error('No hay alumnos disponibles para iniciar la partida.');
    }

    return firstStudentId;
  }, [searchParamsPlayerId, user]);

  const bootstrapPlay = useCallback(async (signal) => {
    const inProgressRes = await playsAPI.getPlays({ sessionId, status: 'in-progress', limit: 1 }, { signal });
    const inProgressPlays = extractData(inProgressRes) || [];
    const foundInProgress = inProgressPlays?.[0];
    if (getId(foundInProgress)) {
      return {
        playId: getId(foundInProgress),
        playerId: foundInProgress.playerId || getId(foundInProgress.player)
      };
    }

    const pausedRes = await playsAPI.getPlays({ sessionId, status: 'paused', limit: 1 }, { signal });
    const pausedPlays = extractData(pausedRes) || [];
    const foundPaused = pausedPlays?.[0];
    if (getId(foundPaused)) {
      return {
        playId: getId(foundPaused),
        playerId: foundPaused.playerId || getId(foundPaused.player)
      };
    }

    const playerId = await resolvePlayerId();
    const createPlayRes = await playsAPI.createPlay({ sessionId, playerId });
    const createdPlay = extractData(createPlayRes);

    return {
      playId: getId(createdPlay),
      playerId
    };
  }, [resolvePlayerId, sessionId]);

  // Efecto principal de inicialización del socket y la partida
  useEffect(() => {
    const controller = new AbortController();

    const onSocketError = payload => {
      const normalized = resolveSocketError(payload);

      // Errores de lector físico que requieren reconexión guiada
      // (no autorizado para esta sesión / cambio de lector a media partida).
      // Heurística sensor-real-vs-táctil: solo molestamos cuando hay un sensor
      // físico realmente conectado (`deviceState === 'ready'`). En modo táctil
      // (sin sensor) estos errores no deberían dispararse en la práctica y, si
      // lo hacen, los silenciamos para no confundir al docente que juega con
      // los botones del fallback. Cuando el sensor SÍ está activo, exponemos
      // `rfidBlocked` para que la UI pinte el banner guiado de reconexión.
      const sensorBlockingCodes = new Set(['RFID_SENSOR_UNAUTHORIZED', 'RFID_SENSOR_MISMATCH']);
      if (sensorBlockingCodes.has(normalized.code)) {
        if (webSerialService.deviceState === 'ready') {
          setRfidBlocked({ code: normalized.code, message: normalized.message });
          onSrAnnouncement(normalized.message);
        }
        // Sin sensor físico (modo táctil): silenciar. No banner, no toast.
        return;
      }

      setRealtimeError(normalized);
      onSrAnnouncement(normalized.message);

      // PROP-92: cuando el error tiene retryAfterMs (RATE_LIMITED, TEMP_BLOCKED,
      // DUPLICATE_RFID_EVENT con backend que devuelve el campo) lo presentamos
      // mediante <RateLimitBanner> con barra de progreso, no con toast — el
      // banner es persistente y comunica el tiempo restante mejor.
      const banneredCodes = new Set(['RATE_LIMITED', 'TEMP_BLOCKED', 'DUPLICATE_RFID_EVENT']);
      if (banneredCodes.has(normalized.code) && normalized.retryAfterMs) {
        return;
      }

      // Deduplicate socket error toasts — max 1 every 5 seconds
      const now = Date.now();
      if (now - lastSocketErrorToastRef.current > 5000) {
        lastSocketErrorToastRef.current = now;
        toast.warning(normalized.message, { id: 'socket-error' });
      }
    };

    const onSocketDisconnect = reason => {
      if (gameStateRef.current === 'finished') {
        return;
      }

      setRealtimeStatus('reconnecting');
      setRealtimeError({
        code: 'SOCKET_DISCONNECTED',
        message: 'Conexión en tiempo real perdida. Intentando reconectar…'
      });
      onSrAnnouncement('Conexión en tiempo real perdida. Intentando reconectar.');

      if (reason === 'io server disconnect') {
        toast.warning('La conexión fue reiniciada por el servidor. Reconectando…');
      }
    };

    const onSocketConnect = () => {
      setRealtimeStatus('connected');
      setRealtimeError(null);
      onSrAnnouncement('Conexión en tiempo real restablecida.');

      if (typeof webSerialService.flushPendingScans === 'function') {
        webSerialService.flushPendingScans();
      }

      if (playIdRef.current) {
        socketService.sendGameCommand(GAME_EVENTS.JOIN_PLAY, { playId: playIdRef.current });
      }
    };

    // ── Feedback para escaneos RFID ignorados ──────────────────────────
    const cancelPendingScanTimeout = () => {
      if (pendingScanTimeoutRef.current) {
        clearTimeout(pendingScanTimeoutRef.current);
        pendingScanTimeoutRef.current = null;
      }
    };

    // Wrappers: cancelar timeout de escaneo pendiente al recibir cualquier respuesta del servidor
    // Limpiamos el realtimeError cuando llega un evento válido del servidor
    // (NEW_ROUND o VALIDATION_RESULT): el hint "Espera un momento entre
    // intentos" persistía visualmente aunque el turno se hubiera completado
    // correctamente (detectado en QA 2026-04-23).
    const wrappedOnNewRound = data => { cancelPendingScanTimeout(); setRealtimeError(null); gameplayCallbacksRef.current.onNewRound(data); };
    const wrappedOnValidationResult = data => { cancelPendingScanTimeout(); setRealtimeError(null); gameplayCallbacksRef.current.onValidationResult(data); };
    const wrappedOnMemoryTurnState = data => { cancelPendingScanTimeout(); gameplayCallbacksRef.current.onMemoryTurnState(data); };
    const wrappedOnGameOver = data => { cancelPendingScanTimeout(); gameplayCallbacksRef.current.onGameOver(data); };
    // (FE-2) play_interrupted vía ref para leer score/correctAnswers actuales.
    const wrappedOnPlayInterrupted = data => { cancelPendingScanTimeout(); gameplayCallbacksRef.current.onPlayInterrupted?.(data); };
    // (F2) Wrappers de Secuencia vía ref (igual que los de arriba): resuelven la
    // versión ACTUAL del callback en cada evento, no la del primer render.
    // `cancelPendingScanTimeout()` es OBLIGATORIO aquí, igual que en los wrappers
    // de Memoria/Asociación: cada scan hardware/sim arma un timeout de 3s que
    // muestra "Tarjeta no reconocida". Sin cancelarlo al recibir la respuesta del
    // servidor (`sequence_card_result`/`round_result`), tras la última carta de
    // cada ronda saltaba un toast rojo espurio ~3s después, aunque la carta SÍ se
    // aceptó — falso negativo confuso para el niño y el docente.
    const wrappedOnSequenceCardResult = data => {
      cancelPendingScanTimeout();
      setRealtimeError(null);
      gameplayCallbacksRef.current.onSequenceCardResult?.(data);
    };
    const wrappedOnSequenceRoundResult = data => {
      cancelPendingScanTimeout();
      gameplayCallbacksRef.current.onSequenceRoundResult?.(data);
    };

    const onScanIgnored = payload => {
      cancelPendingScanTimeout();
      const reason = payload?.reason;
      const message = SCAN_IGNORED_MESSAGES[reason];
      // Anuncio screen-reader siempre (incluso si no mostramos toast),
      // para no perder accesibilidad cuando el banner de pausa ya cubre
      // el caso visualmente.
      const srMessage = message || (reason === 'play_paused'
        ? 'La partida está pausada.'
        : 'Escaneo ignorado.');
      onSrAnnouncement?.(srMessage);

      if (message === null || message === undefined) {
        return;
      }

      const level = SCAN_IGNORED_TOAST_LEVEL[reason] || 'info';
      const toastFn = toast[level] || toast.info;
      toastFn(message, { id: 'scan-ignored', duration: 3000 });
    };

    // Rechazos de escaneo por seguridad: el backend emite `rfid_scan_error` con
    // `{ code: 'RFID_HMAC_INVALID', reason }` donde `reason` es 'HMAC_INVALID' o
    // 'COUNTER_REPLAY'. Sin este listener esos rechazos eran invisibles. Los
    // elevamos a `rfidBlocked` para que la UI muestre el banner guiado de
    // reconexión, eligiendo el mensaje por `reason` (más preciso) con fallback
    // al mensaje por `code`.
    const onRfidScanError = payload => {
      cancelPendingScanTimeout();
      const securityBlockingCodes = new Set(['RFID_HMAC_INVALID', 'COUNTER_REPLAY']);
      if (!securityBlockingCodes.has(payload?.code)) {
        return;
      }
      const message = RFID_SCAN_ERROR_REASONS[payload?.reason]
        || SOCKET_ERROR_MESSAGES[payload?.code]
        || RFID_SCAN_ERROR_REASONS.HMAC_INVALID;
      setRfidBlocked({ code: payload.code, message });
      onSrAnnouncement(message);
    };

    // Timeout client-side: si el frontend envía un scan y no recibe respuesta en 3s.
    // `webSerialService` emite `scan` SIEMPRE, incluso cuando el socket está caído
    // y la lectura solo se ENCOLA (no se envía). En ese caso NO armamos el timeout:
    // no habrá respuesta del servidor y el toast "Tarjeta no reconocida" sería
    // factualmente incorrecto (la carta era válida y quedó en cola para reenviar).
    // El feedback correcto de ese caso ya lo cubren la cola + el evento `scan_expired`.
    const handleLocalScan = () => {
      cancelPendingScanTimeout();
      if (!socketService.isGameSocketConnected()) {
        return;
      }
      pendingScanTimeoutRef.current = setTimeout(() => {
        toast.warning('Tarjeta no reconocida. Verifica que pertenece a esta sesión.', {
          id: 'scan-timeout',
          duration: 4000
        });
        onSrAnnouncement?.('Tarjeta no reconocida.');
        pendingScanTimeoutRef.current = null;
      }, SCAN_RESPONSE_TIMEOUT_MS);
    };

    // `webSerialService` emite `scan_expired` cuando descarta un scan caducado
    // en el flush (p.ej. tras una desconexión del sensor). Sin este listener el
    // docente no se entera de que una lectura se perdió. Lo avisamos con un
    // toast, deduplicado (max 1 cada 5s) para no spamear si caducan varios.
    const onScanExpired = () => {
      const now = Date.now();
      if (now - lastScanExpiredToastRef.current > 5000) {
        lastScanExpiredToastRef.current = now;
        toast.warning('Un escaneo se perdió por una desconexión. Vuelve a acercar la tarjeta.', {
          id: 'scan-expired'
        });
      }
    };

    webSerialService.on('scan', handleLocalScan);
    webSerialService.on('scan_expired', onScanExpired);

    const initRealtimePlay = async () => {
      // Prevenir re-inicialización cuando useEffect se re-ejecuta por cambios de dependencias
      if (initCalledRef.current) {
        return undefined;
      }
      initCalledRef.current = true;

      try {
        if (!sessionId) {
          throw new Error('No se ha indicado una sesión válida.');
        }

        setLoadingSession(true);
        setBootstrappingPlay(true);
        setSessionError(null);

        // 1. Conectar socket primero (crea this.socket/this.gameSocket si no
        //    existen). Asegurar AMBOS namespaces: isSocketConnected() solo mira
        //    el socket de sistema; si el de /game cayó de forma independiente
        //    (timeout/transport) con el de sistema aún arriba, sin comprobar
        //    isGameSocketConnected() se saltaba el connect() y los onGame() de
        //    abajo se registraban sobre un gameSocket inexistente. connect() es
        //    idempotente (no-op si ambos ya están conectados).
        if (!socketService.isSocketConnected() || !socketService.isGameSocketConnected()) {
          await socketService.connect();
        }
        if (controller.signal.aborted) return undefined;

        // 2. Registrar listeners — gameplay en namespace /game, sistema en /
        socketService.onGame(GAME_EVENTS.NEW_ROUND, wrappedOnNewRound);
        socketService.onGame(GAME_EVENTS.MEMORY_TURN_STATE, wrappedOnMemoryTurnState);
        socketService.onGame(GAME_EVENTS.VALIDATION_RESULT, wrappedOnValidationResult);
        socketService.onGame(GAME_EVENTS.GAME_OVER, wrappedOnGameOver);
        socketService.onGame(GAME_EVENTS.PLAY_PAUSED, onPlayPaused);
        socketService.onGame(GAME_EVENTS.PLAY_RESUMED, onPlayResumed);
        socketService.onGame(GAME_EVENTS.PLAY_STATE, onPlayState);
        socketService.onGame(GAME_EVENTS.PLAY_INTERRUPTED, wrappedOnPlayInterrupted);
        socketService.onGame(GAME_EVENTS.SCAN_IGNORED, onScanIgnored);
        socketService.onGame(GAME_EVENTS.RFID_SCAN_ERROR, onRfidScanError);
        socketService.onGame(GAME_EVENTS.ERROR, onSocketError);
        // Mecánica Secuencia (T-921): listeners registrados aquí para garantizar
        // que están activos ANTES del primer evento del backend (se emiten en
        // start_play, antes de que el panel de Secuencia se monte por
        // mechanicMode resolver). Sin esto se pierde el sequence_phase_memorizing
        // inicial y el board queda vacío (QA 2026-05-03 BUG-QA-6).
        if (typeof onSequencePhaseMemorizing === 'function') {
          socketService.onGame(GAME_EVENTS.SEQUENCE_PHASE_MEMORIZING, onSequencePhaseMemorizing);
        }
        if (typeof onSequencePhaseReproducing === 'function') {
          socketService.onGame(GAME_EVENTS.SEQUENCE_PHASE_REPRODUCING, onSequencePhaseReproducing);
        }
        if (typeof onSequenceCardResult === 'function') {
          socketService.onGame(GAME_EVENTS.SEQUENCE_CARD_RESULT, wrappedOnSequenceCardResult);
        }
        if (typeof onSequenceRoundResult === 'function') {
          socketService.onGame(GAME_EVENTS.SEQUENCE_ROUND_RESULT, wrappedOnSequenceRoundResult);
        }
        socketService.on(SOCKET_EVENTS.DISCONNECT, onSocketDisconnect);
        socketService.on(SOCKET_EVENTS.CONNECT, onSocketConnect);

        setRealtimeStatus(socketService.isSocketConnected() ? 'connected' : 'connecting');
        setRealtimeError(null);

        // 3. API calls después de que socket y listeners estén listos
        const response = await sessionsAPI.getSessionById(sessionId, {
          signal: controller.signal
        });

        let sessionData = extractData(response);
        if (controller.signal.aborted) return undefined;

        if (sessionData?.status === 'created') {
          const startSessionRes = await sessionsAPI.startSession(sessionId);
          const startedData = extractData(startSessionRes);
          if (startedData) {
            // Preservar datos poblados de la sesión original (mechanic, deck, context)
            sessionData = {
              ...startedData,
              mechanic: startedData.mechanic?.name ? startedData.mechanic : sessionData.mechanic,
              deck: startedData.deck?.name ? startedData.deck : sessionData.deck,
              context: startedData.context?.name ? startedData.context : sessionData.context
            };
          }
        }
        if (controller.signal.aborted) return undefined;

        setSession(sessionData);

        const resolvedPlay = await bootstrapPlay(controller.signal);
        if (controller.signal.aborted) return undefined;
        if (!resolvedPlay?.playId) {
          throw new Error('No se pudo inicializar una partida de juego.');
        }

        setPlayId(resolvedPlay.playId);
        setSelectedPlayerId(resolvedPlay.playerId || null);

        // Obtener mejor puntuación histórica del jugador en esta sesión
        if (resolvedPlay.playerId) {
          playsAPI.getPlayerStats(resolvedPlay.playerId, { sessionId })
            .then(statsRes => {
              if (controller.signal.aborted) return undefined;
              const stats = extractData(statsRes);
              if (Number.isFinite(stats?.stats?.bestScore)) {
                setBestScore(stats.stats.bestScore);
              }
              return undefined;
            })
            .catch(() => { /* No bloquear gameplay si las stats fallan */ });
        }

        if (controller.signal.aborted) return undefined;
        socketService.sendGameCommand(GAME_EVENTS.JOIN_PLAY, { playId: resolvedPlay.playId });
        socketService.sendGameCommand(GAME_EVENTS.START_PLAY, { playId: resolvedPlay.playId });
        // Sincronizar estado en caso de que rondas avanzaran durante la inicialización
        socketService.requestPlayStateSync(resolvedPlay.playId);

        // Devolver la sesión para que el componente padre extraiga configuración
        return sessionData;
      } catch (error) {
        if (isAbortError(error)) {
          return undefined;
        }

        setSessionError(extractErrorMessage(error));
        return undefined;
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSession(false);
          setBootstrappingPlay(false);
        }
      }
    };

    initRealtimePlay();

    return () => {
      initCalledRef.current = false;
      controller.abort();
      if (playIdRef.current) {
        socketService.sendGameCommand(GAME_EVENTS.LEAVE_PLAY, { playId: playIdRef.current });
      }
      // Limpiar listeners de gameplay (namespace /game)
      socketService.offGame(GAME_EVENTS.NEW_ROUND, wrappedOnNewRound);
      socketService.offGame(GAME_EVENTS.MEMORY_TURN_STATE, wrappedOnMemoryTurnState);
      socketService.offGame(GAME_EVENTS.VALIDATION_RESULT, wrappedOnValidationResult);
      socketService.offGame(GAME_EVENTS.GAME_OVER, wrappedOnGameOver);
      socketService.offGame(GAME_EVENTS.PLAY_PAUSED, onPlayPaused);
      socketService.offGame(GAME_EVENTS.PLAY_RESUMED, onPlayResumed);
      socketService.offGame(GAME_EVENTS.PLAY_STATE, onPlayState);
      socketService.offGame(GAME_EVENTS.PLAY_INTERRUPTED, wrappedOnPlayInterrupted);
      socketService.offGame(GAME_EVENTS.SCAN_IGNORED, onScanIgnored);
      socketService.offGame(GAME_EVENTS.RFID_SCAN_ERROR, onRfidScanError);
      socketService.offGame(GAME_EVENTS.ERROR, onSocketError);
      if (typeof onSequencePhaseMemorizing === 'function') {
        socketService.offGame(GAME_EVENTS.SEQUENCE_PHASE_MEMORIZING, onSequencePhaseMemorizing);
      }
      if (typeof onSequencePhaseReproducing === 'function') {
        socketService.offGame(GAME_EVENTS.SEQUENCE_PHASE_REPRODUCING, onSequencePhaseReproducing);
      }
      if (typeof onSequenceCardResult === 'function') {
        socketService.offGame(GAME_EVENTS.SEQUENCE_CARD_RESULT, wrappedOnSequenceCardResult);
      }
      if (typeof onSequenceRoundResult === 'function') {
        socketService.offGame(GAME_EVENTS.SEQUENCE_ROUND_RESULT, wrappedOnSequenceRoundResult);
      }
      // Limpiar listener de scan local y timeout pendiente
      webSerialService.off('scan', handleLocalScan);
      webSerialService.off('scan_expired', onScanExpired);
      cancelPendingScanTimeout();
      // Limpiar listeners de sistema (namespace /)
      socketService.off(SOCKET_EVENTS.DISCONNECT, onSocketDisconnect);
      socketService.off(SOCKET_EVENTS.CONNECT, onSocketConnect);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- init effect debe ejecutarse una vez por sessionId/retry; handlers usan refs para estado actual
  }, [sessionId, retryKey]);

  // Recuperar estado del juego tras reconexión del socket
  useEffect(() => {
    const handleSocketReconnected = () => {
      const currentPlayId = playIdRef.current;
      if (!currentPlayId || gameStateRef.current === 'finished') {
        return;
      }

      const sent = socketService.requestPlayStateSync(currentPlayId);
      if (sent) {
        toast.success('Reconectado', {
          description: 'Sincronizando estado del juego...'
        });
      }
    };

    // El socket de /game puede reconectar de forma independiente al de sistema
    // (son conexiones io() separadas). Al hacerlo cambia su socket.id y el
    // backend ya limpió el modo RFID gameplay del socket anterior, por lo que
    // hay que re-emitir JOIN_PLAY para re-registrarlo; de lo contrario los
    // escaneos del sensor y los taps del fallback táctil se rechazan con
    // "El lector no está listo". Tras re-unirnos, resincronizamos el estado.
    const handleGameSocketReconnected = () => {
      const currentPlayId = playIdRef.current;
      if (!currentPlayId || gameStateRef.current === 'finished') {
        return;
      }
      socketService.sendGameCommand(GAME_EVENTS.JOIN_PLAY, { playId: currentPlayId });
      // Reenviar los escaneos encolados durante la caída de /game. El socket de
      // sistema (`onSocketConnect`) ya hace flush, pero /game es una conexión io()
      // INDEPENDIENTE que puede caer y volver sola (blip de WiFi de aula) sin que
      // el de sistema lo haga; sin este flush las respuestas del niño quedaban
      // varadas hasta el siguiente escaneo hardware. Orden correcto: JOIN_PLAY re-
      // registra el modo RFID ANTES de reenviar (mismo socket → FIFO).
      if (typeof webSerialService.flushPendingScans === 'function') {
        webSerialService.flushPendingScans();
      }
      socketService.requestPlayStateSync(currentPlayId);
    };

    window.addEventListener('socket_reconnected', handleSocketReconnected);
    window.addEventListener('game_socket_reconnected', handleGameSocketReconnected);
    return () => {
      window.removeEventListener('socket_reconnected', handleSocketReconnected);
      window.removeEventListener('game_socket_reconnected', handleGameSocketReconnected);
    };
  }, []);

  // Listener de estado del dispositivo RFID
  useEffect(() => {
    const handleDeviceStateChange = (payload) => {
      setRfidConnected(payload?.state === 'ready');
    };

    webSerialService.on('device_state_change', handleDeviceStateChange);

    return () => {
      webSerialService.off('device_state_change', handleDeviceStateChange);
    };
  }, []);

  // Anunciar cambios de estado de conexión
  useEffect(() => {
    if (realtimeStatus === previousRealtimeStatusRef.current) {
      return;
    }

    previousRealtimeStatusRef.current = realtimeStatus;
    const announcement = REALTIME_STATUS_COPY[realtimeStatus]?.announcement;
    if (announcement) {
      onSrAnnouncement(announcement);
    }
  }, [realtimeStatus, onSrAnnouncement]);

  // --- Acciones que el componente padre puede invocar ---

  const emitPausePlay = useCallback(() => {
    if (!playIdRef.current) return false;
    const sent = socketService.sendGameCommand(GAME_EVENTS.PAUSE_PLAY, { playId: playIdRef.current });
    if (sent === false) {
      setRealtimeStatus('disconnected');
      setRealtimeError({
        code: 'SOCKET_REQUIRED',
        message: 'Se requiere conexión en tiempo real para pausar/reanudar.'
      });
      toast.error('No se puede pausar: se perdió la conexión. Inténtalo de nuevo.');
    }
    return sent;
  }, []);

  const emitResumePlay = useCallback(() => {
    if (!playIdRef.current) return false;
    const sent = socketService.sendGameCommand(GAME_EVENTS.RESUME_PLAY, { playId: playIdRef.current });
    if (sent === false) {
      setRealtimeStatus('disconnected');
      setRealtimeError({
        code: 'SOCKET_REQUIRED',
        message: 'Se requiere conexión en tiempo real para pausar/reanudar.'
      });
      toast.error('No se puede reanudar: se perdió la conexión. Inténtalo de nuevo.');
    }
    return sent;
  }, []);

  // Guardia anti-rebote SÓLO para el path de FallbackTouchPanel y los
  // taps en el tablero de memoria: protege contra dobles clicks rápidos
  // del usuario sobre los botones, NO contra duplicados del sensor físico
  // (esos los filtra `webSerialService` con su propio dedupe de 1200 ms).
  // Diferenciación por fuente: ver constantes DEDUPE_MS_BY_SOURCE arriba.
  const lastScanRef = useRef({ uid: null, ts: 0, source: null });

  const isDuplicateScan = useCallback((uid, source) => {
    const cooldown = DEDUPE_MS_BY_SOURCE[source] || DEFAULT_DEDUPE_MS;
    const now = Date.now();
    const last = lastScanRef.current;
    // Solo dedupea cuando coincide UID + source: dos fuentes distintas no se
    // ahogan entre sí (un tap táctil no impide la siguiente lectura del sensor).
    if (last.uid === uid && last.source === source && now - last.ts < cooldown) {
      return true;
    }
    lastScanRef.current = { uid, ts: now, source };
    return false;
  }, []);

  const emitFallbackScan = useCallback((card, sensorId) => {
    if (!playIdRef.current || !card?.uid) return false;
    if (isDuplicateScan(card.uid, 'touch_fallback')) return true; // silenciosamente swallow, no es un error
    return socketService.sendGameCommand(GAME_EVENTS.RFID_SCAN_FROM_CLIENT, {
      uid: card.uid,
      type: 'UNKNOWN',
      sensorId: sensorId || 'touch_fallback_sensor',
      timestamp: Date.now(),
      source: 'touch_fallback'
    });
  }, [isDuplicateScan]);

  const emitMemoryCardTap = useCallback((slot, sensorId) => {
    if (!playIdRef.current || !slot?.uid) return false;
    if (isDuplicateScan(slot.uid, 'touch_memory_flip')) return true;
    return socketService.sendGameCommand(GAME_EVENTS.RFID_SCAN_FROM_CLIENT, {
      uid: slot.uid,
      type: 'UNKNOWN',
      sensorId: sensorId || 'touch_fallback_sensor',
      timestamp: Date.now(),
      source: 'touch_memory_flip'
    });
  }, [isDuplicateScan]);

  const retryInit = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastRetryAtRef.current;
    if (elapsed < RETRY_COOLDOWN_MS) {
      const remaining = Math.ceil((RETRY_COOLDOWN_MS - elapsed) / 1000);
      toast.info(`Espera ${remaining}s antes de reintentar.`, { id: 'retry-cooldown' });
      return false;
    }
    lastRetryAtRef.current = now;
    initCalledRef.current = false;
    setSessionError(null);
    return true;
  }, []);

  const startPlay = useCallback(() => {
    if (!playIdRef.current) return false;
    return socketService.sendGameCommand(GAME_EVENTS.START_PLAY, { playId: playIdRef.current });
  }, []);

  const leaveAndCreateNewPlay = useCallback(async (playerId) => {
    if (playIdRef.current) {
      socketService.sendGameCommand(GAME_EVENTS.LEAVE_PLAY, { playId: playIdRef.current });
    }

    const createPlayRes = await playsAPI.createPlay({ sessionId, playerId });
    const newPlay = extractData(createPlayRes);
    const nextPlayId = getId(newPlay);

    if (!nextPlayId) {
      throw new Error('No se pudo crear una nueva partida.');
    }

    setPlayId(nextPlayId);
    socketService.sendGameCommand(GAME_EVENTS.JOIN_PLAY, { playId: nextPlayId });
    socketService.sendGameCommand(GAME_EVENTS.START_PLAY, { playId: nextPlayId });

    return nextPlayId;
  }, [sessionId]);

  const emitBoardReady = useCallback(() => {
    if (!playIdRef.current) return false;
    return socketService.sendGameCommand(GAME_EVENTS.BOARD_READY, { playId: playIdRef.current });
  }, []);

  // Descarta el banner de lector bloqueado (lo invoca la UI al reconectar o
  // al cerrar el aviso manualmente).
  const clearRfidBlocked = useCallback(() => setRfidBlocked(null), []);

  return {
    // Estados
    realtimeStatus,
    realtimeError,
    bootstrappingPlay,
    session,
    playId,
    selectedPlayerId,
    loadingSession,
    sessionError,
    rfidConnected,
    bestScore,
    rfidBlocked,

    // Setters necesarios para el componente padre
    setRealtimeError,
    clearRfidBlocked,

    // Sincronización de gameState
    syncGameState,

    // Constantes exportadas
    REALTIME_STATUS_COPY,

    // Acciones
    emitPausePlay,
    emitResumePlay,
    emitFallbackScan,
    emitMemoryCardTap,
    retryInit,
    startPlay,
    leaveAndCreateNewPlay,
    emitBoardReady
  };
}
