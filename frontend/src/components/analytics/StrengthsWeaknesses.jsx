import { memo, useMemo } from 'react';
import { m as motion } from 'framer-motion';
import { ThumbsUp, Target } from 'lucide-react';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../../lib/utils';
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

  const sorted = allItems.toSorted((a, b) => b.score - a.score);

  return {
    strengths: sorted.slice(0, count),
    weaknesses: sorted.length > count ? sorted.slice(-count).reverse() : [],
  };
};

// Tono por rendimiento REAL, no por posición en la lista: un ítem puede ser el
// "peor" (aparece en «A mejorar») y aun así tener un 90%. Pintarlo en rojo sería
// engañoso — el color comunica el nivel (bien / regular / flojo), no el ranking.
const toneForScore = (score) => {
  if (score >= 75) return { text: 'text-success-on-alpha', bg: 'bg-success-base/5', border: 'border-success-base/10' };
  if (score >= 50) return { text: 'text-warning-on-alpha', bg: 'bg-warning-base/5', border: 'border-warning-base/10' };
  return { text: 'text-error-on-alpha', bg: 'bg-error-base/5', border: 'border-error-base/10' };
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

  // Si aún no hay datos suficientes (todos los contextos/mecánicas con 0 partidas),
  // mostramos una card explicativa en vez de desaparecer del layout sin avisar
  // (un hueco vacío inexplicado confunde al docente).
  if (strengths.length === 0 && weaknesses.length === 0) {
    return (
      <GlassCard variant="default" padding="none" className="p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-2">
          Fortalezas y debilidades
        </h3>
        <p className="text-sm text-text-muted">
          Se necesitan partidas completadas para analizar las fortalezas y
          debilidades de este alumno.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="default" padding="none" className="p-5">
      <h2 className="text-base font-semibold text-text-primary font-display mb-4">Fortalezas y Debilidades</h2>

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
                  <span className="text-sm font-bold text-success-base tabular-nums ml-2">{Math.min(100, Math.max(0, Math.round(item.score)))}%</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-nano text-text-muted capitalize">{item.type === 'context' ? 'Contexto' : 'Mecánica'}</span>
                  <span className="text-nano text-text-disabled">{'\u2022'}</span>
                  <span className="text-nano text-text-muted">{item.gamesPlayed} {item.gamesPlayed === 1 ? 'partida' : 'partidas'}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Weaknesses — encabezado NEUTRO (no rojo): «A mejorar» es informativo,
            no una alarma; cada ítem lleva su color según el nivel real. */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} className="text-text-muted" aria-hidden="true" />
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">A mejorar</span>
          </div>
          <div className="space-y-2">
            {weaknesses.length > 0 ? weaknesses.map((item, index) => {
              const tone = toneForScore(item.score);
              return (
              <motion.div
                key={`weakness-${index}-${item.name}`}
                initial={shouldReduceMotion ? false : { opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: shouldReduceMotion ? 0 : index * 0.08 }}
                className={cn('p-3 rounded-lg border', tone.bg, tone.border)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary truncate">{item.name}</span>
                  <span className={cn('text-sm font-bold tabular-nums ml-2', tone.text)}>{Math.min(100, Math.max(0, Math.round(item.score)))}%</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-nano text-text-muted capitalize">{item.type === 'context' ? 'Contexto' : 'Mecánica'}</span>
                  <span className="text-nano text-text-disabled">{'\u2022'}</span>
                  <span className="text-nano text-text-muted">{item.gamesPlayed} {item.gamesPlayed === 1 ? 'partida' : 'partidas'}</span>
                </div>
              </motion.div>
              );
            }) : (
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
