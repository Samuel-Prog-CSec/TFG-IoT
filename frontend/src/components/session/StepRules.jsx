/**
 * @fileoverview Paso 3 del wizard (variante Asociacion): Configuracion de reglas.
 * Presets de dificultad, rondas, tiempo, puntos, sensor RFID y compositor de retos.
 *
 * @module components/session/StepRules
 */

import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import {
  Check,
  Clock,
  Target,
  Zap,
  AlertTriangle,
  Sparkles,
  Wifi
} from 'lucide-react';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import AssociationChallengeComposer from './AssociationChallengeComposer';
import { DIFFICULTY_VARIANT_STYLES } from './sessionHelpers';
import { configShape, cardMappingShape, challengePlanItemShape } from './sessionPropTypes';

const DIFFICULTIES = [
  { id: 'easy', label: 'Facil', description: 'Mas tiempo, sin penalizacion' },
  { id: 'medium', label: 'Normal', description: 'Configuracion equilibrada' },
  { id: 'hard', label: 'Dificil', description: 'Menos tiempo, mas penalizacion' }
];

/**
 * Paso 3 (Asociacion/General): Configurar reglas de la partida
 */
export default function StepRules({
  config,
  difficulty,
  onDifficultyChange,
  onConfigChange,
  linkSensor,
  onLinkSensorChange,
  currentSensorId,
  isAssociationSelected,
  associationCards,
  associationChallengePlan,
  onAssociationChallengePlanChange,
  contextName
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Presets de dificultad */}
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

      {/* Configuracion manual */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Configuracion Detallada
        </h2>

        <div className="space-y-5">
          {/* Numero de rondas */}
          <div>
            <label htmlFor="assoc-num-rounds" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Target size={14} className="text-accent-indigo" />
              Numero de rondas
            </label>
            <div className="flex items-center gap-4">
              <input
                id="assoc-num-rounds"
                type="range"
                min={1}
                max={15}
                value={config.numberOfRounds}
                onChange={(e) => onConfigChange('numberOfRounds', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-accent-indigo"
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.numberOfRounds}
              </span>
            </div>
          </div>

          {/* Tiempo por ronda */}
          <div>
            <label htmlFor="assoc-time-limit" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Clock size={14} className="text-brand-light" />
              Tiempo por ronda (segundos)
            </label>
            <div className="flex items-center gap-4">
              <input
                id="assoc-time-limit"
                type="range"
                min={5}
                max={60}
                step={5}
                value={config.timeLimit}
                onChange={(e) => onConfigChange('timeLimit', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-brand-base"
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.timeLimit}s
              </span>
            </div>
          </div>

          {/* Puntos por acierto */}
          <div>
            <label htmlFor="assoc-points-correct" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Zap size={14} className="text-success-base" />
              Puntos por acierto
            </label>
            <div className="flex items-center gap-4">
              <input
                id="assoc-points-correct"
                type="range"
                min={5}
                max={25}
                step={5}
                value={config.pointsPerCorrect}
                onChange={(e) => onConfigChange('pointsPerCorrect', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-success-base"
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                +{config.pointsPerCorrect}
              </span>
            </div>
          </div>

          {/* Penalizacion por error */}
          <div>
            <label htmlFor="assoc-penalty-error" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <AlertTriangle size={14} className="text-error-base" />
              Penalizacion por error
            </label>
            <div className="flex items-center gap-4">
              <input
                id="assoc-penalty-error"
                type="range"
                min={-10}
                max={0}
                value={config.penaltyPerError}
                onChange={(e) => onConfigChange('penaltyPerError', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-error-base"
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.penaltyPerError}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* T-009: Vincular Sensor RFID */}
      <GlassCard className="p-6 lg:col-span-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
              <Wifi size={20} className="text-accent-indigo" />
              Vincular Sensor RFID (T-009)
            </h2>
            <p className="text-sm text-text-muted">
              Si activas esta opcion, solo las lecturas provenientes de tu sensor actual
              seran validas para esta sesion. Util en entornos con multiples sensores simultaneos.
            </p>
          </div>

          <div className="flex items-center gap-4">
            {currentSensorId ? (
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-background-elevated/50 border border-border-default">
                  <span className="text-xs font-mono text-text-muted max-w-[150px] truncate">
                    ID: {currentSensorId}
                  </span>
                  <button
                    type="button"
                    className="flex items-center h-6 w-12 rounded-full bg-background-surface relative p-1"
                    onClick={() => onLinkSensorChange(!linkSensor)}
                  >
                    <motion.div
                      className={cn("h-4 w-4 rounded-full shadow-sm", linkSensor ? "bg-accent-indigo" : "bg-text-muted")}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      animate={{ x: linkSensor ? 24 : 0 }}
                    />
                  </button>
                </div>
                <span className={cn("text-xs font-medium", linkSensor ? "text-accent-indigo" : "text-text-muted")}>
                  {linkSensor ? "Sensor vinculado" : "Sin vincular"}
                </span>
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

      {isAssociationSelected && (
        <AssociationChallengeComposer
          cards={associationCards}
          challengePlan={associationChallengePlan}
          onPlanChange={onAssociationChallengePlanChange}
          contextName={contextName}
        />
      )}
    </div>
  );
}

StepRules.propTypes = {
  config: configShape.isRequired,
  difficulty: PropTypes.string.isRequired,
  onDifficultyChange: PropTypes.func.isRequired,
  onConfigChange: PropTypes.func.isRequired,
  linkSensor: PropTypes.bool.isRequired,
  onLinkSensorChange: PropTypes.func.isRequired,
  currentSensorId: PropTypes.string,
  isAssociationSelected: PropTypes.bool,
  associationCards: PropTypes.arrayOf(cardMappingShape),
  associationChallengePlan: PropTypes.arrayOf(challengePlanItemShape),
  onAssociationChallengePlanChange: PropTypes.func,
  contextName: PropTypes.string
};
