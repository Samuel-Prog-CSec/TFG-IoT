/**
 * @fileoverview Componente RFIDScannerPanel - Panel de escaneo RFID con animaciones premium
 * Incluye animación de ondas radar, efecto "card fly-in" al detectar,
 * partículas de confirmación y contador animado.
 * 
 * NOTA: Este componente integra Web Serial para escaneo real y deja simulacion para desarrollo.
 * 
 * @module components/ui/RFIDScannerPanel
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence, useSpring, useTransform, useReducedMotion } from 'framer-motion';
import { CreditCard, Wifi, WifiOff, Plus, Trash2, AlertCircle, Zap, LogOut } from 'lucide-react';
import { cn } from '../../lib/utils';
import { sameId } from '../../lib/entityId';
import { useConfetti } from '../../hooks/useConfetti';
import RFIDConnector from './RFIDConnector';
import webSerialService from '../../services/webSerialService';
import useWebSerialDeviceState from '../../hooks/useWebSerialDeviceState';

// Generar UID aleatorio para mock
const generateMockUid = () => {
  const chars = '0123456789ABCDEF';
  let uid = '';
  for (let i = 0; i < 8; i++) {
    // eslint-disable-next-line sonarjs/pseudo-random -- generacion de UID mock para modo simulacion, no requiere seguridad criptografica
    uid += chars[Math.floor(Math.random() * chars.length)];
  }
  return uid;
};

/**
 * @typedef {Object} ScannedCard
 * @property {string} uid - UID de la tarjeta
 * @property {string} [type] - Tipo de tarjeta (MIFARE_1KB, etc.)
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
const EMPTY_ARRAY = [];
const noop = () => {};

export default function RFIDScannerPanel({
  scannedCards = EMPTY_ARRAY,
  onCardScanned,
  onCardRemoved = noop,
  minCards = 2,
  maxCards = 20,
  allowDuplicates = false,
  showMockButton = true,
  availableCards = EMPTY_ARRAY, // Cartas reales disponibles para simular
  className,
}) {
  // Estado del lector desde la fuente única de verdad (issue 4): inicializa
  // leyendo el valor ACTUAL del singleton, no 'unknown'/'disconnected' fijos.
  const { status, deviceState } = useWebSerialDeviceState();
  const isScanning = status === 'reading';
  const [lastScanned, setLastScanned] = useState(null);
  const [cardRemovedUid, setCardRemovedUid] = useState(null);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();
  const { fireFromElement } = useConfetti();

  // Timers transitorios (reset de estados efímeros tras 1.5–3 s). Se registran
  // para cancelarlos al desmontar y evitar setState sobre componente desmontado
  // si el usuario sale del paso de escaneo dentro de esa ventana.
  const transientTimersRef = useRef(new Set());
  const scheduleTransient = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      transientTimersRef.current.delete(id);
      fn();
    }, ms);
    transientTimersRef.current.add(id);
  }, []);
  useEffect(() => {
    const timers = transientTimersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  // Contador animado
  const countSpring = useSpring(scannedCards.length, { stiffness: 300, damping: 30 });
  const displayCount = useTransform(countSpring, Math.round);

  useEffect(() => {
    countSpring.set(scannedCards.length);
  }, [scannedCards.length, countSpring]);

  // status/deviceState (e isScanning derivado) los aporta useWebSerialDeviceState.
  // Aquí solo escuchamos card_removed para la animación de retirada de tarjeta.
  useEffect(() => {
    const handleCardRemoved = (payload) => {
      if (payload?.uid) {
        setCardRemovedUid(payload.uid);
        scheduleTransient(() => setCardRemovedUid(null), 2000);
      }
    };

    webSerialService.on('card_removed', handleCardRemoved);
    return () => {
      webSerialService.off('card_removed', handleCardRemoved);
    };
  }, [scheduleTransient]);

  const handleCardAdded = useCallback((newCard) => {
    setLastScanned(newCard);
    onCardScanned(newCard);

    if (containerRef.current) {
      fireFromElement(containerRef.current, {
        particleCount: 15,
        spread: 40,
        scalar: 0.6,
        gravity: 0.8,
      });
    }

    scheduleTransient(() => setLastScanned(null), 1500);
  }, [onCardScanned, fireFromElement, scheduleTransient]);

  const handleRealScan = useCallback((payload) => {
    if (!payload?.uid) {
      return;
    }

    if (scannedCards.length >= maxCards) {
      setError(`Máximo de ${maxCards} tarjetas alcanzado`);
      scheduleTransient(() => setError(null), 3000);
      return;
    }

    if (!allowDuplicates && scannedCards.some(c => c.uid === payload.uid)) {
      setError('Esta tarjeta ya ha sido escaneada');
      scheduleTransient(() => setError(null), 3000);
      return;
    }

    const matchedCard = availableCards?.find(
      c => String(c.uid || '').toUpperCase() === payload.uid
    );

    if (availableCards?.length && !matchedCard) {
      setError('Tarjeta no registrada en el sistema');
      scheduleTransient(() => setError(null), 3000);
      return;
    }

    const newCard = matchedCard || {
      _id: `scan-${payload.uid}`,
      uid: payload.uid,
      type: payload.type || 'UNKNOWN',
      scannedAt: new Date()
    };

    handleCardAdded({
      ...newCard,
      scannedAt: new Date()
    });
  }, [allowDuplicates, availableCards, handleCardAdded, maxCards, scannedCards, scheduleTransient]);

  // Simular escaneo (mock para desarrollo)
  const handleMockScan = useCallback(() => {
    if (scannedCards.length >= maxCards) {
      setError(`Máximo de ${maxCards} tarjetas alcanzado`);
      scheduleTransient(() => setError(null), 3000);
      return;
    }

    let newCard;

    // Si tenemos cartas disponibles (pasadas desde el padre), usamos una de ellas
    if (availableCards && availableCards.length > 0) {
      // Filtrar las que ya están escaneadas
      const availableToScan = availableCards.filter((c) => {
        // Deduplicar por UID (huella fisica de la tarjeta, siempre presente) o,
        // en su defecto, por id de carta. `sameId` aporta las guardas de verdad
        // que evitan el falso positivo `undefined === undefined` que marcaria
        // TODAS las cartas como ya escaneadas si los DTO exponen `id` en lugar
        // de `_id`.
        return !scannedCards.some((sc) => sameId(sc, c) || (c.uid && sc.uid && c.uid === sc.uid));
      });

      if (availableToScan.length > 0) {
        // Seleccionar aleatoria
        // eslint-disable-next-line sonarjs/pseudo-random -- seleccion aleatoria de carta en modo simulacion, no requiere seguridad criptografica
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
        scheduleTransient(() => setError(null), 3000);
        return;
      }

      newCard = {
        _id: `mock-${uid}`, // ID temporal para evitar keys duplicadas o nulas
        uid,
        type: 'MIFARE_1KB',
        scannedAt: new Date(),
      };
    }

    handleCardAdded(newCard);
  }, [scannedCards, maxCards, allowDuplicates, availableCards, handleCardAdded, scheduleTransient]);

  // Eliminar tarjeta
  const handleRemoveCard = (uid) => {
    onCardRemoved(uid);
  };

  const isValid = scannedCards.length >= minCards && scannedCards.length <= maxCards;
  const isConnected = deviceState === 'ready';
  const progress = Math.min((scannedCards.length / minCards) * 100, 100);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Panel principal */}
      <div className="bg-background-elevated/40 backdrop-blur-xl rounded-2xl border border-border-default overflow-hidden">
        {/* Header con estado */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <motion.div
              className={cn(
                'size-10 rounded-xl flex items-center justify-center',
                isConnected ? 'bg-success-base/20' : 'bg-background-surface/50'
              )}
              animate={isScanning && !prefersReducedMotion ? {
                boxShadow: [
                  '0 0 0 0 rgba(16, 185, 129, 0)',
                  '0 0 0 8px rgba(16, 185, 129, 0.2)',
                  '0 0 0 0 rgba(16, 185, 129, 0)',
                ],
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {isConnected ? (
                <Wifi className="text-success-base" size={20} />
              ) : (
                <WifiOff className="text-text-muted" size={20} />
              )}
            </motion.div>
            <div>
              <h3 className="font-semibold text-text-primary">Escáner RFID</h3>
              <p className="text-xs text-text-muted">
                {(() => {
                  if (isConnected) return 'Esperando tarjetas...';
                  if (deviceState === 'initializing') return 'Conectando sensor...';
                  return 'Escáner desconectado';
                })()}
              </p>
            </div>
          </div>

          {/* Contador de tarjetas */}
          <div className="flex items-center gap-2">
            <motion.div
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-bold',
                isValid ? 'bg-success-base/20 text-success-base' : 'bg-warning-base/20 text-warning-base'
              )}
            >
              <motion.span>{displayCount}</motion.span>
              <span className="text-text-muted">/{maxCards}</span>
            </motion.div>
          </div>
        </div>

        <div className="px-4 pb-4">
          <RFIDConnector onScan={handleRealScan} />
        </div>

        {/* Área de escaneo con animación */}
        <div className="relative h-48 flex items-center justify-center overflow-hidden">
          {/* Ondas de radar */}
          <AnimatePresence>
            {isScanning && !prefersReducedMotion && (
              <>
                {Array.from({ length: 3 }, (_, i) => ({ id: `radar-wave-${i}`, delay: i * 0.6 })).map(wave => (
                  <motion.div
                    key={wave.id}
                    className="absolute size-32 rounded-full border-2 border-accent-indigo/30"
                    initial={{ scale: 0.5, opacity: 0.8 }}
                    animate={{
                      scale: [0.5, 2.5],
                      opacity: [0.6, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: wave.delay,
                      ease: 'easeOut',
                    }}
                  />
                ))}
              </>
            )}
          </AnimatePresence>

          {/* Icono central de tarjeta */}
          <motion.div
            className="relative z-10 size-20 rounded-2xl bg-gradient-to-br from-accent-indigo to-brand-base flex items-center justify-center shadow-2xl shadow-accent-indigo/40"
            animate={isScanning && !prefersReducedMotion ? {
              scale: [1, 1.05, 1],
              rotate: [0, 2, -2, 0],
            } : {}}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <CreditCard className="text-text-primary" size={36} />
            
            {/* Efecto de pulso */}
            {!prefersReducedMotion && (
              <motion.div
                className="absolute inset-0 rounded-2xl bg-border-default"
                animate={{
                  opacity: [0, 0.3, 0],
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                }}
              />
            )}
          </motion.div>

          {/* Animación de tarjeta escaneada */}
          <AnimatePresence>
            {lastScanned && (
              <motion.div
                className="absolute z-20 px-4 py-2 rounded-lg bg-success-base text-text-primary font-bold shadow-lg"
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
            className="absolute bottom-4 text-text-muted text-sm"
            animate={!prefersReducedMotion ? { opacity: [0.5, 1, 0.5] } : {}}
            transition={!prefersReducedMotion ? { duration: 2, repeat: Infinity } : undefined}
          >
            Acerca una tarjeta al lector
          </motion.p>

          {/* Notificación de tarjeta retirada */}
          <AnimatePresence>
            {cardRemovedUid && (
              <motion.div
                className="absolute z-20 bottom-12 px-3 py-1.5 rounded-lg bg-warning-base/20 border border-warning-base/30 text-warning-base text-xs font-medium"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="flex items-center gap-1.5">
                  <LogOut size={12} />
                  <span>Tarjeta retirada: {cardRemovedUid}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Barra de progreso */}
        <div className="px-4 py-2 bg-background-deep/50">
          <div className="flex items-center justify-between text-xs text-text-muted mb-1">
            <span>Progreso</span>
            <span>{Math.round(progress)}% (mín. {minCards} tarjetas)</span>
          </div>
          <div className="h-1.5 bg-background-elevated rounded-full overflow-hidden">
            <motion.div
              className={cn(
                'h-full rounded-full',
                isValid ? 'bg-success-base' : 'bg-warning-base'
              )}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Botón de simulación (solo desarrollo) */}
        {showMockButton && (
          <div className="p-4 border-t border-border-subtle">
            <motion.button
              onClick={handleMockScan}
              disabled={scannedCards.length >= maxCards}
              className={cn(
                'w-full py-3 rounded-xl font-medium transition-[color,background-color,box-shadow]',
                'flex items-center justify-center gap-2',
                scannedCards.length >= maxCards
                  ? 'bg-background-elevated text-text-muted cursor-not-allowed'
                  : 'bg-gradient-to-r from-accent-indigo to-brand-base text-text-primary hover:shadow-lg hover:shadow-accent-indigo/30'
              )}
              whileHover={scannedCards.length < maxCards ? { scale: 1.02 } : {}}
              whileTap={scannedCards.length < maxCards ? { scale: 0.98 } : {}}
            >
              <Plus size={18} />
              Simular Escaneo (Dev)
            </motion.button>
            <p className="text-nano text-text-muted text-center mt-2">
              Modo simulacion activo para pruebas locales
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
              className="absolute bottom-4 left-4 right-4 p-3 rounded-lg bg-error-base/20 border border-error-base/30 flex items-center gap-2 text-error-base text-sm"
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
          <h4 className="text-sm font-medium text-text-muted mb-2">
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
                  className="group relative flex items-center gap-2 p-2 rounded-lg bg-background-elevated/50 border border-border-subtle hover:border-accent-indigo/30 transition-colors"
                >
                  <div className="size-8 rounded-lg bg-accent-indigo/20 flex items-center justify-center text-accent-indigo text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-text-primary truncate">
                      {card.uid}
                    </p>
                    <p className="text-nano text-text-muted">
                      {card.type || 'RFID'}
                    </p>
                  </div>
                  <motion.button
                    onClick={() => handleRemoveCard(card.uid)}
                    aria-label={`Eliminar tarjeta ${card.uid}`}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-error-base/20 text-error-base hover:bg-error-base/30 transition-[opacity,background-color]"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Trash2 size={12} aria-hidden="true" />
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
          'size-2 rounded-full',
          isConnected ? 'bg-success-base' : 'bg-text-disabled'
        )}
        animate={isConnected ? {
          scale: [1, 1.3, 1],
          opacity: [1, 0.7, 1],
        } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <span className="text-xs text-text-muted">
        {isConnected ? `${cardCount} tarjetas` : 'Desconectado'}
      </span>
    </div>
  );
}

RFIDScannerPanel.propTypes = {
  scannedCards: PropTypes.arrayOf(
    PropTypes.shape({
      uid: PropTypes.string.isRequired,
      type: PropTypes.string,
      scannedAt: PropTypes.instanceOf(Date)
    })
  ),
  onCardScanned: PropTypes.func.isRequired,
  onCardRemoved: PropTypes.func,
  minCards: PropTypes.number,
  maxCards: PropTypes.number,
  allowDuplicates: PropTypes.bool,
  showMockButton: PropTypes.bool,
  availableCards: PropTypes.arrayOf(PropTypes.object),
  className: PropTypes.string
};

RFIDScannerMini.propTypes = {
  isConnected: PropTypes.bool,
  cardCount: PropTypes.number,
  className: PropTypes.string
};
