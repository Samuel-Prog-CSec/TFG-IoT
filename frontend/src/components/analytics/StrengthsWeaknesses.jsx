import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ThumbsUp, AlertTriangle } from 'lucide-react';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import GlassCard from '../ui/GlassCard';

/**
 * Deriva fortalezas y debilidades de los datos de rendimiento por dimension.
 * Fortalezas = top items con mejor accuracy. Debilidades = peores.
 *
 * @param {Array} performanceByContext - Rendimiento por contexto
 * @param {Array} performanceByMechanic - Rendimiento por mecanica
 * @param {number} count - Numero de items a mostrar por lado
 * @returns {{ strengths: Array, weaknesses: Array }}
 */
const deriveStrengthsWeaknesses = (performanceByContext = [], performanceByMechanic = [], count = 3) => {
  const allItems = [
    ...performanceByContext.map(c => ({
      name: c.name || c.context || c.contextName || 'Sin nombre',
      score: c.averageScore ?? c.avgScore ?? c.score ?? 0,
      gamesPlayed: c.gamesPlayed ?? c.totalGames ?? 0,
      type: 'context',
    })),
    ...performanceByMechanic.map(m => ({
      name: m.name || m.mechanic || m.mechanicName || 'Sin nombre',
      score: m.averageScore ?? m.avgScore ?? m.score ?? 0,
      gamesPlayed: m.gamesPlayed ?? m.totalGames ?? 0,
      type: 'mechanic',
    })),
  ].filter(item => item.gamesPlayed > 0);

  const sorted = [...allItems].sort((a, b) => b.score - a.score);

  return {
    strengths: sorted.slice(0, count),
    weaknesses: sorted.length > count ? sorted.slice(-count).reverse() : [],
  };
};

/**
 * Muestra las fortalezas y debilidades del estudiante como tarjetas coloreadas.
 * Derivado automaticamente de los datos de rendimiento por contexto/mecanica.
 *
 * @param {Object} props
 * @param {Array} props.performanceByContext - Rendimiento por contexto
 * @param {Array} props.performanceByMechanic - Rendimiento por mecanica
 */
function StrengthsWeaknesses({ performanceByContext, performanceByMechanic }) {
  const { shouldReduceMotion } = useReducedMotion();
  const { strengths, weaknesses } = useMemo(
    () => deriveStrengthsWeaknesses(performanceByContext, performanceByMechanic),
    [performanceByContext, performanceByMechanic]
  );

  if (strengths.length === 0 && weaknesses.length === 0) {
    return null;
  }

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <h3 className="text-base font-bold text-text-primary font-display mb-4">Fortalezas y Debilidades</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Strengths */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ThumbsUp size={14} className="text-success-base" aria-hidden="true" />
            <span className="text-xs font-semibold text-success-base uppercase tracking-wider">Fortalezas</span>
          </div>
          <div className="space-y-2">
            {strengths.map((item, index) => (
              <motion.div
                key={`strength-${index}-${item.name}`}
                initial={shouldReduceMotion ? false : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : index * 0.08 }}
                className="p-3 rounded-lg bg-success-base/5 border border-success-base/10"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary truncate">{item.name}</span>
                  <span className="text-sm font-bold text-success-base tabular-nums ml-2">{Math.round(item.score)}%</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-text-muted capitalize">{item.type === 'context' ? 'Contexto' : 'Mecanica'}</span>
                  <span className="text-[10px] text-text-disabled">{'\u2022'}</span>
                  <span className="text-[10px] text-text-muted">{item.gamesPlayed} partidas</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Weaknesses */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={14} className="text-error-base" aria-hidden="true" />
            <span className="text-xs font-semibold text-error-base uppercase tracking-wider">A mejorar</span>
          </div>
          <div className="space-y-2">
            {weaknesses.length > 0 ? weaknesses.map((item, index) => (
              <motion.div
                key={`weakness-${index}-${item.name}`}
                initial={shouldReduceMotion ? false : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : index * 0.08 }}
                className="p-3 rounded-lg bg-error-base/5 border border-error-base/10"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary truncate">{item.name}</span>
                  <span className="text-sm font-bold text-error-base tabular-nums ml-2">{Math.round(item.score)}%</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-text-muted capitalize">{item.type === 'context' ? 'Contexto' : 'Mecanica'}</span>
                  <span className="text-[10px] text-text-disabled">{'\u2022'}</span>
                  <span className="text-[10px] text-text-muted">{item.gamesPlayed} partidas</span>
                </div>
              </motion.div>
            )) : (
              <p className="text-xs text-text-muted py-4 text-center">Sin debilidades identificadas con los datos actuales.</p>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

StrengthsWeaknesses.propTypes = {
  performanceByContext: PropTypes.array,
  performanceByMechanic: PropTypes.array,
};

export default memo(StrengthsWeaknesses);
