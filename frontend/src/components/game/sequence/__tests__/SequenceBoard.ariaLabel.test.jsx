/**
 * @fileoverview Regression test del fix de info-leak en aria-label de
 * `SequenceBoard` (QA 2026-05-16).
 *
 * Antes: durante la fase `reproducing` las cartas estaban boca abajo, pero
 * sus aria-label decían `Seleccionar carta: <assignedValue>`, revelando el
 * valor a screen readers (equivalente a hacer trampa).
 *
 * Después: cuando `isFaceUp=false` el aria-label oculta el valor y usa
 * `Carta oculta en posición N`.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SequenceBoard from '../SequenceBoard';
import { SEQUENCE_PHASES } from '../../../../constants/sequenceConfig';

// Mock de SequenceCard para evitar overhead visual.
vi.mock('../SequenceCard', () => ({
  default: () => <div data-testid="seq-card" />,
}));
vi.mock('../SequenceProgressDots', () => ({
  default: () => <div data-testid="seq-progress" />,
}));
vi.mock('../PhaseTransitionOverlay', () => ({
  default: () => null,
}));

const sequence = [
  { uid: 'AA000000', assignedValue: 'España', index: 0 },
  { uid: 'AA000001', assignedValue: 'Francia', index: 1 },
  { uid: 'AA000002', assignedValue: 'Italia', index: 2 },
];

describe('SequenceBoard aria-label (info-leak fix)', () => {
  it('NO revela assignedValue cuando las cartas están boca abajo (reproducing)', () => {
    render(
      <SequenceBoard
        sequence={sequence}
        length={3}
        phase={SEQUENCE_PHASES.REPRODUCING}
        cursor={0}
        onCardTap={() => {}}
      />,
    );

    // Las cartas son interactivas (botón) y boca abajo → aria-label oculta.
    expect(screen.getByLabelText('Carta oculta en posición 1')).toBeTruthy();
    expect(screen.getByLabelText('Carta oculta en posición 2')).toBeTruthy();
    expect(screen.getByLabelText('Carta oculta en posición 3')).toBeTruthy();

    // No debe existir ningún aria-label que filtre el valor.
    expect(screen.queryByLabelText('Seleccionar carta: España')).toBeNull();
    expect(screen.queryByLabelText('Seleccionar carta: Francia')).toBeNull();
    expect(screen.queryByLabelText('Seleccionar carta: Italia')).toBeNull();
  });

  it('revela assignedValue durante memorizing (cartas boca arriba)', () => {
    render(
      <SequenceBoard
        sequence={sequence}
        length={3}
        phase={SEQUENCE_PHASES.MEMORIZING}
        cursor={0}
        onCardTap={() => {}}
      />,
    );

    // En memorizing las cartas son visibles y NO interactivas (sólo se
    // observan). Como CardCellButton sólo renderiza el botón con aria-label
    // cuando `isInteractive=true` (reproducing), aquí no aparece ningún
    // botón aria-labelled. Verificamos que no quedan labels "Carta oculta"
    // tampoco (señal de que tampoco filtra el revés).
    expect(screen.queryByLabelText('Carta oculta en posición 1')).toBeNull();
    expect(screen.queryByLabelText('Seleccionar carta: España')).toBeNull();
  });
});
