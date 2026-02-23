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
    iconClass: 'bg-slate-800 text-slate-500',
    dotClass: 'bg-slate-500',
    text: 'Desconectado',
  },
  initializing: {
    icon: Loader2,
    iconClass: 'bg-amber-500/20 text-amber-400',
    dotClass: 'bg-amber-400 animate-pulse',
    text: 'Esperando sensor RC522...',
  },
  ready: {
    icon: Wifi,
    iconClass: 'bg-emerald-500/20 text-emerald-400',
    dotClass: 'bg-emerald-500',
    text: 'Sensor activo',
  },
  error: {
    icon: XCircle,
    iconClass: 'bg-rose-500/20 text-rose-400',
    dotClass: 'bg-rose-500',
    text: 'Error: sensor no responde',
  },
  stale: {
    icon: AlertTriangle,
    iconClass: 'bg-amber-500/20 text-amber-400',
    dotClass: 'bg-amber-400',
    text: 'Sin señal del sensor',
  },
};

export default function RFIDConnector({
  className,
  onScan,
  showSensorId = true
}) {
  const [status, setStatus] = useState(webSerialService.status);
  const [deviceState, setDeviceState] = useState(webSerialService.deviceState || 'unknown');
  const [fwVersion, setFwVersion] = useState(webSerialService.firmwareVersion);
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(webSerialService.isSupported());
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
    try {
      if (!socketService.isSocketConnected()) {
        await socketService.connect();
      }
      await webSerialService.connect();
      await webSerialService.startReading();
    } catch (connectError) {
      showError(connectError?.message || 'No se pudo conectar al sensor');
    }
  };

  const handleDisconnect = async () => {
    await webSerialService.disconnect();
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
    <div className={cn('rounded-xl border bg-slate-900/50 p-4 transition-colors', {
      'border-emerald-500/20': visualState === 'ready',
      'border-amber-500/20': visualState === 'initializing' || visualState === 'stale',
      'border-rose-500/20': visualState === 'error',
      'border-white/10': visualState === 'unknown',
    }, className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', config.iconClass)}>
            <StateIcon size={20} className={isSpinning ? 'animate-spin' : ''} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">Sensor RFID</p>
              <span className={cn('w-2 h-2 rounded-full', config.dotClass)} />
            </div>
            <p className="text-xs text-slate-400">{displayText}</p>
          </div>
        </div>

        {isSupported ? (
          <button
            type="button"
            onClick={isPortOpen ? handleDisconnect : handleConnect}
            disabled={isReconnecting}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              isPortOpen
                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                : isReconnecting
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
            )}
          >
            {isPortOpen ? 'Desconectar' : isReconnecting ? 'Reconectando...' : 'Conectar'}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs text-amber-400">
            <AlertTriangle size={14} />
            Usa Chrome o Edge
          </div>
        )}
      </div>

      {showSensorId && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Usb size={14} />
          <span>SensorId: {webSerialService.sensorId}</span>
          {visualState === 'ready' && (
            <Activity size={12} className="ml-1 text-emerald-500" />
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300"
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
