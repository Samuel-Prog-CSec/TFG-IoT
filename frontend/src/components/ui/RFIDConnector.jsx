/**
 * @fileoverview Panel de conexion para Web Serial RFID.
 * Muestra el estado REAL del sensor RC522, no solo el del puerto serial.
 *
 * @module components/ui/RFIDConnector
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Wifi, WifiOff, Usb, AlertTriangle, Loader2, Activity, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import webSerialService from '../../services/webSerialService';
import { socketService } from '../../services/socket';

/**
 * Configuración visual por estado del dispositivo RC522.
 * `deviceState` refleja el hardware real, no solo el puerto USB.
 */
const DEVICE_STATE_CONFIG = {
  unknown: {
    icon: WifiOff,
    iconClass: 'bg-background-surface text-text-disabled',
    dotClass: 'bg-text-disabled',
    text: 'Desconectado',
  },
  initializing: {
    icon: Loader2,
    iconClass: 'bg-warning-base/20 text-warning-base',
    dotClass: 'bg-warning-base animate-pulse',
    text: 'Esperando sensor RC522...',
  },
  ready: {
    icon: Wifi,
    iconClass: 'bg-success-base/20 text-success-base',
    dotClass: 'bg-success-base',
    text: 'Sensor activo',
  },
  error: {
    icon: XCircle,
    iconClass: 'bg-error-base/20 text-error-base',
    dotClass: 'bg-error-base',
    text: 'Error: sensor no responde',
  },
  stale: {
    icon: AlertTriangle,
    iconClass: 'bg-warning-base/20 text-warning-base',
    dotClass: 'bg-warning-base',
    text: 'Sin señal del sensor',
  },
};

/**
 * Lee la info del puerto USB (vendor/product ID) si la API lo soporta.
 * Útil para mostrar al profesor cuál dispositivo se ha conectado y
 * confirmar que es el sensor correcto.
 *
 * @param {SerialPort|null} port
 * @returns {{ usbVendorId: string|null, usbProductId: string|null }}
 */
const readPortInfo = (port) => {
  try {
    const info = port?.getInfo?.();
    return {
      usbVendorId: info?.usbVendorId
        ? info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')
        : null,
      usbProductId: info?.usbProductId
        ? info.usbProductId.toString(16).toUpperCase().padStart(4, '0')
        : null
    };
  } catch {
    return { usbVendorId: null, usbProductId: null };
  }
};

export default function RFIDConnector({
  className,
  onScan,
  // El SensorId (UUID) y los IDs USB son jerga técnica para el docente; ocultos
  // por defecto. Solo se muestran si un consumidor de depuración pide `true`
  // explícitamente (QA 2026-06-04; GameSession ya lo ocultaba).
  showSensorId = false
}) {
  const [status, setStatus] = useState(webSerialService.status);
  const [deviceState, setDeviceState] = useState(webSerialService.deviceState || 'unknown');
  const [fwVersion, setFwVersion] = useState(webSerialService.firmwareVersion);
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(() => webSerialService.isSupported());
  const [hasAttempted, setHasAttempted] = useState(false);
  const [portInfo, setPortInfo] = useState({ usbVendorId: null, usbProductId: null });
  const errorTimeoutRef = useRef(null);

  const handleStatus = useCallback((payload) => {
    setStatus(payload?.status || 'disconnected');
  }, []);

  const handleDeviceStateChange = useCallback((payload) => {
    setDeviceState(payload?.state || 'unknown');
    if (payload?.firmwareVersion) {
      setFwVersion(payload.firmwareVersion);
    }
  }, []);

  const handleScan = useCallback((payload) => {
    if (onScan) {
      onScan(payload);
    }
  }, [onScan]);

  const showError = useCallback((message, durationMs = 4000) => {
    if (errorTimeoutRef.current) {
      globalThis.clearTimeout(errorTimeoutRef.current);
    }
    setError(message);
    errorTimeoutRef.current = globalThis.setTimeout(() => {
      setError(null);
      errorTimeoutRef.current = null;
    }, durationMs);
  }, []);

  const handleError = useCallback((payload) => {
    showError(payload?.message || 'Error desconocido');
  }, [showError]);

  const handleDeviceError = useCallback((payload) => {
    showError(
      payload?.message || `Error de dispositivo: ${payload?.type || 'desconocido'}`,
      5000
    );
  }, [showError]);

  useEffect(() => {
    setIsSupported(webSerialService.isSupported());
    webSerialService.on('status', handleStatus);
    webSerialService.on('device_state_change', handleDeviceStateChange);
    webSerialService.on('scan', handleScan);
    webSerialService.on('error', handleError);
    webSerialService.on('device_error', handleDeviceError);

    return () => {
      webSerialService.off('status', handleStatus);
      webSerialService.off('device_state_change', handleDeviceStateChange);
      webSerialService.off('scan', handleScan);
      webSerialService.off('error', handleError);
      webSerialService.off('device_error', handleDeviceError);
      if (errorTimeoutRef.current) {
        globalThis.clearTimeout(errorTimeoutRef.current);
      }
    };
  }, [handleStatus, handleDeviceStateChange, handleScan, handleError, handleDeviceError]);

  const handleConnect = async () => {
    setHasAttempted(true);
    try {
      // Asegurar AMBOS namespaces: isSocketConnected() solo mira el socket de
      // sistema, pero los scans RFID se reenvían por el namespace /game. Si
      // /game cayó de forma aislada con el de sistema aún arriba, sin comprobar
      // isGameSocketConnected() se saltaba el connect() y no se reconectaba
      // /game (los scans quedaban encolados hasta la auto-reconexión). connect()
      // es idempotente. Misma corrección que useGameSocket (gate dual).
      if (!socketService.isSocketConnected() || !socketService.isGameSocketConnected()) {
        await socketService.connect();
      }
      await webSerialService.connect();
      // Capturar info del dispositivo USB para mostrar al profesor.
      setPortInfo(readPortInfo(webSerialService.port));
      await webSerialService.startReading();
    } catch (connectError) {
      showError(connectError?.message || 'No se pudo conectar al sensor');
    }
  };

  const handleDisconnect = async () => {
    await webSerialService.disconnect();
    setPortInfo({ usbVendorId: null, usbProductId: null });
  };

  // Derivar estado visual
  const isPortOpen = status === 'connected' || status === 'reading';
  const isReconnecting = status === 'reconnecting';

  let visualState = deviceState;
  if (!isPortOpen && !isReconnecting) {
    visualState = 'unknown';
  } else if (isReconnecting) {
    visualState = 'initializing';
  }

  const config = DEVICE_STATE_CONFIG[visualState] || DEVICE_STATE_CONFIG.unknown;
  const StateIcon = config.icon;
  const isSpinning = visualState === 'initializing';

  // Texto enriquecido
  let displayText = config.text;
  if (visualState === 'ready' && fwVersion) {
    displayText = `Sensor activo · FW ${fwVersion}`;
  } else if (isReconnecting) {
    displayText = 'Reconectando...';
  } else if (!isSupported) {
    displayText = 'Web Serial no soportado';
  }

  return (
    <div className={cn('rounded-xl border bg-background-elevated/50 p-4 transition-colors', {
      'border-success-base/20': visualState === 'ready',
      'border-warning-base/20': visualState === 'initializing' || visualState === 'stale',
      'border-error-base/20': visualState === 'error',
      'border-border-default': visualState === 'unknown',
    }, className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', config.iconClass)}>
            <StateIcon size={20} className={isSpinning ? 'animate-spin' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-text-primary">Sensor RFID</p>
              <span className={cn('size-2 rounded-full', config.dotClass)} />
            </div>
            <p className="text-xs text-text-muted">{displayText}</p>
          </div>
        </div>

        {isSupported ? (
          <button
            type="button"
            onClick={isPortOpen ? handleDisconnect : handleConnect}
            disabled={isReconnecting}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
              (() => {
                if (isPortOpen) return 'bg-error-base/20 text-error-base hover:bg-error-base/30';
                if (isReconnecting) return 'bg-background-surface text-text-disabled cursor-not-allowed';
                return 'bg-accent-indigo/20 text-accent-indigo hover:bg-accent-indigo/30';
              })()
            )}
          >
            {(() => {
              if (isPortOpen) return 'Desconectar';
              if (isReconnecting) return 'Reconectando...';
              return hasAttempted ? 'Reintentar conexión' : 'Conectar';
            })()}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs text-warning-base">
            <AlertTriangle size={14} />
            Usa Chrome o Edge
          </div>
        )}
      </div>

      {showSensorId && (
        <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
          <Usb size={14} />
          <span>SensorId: {webSerialService.sensorId}</span>
          {portInfo.usbVendorId && (
            <span className="ml-2 rounded bg-background-surface px-1.5 py-0.5 font-mono text-nano text-text-secondary">
              USB {portInfo.usbVendorId}:{portInfo.usbProductId || '????'}
            </span>
          )}
          {visualState === 'ready' && (
            <Activity size={12} className="ml-1 text-success-base" />
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mt-3 rounded-lg border border-error-base/30 bg-error-base/10 px-3 py-2 text-xs text-error-base"
        >
          {error}
        </div>
      )}
    </div>
  );
}

RFIDConnector.propTypes = {
  className: PropTypes.string,
  onScan: PropTypes.func,
  showSensorId: PropTypes.bool
};
