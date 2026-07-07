/**
 * @fileoverview Tests del FallbackTouchPanel: orden alfabético de cartas.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FallbackTouchPanel from '../FallbackTouchPanel';

// Mock de CardAssetPreview para no cargar imágenes en test.
vi.mock('../../ui/CardAssetPreview', () => ({
  default: ({ fallbackLabel }) => <span data-testid="asset">{fallbackLabel}</span>
}));

describe('FallbackTouchPanel', () => {
  it('ordena las cartas alfabéticamente por assignedValue (es)', () => {
    const cards = [
      { uid: 'UID-A', assignedValue: 'Zorro', displayData: { display: 'Zorro' } },
      { uid: 'UID-B', assignedValue: 'Águila', displayData: { display: 'Águila' } },
      { uid: 'UID-C', assignedValue: 'Caballo', displayData: { display: 'Caballo' } },
      { uid: 'UID-D', assignedValue: 'búho', displayData: { display: 'Búho' } }
    ];
    render(
      <FallbackTouchPanel
        cards={cards}
        onSelectCard={() => {}}
        onPauseRequest={() => {}}
      />
    );

    const labels = screen.getAllByTestId('asset').map(el => el.textContent);
    // Esperado: Águila, búho, Caballo, Zorro (es-locale ignora acento; b minúscula intercala).
    expect(labels).toEqual(['Águila', 'búho', 'Caballo', 'Zorro']);
  });

  it('muestra TODAS las cartas del mazo (sin recorte a 12) para que la carta objetivo sea alcanzable en táctil', () => {
    const cards = Array.from({ length: 20 }, (_, i) => ({
      uid: `UID-${i}`,
      assignedValue: `Carta-${String(i).padStart(2, '0')}`,
      displayData: { display: `Carta-${i}` }
    }));
    render(
      <FallbackTouchPanel
        cards={cards}
        onSelectCard={() => {}}
        onPauseRequest={() => {}}
      />
    );

    // El mazo admite hasta 20 cartas; recortar a 12 dejaba rondas IMPOSIBLES de
    // ganar en modo táctil (la carta objetivo podía quedar fuera del panel).
    expect(screen.getAllByTestId('asset')).toHaveLength(20);
  });

  it('usa uid como fallback de sort si no hay assignedValue', () => {
    const cards = [
      { uid: 'ZZZ', displayData: {} },
      { uid: 'AAA', displayData: {} }
    ];
    render(
      <FallbackTouchPanel
        cards={cards}
        onSelectCard={() => {}}
        onPauseRequest={() => {}}
      />
    );

    const labels = screen.getAllByTestId('asset').map(el => el.textContent);
    expect(labels[0]).toBe('AAA');
    expect(labels[1]).toBe('ZZZ');
  });

  it('no falla con array vacío', () => {
    const { container } = render(
      <FallbackTouchPanel
        cards={[]}
        onSelectCard={() => {}}
        onPauseRequest={() => {}}
      />
    );
    expect(container.querySelector('fieldset')).toBeNull();
  });
});
