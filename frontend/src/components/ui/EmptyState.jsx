/**
 * @fileoverview Estado vacio reutilizable con layout consistente y animaciones.
 * @module components/ui/EmptyState
 */

import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from './GlassCard';

/**
 * Estados vacios con tres variantes de UX:
 *   - `default`     -> icono + titulo + descripcion + accion
 *   - `first-use`   -> igual + CTA secundario opcional "Ver guia"
 *   - `filtered`    -> etiqueta visible "Sin resultados" y CTA orientado a limpiar filtros
 *
 * Slots para el "héroe" visual (mutuamente exclusivos, en orden de
 * precedencia): `illustration` > `mascot` > `icon`.
 *
 *   - `illustration` — SVG ilustración a tamaño completo (~180px),
 *     refuerza la identidad de la página (`EmptySessionsIllustration`,
 *     `EmptyDecksIllustration`, …).
 *   - `mascot` — `<CharacterMascot />` o un nodo equivalente (T-953
 *     Fase 2.8). Útil en empty states donde queremos darle voz a la
 *     mascota ("Crea tu primer mazo y empezamos a jugar"). Se renderiza
 *     en el bloque hero con un float coordinado.
 *   - `icon` — fallback discreto para cards densas; contenedor circular
 *     con tinte glass.
 */
export default function EmptyState({
  title,
  titleLevel = 'h2',
  description,
  icon,
  illustration,
  mascot,
  action,
  secondaryAction,
  variant = 'default',
  className,
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const TitleTag = motion[titleLevel] || motion.h2;

  const isFiltered = variant === 'filtered';

  // Héroe visual: precedencia illustration > mascot > icon (extraído del JSX
  // para evitar ternarios anidados en el render).
  let heroVisual = null;
  if (illustration) {
    heroVisual = (
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
    );
  } else if (mascot) {
    heroVisual = (
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.85, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: DURATION.entrance, ease: EASING.outExpo, delay: 0.05 }}
        // Bloque hero de mascota: alto reservado para que la burbuja
        // de diálogo no recorte sobre el título. La mascota ya tiene
        // su propio float interno, no aplicamos animate-float aquí.
        className="relative mx-auto mb-7 flex h-32 items-end justify-center"
      >
        {mascot}
      </motion.div>
    );
  } else if (icon) {
    heroVisual = (
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
    );
  }

  return (
    <GlassCard className={cn('p-10 text-center', className)}>
      {isFiltered && (
        <motion.span
          initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.stateChange, ease: EASING.outQuart }}
          className="inline-flex items-center gap-1.5 rounded-full border border-warning-base/30 bg-warning-base/10 px-3 py-1 text-xs font-medium text-warning-on-alpha mb-4"
        >
          Sin resultados para tu búsqueda
        </motion.span>
      )}

      {heroVisual}

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
          // (D3-004) `text-text-disabled` da ~1.6:1 sobre bg-base en light
          // (falla WCAG AA 4.5:1). Migrado a `text-text-muted` (~5:1 AA).
          // El token `disabled` se reserva para inputs/botones inactivos,
          // no para descripciones secundarias de body text.
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.stateChange, ease: EASING.outQuart, delay: 0.15 }}
          className="text-text-muted mt-2 max-w-md mx-auto"
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
  mascot: PropTypes.node,
  action: PropTypes.node,
  secondaryAction: PropTypes.node,
  variant: PropTypes.oneOf(['default', 'first-use', 'filtered']),
  className: PropTypes.string,
};
