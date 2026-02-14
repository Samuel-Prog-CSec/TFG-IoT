/**
 * @fileoverview Panel de conexion para Web Serial RFID.
 *
 * @module components/ui/RFIDConnector
 */

import { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Wifi, WifiOff, Usb, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import webSerialService from '../../services/webSerialService';
import { socketService } from '../../services/socket';

export default function RFIDConnector({
  className,
  onScan,
  showSensorId = true
}) {
  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(webSerialService.isSupported());

  const handleStatus = useCallback((payload) => {
    setStatus(payload?.status || 'disconnected');
  }, []);

  const handleScan = useCallback((payload) => {
    if (onScan) {
      onScan(payload);
    }
  }, [onScan]);

  const handleError = useCallback((payload) => {
    setError(payload?.message || 'Error desconocido');
    setTimeout(() => setError(null), 4000);
  }, []);

  useEffect(() => {
    setIsSupported(webSerialService.isSupported());
    webSerialService.on('status', handleStatus);
    webSerialService.on('scan', handleScan);
    webSerialService.on('error', handleError);

    return () => {
      webSerialService.off('status', handleStatus);
      webSerialService.off('scan', handleScan);
      webSerialService.off('error', handleError);
      webSerialService.stopReading();
    };
  }, [handleStatus, handleScan, handleError]);

  const handleConnect = async () => {
    try {
      if (!socketService.isSocketConnected()) {
        await socketService.connect();
      }
      await webSerialService.connect();
      await webSerialService.startReading();
    } catch (connectError) {
      setError(connectError?.message || 'No se pudo conectar al sensor');
    }
  };

  const handleDisconnect = async () => {
    await webSerialService.disconnect();
  };

  const isReading = status === 'reading';
  const isConnected = status === 'connected' || status === 'reading';
  let statusText = 'Desconectado';
  if (!isSupported) {
    statusText = 'Web Serial no soportado';
  } else if (isReading) {
    statusText = 'Leyendo tarjeta...';
  } else if (isConnected) {
    statusText = 'Conectado';
  }

  return (
    <div className={cn('rounded-xl border border-white/10 bg-slate-900/50 p-4', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'h-10 w-10 rounded-xl flex items-center justify-center',
              isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
            )}
          >
            {isConnected ? <Wifi size={20} /> : <WifiOff size={20} />}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Sensor RFID</p>
            <p className="text-xs text-slate-400">{statusText}</p>
          </div>
        </div>

        {isSupported ? (
          <button
            type="button"
            onClick={isConnected ? handleDisconnect : handleConnect}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-semibold transition-all',
              isConnected
                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                : 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
            )}
          >
            {isConnected ? 'Desconectar' : 'Conectar'}
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
