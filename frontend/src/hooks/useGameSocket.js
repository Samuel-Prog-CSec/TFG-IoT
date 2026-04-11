/**
 * @fileoverview Hook para gestionar la conexión Socket.IO del juego,
 * incluyendo inicialización de la partida, listeners de eventos,
 * reconexión y estado del dispositivo RFID.
 *
 * @module hooks/useGameSocket
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { socketService, SOCKET_EVENTS } from '../services/socket';
import webSerialService from '../services/webSerialService';
import {
  sessionsAPI,
  usersAPI,
  playsAPI,
  extractData,
  extractErrorMessage,
  isAbortError
} from '../services/api';
import { toast } from 'sonner';

const SOCKET_ERROR_MESSAGES = {
  RFID_MODE_INVALID: 'El lector de tarjetas no está listo. Avisa al profesor.',
  RFID_SENSOR_UNAUTHORIZED: 'Este lector no está configurado para esta sesión. Avisa al profesor.',
  RFID_SENSOR_MISMATCH: 'Se detectó un cambio en el lector durante la partida.',
  PLAY_NOT_ACTIVE: 'La partida ha terminado o fue interrumpida.',
  ROUND_BLOCKED: 'Espera un momento antes de pasar la siguiente tarjeta.',
  RFID_SOCKET_NOT_ACTIVE: 'El juego se abrió en otra ventana. Cierra las demás para continuar.',
  RFID_MODE_TAKEN_OVER: 'Otra ventana tomó el control del lector. Usa solo esta ventana.',
  FORBIDDEN: 'No tienes permisos para ejecutar esta acción.',
  AUTH_REQUIRED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  ENGINE_ERROR: 'Algo salió mal. Inténtalo de nuevo o avisa al profesor.'
};

const REALTIME_STATUS_COPY = {
  connected: { label: 'Juego listo', announcement: 'El juego está conectado.' },
  reconnecting: { label: 'Reconectando…', announcement: 'Reconectando el juego.' },
  disconnected: { label: 'Sin conexión', announcement: 'Se perdió la conexión del juego.' },
  connecting: { label: 'Conectando…', announcement: 'Conectando el juego.' }
};

function resolveSocketError(payload) {
  const code = payload?.code;
  const fallbackMessage = payload?.message || 'No se pudo procesar la acción en tiempo real.';

  return {
    code: code || 'UNKNOWN',
    message: SOCKET_ERROR_MESSAGES[code] || fallbackMessage
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
    onSrAnnouncement
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

  // Refs internos
  const initCalledRef = useRef(false);
  const lastSocketErrorToastRef = useRef(0);
  const lastRetryAtRef = useRef(0);
  const previousRealtimeStatusRef = useRef('connecting');
  const playIdRef = useRef(null);
  const gameStateRef = useRef('waiting');

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

    const teacherId = user?.id || user?._id;
    if (!teacherId) {
      throw new Error('No se pudo determinar el profesor para crear la partida.');
    }

    const studentsRes = await usersAPI.getStudentsByTeacher(teacherId, {
      sortBy: 'createdAt',
      order: 'asc'
    });
    const students = extractData(studentsRes) || [];

    const firstStudentId = students?.[0]?.id || students?.[0]?._id;
    if (!firstStudentId) {
      throw new Error('No hay alumnos disponibles para iniciar la partida.');
    }

    return firstStudentId;
  }, [searchParamsPlayerId, user]);

  const bootstrapPlay = useCallback(async (signal) => {
    const inProgressRes = await playsAPI.getPlays({ sessionId, status: 'in-progress', limit: 1 }, { signal });
    const inProgressPlays = extractData(inProgressRes) || [];
    const foundInProgress = inProgressPlays?.[0];
    if (foundInProgress?.id || foundInProgress?._id) {
      return {
        playId: foundInProgress.id || foundInProgress._id,
        playerId: foundInProgress.playerId || foundInProgress.player?.id || foundInProgress.player?._id
      };
    }

    const pausedRes = await playsAPI.getPlays({ sessionId, status: 'paused', limit: 1 }, { signal });
    const pausedPlays = extractData(pausedRes) || [];
    const foundPaused = pausedPlays?.[0];
    if (foundPaused?.id || foundPaused?._id) {
      return {
        playId: foundPaused.id || foundPaused._id,
        playerId: foundPaused.playerId || foundPaused.player?.id || foundPaused.player?._id
      };
    }

    const playerId = await resolvePlayerId();
    const createPlayRes = await playsAPI.createPlay({ sessionId, playerId });
    const createdPlay = extractData(createPlayRes);

    return {
      playId: createdPlay?.id || createdPlay?._id,
      playerId
    };
  }, [resolvePlayerId, sessionId]);

  // Efecto principal de inicialización del socket y la partida
  useEffect(() => {
    const controller = new AbortController();

    const onSocketError = payload => {
      const normalized = resolveSocketError(payload);

      // No mostrar warning de sensor RFID en modo fallback táctil
      if (normalized.code === 'RFID_SENSOR_UNAUTHORIZED') {
        return;
      }

      setRealtimeError(normalized);
      onSrAnnouncement(normalized.message);

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
        socketService.sendCommand(SOCKET_EVENTS.JOIN_PLAY, { playId: playIdRef.current });
      }
    };

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

        // 1. Conectar socket primero (crea this.socket si no existe)
        if (!socketService.isSocketConnected()) {
          await socketService.connect();
        }
        if (controller.signal.aborted) return undefined;

        // 2. Registrar listeners (this.socket ya existe)
        socketService.on(SOCKET_EVENTS.NEW_ROUND, onNewRound);
        socketService.on(SOCKET_EVENTS.MEMORY_TURN_STATE, onMemoryTurnState);
        socketService.on(SOCKET_EVENTS.VALIDATION_RESULT, onValidationResult);
        socketService.on(SOCKET_EVENTS.GAME_OVER, onGameOver);
        socketService.on(SOCKET_EVENTS.PLAY_PAUSED, onPlayPaused);
        socketService.on(SOCKET_EVENTS.PLAY_RESUMED, onPlayResumed);
        socketService.on(SOCKET_EVENTS.PLAY_STATE, onPlayState);
        socketService.on(SOCKET_EVENTS.PLAY_INTERRUPTED, onPlayInterrupted);
        socketService.on(SOCKET_EVENTS.ERROR, onSocketError);
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
        socketService.sendCommand(SOCKET_EVENTS.JOIN_PLAY, { playId: resolvedPlay.playId });
        socketService.sendCommand(SOCKET_EVENTS.START_PLAY, { playId: resolvedPlay.playId });
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
        socketService.sendCommand(SOCKET_EVENTS.LEAVE_PLAY, { playId: playIdRef.current });
      }
      socketService.off(SOCKET_EVENTS.NEW_ROUND, onNewRound);
      socketService.off(SOCKET_EVENTS.MEMORY_TURN_STATE, onMemoryTurnState);
      socketService.off(SOCKET_EVENTS.VALIDATION_RESULT, onValidationResult);
      socketService.off(SOCKET_EVENTS.GAME_OVER, onGameOver);
      socketService.off(SOCKET_EVENTS.PLAY_PAUSED, onPlayPaused);
      socketService.off(SOCKET_EVENTS.PLAY_RESUMED, onPlayResumed);
      socketService.off(SOCKET_EVENTS.PLAY_STATE, onPlayState);
      socketService.off(SOCKET_EVENTS.PLAY_INTERRUPTED, onPlayInterrupted);
      socketService.off(SOCKET_EVENTS.ERROR, onSocketError);
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

    window.addEventListener('socket_reconnected', handleSocketReconnected);
    return () => {
      window.removeEventListener('socket_reconnected', handleSocketReconnected);
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
    const sent = socketService.sendCommand(SOCKET_EVENTS.PAUSE_PLAY, { playId: playIdRef.current });
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
    const sent = socketService.sendCommand(SOCKET_EVENTS.RESUME_PLAY, { playId: playIdRef.current });
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

  const emitFallbackScan = useCallback((card, sensorId) => {
    if (!playIdRef.current || !card?.uid) return false;
    return socketService.sendCommand(SOCKET_EVENTS.RFID_SCAN_FROM_CLIENT, {
      uid: card.uid,
      type: 'UNKNOWN',
      sensorId: sensorId || 'touch_fallback_sensor',
      timestamp: Date.now(),
      source: 'web_serial'
    });
  }, []);

  const emitMemoryCardTap = useCallback((slot, sensorId) => {
    if (!playIdRef.current || !slot?.uid) return false;
    return socketService.sendCommand(SOCKET_EVENTS.RFID_SCAN_FROM_CLIENT, {
      uid: slot.uid,
      type: 'UNKNOWN',
      sensorId: sensorId || 'touch_fallback_sensor',
      timestamp: Date.now(),
      source: 'web_serial'
    });
  }, []);

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
    return socketService.sendCommand(SOCKET_EVENTS.START_PLAY, { playId: playIdRef.current });
  }, []);

  const leaveAndCreateNewPlay = useCallback(async (playerId) => {
    if (playIdRef.current) {
      socketService.sendCommand(SOCKET_EVENTS.LEAVE_PLAY, { playId: playIdRef.current });
    }

    const createPlayRes = await playsAPI.createPlay({ sessionId, playerId });
    const newPlay = extractData(createPlayRes);
    const nextPlayId = newPlay?.id || newPlay?._id;

    if (!nextPlayId) {
      throw new Error('No se pudo crear una nueva partida.');
    }

    setPlayId(nextPlayId);
    socketService.sendCommand(SOCKET_EVENTS.JOIN_PLAY, { playId: nextPlayId });
    socketService.sendCommand(SOCKET_EVENTS.START_PLAY, { playId: nextPlayId });

    return nextPlayId;
  }, [sessionId]);

  const emitBoardReady = useCallback(() => {
    if (!playIdRef.current) return false;
    return socketService.sendCommand(SOCKET_EVENTS.BOARD_READY, { playId: playIdRef.current });
  }, []);

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

    // Setters necesarios para el componente padre
    setRealtimeError,

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
