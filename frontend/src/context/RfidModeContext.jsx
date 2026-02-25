import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { socketService, SOCKET_EVENTS } from '../services/socket';

const initialModeState = {
  mode: 'idle',
  sensorId: null,
  metadata: {},
  socketId: null,
  updatedAt: null
};

const RfidModeContext = createContext(null);

export function useRfidMode() {
  const context = useContext(RfidModeContext);
  if (!context) {
    throw new Error('useRfidMode debe usarse dentro de RfidModeProvider');
  }
  return context;
}

export function RfidModeProvider({ children }) {
  const [modeState, setModeState] = useState(initialModeState);

  const applyModeState = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    setModeState(prev => ({
      ...prev,
      mode: payload.mode || 'idle',
      sensorId: payload.sensorId || null,
      metadata: payload.metadata || {},
      socketId: payload.socketId || null,
      updatedAt: payload.updatedAt || Date.now()
    }));
  }, []);

  useEffect(() => {
    const onModeChanged = payload => applyModeState(payload);
    const onDisconnect = () => {
      setModeState(initialModeState);
    };

    socketService.on(SOCKET_EVENTS.RFID_MODE_CHANGED, onModeChanged);
    socketService.on(SOCKET_EVENTS.DISCONNECT, onDisconnect);

    return () => {
      socketService.off(SOCKET_EVENTS.RFID_MODE_CHANGED, onModeChanged);
      socketService.off(SOCKET_EVENTS.DISCONNECT, onDisconnect);
    };
  }, [applyModeState]);

  const value = useMemo(
    () => ({
      modeState,
      mode: modeState.mode,
      sensorId: modeState.sensorId,
      metadata: modeState.metadata,
      socketId: modeState.socketId,
      updatedAt: modeState.updatedAt
    }),
    [modeState]
  );

  return <RfidModeContext.Provider value={value}>{children}</RfidModeContext.Provider>;
}
