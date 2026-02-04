/**
 * @fileoverview Componente RFIDScannerPanel - Panel de escaneo RFID con animaciones premium
 * Incluye animación de ondas radar, efecto "card fly-in" al detectar,
 * partículas de confirmación y contador animado.
 * 
 * NOTA: Este componente usa mock/simulación hasta que se complete T-044 (Web Serial API).
 * Una vez completada T-044, integrar eventos WebSocket 'rfid_event' reales.
 * 
 * @module components/ui/RFIDScannerPanel
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { CreditCard, Wifi, WifiOff, Plus, Trash2, AlertCircle, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import confetti from 'canvas-confetti';

// Generar UID aleatorio para mock
const generateMockUid = () => {
  const chars = '0123456789ABCDEF';
  let uid = '';
  for (let i = 0; i < 8; i++) {
    uid += chars[Math.floor(Math.random() * chars.length)];
  }
  return uid;
};

/**
 * @typedef {Object} ScannedCard
 * @property {string} uid - UID de la tarjeta
 * @property {string} [type] - Tipo de tarjeta (MIFARE_1KB, etc.)
 * @property {string} [cardId] - ID en base de datos (si existe)
 * @property {Date} scannedAt - Fecha/hora del escaneo
 */

/**
 * RFIDScannerPanel - Panel de escaneo RFID con animaciones
 * 
 * @param {Object} props
 * @param {ScannedCard[]} props.scannedCards - Lista de tarjetas escaneadas
 * @param {Function} props.onCardScanned - Callback cuando se escanea una tarjeta
 * @param {Function} props.onCardRemoved - Callback cuando se elimina una tarjeta
 * @param {number} [props.minCards=2] - Mínimo de tarjetas requeridas
 * @param {number} [props.maxCards=20] - Máximo de tarjetas permitidas
 * @param {boolean} [props.allowDuplicates=false] - Permitir tarjetas duplicadas
 * @param {boolean} [props.showMockButton=true] - Mostrar botón de simulación (desarrollo)
 * @param {string} [props.className] - Clases adicionales
 * 
 * @example
 * ```jsx
 * <RFIDScannerPanel
 *   scannedCards={cards}
 *   onCardScanned={(card) => setCards(prev => [...prev, card])}
 *   onCardRemoved={(uid) => setCards(prev => prev.filter(c => c.uid !== uid))}
 *   minCards={2}
 *   maxCards={20}
 * />
 * ```
 */
export default function RFIDScannerPanel({
  scannedCards = [],
  onCardScanned,
  onCardRemoved,
  minCards = 2,
  maxCards = 20,
  allowDuplicates = false,
  showMockButton = true,
  availableCards = [], // Cartas reales disponibles para simular
  className,
}) {
  const [isScanning, setIsScanning] = useState(true);
  const [lastScanned, setLastScanned] = useState(null);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);

  // Contador animado
  const countSpring = useSpring(scannedCards.length, { stiffness: 300, damping: 30 });
  const displayCount = useTransform(countSpring, Math.round);

  useEffect(() => {
    countSpring.set(scannedCards.length);
  }, [scannedCards.length, countSpring]);

  // Simular escaneo (mock para desarrollo)
  const handleMockScan = useCallback(() => {
    if (scannedCards.length >= maxCards) {
      setError(`Máximo de ${maxCards} tarjetas alcanzado`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    let newCard;

    // Si tenemos cartas disponibles (pasadas desde el padre), usamos una de ellas
    if (availableCards && availableCards.length > 0) {
      // Filtrar las que ya están escaneadas
      const availableToScan = availableCards.filter(
        c => !scannedCards.some(sc => sc._id === c._id || sc.uid === c.uid)
      );

      if (availableToScan.length > 0) {
        // Seleccionar aleatoria
        const randomCard = availableToScan[Math.floor(Math.random() * availableToScan.length)];
        newCard = {
          ...randomCard,
          scannedAt: new Date()
        };
      }
    }

    // Si no encontramos carta real, generamos mock
    if (!newCard) {
      const uid = generateMockUid();
      
      // Verificar duplicados
      if (!allowDuplicates && scannedCards.some(c => c.uid === uid)) {
        setError('Esta tarjeta ya ha sido escaneada');
        setTimeout(() => setError(null), 3000);
        return;
      }

      newCard = {
        _id: `mock-${uid}`, // ID temporal para evitar keys duplicadas o nulas
        uid,
        type: 'MIFARE_1KB',
        scannedAt: new Date(),
      };
    }

    setLastScanned(newCard);
    onCardScanned(newCard);

    // Mini confetti al escanear
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      confetti({
        particleCount: 15,
        spread: 40,
        origin: {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + 100) / window.innerHeight,
        },
        colors: ['#6366f1', '#8b5cf6', '#a855f7'],
        scalar: 0.6,
        gravity: 0.8,
      });
    }

    // Limpiar animación de última escaneada
    setTimeout(() => setLastScanned(null), 1500);
  }, [scannedCards, maxCards, allowDuplicates, onCardScanned, availableCards]);

  // Eliminar tarjeta
  const handleRemoveCard = (uid) => {
    onCardRemoved(uid);
  };

  const isValid = scannedCards.length >= minCards && scannedCards.length <= maxCards;
  const progress = Math.min((scannedCards.length / minCards) * 100, 100);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Panel principal */}
      <div className="bg-slate-800/40 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
        {/* Header con estado */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <motion.div
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                isScanning ? 'bg-emerald-500/20' : 'bg-slate-700/50'
              )}
              animate={isScanning ? {
                boxShadow: [
                  '0 0 0 0 rgba(16, 185, 129, 0)',
                  '0 0 0 8px rgba(16, 185, 129, 0.2)',
                  '0 0 0 0 rgba(16, 185, 129, 0)',
                ],
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {isScanning ? (
                <Wifi className="text-emerald-400" size={20} />
              ) : (
                <WifiOff className="text-slate-500" size={20} />
              )}
            </motion.div>
            <div>
              <h3 className="font-semibold text-white">Escáner RFID</h3>
              <p className="text-xs text-slate-500">
                {isScanning ? 'Esperando tarjetas...' : 'Escáner pausado'}
              </p>
            </div>
          </div>

          {/* Contador de tarjetas */}
          <div className="flex items-center gap-2">
            <motion.div
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-bold',
                isValid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              )}
            >
              <motion.span>{displayCount}</motion.span>
              <span className="text-slate-500">/{maxCards}</span>
            </motion.div>
          </div>
        </div>

        {/* Área de escaneo con animación */}
        <div className="relative h-48 flex items-center justify-center overflow-hidden">
          {/* Ondas de radar */}
          <AnimatePresence>
            {isScanning && (
              <>
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-32 h-32 rounded-full border-2 border-indigo-500/30"
                    initial={{ scale: 0.5, opacity: 0.8 }}
                    animate={{
                      scale: [0.5, 2.5],
                      opacity: [0.6, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.6,
                      ease: 'easeOut',
                    }}
                  />
                ))}
              </>
            )}
          </AnimatePresence>

          {/* Icono central de tarjeta */}
          <motion.div
            className="relative z-10 w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-500/40"
            animate={isScanning ? {
              scale: [1, 1.05, 1],
              rotate: [0, 2, -2, 0],
            } : {}}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <CreditCard className="text-white" size={36} />
            
            {/* Efecto de pulso */}
            <motion.div
              className="absolute inset-0 rounded-2xl bg-white/20"
              animate={{
                opacity: [0, 0.3, 0],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
              }}
            />
          </motion.div>

          {/* Animación de tarjeta escaneada */}
          <AnimatePresence>
            {lastScanned && (
              <motion.div
                className="absolute z-20 px-4 py-2 rounded-lg bg-emerald-500 text-white font-bold shadow-lg"
                initial={{ y: 50, opacity: 0, scale: 0.8 }}
                animate={{ y: -40, opacity: 1, scale: 1 }}
                exit={{ y: -80, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <div className="flex items-center gap-2">
                  <Zap size={16} />
                  <span>{lastScanned.uid}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mensaje de instrucción */}
          <motion.p
            className="absolute bottom-4 text-slate-500 text-sm"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Acerca una tarjeta al lector
          </motion.p>
        </div>

        {/* Barra de progreso */}
        <div className="px-4 py-2 bg-slate-900/50">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Progreso</span>
            <span>{Math.round(progress)}% (mín. {minCards} tarjetas)</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                isValid ? 'bg-emerald-500' : 'bg-amber-500'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Botón de simulación (solo desarrollo) */}
        {showMockButton && (
          <div className="p-4 border-t border-white/5">
            <motion.button
              onClick={handleMockScan}
              disabled={scannedCards.length >= maxCards}
              className={cn(
                'w-full py-3 rounded-xl font-medium transition-all',
                'flex items-center justify-center gap-2',
                scannedCards.length >= maxCards
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:shadow-lg hover:shadow-indigo-500/30'
              )}
              whileHover={scannedCards.length < maxCards ? { scale: 1.02 } : {}}
              whileTap={scannedCards.length < maxCards ? { scale: 0.98 } : {}}
            >
              <Plus size={18} />
              Simular Escaneo (Dev)
            </motion.button>
            <p className="text-[10px] text-slate-600 text-center mt-2">
              ⚠️ Mock activo - T-044 pendiente para escaneo real
            </p>
          </div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-4 left-4 right-4 p-3 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center gap-2 text-rose-400 text-sm"
            >
              <AlertCircle size={16} />
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Lista de tarjetas escaneadas */}
      {scannedCards.length > 0 && (
        <motion.div
          className="mt-4 space-y-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <h4 className="text-sm font-medium text-slate-400 mb-2">
            Tarjetas escaneadas ({scannedCards.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            <AnimatePresence mode="popLayout">
              {scannedCards.map((card, index) => (
                <motion.div
                  key={card.uid}
                  layout
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: -20 }}
                  transition={{ 
                    type: 'spring', 
                    stiffness: 400, 
                    damping: 25,
                    delay: index * 0.05 
                  }}
                  className="group relative flex items-center gap-2 p-2 rounded-lg bg-slate-800/50 border border-white/5 hover:border-indigo-500/30 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-white truncate">
                      {card.uid}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {card.type || 'RFID'}
                    </p>
                  </div>
                  <motion.button
                    onClick={() => handleRemoveCard(card.uid)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-all"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Trash2 size={12} />
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * RFIDScannerMini - Versión mini para mostrar en headers o sidebars
 */
export function RFIDScannerMini({ isConnected = false, cardCount = 0, className }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <motion.div
        className={cn(
          'w-2 h-2 rounded-full',
          isConnected ? 'bg-emerald-500' : 'bg-slate-600'
        )}
        animate={isConnected ? {
          scale: [1, 1.3, 1],
          opacity: [1, 0.7, 1],
        } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <span className="text-xs text-slate-400">
        {isConnected ? `${cardCount} tarjetas` : 'Desconectado'}
      </span>
    </div>
  );
}
