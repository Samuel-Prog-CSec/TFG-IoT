/**
 * @fileoverview Componente Breadcrumb reutilizable con navegacion responsiva.
 * Desktop: trail completo con separadores. Mobile: boton "Volver" simplificado.
 * @module components/ui/Breadcrumb
 */

import { Link } from 'react-router-dom';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { m as motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export default function Breadcrumb({ items, className }) {
  const { shouldReduceMotion } = useReducedMotion();

  if (!items || items.length === 0) return null;

  const backItem = items.length >= 2 ? items[items.length - 2] : null;

  return (
    <motion.nav
      aria-label="Navegación de migas de pan"
      initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.stateChange, ease: EASING.outQuart }}
      // BUG-A11Y-BREADCRUMB-BG (QA Sprint 0): el breadcrumb se mostraba sobre
      // la aurora atmosférica del AppLayout (amber/púrpura según mecánica),
      // rompiendo contraste de los enlaces. Añadido bg sólido + padding
      // ligero para que el texto siempre tenga contraste estable.
      className={cn('mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background-elevated/85 backdrop-blur-sm border border-border-subtle/40', className)}
    >
      {/* Mobile: boton volver simplificado */}
      {backItem?.to && (
        <Link
          to={backItem.to}
          className="md:hidden inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Volver</span>
        </Link>
      )}

      {/* Desktop: trail completo */}
      <ol className="hidden md:flex items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight size={14} className="text-text-disabled shrink-0" />
              )}
              {isLast || !item.to ? (
                <span className="text-text-primary font-medium truncate max-w-48">
                  {item.icon && <span className="mr-1 inline-flex">{item.icon}</span>}
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.to}
                  className="text-text-muted hover:text-text-secondary transition-colors truncate max-w-48"
                >
                  {item.icon && <span className="mr-1 inline-flex">{item.icon}</span>}
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </motion.nav>
  );
}

Breadcrumb.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      to: PropTypes.string,
      icon: PropTypes.element,
    })
  ).isRequired,
  className: PropTypes.string,
};
