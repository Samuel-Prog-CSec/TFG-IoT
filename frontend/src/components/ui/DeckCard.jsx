/**
 * @fileoverview Componente DeckCard - Card visual premium para mostrar mazos de cartas
 * Incluye efecto 3D tilt, gradiente animado en borde, preview de assets con parallax,
 * y acciones hover con slide-up.
 * 
 * Optimizaciones de rendimiento:
 * - Animaciones reducidas cuando hay muchas cards (>15)
 * - Respeta prefers-reduced-motion del sistema
 * - will-change aplicado solo en hover
 * 
 * @module components/ui/DeckCard
 */

import { useState, useRef, useMemo } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Layers, Edit2, Trash2, Eye, MoreVertical, Calendar, CreditCard } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * DeckCard - Card visual premium para mazos
 * 
 * @param {Object} props
 * @param {Object} props.deck - Datos del mazo
 * @param {string} props.deck.id - ID del mazo
 * @param {string} props.deck.name - Nombre del mazo
 * @param {string} [props.deck.description] - Descripción del mazo
 * @param {Object} props.deck.context - Contexto asociado
 * @param {string} props.deck.context.name - Nombre del contexto
 * @param {Array} props.deck.cardMappings - Mapeos de tarjetas
 * @param {string} props.deck.createdAt - Fecha de creación
 * @param {Function} [props.onView] - Callback al ver detalles
 * @param {Function} [props.onEdit] - Callback al editar
 * @param {Function} [props.onDelete] - Callback al eliminar
 * @param {Function} [props.onSelect] - Callback al seleccionar (para wizard)
 * @param {boolean} [props.selectable=false] - Modo seleccionable
 * @param {boolean} [props.selected=false] - Estado seleccionado
 * @param {boolean} [props.reducedMotion=false] - Reducir animaciones para rendimiento
 * @param {string} [props.className] - Clases adicionales
 */
export default function DeckCard({
  deck,
  onView,
  onEdit,
  onDelete,
  onSelect,
  selectable = false,
  selected = false,
  reducedMotion = false,
  className,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef(null);

  // Detectar preferencia de movimiento reducido del sistema
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Determinar si usar animaciones completas
  const useFullAnimations = !reducedMotion && !prefersReducedMotion;

  // Valores para efecto 3D tilt
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Springs más suaves cuando hay animaciones reducidas
  const springConfig = useFullAnimations 
    ? { stiffness: 400, damping: 90 }
    : { stiffness: 200, damping: 50 };

  const mouseXSpring = useSpring(x, springConfig);
  const mouseYSpring = useSpring(y, springConfig);

  // Ángulo de rotación (reducido si necesario)
  const rotationAmount = useFullAnimations ? 10 : 5;
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [`${rotationAmount}deg`, `-${rotationAmount}deg`]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [`-${rotationAmount}deg`, `${rotationAmount}deg`]);

  // Efecto parallax para los assets preview (reducido si necesario)
  const parallaxAmount = useFullAnimations ? 10 : 4;
  const assetX = useTransform(mouseXSpring, [-0.5, 0.5], [parallaxAmount, -parallaxAmount]);
  const assetY = useTransform(mouseYSpring, [-0.5, 0.5], [parallaxAmount, -parallaxAmount]);

  const handlePointerMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const xPos = (e.clientX - rect.left) / rect.width - 0.5;
    const yPos = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(xPos);
    y.set(yPos);
    
    // Set CSS variables for holographic effect
    cardRef.current.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    cardRef.current.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
  };

  const handleClick = () => {
    if (selectable && onSelect) {
      onSelect(deck);
    }
  };

  // Obtener preview de assets (primeros 4)
  const previewAssets = deck.cardMappings?.slice(0, 4) || [];
  const remainingCount = (deck.cardMappings?.length || 0) - 4;

  // Formatear fecha
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { 
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <motion.div
      ref={cardRef}
      className={cn(
        'relative group cursor-pointer perspective-1000',
        className
      )}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      style={{
        transformStyle: 'preserve-3d',
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ z: 20 }}
      transition={{ duration: 0.3 }}
      role={selectable ? 'button' : 'article'}
      aria-label={selectable ? `Seleccionar mazo ${deck.name}` : `Mazo ${deck.name}`}
      aria-selected={selectable ? selected : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={selectable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      } : undefined}
    >
      <motion.div
        className={cn(
          'relative rounded-2xl overflow-hidden',
          'bg-gradient-to-br from-slate-900/90 to-slate-800/90',
          'border border-white/10',
          'backdrop-blur-xl',
          'transition-shadow duration-300',
          isHovered && 'shadow-2xl shadow-indigo-500/20',
          selected && 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-950',
          selectable && 'hover:ring-2 hover:ring-indigo-400/50'
        )}
        style={{
          rotateX: useFullAnimations && isHovered ? rotateX : 0,
          rotateY: useFullAnimations && isHovered ? rotateY : 0,
          transformStyle: 'preserve-3d',
          willChange: isHovered ? 'transform' : 'auto',
        }}
      >
        {/* Gradiente animado en el borde */}
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div 
            className="absolute inset-0 rounded-2xl"
            style={{
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7, #6366f1)',
              backgroundSize: '300% 100%',
              animation: 'gradient-shift 3s ease infinite',
              padding: '1px',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />
        </div>

        {/* Contenido de la card */}
        <div className="relative p-5 z-10">
          {/* Header con icono y contexto */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Layers className="text-white" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg leading-tight line-clamp-1">
                  {deck.name}
                </h3>
                <span className="text-xs text-purple-400 font-medium">
                  {deck.context?.name || deck.contextId?.name || 'Sin contexto'}
                </span>
              </div>
            </div>

            {/* Menú de acciones (solo si no es selectable) */}
            {!selectable && (
              <div className="relative z-20">
                <motion.button
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Implement menu logic if needed, or keep as visual
                  }}
                  aria-label={`Opciones para mazo ${deck.name}`}
                  aria-haspopup="true"
                >
                  <MoreVertical size={18} aria-hidden="true" />
                </motion.button>
              </div>
            )}
          </div>

          {/* Descripción */}
          {deck.description && (
            <p className="text-slate-400 text-sm mb-4 line-clamp-2">
              {deck.description}
            </p>
          )}

          {/* Preview de assets con parallax */}
          <motion.div 
            className="flex items-center gap-2 mb-4"
            style={{
              x: useFullAnimations && isHovered ? assetX : 0,
              y: useFullAnimations && isHovered ? assetY : 0,
            }}
          >
            {previewAssets.map((mapping, index) => (
              <motion.div
                key={mapping._id || index}
                className="w-10 h-10 rounded-lg bg-slate-800/80 border border-white/10 flex items-center justify-center text-lg overflow-hidden"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                style={{
                  transform: `translateZ(${(index + 1) * 10}px)`,
                }}
              >
                {mapping.displayData?.display || mapping.displayData?.emoji || '🎴'}
              </motion.div>
            ))}
            {remainingCount > 0 && (
              <motion.div
                className="w-10 h-10 rounded-lg bg-slate-800/80 border border-white/10 flex items-center justify-center text-xs font-bold text-slate-400"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
              >
                +{remainingCount}
              </motion.div>
            )}
          </motion.div>

          {/* Estadísticas */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <CreditCard size={14} />
              <span>{deck.cardMappings?.length || 0} tarjetas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar size={14} />
              <span>{formatDate(deck.createdAt)}</span>
            </div>
          </div>

          {/* Acciones hover (slide-up) */}
          {!selectable && (
            <motion.div
              className={cn(
                'absolute bottom-0 left-0 right-0 p-4 pt-8 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent z-20',
                isHovered ? 'pointer-events-auto' : 'pointer-events-none'
              )}
              initial={{ opacity: 0, y: 20 }}
              animate={{ 
                opacity: isHovered ? 1 : 0, 
                y: isHovered ? 0 : 20 
              }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-center gap-2">
                <ActionButton 
                  icon={Eye} 
                  label="Ver" 
                  onClick={(e) => { e.stopPropagation(); onView?.(deck); }}
                />
                <ActionButton 
                  icon={Edit2} 
                  label="Editar" 
                  onClick={(e) => { e.stopPropagation(); onEdit?.(deck); }}
                />
                <ActionButton 
                  icon={Trash2} 
                  label="Archivar" 
                  variant="danger"
                  onClick={(e) => { e.stopPropagation(); onDelete?.(deck); }}
                />
              </div>
            </motion.div>
          )}

          {/* Indicador de selección */}
          {selectable && selected && (
            <motion.div
              className="absolute top-3 right-3 w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </motion.div>
          )}
        </div>

        {/* Efecto de brillo en hover */}
        <motion.div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none"
          style={{
            background: 'radial-gradient(800px circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.1) 0%, transparent 40%)',
          }}
        />
      </motion.div>

      {/* CSS para animación del gradiente */}
      <style jsx global>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .perspective-1000 {
          perspective: 1000px;
        }
      `}</style>
    </motion.div>
  );
}

/**
 * ActionButton - Botón de acción para las cards
 */
function ActionButton({ icon: Icon, label, onClick, variant = 'default' }) {
  return (
    <motion.button
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
        variant === 'default' && 'bg-white/10 text-white hover:bg-white/20',
        variant === 'danger' && 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
      )}
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={label}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </motion.button>
  );
}

/**
 * DeckCardSkeleton - Skeleton loading para DeckCard
 */
export function DeckCardSkeleton() {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-slate-900/50 border border-white/5 p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-slate-800" />
          <div className="space-y-2">
            <div className="w-32 h-5 bg-slate-800 rounded" />
            <div className="w-20 h-3 bg-slate-800 rounded" />
          </div>
        </div>
      </div>
      <div className="w-full h-4 bg-slate-800 rounded mb-4" />
      <div className="flex gap-2 mb-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="w-10 h-10 rounded-lg bg-slate-800" />
        ))}
      </div>
      <div className="flex gap-4">
        <div className="w-20 h-3 bg-slate-800 rounded" />
        <div className="w-24 h-3 bg-slate-800 rounded" />
      </div>
    </div>
  );
}
