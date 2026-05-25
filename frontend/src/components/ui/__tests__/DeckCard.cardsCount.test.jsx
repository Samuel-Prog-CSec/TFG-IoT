/**
 * @fileoverview Regresión del conteo de tarjetas en DeckCard (QA 2026-05-25).
 *
 * Bug: en el listado de mazos el DTO trunca `cardMappings` a 6 (preview de
 * miniaturas) pero envía `cardsCount` con la longitud real. DeckCard leía
 * `cardMappings?.length` ANTES de `cardsCount`, así que un mazo de memoria de
 * 12 tarjetas mostraba "6 tarjetas" en la card mientras el detalle mostraba 12.
 * Fix: priorizar `cardsCount` y caer a `cardMappings.length` solo si falta.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeckCard from '../DeckCard';

// Sub-componentes con assets/posicionamiento — se simplifican para aislar el
// conteo (no aportan al texto "N tarjetas").
vi.mock('../CardAssetPreview', () => ({ default: () => <div data-testid="asset" /> }));
vi.mock('../Tooltip', () => ({ default: ({ children }) => <>{children}</> }));

const SIX_MAPPINGS = [
  { uid: '01', displayData: { key: 'circle', display: 'Círculo' } },
  { uid: '02', displayData: { key: 'circle-b', display: 'Círculo' } },
  { uid: '03', displayData: { key: 'square', display: 'Cuadrado' } },
  { uid: '04', displayData: { key: 'square-b', display: 'Cuadrado' } },
  { uid: '05', displayData: { key: 'triangle', display: 'Triángulo' } },
  { uid: '06', displayData: { key: 'triangle-b', display: 'Triángulo' } },
];

const makeDeck = (overrides = {}) => ({
  _id: 'deck-1',
  name: 'Formas Memoria',
  description: 'Mazo con parejas de formas',
  contextId: { _id: 'ctx-1', name: 'Formas Básicas' },
  status: 'active',
  createdAt: '2026-05-25T00:00:00.000Z',
  cardsCount: 12,
  cardMappings: SIX_MAPPINGS,
  ...overrides,
});

const renderCard = deck =>
  render(
    <MemoryRouter>
      <DeckCard deck={deck} />
    </MemoryRouter>,
  );

describe('DeckCard — conteo real de tarjetas', () => {
  it('usa cardsCount (12) aunque cardMappings venga truncado a 6 en el listado', () => {
    renderCard(makeDeck());
    expect(screen.getByText(/12\s*tarjetas/)).toBeTruthy();
    expect(screen.queryByText(/^6\s*tarjetas/)).toBeNull();
  });

  it('cae a cardMappings.length cuando no hay cardsCount', () => {
    renderCard(makeDeck({ cardsCount: undefined }));
    expect(screen.getByText(/6\s*tarjetas/)).toBeTruthy();
  });
});
