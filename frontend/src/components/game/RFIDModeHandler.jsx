/**
 * @fileoverview Componente para la gestión visual del modo RFID activo.
 * Muestra el estado actual del lector RFID y permite cambios rápidos si es necesario.
 * 
 * @module components/game/RFIDModeHandler
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wifi, 
  WifiOff, 
  Settings, 
  Gamepad2, 
  UserPlus, 
  CreditCard,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { webSerialService } from '../../services/webSerialService';
import { GlassCard } from '../ui';

const MODES_CONFIG = {
  idle: {
    label: 'Inactivo',
    icon: WifiOff,
    color: 'slate',
    description: 'El sensor no está procesando tarjetas'
  },
  gameplay: {
    label: 'Modo Juego',
    icon: Gamepad2,
    color: 'emerald',
    description: 'Escaneando respuestas de los estudiantes'
  },
  card_registration: {
    label: 'Registro',
    icon: UserPlus,
    color: 'blue',
    description: 'Registrando nuevas tarjetas en el sistema'
  },
  card_assignment: {
    label: 'Asignación',
    icon: CreditCard,
    color: 'purple',
    description: 'Vinculando tarjetas a estudiantes'
  }
};

export default function RFIDModeHandler({ currentMode = 'idle', className }) {
  const [status, setStatus] = useState(webSerialService.status);
  const modeInfo = MODES_CONFIG[currentMode] || MODES_CONFIG.idle;
  const Icon = modeInfo.icon;

  useEffect(() => {
    const handleStatus = ({ status }) => setStatus(status);
    webSerialService.on('status', handleStatus);
    return () => webSerialService.off('status', handleStatus);
  }, []);

  const isConnected = status !== 'disconnected' && status !== 'unsupported';

  return (
    <div className={cn("fixed bottom-6 right-6 z-50", className)}>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
        >
          <GlassCard className="p-4 shadow-2xl border-white/10 overflow-hidden w-64">
            {/* Indicador de Conexión */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                )} />
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  {isConnected ? 'Sensor Conectado' : 'Sensor Desconectado'}
                </span>
              </div>
              <Settings size={14} className="text-slate-500 cursor-pointer hover:text-white transition-colors" />
            </div>

            {/* Estado del Modo */}
            <div className="flex items-start gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                `bg-${modeInfo.color}-500/20 text-${modeInfo.color}-400`
              )}>
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-white">
                  {modeInfo.label}
                </h4>
                <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                  {modeInfo.description}
                </p>
              </div>
            </div>

            {!isConnected && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-amber-500 text-[10px]"
              >
                <AlertCircle size={12} />
                <span>Requiere conexión manual</span>
              </motion.div>
            )}
          </GlassCard>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
