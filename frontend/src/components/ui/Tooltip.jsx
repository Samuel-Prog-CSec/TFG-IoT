/**
 * @fileoverview Tooltip accesible con animación y detección de colisión viewport.
 * Usa Framer Motion para animaciones suaves que encajan con el diseño glassmorphic.
 * @module components/ui/Tooltip
 */

import { useState, useRef, useEffect, useCallback, useId, cloneElement, isValidElement } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

/** Offset en px entre el trigger y el tooltip */
const TOOLTIP_OFFSET = 8;

/** Delay antes de mostrar el tooltip (ms) */
const DEFAULT_DELAY = 200;

/**
 * Calcula si el tooltip se sale del viewport y devuelve el lado efectivo.
 * @param {DOMRect} triggerRect - Rect del trigger
 * @param {string} preferredSide - Lado preferido
 * @returns {string} Lado efectivo
 */
function getEffectiveSide(triggerRect, preferredSide) {
  const margin = 12;
  const { top, bottom, left, right } = triggerRect;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  switch (preferredSide) {
    case 'top':
      return top < 60 ? 'bottom' : 'top';
    case 'bottom':
      return bottom > viewportHeight - 60 ? 'top' : 'bottom';
    case 'left':
      return left < 80 ? 'right' : 'left';
    case 'right':
      return right > viewportWidth - margin - 80 ? 'left' : 'right';
    default:
      return preferredSide;
  }
}

/**
 * Variantes de animación Framer Motion por lado
 */
const getMotionVariants = (side) => {
  const offset = 4;
  const axisMap = {
    top: { y: offset },
    bottom: { y: -offset },
    left: { x: offset },
    right: { x: -offset },
  };

  return {
    initial: { opacity: 0, scale: 0.95, ...axisMap[side] },
    animate: { opacity: 1, scale: 1, x: 0, y: 0 },
    exit: { opacity: 0, scale: 0.95, ...axisMap[side] },
  };
};

/**
 * Clases CSS de posicionamiento por lado
 */
const positionClasses = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/**
 * Clases CSS de la flecha por lado
 */
const arrowClasses = {
  top: 'top-full left-1/2 -translate-x-1/2 border-t-background-elevated border-x-transparent border-b-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-background-elevated border-x-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-l-background-elevated border-y-transparent border-r-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-r-background-elevated border-y-transparent border-l-transparent',
};

export default function Tooltip({
  content,
  children,
  side = 'top',
  delay = DEFAULT_DELAY,
  className,
  disabled = false,
}) {
  const [visible, setVisible] = useState(false);
  const [effectiveSide, setEffectiveSide] = useState(side);
  const tooltipId = useId();
  const triggerRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  // Limpiar timeout al desmontar
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // Recalcular lado al hacerse visible
  useEffect(() => {
    if (visible && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setEffectiveSide(getEffectiveSide(rect, side));
    }
  }, [visible, side]);

  const show = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const showImmediate = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setVisible(false);
  }, []);

  // Toggle para dispositivos táctiles (tablets no tienen hover)
  const handleTouchToggle = useCallback(() => {
    setVisible(prev => !prev);
  }, []);

  if (!content || disabled) {
    return children;
  }

  const variants = getMotionVariants(effectiveSide);

  // Detectar si el hijo ya es un elemento interactivo (evitar anidamiento button>button, a>button, etc.)
  const isChildInteractive = (() => {
    if (!isValidElement(children)) return false;
    const tagType = children.type;
    // Elementos HTML nativos interactivos
    if (typeof tagType === 'string' && ['button', 'a', 'input', 'select', 'textarea'].includes(tagType)) {
      return true;
    }
    // Componentes con role="button"
    if (children.props?.role === 'button') return true;
    // Componentes cuyo nombre contiene "Button" (ej: ButtonPremium)
    const componentName = tagType?.displayName || tagType?.name || '';
    if (componentName.includes('Button')) return true;
    return false;
  })();

  const child = isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': tooltipId })
    : <span aria-describedby={tooltipId}>{children}</span>;

  // Si el hijo no es interactivo y el content es un string, promovemos el content
  // como aria-label del wrapper para que lectores de pantalla anuncien el proposito
  // del trigger cuando este solo contenga iconos.
  const wrapperAriaLabel = !isChildInteractive && typeof content === 'string'
    ? content
    : undefined;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Cuando el hijo es interactivo, el wrapper solo usa eventos pasivos (hover/focus) sin role/tabIndex para evitar anidamiento de elementos interactivos
    <span
      ref={triggerRef}
      {...(!isChildInteractive && { role: 'button', tabIndex: 0, 'aria-label': wrapperAriaLabel })}
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={showImmediate}
      onBlur={hide}
      {...(!isChildInteractive && {
        onClick: handleTouchToggle,
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleTouchToggle();
          }
        },
      })}
    >
      {child}
      <AnimatePresence>
        {visible && (
          <motion.span
            id={tooltipId}
            role="tooltip"
            initial={variants.initial}
            animate={variants.animate}
            exit={variants.exit}
            transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
            className={cn(
              'absolute z-[60] pointer-events-none',
              'px-3 py-2 rounded-lg',
              'text-xs font-medium leading-snug',
              // Texto corto = una sola linea; texto largo (mas de 32 chars) hace wrap con max-width
              typeof content === 'string' && content.length > 32
                ? 'max-w-[260px] whitespace-normal text-balance'
                : 'whitespace-nowrap',
              // Glassmorphism con saturacion para coherencia con resto de UI
              'bg-background-elevated/95 backdrop-blur-md text-text-primary',
              'border border-border-default',
              // Tokens por tema — en light el tooltip no flota con sombra
              // negra agresiva sobre el papel marfil (T-951 Fase 1).
              'shadow-[var(--shadow-lg),var(--shadow-inset-card)]',
              positionClasses[effectiveSide]
            )}
          >
            {content}
            {/* Flecha */}
            <span
              className={cn(
                'absolute w-0 h-0 border-[5px]',
                arrowClasses[effectiveSide]
              )}
              aria-hidden="true"
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
