/**
 * @fileoverview Paso 3 del wizard (variante Asociacion): Configuracion de reglas.
 * Presets de dificultad, rondas, tiempo, puntos, sensor RFID y compositor de retos.
 *
 * @module components/session/StepRules
 */

import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import {
  Check,
  Clock,
  Target,
  Zap,
  AlertTriangle,
  Sparkles,
  Wifi,
  Volume2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import AssociationChallengeComposer from './AssociationChallengeComposer';
import { DIFFICULTY_VARIANT_STYLES, getRangeFillPercent } from './sessionHelpers';
import { configShape, cardMappingShape, challengePlanItemShape } from './sessionPropTypes';
import { ASSOCIATION_LIMITS } from '../../constants/associationConfig';

const DIFFICULTIES = [
  { id: 'easy', label: 'Fácil', description: 'Más tiempo, sin penalización' },
  { id: 'medium', label: 'Normal', description: 'Configuración equilibrada' },
  { id: 'hard', label: 'Difícil', description: 'Menos tiempo, más penalización' }
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
  autoPlayPrompt = false,
  onAutoPlayPromptChange,
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
          Configuración Detallada
        </h2>

        <div className="space-y-5">
          {/* Numero de rondas */}
          <div>
            <label htmlFor="assoc-num-rounds" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <Target size={14} className="text-accent-indigo" />
              Número de rondas
            </label>
            <div className="flex items-center gap-4">
              <input
                id="assoc-num-rounds"
                type="range"
                min={1}
                max={15}
                value={config.numberOfRounds}
                aria-valuetext={`${config.numberOfRounds} ronda${config.numberOfRounds === 1 ? '' : 's'}`}
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
                min={ASSOCIATION_LIMITS.minTimeLimit}
                max={ASSOCIATION_LIMITS.maxTimeLimit}
                step={5}
                value={config.timeLimit}
                aria-valuetext={`${config.timeLimit} segundos`}
                onChange={(e) => onConfigChange('timeLimit', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-brand-base"
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.timeLimit}s
              </span>
            </div>
          </div>

          {/* Puntos por acierto — rango unificado 5-15 (ADR-114) */}
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
                max={15}
                step={5}
                value={config.pointsPerCorrect}
                aria-valuetext={`+${config.pointsPerCorrect} puntos por acierto`}
                onChange={(e) => onConfigChange('pointsPerCorrect', Number.parseInt(e.target.value, 10))}
                className="flex-1 accent-success-base"
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                +{config.pointsPerCorrect}
              </span>
            </div>
          </div>

          {/* Penalizacion por error — rango unificado -5..0 (ADR-114) */}
          <div>
            <label htmlFor="assoc-penalty-error" className="flex items-center gap-2 text-sm text-text-secondary mb-2">
              <AlertTriangle size={14} className="text-error-base" />
              Penalización por error
            </label>
            <div className="flex items-center gap-4">
              <input
                id="assoc-penalty-error"
                type="range"
                // El slider trabaja en MAGNITUD (0..5) y guarda el valor en
                // negativo. Con min=0 el thumb se posiciona en value/5 y el
                // fill pintado a mano (getRangeFillPercent) coincide EXACTO
                // con el thumb: "mas a la derecha = mas penalizacion = mas
                // relleno". Antes el input iba en negativo (min=-5..0) y el
                // fill |value|/5 quedaba invertido respecto al thumb.
                min={0}
                max={5}
                step={1}
                value={Math.abs(config.penaltyPerError)}
                aria-valuetext={config.penaltyPerError === 0 ? 'Sin penalización' : `${config.penaltyPerError} puntos por error`}
                onChange={(e) => onConfigChange('penaltyPerError', -Number.parseInt(e.target.value, 10))}
                className="flex-1 penalty-range"
                style={{
                  accentColor: 'transparent',
                  background: `linear-gradient(to right, var(--color-error-base) 0%, var(--color-error-base) ${
                    getRangeFillPercent(Math.abs(config.penaltyPerError), 0, 5)
                  }%, var(--color-background-elevated) ${
                    getRangeFillPercent(Math.abs(config.penaltyPerError), 0, 5)
                  }%, var(--color-background-elevated) 100%)`
                }}
              />
              <span className="w-12 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1">
                {config.penaltyPerError}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Vincular Sensor RFID — anclar la sesion a un lector especifico */}
      <GlassCard className="p-6 lg:col-span-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
              <Wifi size={20} className="text-accent-indigo" />
              Vincular Sensor RFID
            </h2>
            <p className="text-sm text-text-muted">
              Si activas esta opción, solo las lecturas provenientes de tu sensor actual
              serán válidas para esta sesión. Útil en entornos con múltiples sensores simultáneos.
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
                    role="switch"
                    aria-checked={linkSensor}
                    aria-label="Vincular sensor RFID"
                    className="flex items-center h-6 w-12 rounded-full bg-background-surface relative p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-background-base"
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

      {/* Locución automática de la consigna — solo Asociación. Accesibilidad para
          alumnos pre-lectores: si las tarjetas del reto llevan audio, se reproduce
          solo al empezar cada ronda (el objetivo del reto está oculto, así que el
          audio hace de pregunta). El botón de reproducción manual sigue disponible. */}
      {isAssociationSelected && (
        <GlassCard className="p-6 lg:col-span-2">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
                <Volume2 size={20} className="text-accent-indigo" />
                Locución automática de la consigna
              </h2>
              <p className="text-sm text-text-muted">
                Si las tarjetas del reto tienen audio, se reproducirá automáticamente al
                empezar cada ronda como pista sonora. Útil para alumnos que aún no leen.
                El botón para escuchar la consigna manualmente sigue disponible siempre.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={autoPlayPrompt}
                aria-label="Reproducir la consigna de audio automáticamente"
                className="flex items-center h-6 w-12 rounded-full bg-background-surface relative p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-background-base"
                onClick={() => onAutoPlayPromptChange?.(!autoPlayPrompt)}
              >
                <motion.div
                  className={cn('h-4 w-4 rounded-full shadow-sm', autoPlayPrompt ? 'bg-accent-indigo' : 'bg-text-muted')}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  animate={{ x: autoPlayPrompt ? 24 : 0 }}
                />
              </button>
              <span className={cn('text-xs font-medium', autoPlayPrompt ? 'text-accent-indigo' : 'text-text-muted')}>
                {autoPlayPrompt ? 'Activada' : 'Desactivada'}
              </span>
            </div>
          </div>
        </GlassCard>
      )}

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
  autoPlayPrompt: PropTypes.bool,
  onAutoPlayPromptChange: PropTypes.func,
  contextName: PropTypes.string
};
