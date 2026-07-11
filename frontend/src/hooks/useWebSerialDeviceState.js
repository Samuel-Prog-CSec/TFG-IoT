/**
 * @fileoverview Hook de suscripción al estado del lector Web Serial (RC522).
 * @module hooks/useWebSerialDeviceState
 */

import { useEffect, useState, useCallback } from 'react';
import webSerialService from '../services/webSerialService';

/**
 * Suscribe un componente al estado del lector Web Serial leyendo el valor
 * ACTUAL del singleton al montar y manteniéndolo en sync con los eventos
 * `status` / `device_state_change`.
 *
 * Es la fuente ÚNICA de verdad para "¿está el lector conectado y listo?". El
 * evento `device_state_change` es edge-triggered (solo se emite en un cambio
 * real de estado), así que inicializar desde el valor actual del singleton es
 * imprescindible: si el sensor ya estaba `ready` antes de montar el componente
 * (p. ej. se conectó al crear un mazo y luego se entra a la partida), sin esta
 * lectura inicial el indicador se quedaría clavado en "desconectado" para
 * siempre aunque el lector funcione (issue 4).
 *
 * @returns {{
 *   status: string,
 *   deviceState: string,
 *   firmwareVersion: (string|null),
 *   hmacEnabled: boolean,
 *   isReady: boolean
 * }}
 */
export function useWebSerialDeviceState() {
  const [status, setStatus] = useState(() => webSerialService.status);
  const [deviceState, setDeviceState] = useState(() => webSerialService.deviceState || 'unknown');
  const [firmwareVersion, setFirmwareVersion] = useState(() => webSerialService.firmwareVersion);
  const [hmacEnabled, setHmacEnabled] = useState(() => Boolean(webSerialService.hmacEnabled));

  const handleStatus = useCallback((payload) => {
    setStatus(payload?.status || 'disconnected');
  }, []);

  const handleDeviceStateChange = useCallback((payload) => {
    setDeviceState(payload?.state || 'unknown');
    if (payload?.firmwareVersion) {
      setFirmwareVersion(payload.firmwareVersion);
    }
    if (typeof payload?.hmacEnabled === 'boolean') {
      setHmacEnabled(payload.hmacEnabled);
    }
  }, []);

  useEffect(() => {
    // Re-sincronizar con el valor actual por si cambió entre el render inicial
    // y la ejecución del efecto (el singleton persiste entre navegaciones SPA).
    setStatus(webSerialService.status);
    setDeviceState(webSerialService.deviceState || 'unknown');
    setFirmwareVersion(webSerialService.firmwareVersion);
    setHmacEnabled(Boolean(webSerialService.hmacEnabled));

    webSerialService.on('status', handleStatus);
    webSerialService.on('device_state_change', handleDeviceStateChange);

    return () => {
      webSerialService.off('status', handleStatus);
      webSerialService.off('device_state_change', handleDeviceStateChange);
    };
  }, [handleStatus, handleDeviceStateChange]);

  return {
    status,
    deviceState,
    firmwareVersion,
    hmacEnabled,
    isReady: deviceState === 'ready'
  };
}

export default useWebSerialDeviceState;
