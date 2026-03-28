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

  if (!content || disabled) {
    return children;
  }

  const variants = getMotionVariants(effectiveSide);

  const child = isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': tooltipId })
    : <span aria-describedby={tooltipId}>{children}</span>;

  return (
    <span
      ref={triggerRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={showImmediate}
      onBlur={hide}
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
              'absolute z-50 pointer-events-none',
              'px-2.5 py-1.5 rounded-lg',
              'text-xs font-medium whitespace-nowrap',
              'bg-background-elevated text-text-primary',
              'border border-border-default',
              'shadow-lg shadow-black/30',
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
