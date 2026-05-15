/**
 * @fileoverview Panel de detalle específico para sesiones de Memoria.
 * Muestra el tablero (boardLayout) en grid 2D, número de parejas y
 * recordatorio de configuración pendiente cuando no hay layout aún.
 *
 * Parte de la reorganización de SessionDetail por mecánica (ADR-114).
 *
 * @module components/session/detail/SessionDetailMemoryPanel
 */

import { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Map, AlertTriangle, Layers } from 'lucide-react';
import GlassCard from '../../ui/GlassCard';
import CardAssetPreview from '../../ui/CardAssetPreview';
import EmptyState from '../../ui/EmptyState';
import ButtonPremium from '../../ui/ButtonPremium';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes';

const MEMORY_GROUP_SIZE = 2;

function SessionDetailMemoryPanel({ session }) {
  const navigate = useNavigate();
  const boardLayout = useMemo(
    () => (Array.isArray(session?.boardLayout) ? session.boardLayout : []),
    [session]
  );
  const sortedSlots = useMemo(
    () => boardLayout.toSorted((a, b) => Number(a.slotIndex) - Number(b.slotIndex)),
    [boardLayout]
  );

  const numberOfPairs = Math.floor(boardLayout.length / MEMORY_GROUP_SIZE);
  const sessionId = session?.id || session?._id;
  const hasBoard = boardLayout.length > 0;

  // Calculamos columnas razonables para el tablero (entre 4 y 6) según total
  // de cartas, manteniendo proporción casi cuadrada.
  const cols = (() => {
    const total = boardLayout.length;
    if (total <= 8) return 4;
    if (total <= 16) return 4;
    if (total <= 24) return 6;
    return 6;
  })();

  if (!hasBoard) {
    return (
      <GlassCard className="p-6">
        <EmptyState
          title="Tablero pendiente de configurar"
          description="La mecánica Memoria requiere distribuir las parejas en un tablero antes de jugar. Cada pareja debe colocarse en dos celdas del grid."
          icon={<AlertTriangle size={28} className="text-warning-base" />}
          action={
            <ButtonPremium
              variant="primary"
              onClick={() => navigate(ROUTES.BOARD_SETUP_WITH_ID(sessionId))}
            >
              <Map size={16} />
              Configurar tablero
            </ButtonPremium>
          }
        />
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Layers size={18} className="text-accent-indigo" />
            Tablero del juego
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {numberOfPairs} {numberOfPairs === 1 ? 'pareja distribuida' : 'parejas distribuidas'} en {boardLayout.length} celdas. El alumno verá las cartas boca abajo y deberá emparejarlas.
          </p>
        </div>
        <ButtonPremium
          variant="secondary"
          size="sm"
          onClick={() => navigate(ROUTES.BOARD_SETUP_WITH_ID(sessionId))}
        >
          <Map size={14} />
          Reconfigurar
        </ButtonPremium>
      </div>

      <div
        className="grid gap-2 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {sortedSlots.map(slot => {
          const display = slot.displayData?.display || slot.displayData?.emoji;
          const label = slot.displayData?.value || slot.assignedValue || slot.uid;
          return (
            <div
              key={`${slot.slotIndex}-${slot.uid}`}
              className="aspect-square rounded-xl border border-accent-indigo/20 bg-glass-bg p-2 flex flex-col items-center justify-center gap-1"
              title={`Slot ${slot.slotIndex} · ${label}`}
            >
              <CardAssetPreview
                asset={slot.displayData}
                alt={label}
                className="size-full rounded-lg"
                fit="contain"
                fallbackLabel={display || label}
              />
              <span className="text-[10px] text-text-muted tabular-nums">
                #{Number(slot.slotIndex) + 1}
              </span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

SessionDetailMemoryPanel.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
    boardLayout: PropTypes.array,
    cardMappings: PropTypes.array
  })
};

export default memo(SessionDetailMemoryPanel);
