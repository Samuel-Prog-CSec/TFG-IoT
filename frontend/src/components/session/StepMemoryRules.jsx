/**
 * @fileoverview Paso 3 del wizard (variante Memoria): Configuracion de reglas de memoria.
 * Presets de dificultad, tiempo total, puntos y penalizacion.
 *
 * @module components/session/StepMemoryRules
 */

import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import {
  Check,
  Clock,
  Zap,
  AlertTriangle,
  Sparkles,
  Wifi
} from 'lucide-react';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import { DIFFICULTY_VARIANT_STYLES } from './sessionHelpers';
import { configShape } from './sessionPropTypes';

const DIFFICULTIES = [
  { id: 'easy', label: 'Fácil', description: 'Más tiempo, sin penalización' },
  { id: 'medium', label: 'Normal', description: 'Configuración equilibrada' },
  { id: 'hard', label: 'Difícil', description: 'Menos tiempo, más penalización' }
];

/**
 * Paso 3 (Memoria): Configurar reglas de la partida de memoria
 */
export default function StepMemoryRules({
  config,
  difficulty,
  onDifficultyChange,
  onConfigChange,
  linkSensor,
  onLinkSensorChange,
  currentSensorId
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Presets de dificultad para memoria */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Dificultad Predefinida
        </h2>

        <div className="space-y-3">
          {DIFFICULTIES.map((d) => {
            const style = DIFFICULTY_VARIANT_STYLES[d.id] || DIFFICULTY_VARIANT_STYLES.medium;
            const isSelected = difficulty === d.id;

            return (
              <motion.button
                key={d.id}
                onClick={() => onDifficultyChange(d.id)}
                className={cn(
                  'w-full p-4 rounded-xl border-2 text-left transition-colors',
                  isSelected
                    ? style.selectedCard
                    : 'border-border-default bg-background-elevated/30 hover:border-border-strong'
                )}
                whileHover={{ x: 4 }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={cn(
                      'font-medium',
                      isSelected ? style.selectedText : 'text-text-primary'
                    )}>
                      {d.label}
                    </h3>
                    <p className="text-xs text-text-muted">{d.description}</p>
                  </div>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={cn(
                        'size-6 rounded-full flex items-center justify-center',
                        style.selectedIndicator
                      )}
                    >
                      <Check size={14} className="text-text-primary" />
                    </motion.div>
                  )}
                </div>
              </motion.button>
            );
          })}

          {difficulty === 'custom' && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full p-4 rounded-xl border-2 border-dashed border-brand-light/50 bg-brand-light/5"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-brand-light" />
                <h3 className="font-medium text-brand-light">Personalizado</h3>
              </div>
              <p className="text-xs text-text-muted mt-1">
                Has ajustado las reglas manualmente
              </p>
            </motion.div>
          )}
        </div>
      </GlassCard>

      {/* Configuracion manual de reglas de memoria */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Reglas de Memoria</h2>

        <div className="space-y-5">
          <div>
            <label htmlFor="memory-time-limit" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Clock size={14} className="text-brand-light" />
              Tiempo total de partida (segundos)
            </label>
            <div className="flex items-center gap-4">
              <input
                id="memory-time-limit"
                type="range"
                min={10}
                max={300}
                step={5}
                value={config.timeLimit}
                aria-valuetext={`${config.timeLimit} segundos`}
                onChange={(e) => onConfigChange('timeLimit', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-brand-base"
              />
              <span className="w-16 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.timeLimit}s
              </span>
            </div>
          </div>

          {/* Puntos por pareja — rango unificado 5-15 (ADR-114) */}
          <div>
            <label htmlFor="memory-points-correct" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Zap size={14} className="text-success-base" />
              Puntos por pareja correcta
            </label>
            <div className="flex items-center gap-4">
              <input
                id="memory-points-correct"
                type="range"
                min={5}
                max={15}
                step={5}
                value={config.pointsPerCorrect}
                aria-valuetext={`+${config.pointsPerCorrect} puntos por pareja correcta`}
                onChange={(e) => onConfigChange('pointsPerCorrect', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-success-base"
              />
              <span className="w-16 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                +{config.pointsPerCorrect}
              </span>
            </div>
          </div>

          {/* Penalización por error — rango unificado -5..0 (ADR-114) */}
          <div>
            <label htmlFor="memory-penalty-error" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <AlertTriangle size={14} className="text-error-base" />
              Penalización por pareja incorrecta
            </label>
            <div className="flex items-center gap-4">
              <input
                id="memory-penalty-error"
                type="range"
                min={-5}
                max={0}
                step={1}
                value={config.penaltyPerError}
                aria-valuetext={`${config.penaltyPerError} puntos por pareja incorrecta`}
                onChange={(e) => onConfigChange('penaltyPerError', Number.parseInt(e.target.value, 10))}
                className="flex-1 penalty-range"
                // El accent-color nativo pinta desde min hacia value. Con rango
                // negativo eso deja la barra más llena cuanto menor es la
                // penalización (valor cercano a 0), al revés de la intuición
                // del profe ("más fill = más penalización"). Ocultamos el
                // accent-color con transparent y pintamos un gradient
                // explícito proporcional a |value| / 5 desde la izquierda.
                style={{
                  accentColor: 'transparent',
                  background: `linear-gradient(to right, var(--color-error-base) 0%, var(--color-error-base) ${
                    (Math.abs(config.penaltyPerError) / 5) * 100
                  }%, var(--color-background-elevated) ${
                    (Math.abs(config.penaltyPerError) / 5) * 100
                  }%, var(--color-background-elevated) 100%)`
                }}
              />
              <span className="w-16 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.penaltyPerError}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Vincular sensor RFID */}
      <GlassCard className="p-6 lg:col-span-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
              <Wifi size={20} className="text-accent-indigo" />
              Vincular Sensor RFID
            </h2>
            <p className="text-sm text-text-muted">
              Solo se aceptarán lecturas del sensor activo cuando la sesión lo requiera.
            </p>
          </div>

          <div className="flex items-center gap-4">
            {currentSensorId ? (
              <div className="flex items-center gap-3 p-3 rounded-xl bg-background-elevated/50 border border-border-default">
                <span className="text-xs font-mono text-text-muted max-w-[150px] truncate">
                  ID: {currentSensorId}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={linkSensor}
                  aria-label="Vincular sensor RFID"
                  onClick={() => onLinkSensorChange(!linkSensor)}
                  className="flex items-center h-6 w-12 rounded-full bg-background-surface relative p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-background-base"
                >
                  <motion.div
                    className={cn(
                      'h-4 w-4 rounded-full shadow-sm',
                      linkSensor ? 'bg-accent-indigo' : 'bg-text-muted'
                    )}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    animate={{ x: linkSensor ? 24 : 0 }}
                  />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-warning-base bg-warning-base/10 p-3 rounded-xl border border-warning-base/20">
                <AlertTriangle size={16} />
                <span className="text-sm">Sensor no detectado</span>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

StepMemoryRules.propTypes = {
  config: configShape.isRequired,
  difficulty: PropTypes.string.isRequired,
  onDifficultyChange: PropTypes.func.isRequired,
  onConfigChange: PropTypes.func.isRequired,
  linkSensor: PropTypes.bool.isRequired,
  onLinkSensorChange: PropTypes.func.isRequired,
  currentSensorId: PropTypes.string
};
