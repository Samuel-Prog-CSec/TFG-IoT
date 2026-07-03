/**
 * @fileoverview Componente para configurar retos de asociacion ronda por ronda.
 * Permite seleccionar la tarjeta objetivo y una consigna opcional para cada ronda.
 *
 * @module components/session/AssociationChallengeComposer
 */

import PropTypes from 'prop-types';
import GlassCard from '../ui/GlassCard';
import InputPremium from '../ui/InputPremium';
import SelectPremium from '../ui/SelectPremium';
import { cardMappingShape, challengePlanItemShape } from './sessionPropTypes';

/**
 * Compositor de retos de asociacion por rondas
 */
export default function AssociationChallengeComposer({ cards, challengePlan, onPlanChange, disabled = false }) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const safePlan = Array.isArray(challengePlan) ? challengePlan : [];

  // Construir opciones sin exponer UIDs al docente; desambiguar valores duplicados con indice
  const valueCounts = new Map();
  for (const card of safeCards) {
    const val = card.assignedValue || '';
    valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
  }
  const valueSeenCount = new Map();
  const cardOptions = safeCards.map(card => {
    const val = card.assignedValue || '';
    const total = valueCounts.get(val) || 1;
    let label = val;
    if (total > 1) {
      const seen = (valueSeenCount.get(val) || 0) + 1;
      valueSeenCount.set(val, seen);
      label = `${val} (#${seen})`;
    }
    return { value: card.uid, label };
  });

  const cardByUid = new Map(safeCards.map(card => [card.uid, card]));

  const handleCardChange = (roundNumber, selectedUid) => {
    const selectedCard = cardByUid.get(selectedUid);
    if (!selectedCard) {
      return;
    }

    onPlanChange(prev =>
      (Array.isArray(prev) ? prev : []).map(item =>
        item.roundNumber === roundNumber
          ? {
              ...item,
              uid: selectedCard.uid,
              assignedValue: selectedCard.assignedValue,
              displayData: selectedCard.displayData || {}
            }
          : item
      )
    );
  };

  const handlePromptChange = (roundNumber, promptText) => {
    onPlanChange(prev =>
      (Array.isArray(prev) ? prev : []).map(item =>
        item.roundNumber === roundNumber
          ? {
              ...item,
              promptText
            }
          : item
      )
    );
  };

  if (safePlan.length === 0) {
    return (
      <GlassCard className="p-6 lg:col-span-2 border border-warning-base/40">
        <h2 className="text-lg font-semibold text-text-primary mb-2">Retos de Asociación</h2>
        <p className="text-sm text-warning-base">
          Selecciona un mazo con tarjetas y define el numero de rondas para configurar los retos.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-6 lg:col-span-2">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary mb-1">Plan de retos (Asociación)</h2>
        <p className="text-sm text-text-muted">
          Hemos generado un plan para las {safePlan.length} rondas. Puedes personalizarlo:
          elige la tarjeta objetivo y, si quieres, añade una consigna breve.
        </p>
      </div>

      <div className="space-y-4">
        {safePlan.map(item => (
          <div
            key={`association-round-${item.roundNumber}`}
            className="rounded-xl border border-border-default bg-background-base/40 p-4"
          >
            {/* "Ronda X" como título de la fila (no dentro de una columna): así
                «Tarjeta objetivo» y «Consigna opcional» quedan alineadas a la
                misma altura, en vez de desfasadas por este rótulo. */}
            <p className="text-sm font-medium text-text-primary mb-3">Ronda {item.roundNumber}</p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <SelectPremium
                  label="Tarjeta objetivo"
                  value={item.uid || ''}
                  onChange={value => handleCardChange(item.roundNumber, value)}
                  options={cardOptions}
                  disabled={disabled}
                  placeholder="Selecciona una tarjeta"
                />
              </div>

              <div className="lg:col-span-2">
                <InputPremium
                  label="Consigna opcional"
                  value={item.promptText || ''}
                  onChange={e => handlePromptChange(item.roundNumber, e.target.value)}
                  maxLength={180}
                  disabled={disabled}
                  placeholder={`Ej: Busca ${item.assignedValue || 'la carta correcta'}`}
                  hint="Se muestra en la ronda como guia del reto."
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

AssociationChallengeComposer.propTypes = {
  cards: PropTypes.arrayOf(cardMappingShape),
  challengePlan: PropTypes.arrayOf(challengePlanItemShape),
  onPlanChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  contextName: PropTypes.string
};
