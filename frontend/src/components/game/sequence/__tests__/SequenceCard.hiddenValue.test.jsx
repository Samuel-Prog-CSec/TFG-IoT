/**
 * @fileoverview Regresión: SequenceCard no debe filtrar el valor objetivo
 * mientras la carta está boca abajo (QA 2026-05-25).
 *
 * Durante la fase de reproducción las cartas-posición muestran "?" pero antes
 * renderaban siempre el `CardAssetPreview` (imagen con `alt`/fallbackLabel con
 * el valor), aunque la cara estuviera rotada por CSS. Eso dejaba la respuesta
 * en el DOM y en el árbol de accesibilidad: un lector de pantalla o la
 * inspección del DOM revelaban la secuencia de un juego de memoria. El valor
 * solo debe existir cuando la carta está revelada (memorizing o tras acierto).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SequenceCard from '../SequenceCard';
import { SEQUENCE_CARD_STATES } from '../../../../constants/sequenceConfig';

// Simplificamos CardAssetPreview al MISMO vector de la fuga: una imagen cuyo
// `alt` es el valor objetivo. Así el test verifica directamente su presencia.
vi.mock('../../../ui/CardAssetPreview', () => ({
  default: ({ fallbackLabel }) => <img alt={fallbackLabel} src="data:," />,
}));

describe('SequenceCard — ocultación del valor objetivo boca abajo', () => {
  it('boca abajo en reproducción (status hidden, isFaceUp=false) NO expone el valor', () => {
    render(
      <SequenceCard
        uid="0000000A"
        assignedValue="Naranja"
        status={SEQUENCE_CARD_STATES.HIDDEN}
        isFaceUp={false}
      />,
    );
    expect(screen.queryByAltText('Naranja')).toBeNull();
    expect(screen.queryByText('Naranja')).toBeNull();
  });

  it('en memorización (isFaceUp=true) SÍ muestra el valor para que el alumno lo lea', () => {
    render(
      <SequenceCard
        uid="0000000A"
        assignedValue="Naranja"
        status={SEQUENCE_CARD_STATES.HIDDEN}
        isFaceUp
      />,
    );
    expect(screen.getByAltText('Naranja')).toBeTruthy();
  });

  it('revelada por resultado (correct) SÍ muestra el valor aunque isFaceUp=false', () => {
    render(
      <SequenceCard
        uid="0000000A"
        assignedValue="Naranja"
        status={SEQUENCE_CARD_STATES.CORRECT}
        isFaceUp={false}
      />,
    );
    expect(screen.getByAltText('Naranja')).toBeTruthy();
  });
});
