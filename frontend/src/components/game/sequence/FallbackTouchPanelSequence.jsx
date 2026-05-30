/**
 * @fileoverview Panel táctil para Secuencia (sensor RFID no disponible).
 *
 * Diferencias respecto al `FallbackTouchPanel` de Asociación:
 *  - El alumno escanea durante la fase reproducing en orden — el panel debe
 *    mantener todas las cartas del mazo visibles SIN reordenarlas, porque la
 *    reordenación rompería la pista espacial implícita.
 *  - Cada tap es independiente: no usamos un `tappedUid` global que bloquee
 *    el resto. El feedback visual lo aporta el flip de la carta del board
 *    cuando llega `sequence_card_result`.
 *  - Cooldown 250ms (alineado con `useGameSocket.DEDUPE_MS_BY_SOURCE.touch_fallback`).
 */
import { memo, useRef } from 'react';
import { m as motion } from 'framer-motion';
import { Hand } from 'lucide-react';
import PropTypes from 'prop-types';
import CardAssetPreview from '../../ui/CardAssetPreview';
import { cn } from '../../../lib/utils';

const TAP_COOLDOWN_MS = 250;

function getSortKey(card) {
  return String(card?.assignedValue ?? card?.displayData?.display ?? card?.uid ?? '').toLowerCase();
}

// Mostramos progreso "carta X de N" SIN revelar cuál es la siguiente: el
// alumno todavía debe recordar el orden (eso es la mecánica). Resaltar la
// próxima carta filtraría la `expectedSequence` y rompería la pedagogía.
function FallbackTouchPanelSequence({ cards, onSelectCard, cursor = 0, sequenceLength = 0 }) {
  const lastTapRef = useRef(0);

  const visibleCards = (Array.isArray(cards) ? [...cards] : [])
    .sort((a, b) => getSortKey(a).localeCompare(getSortKey(b), 'es'))
    .slice(0, 12);

  const colsClass = (() => {
    const n = visibleCards.length;
    if (n <= 3) return 'grid-cols-3';
    if (n <= 4) return 'grid-cols-4';
    return 'grid-cols-3 md:grid-cols-6';
  })();

  const handleTap = card => {
    const now = Date.now();
    if (now - lastTapRef.current < TAP_COOLDOWN_MS) {
      return;
    }
    lastTapRef.current = now;
    onSelectCard?.(card);
  };

  return (
    <div className="mt-2 w-full max-w-5xl rounded-2xl border border-accent-amber/25 bg-accent-amber/5 p-3 sm:p-4">
      <div className="flex flex-col items-center justify-center gap-1 text-text-secondary mb-3">
        <div className="flex items-center gap-2">
          <Hand size={14} className="shrink-0 text-accent-amber" aria-hidden="true" />
          <p className="text-xs font-medium">
            Toca las cartas en el orden que viste para reproducir la secuencia
          </p>
        </div>
        {sequenceLength > 0 && (
          <p
            className="text-micro font-medium text-accent-amber tabular-nums"
            aria-live="polite"
          >
            Carta {Math.min(cursor + 1, sequenceLength)} de {sequenceLength}
          </p>
        )}
      </div>

      {visibleCards.length > 0 && (
        <fieldset
          className={cn('grid gap-3 sm:gap-4 border-0 p-0 m-0', colsClass)}
          aria-label="Cartas disponibles para reproducir la secuencia"
        >
          {visibleCards.map(card => (
            <motion.button
              key={`fallback-seq-card-${card.uid}`}
              type="button"
              onClick={() => handleTap(card)}
              whileTap={{ scale: 0.94, backgroundColor: 'rgba(245, 158, 11, 0.2)' }}
              whileHover={{ y: -2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              className="relative aspect-square min-h-[72px] md:min-h-[110px] rounded-xl border-2 border-border-default bg-background-base/60 p-2 text-center hover:border-accent-amber/50 hover:shadow-[0_4px_16px_rgba(245,158,11,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-amber focus-visible:ring-offset-2 focus-visible:ring-offset-background-base transition-[background-color,border-color,box-shadow]"
              aria-label={`Tocar carta: ${card.assignedValue || card.uid}`}
            >
              <CardAssetPreview
                asset={card.displayData || { display: card.assignedValue || card.uid }}
                className="h-full w-full rounded-lg"
                fit="contain"
                loading="eager"
                fallbackLabel={card.assignedValue || card.uid}
                largeFallback
              />
            </motion.button>
          ))}
        </fieldset>
      )}
    </div>
  );
}

FallbackTouchPanelSequence.propTypes = {
  cards: PropTypes.array,
  onSelectCard: PropTypes.func.isRequired,
  cursor: PropTypes.number,
  sequenceLength: PropTypes.number
};

export default memo(FallbackTouchPanelSequence);
