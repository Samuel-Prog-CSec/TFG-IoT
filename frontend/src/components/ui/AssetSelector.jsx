/**
 * @fileoverview Componente AssetSelector - Selector visual premium de assets
 * Grid con efecto stagger, scale+glow on select, búsqueda con highlight animado,
 * y badge "asignado" con pulse para indicar assets ya usados.
 * 
 * @module components/ui/AssetSelector
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Check, Image, Volume2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * @typedef {Object} Asset
 * @property {string} key - Clave única del asset
 * @property {string} value - Valor del asset (nombre/texto)
 * @property {string} [display] - Emoji o texto de display
 * @property {string} [imageUrl] - URL de imagen
 * @property {string} [thumbnailUrl] - URL de miniatura
 * @property {string} [audioUrl] - URL de audio
 */

/**
 * AssetSelector - Selector visual de assets con animaciones premium
 * 
 * @param {Object} props
 * @param {Asset[]} props.assets - Lista de assets disponibles
 * @param {string} [props.selectedAssetKey] - Key del asset seleccionado
 * @param {Function} props.onSelect - Callback al seleccionar un asset
 * @param {Set<string>|string[]} [props.assignedAssets=[]] - Assets ya asignados a otras tarjetas
 * @param {boolean} [props.showSearch=true] - Mostrar barra de búsqueda
 * @param {string} [props.placeholder='Buscar asset...'] - Placeholder de búsqueda
 * @param {string} [props.className] - Clases adicionales
 * @param {number} [props.columns=4] - Número de columnas en el grid
 * 
 * @example
 * ```jsx
 * <AssetSelector
 *   assets={contextAssets}
 *   selectedAssetKey={selectedAsset}
 *   onSelect={(asset) => setSelectedAsset(asset.key)}
 *   assignedAssets={usedAssets}
 * />
 * ```
 */
export default function AssetSelector({
  assets = [],
  selectedAssetKey,
  onSelect,
  assignedAssets = [],
  showSearch = true,
  placeholder = 'Buscar asset...',
  className,
  columns = 4,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredAsset, setHoveredAsset] = useState(null);

  // Convertir assignedAssets a Set para búsqueda O(1)
  const assignedSet = useMemo(() => {
    if (assignedAssets instanceof Set) return assignedAssets;
    return new Set(Array.isArray(assignedAssets) ? assignedAssets : []);
  }, [assignedAssets]);

  // Filtrar assets por búsqueda
  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return assets;
    const query = searchQuery.toLowerCase();
    return assets.filter(asset => 
      asset.value?.toLowerCase().includes(query) ||
      asset.key?.toLowerCase().includes(query) ||
      asset.display?.toLowerCase().includes(query)
    );
  }, [assets, searchQuery]);

  // Variantes de animación para el grid
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.03,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.8, y: 20 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 25,
      },
    },
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Barra de búsqueda */}
      {showSearch && (
        <div className="relative">
          <Search 
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" 
            size={18} 
          />
          <motion.input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={placeholder}
            className={cn(
              'w-full pl-10 pr-4 py-3 rounded-xl',
              'bg-slate-800/50 border border-white/10',
              'text-white placeholder-slate-500',
              'focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20',
              'transition-all duration-300'
            )}
            whileFocus={{ scale: 1.01 }}
          />
          {/* Indicador de búsqueda activa */}
          <AnimatePresence>
            {searchQuery && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500"
              >
                {filteredAssets.length} resultado{filteredAssets.length !== 1 ? 's' : ''}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Grid de assets */}
      <motion.div
        className={cn(
          'grid gap-3',
          columns === 3 && 'grid-cols-3',
          columns === 4 && 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
          columns === 5 && 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5',
          columns === 6 && 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6',
        )}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        key={searchQuery} // Re-animar al cambiar búsqueda
      >
        <AnimatePresence mode="popLayout">
          {filteredAssets.map((asset) => {
            const isSelected = asset.key === selectedAssetKey;
            const isAssigned = assignedSet.has(asset.key) && asset.key !== selectedAssetKey;

            return (
              <motion.button
                key={asset.key}
                variants={itemVariants}
                layout
                onClick={() => !isAssigned && onSelect(asset)}
                onMouseEnter={() => setHoveredAsset(asset.key)}
                onMouseLeave={() => setHoveredAsset(null)}
                disabled={isAssigned}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-2 p-4 rounded-xl',
                  'border transition-all duration-300',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                  isSelected && [
                    'bg-indigo-500/20 border-indigo-500',
                    'ring-2 ring-indigo-500/50',
                    'shadow-lg shadow-indigo-500/30',
                  ],
                  !isSelected && !isAssigned && [
                    'bg-slate-800/50 border-white/10',
                    'hover:bg-slate-700/50 hover:border-indigo-400/30',
                    'hover:shadow-lg hover:shadow-indigo-500/10',
                  ],
                  isAssigned && [
                    'bg-slate-900/50 border-slate-700/50',
                    'cursor-not-allowed opacity-60',
                  ]
                )}
                whileHover={!isAssigned ? { scale: 1.05, y: -2 } : {}}
                whileTap={!isAssigned ? { scale: 0.98 } : {}}
              >
                {/* Asset visual */}
                <div className="relative">
                  {asset.imageUrl || asset.thumbnailUrl ? (
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-900">
                      <img
                        src={asset.thumbnailUrl || asset.imageUrl}
                        alt={asset.value}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-slate-900/80 flex items-center justify-center text-3xl">
                      {asset.display || '📎'}
                    </div>
                  )}

                  {/* Indicador de audio */}
                  {asset.audioUrl && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                      <Volume2 size={10} className="text-white" />
                    </div>
                  )}
                </div>

                {/* Nombre del asset */}
                <span className={cn(
                  'text-xs font-medium text-center line-clamp-2',
                  isSelected ? 'text-white' : 'text-slate-300'
                )}>
                  {asset.value}
                </span>

                {/* Checkmark de selección */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 180 }}
                      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center"
                    >
                      <Check size={12} className="text-white" strokeWidth={3} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Badge "Asignado" con pulse */}
                <AnimatePresence>
                  {isAssigned && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded-xl"
                    >
                      <motion.span
                        className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold uppercase tracking-wider"
                        animate={{
                          boxShadow: [
                            '0 0 0 0 rgba(245, 158, 11, 0)',
                            '0 0 0 4px rgba(245, 158, 11, 0.3)',
                            '0 0 0 0 rgba(245, 158, 11, 0)',
                          ],
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        Asignado
                      </motion.span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Efecto glow en hover/selected */}
                {(isSelected || hoveredAsset === asset.key) && !isAssigned && (
                  <motion.div
                    className="absolute inset-0 rounded-xl pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                      background: isSelected 
                        ? 'radial-gradient(circle at center, rgba(99, 102, 241, 0.2) 0%, transparent 70%)'
                        : 'radial-gradient(circle at center, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
                    }}
                  />
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {/* Mensaje si no hay resultados */}
      {filteredAssets.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-12 text-slate-500"
        >
          <Search size={48} className="mb-4 opacity-50" />
          <p className="text-sm">No se encontraron assets</p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 text-indigo-400 hover:text-indigo-300 text-sm"
            >
              Limpiar búsqueda
            </button>
          )}
        </motion.div>
      )}

      {/* Contador de assets */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {filteredAssets.length} asset{filteredAssets.length !== 1 ? 's' : ''} disponible{filteredAssets.length !== 1 ? 's' : ''}
        </span>
        <span>
          {assignedSet.size} asignado{assignedSet.size !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

/**
 * AssetSelectorCompact - Versión compacta para espacios reducidos
 */
export function AssetSelectorCompact({
  assets = [],
  selectedAssetKey,
  onSelect,
  assignedAssets = [],
  className,
}) {
  const assignedSet = useMemo(() => {
    if (assignedAssets instanceof Set) return assignedAssets;
    return new Set(Array.isArray(assignedAssets) ? assignedAssets : []);
  }, [assignedAssets]);

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {assets.map((asset) => {
        const isSelected = asset.key === selectedAssetKey;
        const isAssigned = assignedSet.has(asset.key) && asset.key !== selectedAssetKey;

        return (
          <motion.button
            key={asset.key}
            onClick={() => !isAssigned && onSelect(asset)}
            disabled={isAssigned}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
              'transition-all duration-200',
              isSelected && 'bg-indigo-500/20 border-indigo-500 text-white',
              !isSelected && !isAssigned && 'bg-slate-800/50 border-white/10 text-slate-300 hover:border-indigo-400/50',
              isAssigned && 'bg-slate-900/50 border-slate-700/50 text-slate-600 cursor-not-allowed'
            )}
            whileHover={!isAssigned ? { scale: 1.02 } : {}}
            whileTap={!isAssigned ? { scale: 0.98 } : {}}
          >
            <span className="text-lg">{asset.display || '📎'}</span>
            <span>{asset.value}</span>
            {isSelected && <Check size={14} className="text-indigo-400" />}
          </motion.button>
        );
      })}
    </div>
  );
}
