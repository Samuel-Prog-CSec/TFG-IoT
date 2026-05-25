/**
 * @fileoverview Regression test de la UX de categoryDominance en el
 * GameOver de Asociación (QA 2026-05-16).
 *
 * Antes: `computeCategoryDominance` del backend devolvía la primera
 * categoría alfabéticamente cuando había empate. Si el alumno acertó
 * todas con ratio 100% se mostraba la primera ("Caballo") como "categoría
 * más fuerte", desmereciendo el logro.
 *
 * Después: detectamos en el frontend si el empate cubre TODAS las
 * categorías acertadas (modo `all`) o sólo un subconjunto (`tied`) y
 * mostramos un mensaje motivador.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameOverStatsAssociation from '../GameOverStatsAssociation';

// MetricPill referencia Lucide internamente — silenciamos.
vi.mock('../../../ui/MetricPill', () => ({
  default: ({ label, value }) => (
    <div data-testid="metric-pill">
      <span data-testid="metric-label">{label}</span>
      <span data-testid="metric-value">{String(value)}</span>
    </div>
  ),
}));

const baseSummary = {
  errors: 0,
  averageResponseTimeMs: 3400,
  totalTimePlayed: 24_000,
};

describe('GameOverStatsAssociation — UX categoryDominance', () => {
  it('cuando TODAS las categorías acertadas están al 100% → "¡Dominio total!"', () => {
    const summary = {
      ...baseSummary,
      association: {
        categoryDominance: 'Caballo',
        peakStreak: 5,
        byValueAccuracy: {
          Vaca: { correct: 1, total: 1 },
          Cerdo: { correct: 1, total: 1 },
          Gallina: { correct: 1, total: 1 },
          Caballo: { correct: 1, total: 1 },
          Pato: { correct: 1, total: 1 },
        },
      },
    };
    render(
      <GameOverStatsAssociation
        summary={summary}
        totalRounds={5}
        correctAnswers={5}
      />,
    );
    expect(screen.getByText('¡Dominio total!')).toBeTruthy();
    expect(screen.getByText('Acertaste todas las categorías')).toBeTruthy();
    // No debe quedarse en "Caballo" como label suelto.
    expect(screen.queryByText('Mejor racha: 5')).toBeNull();
  });

  it('cuando 2 categorías empatadas (pero no todas) → muestra empate parcial', () => {
    const summary = {
      ...baseSummary,
      association: {
        categoryDominance: 'Pato',
        peakStreak: 2,
        byValueAccuracy: {
          Pato: { correct: 1, total: 1 },
          Vaca: { correct: 1, total: 1 },
          Cerdo: { correct: 1, total: 2 }, // 50% — no empata
        },
      },
    };
    render(
      <GameOverStatsAssociation
        summary={summary}
        totalRounds={4}
        correctAnswers={3}
      />,
    );
    expect(screen.getByText('Empate entre tus categorías más fuertes')).toBeTruthy();
    // Tooltip listará "Pato, Vaca"; el texto visible muestra "Pato · Vaca".
    expect(screen.getByText(/Pato · Vaca/)).toBeTruthy();
  });

  it('cuando hay categorías FALLADAS → NO muestra "¡Dominio total!" aunque las acertadas estén al 100% (regresión QA 2026-05-25)', () => {
    // Caso real: 2/5 aciertos. Vaca y Gallina al 100%, Cerdo y Pato al 0%.
    // El bug mostraba "¡Dominio total!" porque filtraba las falladas antes
    // de decidir, dejando solo las dos perfectas como "todas las categorías".
    const summary = {
      ...baseSummary,
      errors: 2,
      association: {
        categoryDominance: 'Gallina',
        peakStreak: 1,
        byValueAccuracy: {
          Vaca: { correct: 1, total: 1 },
          Cerdo: { correct: 0, total: 1 },
          Gallina: { correct: 1, total: 1 },
          Pato: { correct: 0, total: 1 },
        },
      },
    };
    render(
      <GameOverStatsAssociation
        summary={summary}
        totalRounds={5}
        correctAnswers={2}
      />,
    );
    expect(screen.queryByText('¡Dominio total!')).toBeNull();
    expect(screen.queryByText('Acertaste todas las categorías')).toBeNull();
    // Sí destaca las dos categorías acertadas como las más fuertes.
    expect(screen.getByText('Empate entre tus categorías más fuertes')).toBeTruthy();
    expect(screen.getByText(/Vaca · Gallina/)).toBeTruthy();
  });

  it('cuando hay un único ganador → muestra ese nombre y "Mejor racha"', () => {
    const summary = {
      ...baseSummary,
      association: {
        categoryDominance: 'Vaca',
        peakStreak: 3,
        byValueAccuracy: {
          Vaca: { correct: 3, total: 3 }, // 100%
          Cerdo: { correct: 1, total: 2 }, // 50%
        },
      },
    };
    render(
      <GameOverStatsAssociation
        summary={summary}
        totalRounds={5}
        correctAnswers={4}
      />,
    );
    expect(screen.getByText('Vaca')).toBeTruthy();
    expect(screen.getByText('Tu categoría más fuerte')).toBeTruthy();
    expect(screen.getByText('Mejor racha: 3')).toBeTruthy();
  });

  it('cuando no hay association detail → no renderiza hero (fallback)', () => {
    render(
      <GameOverStatsAssociation
        summary={baseSummary}
        totalRounds={5}
        correctAnswers={3}
      />,
    );
    expect(screen.queryByText('Tu categoría más fuerte')).toBeNull();
    expect(screen.queryByText('¡Dominio total!')).toBeNull();
  });
});
