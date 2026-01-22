import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Select/Dropdown premium con animaciones
 * 
 * @param {Object} props
 * @param {Array<{value: string, label: string, icon?: React.ReactNode}>} props.options - Opciones del select
 * @param {string} props.value - Valor seleccionado
 * @param {Function} props.onChange - Callback al cambiar selección
 * @param {string} props.placeholder - Placeholder cuando no hay selección
 * @param {string} props.label - Label del campo
 * @param {boolean} props.disabled - Estado deshabilitado
 * @param {string} props.className - Clases adicionales
 */
export default function SelectPremium({
  options = [],
  value,
  onChange,
  placeholder = 'Seleccionar...',
  label,
  disabled = false,
  className,
  ...props
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  
  const selected = options.find(o => o.value === value);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cerrar con Escape
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleSelect = (option) => {
    onChange?.(option.value);
    setIsOpen(false);
  };

  return (
    <div className={cn('relative', className)} ref={containerRef} {...props}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-slate-300 mb-2">
          {label}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'relative w-full',
          'flex items-center justify-between gap-2',
          'bg-slate-800/80 backdrop-blur-sm',
          'border border-white/10 rounded-xl',
          'px-4 py-3',
          'text-left',
          'transition-all duration-300',
          'focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20',
          isOpen && 'border-purple-500/50 ring-2 ring-purple-500/20',
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'hover:border-white/20'
        )}
      >
        {/* Selected value or placeholder */}
        <span className={cn(
          'flex items-center gap-2 truncate',
          selected ? 'text-white' : 'text-slate-500'
        )}>
          {selected?.icon && (
            <span className="flex-shrink-0">{selected.icon}</span>
          )}
          {selected?.label || placeholder}
        </span>

        {/* Chevron */}
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-slate-400 flex-shrink-0"
        >
          <ChevronDown size={20} />
        </motion.span>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-50 w-full mt-2',
              'bg-slate-800/95 backdrop-blur-xl',
              'border border-white/10 rounded-xl',
              'shadow-xl shadow-black/30',
              'overflow-hidden',
              'max-h-60 overflow-y-auto custom-scrollbar'
            )}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              
              return (
                <motion.button
                  key={option.value}
                  type="button"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => handleSelect(option)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3',
                    'text-left',
                    'transition-colors duration-150',
                    isSelected 
                      ? 'bg-purple-500/20 text-white' 
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  )}
                >
                  {/* Icon */}
                  {option.icon && (
                    <span className="flex-shrink-0">{option.icon}</span>
                  )}
                  
                  {/* Label */}
                  <span className="flex-1 truncate">{option.label}</span>
                  
                  {/* Check mark */}
                  {isSelected && (
                    <Check size={18} className="text-purple-400 flex-shrink-0" />
                  )}
                </motion.button>
              );
            })}

            {options.length === 0 && (
              <div className="px-4 py-3 text-slate-500 text-center">
                No hay opciones disponibles
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
