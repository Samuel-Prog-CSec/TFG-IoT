/**
 * @fileoverview Paso 3 del wizard (variante Secuencia): Configuracion de
 * reglas específicas de la mecánica Secuencia.
 *
 * Campos:
 *  - Dificultad (easy/medium/hard) con descripción contextual.
 *  - Min/Max longitud de secuencia (slider doble con validación min ≤ max).
 *  - Segundos de display (memorización) — slider 2..8s.
 *  - Tiempo de reproducción por ronda — slider 5..180s.
 *  - Número de rondas — slider 1..20.
 *  - Botón "Regenerar plan" para previsualizar diferentes layouts.
 */

import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { Check, Clock, Target, Eye, Sparkles, Hourglass, Shuffle, Zap, AlertTriangle, Volume2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import {
  SEQUENCE_DEFAULTS,
  SEQUENCE_LIMITS,
  SEQUENCE_DIFFICULTY_RULES
} from '../../constants/sequenceConfig';
import { generateSequencePlan } from '../../hooks/useSequencePlanGenerator';
import { configShape, cardMappingShape } from './sessionPropTypes';

const DIFFICULTY_BADGES = {
  easy: 'bg-success-base/15 border-success-base/40 text-success-base',
  medium: 'bg-brand-base/15 border-brand-base/40 text-brand-base',
  hard: 'bg-error-base/15 border-error-base/40 text-error-base'
};

export default function StepSequenceRules({
  config,
  difficulty,
  onDifficultyChange,
  onConfigChange,
  sequenceConfig,
  onSequenceConfigChange,
  onSequencePlanChange,
  cards
}) {
  const {
    minSequenceLength = SEQUENCE_DEFAULTS.minSequenceLength,
    maxSequenceLength = SEQUENCE_DEFAULTS.maxSequenceLength,
    displaySeconds = SEQUENCE_DEFAULTS.displaySeconds,
    autoPlayHints = false
  } = sequenceConfig || {};

  const numberOfRounds = config?.numberOfRounds || SEQUENCE_DEFAULTS.numberOfRounds;
  const timeLimit = config?.timeLimit || 30;

  // Regenerar plan al cambiar parámetros relevantes (paramétrico).
  useEffect(() => {
    if (!Array.isArray(cards) || cards.length === 0) return;
    const plan = generateSequencePlan(cards, {
      numberOfRounds,
      minLength: minSequenceLength,
      maxLength: maxSequenceLength
    });
    onSequencePlanChange?.(plan);
  }, [cards, numberOfRounds, minSequenceLength, maxSequenceLength, onSequencePlanChange]);

  const handleSequenceConfig = (key, value) => {
    const next = { ...sequenceConfig, [key]: value };
    // Mantener invariante min <= max ajustando el otro extremo.
    if (key === 'minSequenceLength' && value > next.maxSequenceLength) {
      next.maxSequenceLength = value;
    }
    if (key === 'maxSequenceLength' && value < next.minSequenceLength) {
      next.minSequenceLength = value;
    }
    onSequenceConfigChange?.(next);
  };

  const regeneratePlan = () => {
    if (!Array.isArray(cards) || cards.length === 0) return;
    const plan = generateSequencePlan(cards, {
      numberOfRounds,
      minLength: minSequenceLength,
      maxLength: maxSequenceLength
    });
    onSequencePlanChange?.(plan);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Dificultad con explicación específica */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Dificultad</h2>
        <p className="text-xs text-text-muted mb-4">
          Regula los intentos por carta y la disponibilidad de pistas.
        </p>

        <div className="space-y-3">
          {Object.entries(SEQUENCE_DIFFICULTY_RULES).map(([id, info]) => {
            const isSelected = difficulty === id;
            return (
              <motion.button
                key={id}
                type="button"
                onClick={() => onDifficultyChange(id)}
                whileHover={{ x: 4 }}
                className={cn(
                  'w-full p-4 rounded-xl border-2 text-left transition-colors',
                  isSelected
                    ? cn(DIFFICULTY_BADGES[id], 'shadow-md')
                    : 'border-border-default bg-background-elevated/30 hover:border-border-strong'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="font-medium text-text-primary mb-1 flex items-center gap-2">
                      {info.label}
                      <span className="text-xs font-normal text-text-muted">
                        · {info.maxAttemptsPerCard} {info.maxAttemptsPerCard === 1 ? 'intento' : 'intentos'} por carta
                      </span>
                    </h3>
                    <p className="text-xs text-text-secondary leading-relaxed">{info.description}</p>
                  </div>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="size-6 rounded-full bg-brand-base flex items-center justify-center shrink-0"
                    >
                      <Check size={14} className="text-text-primary" />
                    </motion.div>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
      </GlassCard>

      {/* Configuración de longitud y display */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-accent-amber" /> Configuración de la secuencia
        </h2>

        <div className="space-y-5">
          <SliderRow
            id="seq-min-len"
            icon={<Target size={14} className="text-accent-amber" />}
            label="Longitud mínima"
            min={SEQUENCE_LIMITS.minSequenceLength}
            max={SEQUENCE_LIMITS.maxSequenceLength}
            value={minSequenceLength}
            onChange={v => handleSequenceConfig('minSequenceLength', v)}
            display={`${minSequenceLength} cartas`}
          />

          <SliderRow
            id="seq-max-len"
            icon={<Target size={14} className="text-accent-amber" />}
            label="Longitud máxima"
            min={SEQUENCE_LIMITS.minSequenceLength}
            max={SEQUENCE_LIMITS.maxSequenceLength}
            value={maxSequenceLength}
            onChange={v => handleSequenceConfig('maxSequenceLength', v)}
            display={`${maxSequenceLength} cartas`}
          />

          <SliderRow
            id="seq-display-seconds"
            icon={<Eye size={14} className="text-brand-light" />}
            label="Tiempo de memorización"
            min={SEQUENCE_LIMITS.minDisplaySeconds}
            max={SEQUENCE_LIMITS.maxDisplaySeconds}
            value={displaySeconds}
            onChange={v => handleSequenceConfig('displaySeconds', v)}
            display={`${displaySeconds}s`}
          />

          <SliderRow
            id="seq-rounds"
            icon={<Hourglass size={14} className="text-accent-cyan" />}
            label="Número de rondas"
            min={SEQUENCE_LIMITS.minNumberOfRounds}
            max={SEQUENCE_LIMITS.maxNumberOfRounds}
            value={numberOfRounds}
            onChange={v => onConfigChange?.('numberOfRounds', v)}
            display={`${numberOfRounds}`}
          />

          <SliderRow
            id="seq-time-limit"
            icon={<Clock size={14} className="text-brand-light" />}
            label="Tiempo por ronda"
            min={SEQUENCE_LIMITS.minTimeLimit}
            max={SEQUENCE_LIMITS.maxTimeLimit}
            step={5}
            value={timeLimit}
            onChange={v => onConfigChange?.('timeLimit', v)}
            display={`${timeLimit}s`}
          />

          {/* Puntos por carta correcta — antes hardcoded a 10 (ADR-114).
              Rango unificado 5-15 entre las 3 mecánicas para evitar que un
              docente ajuste valores extremos que distorsionen el ranking. */}
          <SliderRow
            id="seq-points-correct"
            icon={<Zap size={14} className="text-success-base" />}
            label="Puntos por carta correcta"
            min={5}
            max={15}
            step={5}
            value={config?.pointsPerCorrect ?? 10}
            onChange={v => onConfigChange?.('pointsPerCorrect', v)}
            display={`+${config?.pointsPerCorrect ?? 10}`}
          />

          {/* Penalización por carta incorrecta — antes 0 fijo (ADR-114). */}
          <SliderRow
            id="seq-penalty-error"
            icon={<AlertTriangle size={14} className="text-error-base" />}
            label="Penalización por error"
            min={-5}
            max={0}
            step={1}
            value={config?.penaltyPerError ?? -2}
            onChange={v => onConfigChange?.('penaltyPerError', v)}
            display={`${config?.penaltyPerError ?? -2}`}
          />
        </div>
      </GlassCard>

      {/* Audio en las pistas — accesibilidad pre-lectora. Si la carta esperada
          tiene audio, se reproduce al fallar según la dificultad: Fácil → con
          cada pista de texto (hasta 2 veces por carta); Media → una vez en el
          primer fallo (no hay pista de texto, el audio ES la pista); Difícil →
          nunca (un único intento, sin pistas). */}
      <GlassCard className="p-6 lg:col-span-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2 flex-wrap">
              <Volume2 size={20} className="text-accent-amber" />
              Audio en las pistas
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-nano font-bold uppercase tracking-wider bg-accent-amber/15 text-accent-amber border border-accent-amber/30">
                <Sparkles size={10} aria-hidden="true" />
                Ideal si aún no leen
              </span>
            </h2>
            <p className="text-sm text-text-muted">
              Si la carta que toca tiene audio, se reproduce cuando el alumno falla,
              como pista sonora.{' '}
              {difficulty === 'easy' && 'Con dificultad Fácil suena con cada pista (hasta 2 veces por carta).'}
              {difficulty === 'medium' && 'Con dificultad Media suena una vez, en el primer fallo.'}
              {difficulty === 'hard' && 'Con dificultad Difícil no sonará: hay un único intento, sin pistas.'}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={autoPlayHints}
              aria-label="Reproducir el audio de la carta esperada al mostrar pistas"
              disabled={difficulty === 'hard'}
              className={cn(
                'flex items-center h-6 w-12 rounded-full bg-background-surface relative p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber focus-visible:ring-offset-2 focus-visible:ring-offset-background-base',
                difficulty === 'hard' && 'opacity-50 cursor-not-allowed'
              )}
              onClick={() => handleSequenceConfig('autoPlayHints', !autoPlayHints)}
            >
              <motion.div
                className={cn('h-4 w-4 rounded-full shadow-sm', autoPlayHints ? 'bg-accent-amber' : 'bg-text-muted')}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                animate={{ x: autoPlayHints ? 24 : 0 }}
              />
            </button>
            <span className={cn('text-xs font-medium', autoPlayHints && difficulty !== 'hard' ? 'text-accent-amber' : 'text-text-muted')}>
              {(() => {
                if (difficulty === 'hard') return 'No disponible en Difícil';
                return autoPlayHints ? 'Activado' : 'Desactivado';
              })()}
            </span>
          </div>
        </div>
      </GlassCard>

      {/* Plan + regenerar */}
      <GlassCard className="p-6 lg:col-span-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-1">Plan de secuencias</h2>
            <p className="text-sm text-text-muted">
              Cada ronda recibe una secuencia aleatoria entre {minSequenceLength} y {maxSequenceLength}{' '}
              cartas. Puedes regenerar el plan tantas veces como quieras antes de guardar.
            </p>
          </div>
          <motion.button
            type="button"
            onClick={regeneratePlan}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-accent-amber/40 bg-accent-amber/10 text-accent-amber font-medium hover:bg-accent-amber/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber"
          >
            <Shuffle size={16} aria-hidden="true" />
            Regenerar plan
          </motion.button>
        </div>
      </GlassCard>
    </div>
  );
}

function SliderRow({ id, icon, label, min, max, step = 1, value, onChange, display }) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-2 text-sm text-text-secondary mb-2">
        {icon}
        {label}
      </label>
      <div className="flex items-center gap-4">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={`${label}: ${display}`}
          onChange={e => onChange?.(Number.parseInt(e.target.value, 10))}
          className="flex-1 accent-accent-amber"
        />
        <span className="w-20 text-center text-text-primary font-medium bg-background-elevated rounded-lg py-1 tabular-nums">
          {display}
        </span>
      </div>
    </div>
  );
}

SliderRow.propTypes = {
  id: PropTypes.string.isRequired,
  icon: PropTypes.node,
  label: PropTypes.string.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number,
  value: PropTypes.number.isRequired,
  onChange: PropTypes.func,
  display: PropTypes.string.isRequired
};

StepSequenceRules.propTypes = {
  config: configShape.isRequired,
  difficulty: PropTypes.string.isRequired,
  onDifficultyChange: PropTypes.func.isRequired,
  onConfigChange: PropTypes.func.isRequired,
  sequenceConfig: PropTypes.shape({
    minSequenceLength: PropTypes.number,
    maxSequenceLength: PropTypes.number,
    displaySeconds: PropTypes.number
  }),
  onSequenceConfigChange: PropTypes.func.isRequired,
  onSequencePlanChange: PropTypes.func.isRequired,
  cards: PropTypes.arrayOf(cardMappingShape)
};
