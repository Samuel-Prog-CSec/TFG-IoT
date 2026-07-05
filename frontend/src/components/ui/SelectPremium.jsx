import { useState, useRef, useEffect, useId, useCallback, useMemo } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '../../lib/utils';

const SEARCHABLE_AUTO_THRESHOLD = 20;

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
 * @param {boolean|'auto'} [props.searchable='auto'] - Activa el input de búsqueda
 *   interno. Por defecto 'auto': se activa cuando hay más de 20 opciones.
 *   `true` lo fuerza siempre, `false` lo desactiva (PROP-70/84).
 */
const EMPTY_OPTIONS = [];

export default function SelectPremium({
  options = EMPTY_OPTIONS,
  value,
  onChange,
  placeholder = 'Seleccionar…',
  label,
  disabled = false,
  className,
  searchable = 'auto',
  // BUG-A11Y-SELECT-NAME-B (QA 2026-06-04): capturamos `aria-label` explícito.
  // Antes caía en `{...props}` sobre el `<div>` contenedor y el combobox se
  // quedaba con el placeholder ("Seleccionar…") como nombre — los filtros del
  // dashboard (contexto/mecánica/rango) sonaban idénticos al lector de pantalla
  // y no anunciaban su valor.
  'aria-label': ariaLabelProp,
  ...props
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const listboxRef = useRef(null);
  const searchInputRef = useRef(null);
  const id = useId();
  const labelId = `${id}-label`;
  const listboxId = `${id}-listbox`;
  const searchInputId = `${id}-search`;
  const liveRegionId = `${id}-live`;

  const isSearchable = searchable === true ||
    (searchable === 'auto' && options.length > SEARCHABLE_AUTO_THRESHOLD);

  const selected = options.find(o => o.value === value);

  // Nombre accesible del combobox (BUG-A11Y-SELECT-NAME-B):
  // - Si hay `aria-label` explícito y NO label visible (caso filtros del
  //   dashboard): combinamos propósito + valor seleccionado para que el lector
  //   anuncie "Filtrar por contexto temático: Todos los contextos" y cada
  //   filtro sea distinguible.
  // - Si hay label visible: lo provee `aria-labelledby` (el valor queda
  //   visualmente adyacente).
  // - Fallback legacy: placeholder.
  let comboAriaLabel;
  if (!label && ariaLabelProp) {
    comboAriaLabel = `${ariaLabelProp}: ${selected?.label || placeholder}`;
  } else if (!label) {
    comboAriaLabel = placeholder;
  }

  // Filtrar opciones por la query (case-insensitive, match parcial). Si no hay
  // query, devolver el array intacto para evitar trabajar de más.
  const filteredOptions = useMemo(() => {
    if (!isSearchable || searchQuery.trim().length === 0) return options;
    const needle = searchQuery.toLowerCase().trim();
    return options.filter(o => String(o.label || '').toLowerCase().includes(needle));
  }, [options, searchQuery, isSearchable]);

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

  // Reset query y highlight al cerrar (no queda residuo entre aperturas).
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  // Focus automático en el input al abrir (solo si searchable).
  useEffect(() => {
    if (isOpen && isSearchable && searchInputRef.current) {
      // Pequeño delay para que la animación de entrada no compita con el focus.
      const tid = setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true });
      }, 30);
      return () => clearTimeout(tid);
    }
    return undefined;
  }, [isOpen, isSearchable]);

  // Si la query reduce las opciones, asegurar que highlightedIndex queda en rango.
  useEffect(() => {
    if (highlightedIndex >= filteredOptions.length) {
      setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1);
    }
  }, [filteredOptions.length, highlightedIndex]);

  const handleSelect = useCallback((option) => {
    onChange?.(option.value);
    setIsOpen(false);
    setHighlightedIndex(-1);
    setSearchQuery('');
  }, [onChange]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    // Poner el foco en el elemento seleccionado o el primero del listado actual.
    const currentIndex = filteredOptions.findIndex(o => o.value === value);
    setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [disabled, filteredOptions, value]);

  const handleKeyDown = useCallback((event) => {
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          setHighlightedIndex(prev =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
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
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
        }
        break;
      }
      case 'Enter':
      case ' ': {
        // Cuando el usuario está escribiendo en el input, espacio NO debe
        // disparar selección. Sí lo hace Enter (selecciona resaltado).
        if (event.key === ' ' && event.target?.id === searchInputId) {
          break;
        }
        event.preventDefault();
        if (isOpen && highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex]);
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
          setHighlightedIndex(filteredOptions.length - 1);
        }
        break;
      }
      case 'Escape': {
        if (isOpen) {
          event.preventDefault();
          // Primer Esc limpia query si hay; segundo cierra el dropdown.
          if (isSearchable && searchQuery.length > 0) {
            setSearchQuery('');
          } else {
            setIsOpen(false);
            setHighlightedIndex(-1);
          }
        }
        break;
      }
      default:
        break;
    }
  }, [isOpen, highlightedIndex, filteredOptions, handleSelect, openDropdown, isSearchable, searchQuery, searchInputId]);

  // Scroll al elemento highlighted
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const highlighted = listboxRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
      highlighted?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, highlightedIndex]);

  const activeDescendantId = highlightedIndex >= 0 && filteredOptions[highlightedIndex]
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
        // BUG-A11Y-SELECT-NAME-A/B: sin label visible, el combobox necesita
        // nombre accesible propio. `comboAriaLabel` combina el `aria-label`
        // explícito con el valor seleccionado (o cae al placeholder legacy).
        aria-label={comboAriaLabel}
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
        {/* Selected value or placeholder. `truncate` va en un span propio
            (hijo del flex): aplicado al contenedor flex recortaba el texto en
            seco y sin elipsis ("Clase comple" en Informes a 1366px). */}
        <span className={cn(
          'flex min-w-0 flex-1 items-center gap-2',
          selected ? 'text-text-primary' : 'text-text-muted'
        )}>
          {selected?.icon && (
            <span className="flex-shrink-0">{selected.icon}</span>
          )}
          <span className="truncate">{selected?.label || placeholder}</span>
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
              // Sombra del dropdown semántica por tema (T-951 Fase 1).
              'shadow-[var(--shadow-lg)]',
              'overflow-hidden'
            )}
          >
            {/* Search input — sticky en la parte superior del dropdown.
                PROP-70/84: input de filtrado opt-in cuando hay >20 opciones. */}
            {isSearchable && (
              <div className="sticky top-0 z-10 bg-background-elevated/95 backdrop-blur-xl border-b border-border-subtle px-3 py-2">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    ref={searchInputRef}
                    id={searchInputId}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Buscar…"
                    aria-label="Buscar opciones"
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    className={cn(
                      'w-full pl-8 pr-3 py-2 text-sm rounded-lg',
                      'bg-background-base/60 border border-border-subtle',
                      'text-text-primary placeholder:text-text-muted',
                      'focus:outline-none focus:border-brand-base/50 focus:ring-1 focus:ring-brand-base/30'
                    )}
                  />
                </div>
                {searchQuery.length > 0 && (
                  <span
                    id={liveRegionId}
                    aria-live="polite"
                    aria-atomic="true"
                    className="block mt-1.5 text-micro text-text-muted px-1"
                  >
                    {(() => {
                      if (filteredOptions.length === 0) return 'Sin coincidencias';
                      const noun = filteredOptions.length === 1 ? 'resultado' : 'resultados';
                      return `${filteredOptions.length} ${noun}`;
                    })()}
                  </span>
                )}
              </div>
            )}

            {/* Lista scrollable */}
            <div
              ref={listboxRef}
              className="max-h-60 overflow-y-auto overscroll-contain custom-scrollbar"
            >
              {filteredOptions.map((option, index) => {
                const isSelected = option.value === value;
                const isHighlighted = index === highlightedIndex;

                return (
                  <button
                    // Combinar value + index para garantizar key unica incluso
                    // cuando el caller pase opciones con value duplicado (ej:
                    // filtro "Todos" con value="" + lista de items reales).
                    key={`${option.value || 'opt'}-${index}`}
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

                    {/* Label — envuelve en vez de truncar: en dropdowns con
                        frases largas (p.ej. tipos de alerta "Caída repentina
                        de puntuación") el truncado impedía saber qué opción
                        era cada una. El trigger sí trunca (una línea); la
                        lista muestra el texto completo. */}
                    <span className="flex-1 min-w-0 break-words">{option.label}</span>

                    {/* Check mark */}
                    {isSelected && (
                      <Check size={18} className="text-brand-base flex-shrink-0" />
                    )}
                  </button>
                );
              })}

              {filteredOptions.length === 0 && (
                <div className="px-4 py-3 text-text-muted text-center text-sm">
                  {searchQuery.length > 0 ? 'Sin coincidencias' : 'No hay opciones disponibles'}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
