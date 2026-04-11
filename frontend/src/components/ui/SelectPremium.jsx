import { useState, useRef, useEffect, useId, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Select/Dropdown premium con animaciones y navegación por teclado.
 * Implementa patrón ARIA combobox/listbox.
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
  placeholder = 'Seleccionar…',
  label,
  disabled = false,
  className,
  ...props
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const listboxRef = useRef(null);
  const id = useId();
  const labelId = `${id}-label`;
  const listboxId = `${id}-listbox`;

  const selected = options.find(o => o.value === value);

  // Cerrar al hacer clic fuera (solo escuchar cuando está abierto)
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = useCallback((option) => {
    onChange?.(option.value);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, [onChange]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    // Poner el foco en el elemento seleccionado o el primero
    const currentIndex = options.findIndex(o => o.value === value);
    setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [disabled, options, value]);

  const handleKeyDown = useCallback((event) => {
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          setHighlightedIndex(prev =>
            prev < options.length - 1 ? prev + 1 : 0
          );
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          setHighlightedIndex(prev =>
            prev > 0 ? prev - 1 : options.length - 1
          );
        }
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (isOpen && highlightedIndex >= 0 && options[highlightedIndex]) {
          handleSelect(options[highlightedIndex]);
        } else if (!isOpen) {
          openDropdown();
        }
        break;
      }
      case 'Home': {
        if (isOpen) {
          event.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      }
      case 'End': {
        if (isOpen) {
          event.preventDefault();
          setHighlightedIndex(options.length - 1);
        }
        break;
      }
      case 'Escape': {
        if (isOpen) {
          event.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
        break;
      }
      default:
        break;
    }
  }, [isOpen, highlightedIndex, options, handleSelect, openDropdown]);

  // Scroll al elemento highlighted
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const highlighted = listboxRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
      highlighted?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, highlightedIndex]);

  const activeDescendantId = highlightedIndex >= 0 && options[highlightedIndex]
    ? `${id}-option-${highlightedIndex}`
    : undefined;

  return (
    <div className={cn('relative', className)} ref={containerRef} {...props}>
      {/* Label */}
      {label && (
        <label id={labelId} className="block text-sm font-medium text-text-secondary mb-2">
          {label}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={label ? labelId : undefined}
        aria-activedescendant={isOpen ? activeDescendantId : undefined}
        onClick={() => isOpen ? setIsOpen(false) : openDropdown()}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          'relative w-full',
          'flex items-center justify-between gap-2',
          'bg-background-elevated/80 backdrop-blur-sm',
          'border border-border-default rounded-xl',
          'px-4 py-3',
          'text-left',
          'transition-[color,background-color,border-color,box-shadow] duration-300',
          'focus-ring',
          isOpen && 'border-brand-base/50 ring-2 ring-brand-base/20',
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'hover:border-border-strong'
        )}
      >
        {/* Selected value or placeholder */}
        <span className={cn(
          'flex items-center gap-2 truncate',
          selected ? 'text-text-primary' : 'text-text-muted'
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
          className="text-text-muted flex-shrink-0"
          aria-hidden="true"
        >
          <ChevronDown size={20} />
        </motion.span>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-40 w-full mt-2',
              'bg-background-elevated/95 backdrop-blur-xl',
              'border border-border-default rounded-xl',
              'shadow-xl shadow-black/30',
              'overflow-hidden',
              'max-h-60 overflow-y-auto overscroll-contain custom-scrollbar'
            )}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={option.value}
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3',
                    'text-left',
                    'transition-colors duration-150',
                    (() => {
                      if (isSelected) return 'bg-brand-base/20 text-text-primary';
                      if (isHighlighted) return 'bg-glass-bg text-text-primary';
                      return 'text-text-secondary hover:bg-glass-bg hover:text-text-primary';
                    })()
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
                    <Check size={18} className="text-brand-base flex-shrink-0" />
                  )}
                </button>
              );
            })}

            {options.length === 0 && (
              <div className="px-4 py-3 text-text-muted text-center">
                No hay opciones disponibles
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
