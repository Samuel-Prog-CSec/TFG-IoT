/**
 * @fileoverview Estado vacio reutilizable con layout consistente y animaciones.
 * @module components/ui/EmptyState
 */

import { motion } from 'framer-motion';
import { cn, DURATION, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from './GlassCard';

export default function EmptyState({
  title,
  description,
  icon,
  action,
  className
}) {
  const { shouldReduceMotion } = useReducedMotion();

  return (
    <GlassCard className={cn('p-10 text-center', className)}>
      {icon && (
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
        <motion.p
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.stateChange, ease: EASING.outQuart, delay: 0.1 }}
          className="text-text-primary text-lg font-semibold"
        >
          {title}
        </motion.p>
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
      {action && (
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.stateChange, ease: EASING.outQuart, delay: 0.25 }}
          className="mt-6 flex justify-center"
        >
          {action}
        </motion.div>
      )}
    </GlassCard>
  );
}
