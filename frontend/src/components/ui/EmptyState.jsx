/**
 * @fileoverview Estado vacio reutilizable con layout consistente y animaciones.
 * @module components/ui/EmptyState
 */

import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from './GlassCard';

/**
 * Estados vacios con tres variantes de UX:
 *   - `default`     -> icono + titulo + descripcion + accion
 *   - `first-use`   -> igual + CTA secundario opcional "Ver guia"
 *   - `filtered`    -> etiqueta visible "Sin resultados" y CTA orientado a limpiar filtros
 *
 * La prop `illustration` tiene prioridad sobre `icon`. Cuando se pasa una
 * ilustracion SVG (por ejemplo una de las del directorio `illustrations/`), esta
 * sustituye al contenedor circular del icono y se renderiza a tamaño completo
 * (hasta ~180px) para reforzar la identidad de la pagina.
 */
export default function EmptyState({
  title,
  titleLevel = 'h2',
  description,
  icon,
  illustration,
  action,
  secondaryAction,
  variant = 'default',
  className,
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const TitleTag = motion[titleLevel] || motion.h2;

  const isFiltered = variant === 'filtered';

  return (
    <GlassCard className={cn('p-10 text-center', className)}>
      {isFiltered && (
        <motion.span
          initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.stateChange, ease: EASING.outQuart }}
          className="inline-flex items-center gap-1.5 rounded-full border border-warning-base/30 bg-warning-base/10 px-3 py-1 text-xs font-medium text-warning-base mb-4"
        >
          Sin resultados para tu busqueda
        </motion.span>
      )}

      {illustration ? (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATION.entrance, ease: EASING.outExpo }}
          className={cn(
            'mx-auto mb-6 flex items-center justify-center',
            // Float sutil sobre la ilustracion: refuerza la metafora "objeto fisico
            // que descansa sobre la mesa". El reset global de prefers-reduced-motion
            // en index.css lo neutraliza automaticamente si el usuario lo prefiere.
            !shouldReduceMotion && 'animate-float'
          )}
        >
          {illustration}
        </motion.div>
      ) : icon && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATION.entrance, ease: EASING.outExpo }}
          className={cn(
            "mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-glass-bg text-text-muted",
            !shouldReduceMotion && "animate-float"
          )}
        >
          {icon}
        </motion.div>
      )}

      {title && (
        <TitleTag
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.stateChange, ease: EASING.outQuart, delay: 0.1 }}
          className="text-text-primary text-lg font-semibold"
        >
          {title}
        </TitleTag>
      )}

      {description && (
        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.stateChange, ease: EASING.outQuart, delay: 0.15 }}
          className="text-text-disabled mt-2 max-w-md mx-auto"
        >
          {description}
        </motion.p>
      )}

      {(action || secondaryAction) && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.stateChange, ease: EASING.outQuart, delay: 0.25 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-3"
        >
          {action}
          {secondaryAction}
        </motion.div>
      )}
    </GlassCard>
  );
}

EmptyState.propTypes = {
  title: PropTypes.node,
  titleLevel: PropTypes.oneOf(['h2', 'h3', 'h4']),
  description: PropTypes.node,
  icon: PropTypes.node,
  illustration: PropTypes.node,
  action: PropTypes.node,
  secondaryAction: PropTypes.node,
  variant: PropTypes.oneOf(['default', 'first-use', 'filtered']),
  className: PropTypes.string,
};
