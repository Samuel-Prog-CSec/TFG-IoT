/**
 * @fileoverview Paso 1 del wizard: Seleccion de mazo.
 * Muestra una cuadricula de mazos disponibles con preview de assets.
 *
 * @module components/session/StepDeck
 */

import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  CreditCard,
  Palette,
  Plus,
  AlertTriangle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import GlassCard from '../ui/GlassCard';
import ButtonPremium from '../ui/ButtonPremium';
import CardAssetPreview from '../ui/CardAssetPreview';
import { SkeletonCard } from '../ui/SkeletonShimmer';
import { ROUTES } from '../../constants/routes';
import { deckShape } from './sessionPropTypes';

/**
 * Paso 1: Seleccionar Mazo
 */
export default function StepDeck({ decks, loading, selectedDeckId, onSelect }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {['deck-skeleton-1', 'deck-skeleton-2', 'deck-skeleton-3', 'deck-skeleton-4', 'deck-skeleton-5', 'deck-skeleton-6'].map((skeletonKey) => (
            <SkeletonCard key={skeletonKey} className="h-48" />
          ))}
        </div>
      </GlassCard>
    );
  }

  if (decks.length === 0) {
    return (
      <GlassCard className="p-8 text-center">
        <div className="size-16 mx-auto mb-4 rounded-full bg-warning-base/20 flex items-center justify-center">
          <AlertTriangle className="text-warning-base" size={32} />
        </div>
        <h3 className="text-xl font-semibold text-text-primary mb-2">
          No tienes mazos creados
        </h3>
        <p className="text-text-muted mb-6">
          Necesitas crear al menos un mazo de cartas antes de crear una sesion.
        </p>
        <ButtonPremium icon={<Plus size={18} />} onClick={() => navigate(ROUTES.CARD_DECKS_NEW)}>
          Crear mi primer mazo
        </ButtonPremium>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text-primary mb-1">
          Selecciona un Mazo
        </h2>
        <p className="text-text-muted text-sm">
          El mazo determina las tarjetas RFID y los assets que se usarán en el juego
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {decks.map((deck) => {
          const deckId = deck.id || deck._id;
          const cardsPreview = deck.cardMappings || [];
          const cardsCount = deck.cardsCount || deck.cardMappings?.length || 0;
          const contextName = deck.context?.name || deck.contextId?.name || 'Contexto';

          return (
          <motion.button
            key={deckId}
            onClick={() => onSelect(deck)}
            className={cn(
              'relative p-4 rounded-xl border-2 text-left transition-[border-color,background-color]',
              'hover:border-accent-indigo/50 hover:bg-accent-indigo/5',
              selectedDeckId === deckId
                ? 'border-accent-indigo bg-accent-indigo/10'
                : 'border-border-default bg-background-elevated/30'
            )}
            aria-pressed={selectedDeckId === deckId}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {selectedDeckId === deckId && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 right-2 size-7 rounded-full bg-accent-indigo flex items-center justify-center shadow-lg shadow-accent-indigo/40"
              >
                <Check size={14} className="text-text-primary" />
              </motion.div>
            )}

            {/* Preview de assets */}
            <div className="flex gap-1.5 mb-3 h-8 overflow-hidden">
              {cardsPreview.slice(0, 6).map((mapping) => (
                <CardAssetPreview
                  key={mapping.uid || mapping.id || mapping._id}
                  asset={mapping.displayData}
                  className="size-8 rounded-md flex-shrink-0"
                  fallbackLabel={mapping.displayData?.display || mapping.displayData?.emoji || '\uD83C\uDFB3'}
                />
              ))}
            </div>

            <h3 className="font-medium text-text-primary mb-1">{deck.name}</h3>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <CreditCard size={12} />
                {cardsCount} cartas
              </span>
              <span className="flex items-center gap-1">
                <Palette size={12} />
                {contextName}
              </span>
            </div>
          </motion.button>
          );
        })}
      </div>

      {!selectedDeckId && (
        <p className="mt-4 text-center text-sm text-text-muted">
          Selecciona un mazo para continuar
        </p>
      )}

      <div className="mt-6 pt-4 border-t border-border-subtle flex justify-center">
        <ButtonPremium variant="ghost" icon={<Plus size={16} />} onClick={() => navigate(ROUTES.CARD_DECKS_NEW)}>
          Crear nuevo mazo
        </ButtonPremium>
      </div>
    </GlassCard>
  );
}

StepDeck.propTypes = {
  decks: PropTypes.arrayOf(deckShape).isRequired,
  loading: PropTypes.bool.isRequired,
  selectedDeckId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelect: PropTypes.func.isRequired
};
