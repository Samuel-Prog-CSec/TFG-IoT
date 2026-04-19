/**
 * @fileoverview Componente para la gestión visual del modo RFID activo.
 * Muestra el estado actual del lector RFID y permite cambios rápidos si es necesario.
 * 
 * @module components/game/RFIDModeHandler
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  WifiOff,
  Settings,
  Gamepad2,
  CreditCard,
  AlertCircle,
  Activity
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { webSerialService } from '../../services/webSerialService';
import GlassCard from '../ui/GlassCard';
import { useRfidMode } from '../../context/RfidModeContext';

const MODES_CONFIG = {
  idle: {
    label: 'Inactivo',
    icon: WifiOff,
    iconContainerClass: 'bg-background-surface/20 text-text-muted',
    description: 'El sensor no está procesando tarjetas'
  },
  gameplay: {
    label: 'Modo Juego',
    icon: Gamepad2,
    iconContainerClass: 'bg-success-base/20 text-success-base',
    description: 'Escaneando respuestas de los estudiantes'
  },
  card_assignment: {
    label: 'Asignación',
    icon: CreditCard,
    iconContainerClass: 'bg-brand-base/20 text-brand-base',
    description: 'Vinculando tarjetas a estudiantes'
  }
};

export default function RFIDModeHandler({ currentMode = 'idle', className }) {
  const { mode } = useRfidMode();
  const [, setStatus] = useState(webSerialService.status);
  const [deviceState, setDeviceState] = useState(webSerialService.deviceState || 'unknown');
  const [deviceHealth, setDeviceHealth] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const effectiveMode = mode || currentMode;
  const modeInfo = MODES_CONFIG[effectiveMode] || MODES_CONFIG.idle;
  const Icon = modeInfo.icon;

  useEffect(() => {
    const handleStatus = ({ status }) => setStatus(status);
    const handleDeviceStateChange = (payload) => setDeviceState(payload?.state || 'unknown');
    const handleDeviceStatus = (payload) => setDeviceHealth(payload);

    webSerialService.on('status', handleStatus);
    webSerialService.on('device_state_change', handleDeviceStateChange);
    webSerialService.on('device_status', handleDeviceStatus);

    return () => {
      webSerialService.off('status', handleStatus);
      webSerialService.off('device_state_change', handleDeviceStateChange);
      webSerialService.off('device_status', handleDeviceStatus);
    };
  }, []);

  const isConnected = deviceState === 'ready';
  // Mostrar expandido si está conectado, o si el usuario hizo click
  const showExpanded = isConnected || expanded;

  return (
    <div className={cn("fixed bottom-6 right-6 z-40 pointer-events-none", className)}>
      <AnimatePresence mode="wait">
        {showExpanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="pointer-events-auto"
          >
            <GlassCard className="p-4 shadow-2xl border-border-default overflow-hidden w-64">
              {/* Indicador de Conexión */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "size-2 rounded-full",
                    isConnected ? "bg-success-base animate-pulse" : "bg-error-base"
                  )} />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-text-muted">
                    {isConnected ? 'Sensor Conectado' : 'Sensor Desconectado'}
                  </span>
                </div>
                {!isConnected && (
                  <button
                    onClick={() => setExpanded(false)}
                    className="text-text-muted cursor-pointer hover:text-text-primary transition-colors"
                    aria-label="Minimizar widget RFID"
                  >
                    <Settings size={14} />
                  </button>
                )}
                {isConnected && (
                  <Settings size={14} className="text-text-muted cursor-pointer hover:text-text-primary transition-colors" />
                )}
              </div>

              {/* Estado del Modo */}
              <div className="flex items-start gap-3">
                <div className={cn(
                  "p-2 rounded-lg",
                  modeInfo.iconContainerClass
                )}>
                  <Icon size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-text-primary">
                    {modeInfo.label}
                  </h4>
                  <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                    {modeInfo.description}
                  </p>
                </div>
              </div>

              {!isConnected && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 pt-3 border-t border-border-subtle flex items-center gap-2 text-warning-base text-[10px]"
                >
                  <AlertCircle size={12} />
                  <span>Requiere conexión manual</span>
                </motion.div>
              )}

              {isConnected && deviceHealth && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 pt-3 border-t border-border-subtle flex items-center gap-3 text-[10px] text-text-muted"
                >
                  <Activity size={10} className="text-success-base" />
                  <span>Uptime: {Math.floor((deviceHealth.uptime || 0) / 1000)}s</span>
                  <span>·</span>
                  <span>Heap: {((deviceHealth.freeHeap || 0) / 1024).toFixed(1)}KB</span>
                </motion.div>
              )}
            </GlassCard>
          </motion.div>
        ) : (
          /* Widget colapsado: signature del producto — un "sensor" vivo con pulso radar
              que refuerza la naturaleza RFID de la plataforma. El anillo se expande
              desde el dot central como una onda de radio. */
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => setExpanded(true)}
            className="pointer-events-auto group relative flex items-center gap-2.5 pl-2.5 pr-3.5 py-2 rounded-full bg-background-elevated/85 border border-border-default backdrop-blur-md shadow-lg hover:border-brand-base/40 hover:bg-background-surface/80 transition-[border-color,background-color] duration-200 cursor-pointer"
            aria-label="Expandir widget RFID"
            title="Sensor RFID desconectado — click para expandir"
          >
            <span className="relative flex items-center justify-center size-5" aria-hidden="true">
              <motion.span
                className="absolute inset-0 rounded-full ring-2 ring-error-base/60"
                initial={{ scale: 0.6, opacity: 0.6 }}
                animate={{ scale: [0.6, 1.6], opacity: [0.6, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
              <motion.span
                className="absolute inset-0 rounded-full ring-2 ring-error-base/40"
                initial={{ scale: 0.6, opacity: 0.35 }}
                animate={{ scale: [0.6, 2.1], opacity: [0.35, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay: 0.55 }}
              />
              <span className="relative size-2 rounded-full bg-error-base shadow-[0_0_8px_var(--color-error-glow)]" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-text-secondary group-hover:text-text-primary transition-colors">RFID</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
