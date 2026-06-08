/**
 * @fileoverview Componente PageHeader reutilizable para cabeceras de paginas de listado.
 * Estructura consistente: icono + titulo + subtitulo + acciones.
 * @module components/ui/PageHeader
 */

import { m as motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export default function PageHeader({
  icon,
  iconClassName,
  title,
  subtitle,
  badge,
  actions,
  className,
}) {
  const { shouldReduceMotion } = useReducedMotion();

  return (
    <motion.header
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.entrance, ease: EASING.outExpo }}
      className={cn('flex flex-col gap-4', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {icon && (
            <div
              className={cn(
                'size-12 rounded-2xl flex items-center justify-center shrink-0 ring-1 ring-inset ring-border-subtle',
                iconClassName || 'bg-accent-indigo/20 text-accent-indigo'
              )}
            >
              {icon}
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-text-primary font-display tracking-tight leading-[1.1]">{title}</h1>
              {badge}
            </div>
            {subtitle && (
              <p className="text-text-muted mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap gap-3">
            {actions}
          </div>
        )}
      </div>
    </motion.header>
  );
}

PageHeader.propTypes = {
  icon: PropTypes.element,
  iconClassName: PropTypes.string,
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  badge: PropTypes.element,
  actions: PropTypes.node,
  className: PropTypes.string,
};
