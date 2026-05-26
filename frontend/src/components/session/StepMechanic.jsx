/**
 * @fileoverview Paso 2 del wizard: Seleccion de mecanica de juego.
 * Muestra las mecanicas disponibles con indicadores de disponibilidad.
 *
 * @module components/session/StepMechanic
 */

import PropTypes from 'prop-types';
import { m as motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import { SkeletonCard } from '../ui/SkeletonShimmer';
import { isMechanicSelectable } from './sessionHelpers';
import { mechanicShape } from './sessionPropTypes';
import { getMechanicMeta } from '../../constants/mechanicLabels';
import { getMechanicTheme } from '../../lib/mechanicTheme';

/**
 * Paso 2: Seleccionar Mecanica
 */
export default function StepMechanic({ mechanics, loading, selectedMechanicId, onSelect, memoryPairWarning }) {
  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[var(--space-fluid-gutter)]">
          {['mechanic-skeleton-1', 'mechanic-skeleton-2', 'mechanic-skeleton-3'].map((skeletonKey) => (
            <SkeletonCard key={skeletonKey} className="h-48" />
          ))}
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Selecciona la Mecánica de Juego
        </h2>
        <p className="text-text-muted text-sm">
          La mecánica define cómo interactuarán los estudiantes con las tarjetas
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {mechanics.map((mechanic) => {
          const meta = getMechanicMeta(mechanic.name);
          const IconComponent = meta.icon;
          const mechanicId = mechanic.id || mechanic._id;
          const selectable = isMechanicSelectable(mechanic);
          const selected = selectable && selectedMechanicId === mechanicId;
          // Tema canónico de la mecánica para tintar la card seleccionada con
          // su color signature (Memoria=indigo, Asociación=cyan, Secuencia=ámbar).
          // Antes todas las cards seleccionadas usaban brand-base (morado) y
          // perdían la personalidad cromática de la mecánica.
          const theme = getMechanicTheme(mechanic.name);

          return (
            <motion.button
              key={mechanicId}
              onClick={() => onSelect(mechanic)}
              disabled={!selectable}
              className={cn(
                'relative p-6 rounded-xl border-2 text-left transition-[border-color,background-color]',
                selectable
                  ? !selected && `hover:${theme.accentBorderClass} hover:${theme.accentBgSoftClass}`
                  : 'opacity-70 cursor-not-allowed border-border-default bg-background-base/40',
                selected
                  ? cn(theme.accentBorderClass, theme.accentBgSoftClass, 'border-2')
                  : selectable && 'border-border-default bg-background-elevated/30'
              )}
              aria-pressed={selected}
              whileHover={selectable ? { scale: 1.03, y: -4 } : undefined}
              whileTap={selectable ? { scale: 0.98 } : undefined}
            >
              {!selectable && (
                <span className="absolute top-3 right-3 rounded-full border border-warning-base/40 bg-warning-base/10 px-2 py-0.5 text-micro font-medium text-warning-base">
                  Próximamente
                </span>
              )}

              {selected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={cn(
                    'absolute top-3 right-3 size-7 rounded-full flex items-center justify-center shadow-lg',
                    theme.accentBgClass
                  )}
                >
                  <Check size={14} className={theme.accentClass} />
                </motion.div>
              )}

              <div
                className={cn(
                  'size-14 mb-4 rounded-xl flex items-center justify-center transition-colors',
                  selected
                    ? cn(theme.accentBgClass, theme.accentClass)
                    : 'bg-background-elevated/80 text-text-secondary'
                )}
                aria-hidden="true"
              >
                <IconComponent size={28} strokeWidth={1.75} />
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                {mechanic.displayName || mechanic.name}
              </h3>
              <p className="text-sm text-text-muted line-clamp-3">
                {mechanic.description || 'Mecánica de juego interactiva'}
              </p>

              {!selectable && (
                <p className="mt-3 text-xs text-warning-base/90">
                  Esta mecánica no está habilitada para creación de sesiones en este entorno.
                </p>
              )}
            </motion.button>
          );
        })}
      </div>

      {memoryPairWarning && (
        <div className="mt-4 p-4 rounded-xl border border-warning-base/30 bg-warning-base/10 text-warning-base text-sm">
          <p className="font-medium mb-1">Mazo no compatible con memoria</p>
          <p className="text-warning-base/80">{memoryPairWarning}</p>
        </div>
      )}
    </GlassCard>
  );
}

StepMechanic.propTypes = {
  mechanics: PropTypes.arrayOf(mechanicShape).isRequired,
  loading: PropTypes.bool.isRequired,
  selectedMechanicId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelect: PropTypes.func.isRequired,
  memoryPairWarning: PropTypes.string
};
