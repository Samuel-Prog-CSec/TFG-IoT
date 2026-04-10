/**
 * @fileoverview Panel táctil alternativo cuando no hay sensor RFID conectado.
 * Muestra las cartas disponibles como botones para que el jugador
 * pueda responder tocando directamente en la pantalla.
 */

import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import PropTypes from 'prop-types';
import CardAssetPreview from '../ui/CardAssetPreview';

export default function FallbackTouchPanel({ cards, onSelectCard, onPauseRequest, canPause }) {
  const visibleCards = Array.isArray(cards) ? cards.slice(0, 12) : [];

  return (
    <div className="mt-3 w-full max-w-3xl rounded-xl border border-warning-base/30 bg-warning-base/10 p-2.5">
      <div className="flex items-center gap-2 text-warning-base">
        <AlertTriangle size={14} className="shrink-0" />
        <p className="text-xs font-semibold">Sin sensor RFID — toca una carta para responder</p>
      </div>

      {visibleCards.length > 0 && (
        <fieldset
          className="mt-2 grid grid-cols-3 sm:grid-cols-6 gap-1.5 border-0 p-0 m-0"
          aria-label="Cartas disponibles para selección táctil"
        >
          {visibleCards.map(card => (
            <motion.button
              key={`fallback-card-${card.uid}`}
              type="button"
              onClick={() => onSelectCard(card)}
              // TOKEN-EXCEPTION: Framer Motion whileTap requires direct color value for interpolation
              whileTap={{ scale: 0.92, backgroundColor: 'rgba(99, 102, 241, 0.2)' }}
              aria-label={`Seleccionar carta: ${card.assignedValue || card.uid}`}
              className="rounded-lg border border-border-default bg-background-base/40 p-1.5 text-center hover:bg-background-base/60 transition-colors focus-visible:ring-2 focus-visible:ring-accent-indigo"
            >
              <CardAssetPreview
                asset={card.displayData || { display: card.assignedValue || card.uid }}
                className="h-14 w-full rounded"
                fit="contain"
                loading="eager"
                fallbackLabel={card.assignedValue || card.uid}
              />
            </motion.button>
          ))}
        </fieldset>
      )}

      {canPause && (
        <button
          type="button"
          onClick={onPauseRequest}
          className="mt-2 text-[10px] px-2 py-1 rounded bg-background-base/60 text-text-secondary border border-border-subtle hover:bg-background-base/80 transition-colors"
        >
          Pausar para revisar sensor
        </button>
      )}
    </div>
  );
}

FallbackTouchPanel.propTypes = {
  cards: PropTypes.array,
  onSelectCard: PropTypes.func.isRequired,
  onPauseRequest: PropTypes.func.isRequired,
  canPause: PropTypes.bool
};
