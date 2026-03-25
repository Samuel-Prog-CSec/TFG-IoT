/**
 * @fileoverview Estado de error reutilizable con layout consistente, animaciones y accion de reintento.
 * Sigue el mismo patron de animacion que EmptyState.
 * @module components/ui/ErrorState
 */

import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from './GlassCard';
import ButtonPremium from './ButtonPremium';

export default function ErrorState({
  title = 'Algo salió mal',
  message,
  icon,
  onRetry,
  retryLabel = 'Reintentar',
  className,
}) {
  const { shouldReduceMotion } = useReducedMotion();

  return (
    <GlassCard className={cn('p-10 text-center', className)}>
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: DURATION.entrance, ease: EASING.outExpo }}
        className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-error-base/20 text-error-base"
      >
        {icon || <AlertTriangle size={28} />}
      </motion.div>

      <motion.p
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.stateChange, ease: EASING.outQuart, delay: 0.1 }}
        className="text-text-primary text-lg font-semibold"
      >
        {title}
      </motion.p>

      {message && (
        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.stateChange, ease: EASING.outQuart, delay: 0.15 }}
          className="text-text-muted mt-2 max-w-md mx-auto"
        >
          {message}
        </motion.p>
      )}

      {onRetry && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.stateChange, ease: EASING.outQuart, delay: 0.25 }}
          className="mt-6 flex justify-center"
        >
          <ButtonPremium variant="secondary" onClick={onRetry}>
            {retryLabel}
          </ButtonPremium>
        </motion.div>
      )}
    </GlassCard>
  );
}

ErrorState.propTypes = {
  title: PropTypes.string,
  message: PropTypes.string,
  icon: PropTypes.element,
  onRetry: PropTypes.func,
  retryLabel: PropTypes.string,
  className: PropTypes.string,
};
