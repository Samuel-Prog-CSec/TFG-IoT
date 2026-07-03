/**
 * @fileoverview Paso 4 del wizard: Revision y nombre de la sesion.
 * Muestra un resumen de toda la configuracion y permite definir el nombre.
 *
 * @module components/session/StepReview
 */

import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import {
  CreditCard,
  Layers,
  Settings,
  Clock,
  Target
} from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import InputPremium from '../ui/InputPremium';
import CardAssetPreview from '../ui/CardAssetPreview';
import AudioPlayBadge from '../ui/AudioPlayBadge';
import CharacterMascot from '../game/CharacterMascot';
import { getId } from '../../lib/entityId';
import { normalizeMechanicName } from './sessionHelpers';
import { deckShape, mechanicShape, configShape } from './sessionPropTypes';

// Mecánicas con tinte de halo propio para Otto en la revisión. Si el nombre
// no es una de estas, se omite `mechanicType` (el halo cae a su color neutro).
const MASCOT_MECHANIC_TYPES = new Set(['memory', 'association', 'sequence']);

/**
 * Paso 4: Revisar y Crear
 */
export default function StepReview({ sessionConfig, setSessionConfig, selectedDeck, selectedMechanic }) {
  const mechanicName = normalizeMechanicName(selectedMechanic);
  const isMemory = mechanicName === 'memory';
  const mascotMechanicType = MASCOT_MECHANIC_TYPES.has(mechanicName) ? mechanicName : null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Nombre de la sesion — Otto acompaña bajo el input, anclado al fondo
          (mt-auto) para llenar el hueco de esta columna (más corta que el
          resumen) en vez de quedar centrado bajo el grid dejando un vacío.
          `h-full` estira la card a la altura del resumen para que Otto baje de
          verdad al fondo y su bocadillo NO invada el texto de ayuda del input. */}
      <GlassCard className="p-6 h-full">
        {/* Envoltorio flex-col PROPIO: `GlassCard` mete un div block interno, así
            que el `flex` puesto en la card no llega a estos hijos y `mt-auto` no
            funcionaría. Con este div (a la altura completa de la card, estirada
            por `h-full`) Otto se ancla al fondo y su bocadillo queda muy por
            debajo del texto de ayuda del input. */}
        <div className="flex h-full flex-col">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Nombre de la Sesión
          </h2>
          <InputPremium
            value={sessionConfig.name}
            onChange={(e) => setSessionConfig(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Ej: Capitales de Europa - Nivel 1"
            maxLength={100}
            helperText="Un nombre descriptivo ayuda a identificar la sesión"
          />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mt-auto flex justify-center pt-6"
          >
            <CharacterMascot
              mood="happy"
              size="md"
              mechanicType={mascotMechanicType}
              message="¡Casi lista! ¿Empezamos?"
            />
          </motion.div>
        </div>
      </GlassCard>

      {/* Resumen de configuracion */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Resumen de Configuración
        </h2>

        <div className="space-y-4">
          {/* Mazo */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-background-elevated/50">
            <div className="size-10 rounded-lg bg-accent-indigo/20 flex items-center justify-center flex-shrink-0">
              <CreditCard size={18} className="text-accent-indigo" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-muted">Mazo</p>
              <p className="text-text-primary font-medium">{selectedDeck?.name || 'No seleccionado'}</p>
              <p className="text-xs text-text-muted">
                {selectedDeck?.cards?.length || selectedDeck?.cardMappings?.length || 0} cartas
                {(selectedDeck?.context?.name || selectedDeck?.contextId?.name) && (
                  <> {'\u2022'} {selectedDeck?.context?.name || selectedDeck?.contextId?.name}</>
                )}
              </p>
              {/* Mini-galeria de assets del mazo */}
              {selectedDeck?.cardMappings?.length > 0 && (
                <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 max-w-full">
                  {selectedDeck.cardMappings.slice(0, 8).map((m) => (
                    <div key={m.uid || getId(m)} className="relative flex-shrink-0">
                      <CardAssetPreview
                        asset={m.displayData}
                        className="size-10 rounded-lg"
                        fallbackLabel={m.displayData?.display || m.displayData?.emoji || '\uD83C\uDFB3'}
                      />
                      {m.displayData?.audioUrl && (
                        <AudioPlayBadge
                          audioUrl={m.displayData.audioUrl}
                          size="xs"
                          className="absolute -top-1 -right-1"
                        />
                      )}
                    </div>
                  ))}
                  {selectedDeck.cardMappings.length > 8 && (
                    <div className="size-10 rounded-lg flex-shrink-0 bg-background-surface/60 flex items-center justify-center text-xs text-text-muted">
                      +{selectedDeck.cardMappings.length - 8}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Mecanica */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-background-elevated/50">
            <div className="size-10 rounded-lg bg-brand-base/20 flex items-center justify-center flex-shrink-0">
              <Layers size={18} className="text-brand-light" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Mecánica</p>
              <p className="text-text-primary font-medium">
                {selectedMechanic?.displayName || selectedMechanic?.name || 'No seleccionada'}
              </p>
            </div>
          </div>

          {/* Reglas */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-background-elevated/50">
            <div className="size-10 rounded-lg bg-success-base/20 flex items-center justify-center flex-shrink-0">
              <Settings size={18} className="text-success-base" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-text-muted">Configuración</p>
              <div className="grid grid-cols-2 gap-2 mt-1 text-sm">
                {isMemory ? (
                  /* Memoria: tiempo total (sin rondas) */
                  <span className="text-text-secondary">
                    <Clock size={12} className="inline mr-1" />
                    Tiempo total: {sessionConfig.config.timeLimit}s
                  </span>
                ) : (
                  /* Asociacion: rondas + tiempo por ronda */
                  <>
                    <span className="text-text-secondary">
                      <Target size={12} className="inline mr-1" />
                      {sessionConfig.config.numberOfRounds} rondas
                    </span>
                    <span className="text-text-secondary">
                      <Clock size={12} className="inline mr-1" />
                      {sessionConfig.config.timeLimit}s por ronda
                    </span>
                  </>
                )}
                <span className="text-success-base">
                  +{sessionConfig.config.pointsPerCorrect} pts · acierto
                </span>
                <span className="text-error-base">
                  {sessionConfig.config.penaltyPerError === 0
                    ? 'Sin penalización'
                    : `${sessionConfig.config.penaltyPerError} pts · error`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
      </div>
    </div>
  );
}

StepReview.propTypes = {
  sessionConfig: PropTypes.shape({
    name: PropTypes.string,
    config: configShape
  }).isRequired,
  setSessionConfig: PropTypes.func.isRequired,
  selectedDeck: deckShape,
  selectedMechanic: mechanicShape
};
