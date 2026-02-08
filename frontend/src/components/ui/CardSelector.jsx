/**
 * @fileoverview Componente CardSelector - Selector manual de tarjetas RFID
 * Alternativa al escaneo para seleccionar tarjetas existentes en el sistema.
 * Incluye checkboxes animados, drag-to-select y chips con efecto bounce.
 * 
 * @module components/ui/CardSelector
 */

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CreditCard, Check, X, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * @typedef {Object} Card
 * @property {string} _id - ID de la tarjeta
 * @property {string} uid - UID de la tarjeta RFID
 * @property {string} [type] - Tipo de tarjeta
 * @property {string} [status] - Estado (active, inactive)
 * @property {Object} [metadata] - Metadatos adicionales
 */

/**
 * CardSelector - Selector manual de tarjetas con animaciones premium
 * 
 * @param {Object} props
 * @param {Card[]} props.cards - Lista de tarjetas disponibles
 * @param {string[]} props.selectedCardIds - IDs de tarjetas seleccionadas
 * @param {Function} props.onSelectionChange - Callback al cambiar selección
 * @param {number} [props.minCards=2] - Mínimo de tarjetas requeridas
 * @param {number} [props.maxCards=20] - Máximo de tarjetas permitidas
 * @param {boolean} [props.showSearch=true] - Mostrar barra de búsqueda
 * @param {boolean} [props.loading=false] - Estado de carga
 * @param {string} [props.className] - Clases adicionales
 * 
 * @example
 * ```jsx
 * <CardSelector
 *   cards={availableCards}
 *   selectedCardIds={selectedIds}
 *   onSelectionChange={(ids) => setSelectedIds(ids)}
 *   minCards={2}
 *   maxCards={20}
 * />
 * ```
 */
export default function CardSelector({
  cards = [],
  selectedCardIds = [],
  onSelectionChange,
  minCards = 2,
  maxCards = 20,
  showSearch = true,
  loading = false,
  className,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Convertir selectedCardIds a Set para búsqueda O(1)
  const selectedSet = useMemo(() => new Set(selectedCardIds), [selectedCardIds]);

  // Filtrar tarjetas por búsqueda
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return cards;
    const query = searchQuery.toLowerCase();
    return cards.filter(card => 
      card.uid?.toLowerCase().includes(query) ||
      card.type?.toLowerCase().includes(query)
    );
  }, [cards, searchQuery]);

  // Toggle selección de tarjeta
  const toggleCard = useCallback((cardId) => {
    const newSelection = selectedSet.has(cardId)
      ? selectedCardIds.filter(id => id !== cardId)
      : [...selectedCardIds, cardId];
    
    // Validar límite máximo
    if (newSelection.length > maxCards) return;
    
    onSelectionChange(newSelection);
  }, [selectedCardIds, selectedSet, maxCards, onSelectionChange]);

  // Seleccionar todas las visibles
  const selectAll = () => {
    const newIds = filteredCards
      .map(c => c._id)
      .filter(id => !selectedSet.has(id))
      .slice(0, maxCards - selectedCardIds.length);
    onSelectionChange([...selectedCardIds, ...newIds]);
  };

  // Deseleccionar todas
  const deselectAll = () => {
    const filteredIds = new Set(filteredCards.map(c => c._id));
    onSelectionChange(selectedCardIds.filter(id => !filteredIds.has(id)));
  };

  const isValid = selectedCardIds.length >= minCards && selectedCardIds.length <= maxCards;

  // Variantes de animación
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.02 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header con búsqueda y acciones */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Búsqueda */}
        {showSearch && (
          <div className="relative flex-1">
            <Search 
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" 
              size={18} 
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por UID..."
              className={cn(
                'w-full pl-10 pr-4 py-2.5 rounded-xl',
                'bg-slate-800/50 border border-white/10',
                'text-white placeholder-slate-500 text-sm',
                'focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20',
                'transition-all duration-300'
              )}
            />
          </div>
        )}

        {/* Acciones rápidas */}
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            disabled={selectedCardIds.length >= maxCards}
            className="px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 text-xs font-medium hover:bg-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Seleccionar todo
          </button>
          <button
            onClick={deselectAll}
            disabled={selectedCardIds.length === 0}
            className="px-3 py-2 rounded-lg bg-slate-700/50 text-slate-400 text-xs font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Chips de selección */}
      <AnimatePresence>
        {selectedCardIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-800/30 border border-white/5"
          >
            {selectedCardIds.map((cardId, index) => {
              const card = cards.find(c => c._id === cardId);
              if (!card) return null;

              return (
                <motion.span
                  key={cardId}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ 
                    type: 'spring',
                    stiffness: 500,
                    damping: 25,
                  }}
                  className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs"
                >
                  <span className="font-mono">{card.uid}</span>
                  <button
                    onClick={() => toggleCard(cardId)}
                    className="p-0.5 rounded-full hover:bg-indigo-500/30 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </motion.span>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista de tarjetas */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-slate-800/50 animate-pulse" />
          ))}
        </div>
      ) : filteredCards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-12 text-slate-500"
        >
          <CreditCard size={48} className="mb-4 opacity-50" />
          <p className="text-sm">
            {cards.length === 0 
              ? 'No hay tarjetas disponibles' 
              : 'No se encontraron tarjetas'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 text-indigo-400 hover:text-indigo-300 text-sm"
            >
              Limpiar búsqueda
            </button>
          )}
        </motion.div>
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {filteredCards.map((card) => {
            const isSelected = selectedSet.has(card._id);
            const isDisabled = !isSelected && selectedCardIds.length >= maxCards;

            return (
              <motion.button
                key={card._id}
                variants={itemVariants}
                onClick={() => !isDisabled && toggleCard(card._id)}
                disabled={isDisabled}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                  isSelected && [
                    'bg-indigo-500/15 border-indigo-500/50',
                  ],
                  !isSelected && !isDisabled && [
                    'bg-slate-800/30 border-white/5',
                    'hover:bg-slate-800/50 hover:border-indigo-500/30',
                  ],
                  isDisabled && 'opacity-40 cursor-not-allowed'
                )}
                whileHover={!isDisabled ? { scale: 1.01 } : {}}
                whileTap={!isDisabled ? { scale: 0.99 } : {}}
              >
                {/* Checkbox animado */}
                <div className={cn(
                  'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                  isSelected 
                    ? 'bg-indigo-500 border-indigo-500' 
                    : 'border-slate-600'
                )}>
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 90 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      >
                        <Check size={12} className="text-white" strokeWidth={3} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Icono de tarjeta */}
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  isSelected ? 'bg-indigo-500/20' : 'bg-slate-800'
                )}>
                  <CreditCard size={16} className={isSelected ? 'text-indigo-400' : 'text-slate-500'} />
                </div>

                {/* Info de la tarjeta */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'font-mono text-sm truncate',
                    isSelected ? 'text-white' : 'text-slate-300'
                  )}>
                    {card.uid}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {card.type || 'RFID'} • {card.status === 'active' ? 'Activa' : 'Inactiva'}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {/* Footer con contador y validación */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm font-medium',
            isValid ? 'text-emerald-400' : 'text-amber-400'
          )}>
            {selectedCardIds.length}/{maxCards} tarjetas
          </span>
          {!isValid && selectedCardIds.length < minCards && (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertCircle size={12} />
              Mínimo {minCards}
            </span>
          )}
        </div>

        {/* Barra de progreso mini */}
        <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            className={cn(
              'h-full rounded-full',
              isValid ? 'bg-emerald-500' : 'bg-amber-500'
            )}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min((selectedCardIds.length / minCards) * 100, 100)}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Obtener tarjetas seleccionadas con sus datos completos
 * @param {Card[]} cards - Lista de todas las tarjetas
 * @param {string[]} selectedIds - IDs seleccionados
 * @returns {Card[]} Tarjetas seleccionadas con datos completos
 */
export function getSelectedCards(cards, selectedIds) {
  const idSet = new Set(selectedIds);
  return cards.filter(card => idSet.has(card._id));
}
