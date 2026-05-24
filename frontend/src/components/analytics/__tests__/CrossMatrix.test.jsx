/**
 * @fileoverview Tests del componente `CrossMatrix` (T-942 Fase C).
 *
 * Cubre los 4 estados base (loading, empty, error, datos) + filtrado por
 * mecanica + apertura del drill-down lateral interno al hacer clic en
 * una celda con datos.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks globales ---

vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => ({ shouldReduceMotion: true }),
}));

vi.mock('../../../hooks/useHorizontalScroll', () => ({
  useHorizontalScroll: () => ({
    ref: { current: null },
    hasOverflow: false,
    canScrollRight: false,
    scrollByOne: () => {},
  }),
}));

import CrossMatrix from '../CrossMatrix';

// --- Helpers ---

function renderWithRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// Dataset minimalista 2 mecanicas × 2 contextos, sin la combinacion (sequence × geo).
const SAMPLE_DATA = {
  groupBy: 'cross',
  items: [
    {
      mechanicId: 'mech-mem',
      mechanicName: 'Memoria',
      contextId: 'ctx-animals',
      contextName: 'Animales',
      avgScore: 85,
      avgAccuracy: 88,
      totalPlays: 24,
      uniqueStudents: 8,
      avgCompletionTime: 95,
      improvementRate: 12,
      learningEfficiency: 'high',
      scoreRag: { status: 'GREEN' },
      learningRag: { status: 'GREEN' },
      interpretation: {
        whatHappened: 'Los alumnos retienen las parejas con rapidez.',
        soWhat: 'Combinación robusta para introducir contenido nuevo.',
        nowWhat: 'Mantén la frecuencia semanal.',
      },
    },
    {
      mechanicId: 'mech-mem',
      mechanicName: 'Memoria',
      contextId: 'ctx-geography',
      contextName: 'Geografía',
      avgScore: 55,
      avgAccuracy: 62,
      totalPlays: 18,
      uniqueStudents: 6,
      avgCompletionTime: 140,
      improvementRate: 2,
      learningEfficiency: 'medium',
      scoreRag: { status: 'AMBER' },
      learningRag: { status: 'AMBER' },
      interpretation: {
        whatHappened: 'Rendimiento medio con margen de mejora.',
        soWhat: 'Conviene revisar las cartas más erradas.',
        nowWhat: 'Refuerza con sesiones cortas adicionales.',
      },
    },
    {
      mechanicId: 'mech-seq',
      mechanicName: 'Secuencia',
      contextId: 'ctx-animals',
      contextName: 'Animales',
      avgScore: 42,
      avgAccuracy: 50,
      totalPlays: 9,
      uniqueStudents: 5,
      avgCompletionTime: 180,
      improvementRate: -8,
      learningEfficiency: 'low',
      scoreRag: { status: 'RED' },
      learningRag: { status: 'RED' },
      interpretation: {
        whatHappened: 'Errores frecuentes en las primeras rondas.',
        soWhat: 'Posible sobrecarga cognitiva.',
        nowWhat: 'Reduce el número de pasos por secuencia.',
      },
    },
    // OJO: combinacion (sequence × geography) intencionadamente ausente
    // para verificar que se renderiza una celda "Sin datos".
  ],
};

// ═════════════════════════════════════════════════════════════════════
// Estados base
// ═════════════════════════════════════════════════════════════════════

describe('CrossMatrix — estados base', () => {
  it('renderiza skeleton cuando loading=true', () => {
    renderWithRouter(<CrossMatrix data={null} loading />);
    // El titulo siempre aparece en estado loading (header del card).
    expect(screen.getByText('Matriz Mecánica × Contexto')).toBeTruthy();
    // No deberia haber tabla aun.
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renderiza empty state cuando items=[]', () => {
    renderWithRouter(
      <CrossMatrix data={{ items: [], groupBy: 'cross' }} loading={false} />
    );
    expect(
      screen.getByText(/Aún no hay suficientes partidas/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/al menos 3 alumnos en 2 mecánicas distintas/i)
    ).toBeTruthy();
  });

  it('renderiza ErrorState cuando hay error y dispara onRetry al pulsar Reintentar', () => {
    const onRetry = vi.fn();
    renderWithRouter(
      <CrossMatrix
        data={null}
        loading={false}
        error={{ message: 'fail' }}
        onRetry={onRetry}
      />
    );
    // Componente ErrorState pinta "No se pudo cargar la matriz cruzada"
    // y un boton "Reintentar".
    expect(
      screen.getByText('No se pudo cargar la matriz cruzada')
    ).toBeTruthy();
    const retryBtn = screen.getByRole('button', { name: /reintentar/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Render con datos
// ═════════════════════════════════════════════════════════════════════

describe('CrossMatrix — renderizado con datos', () => {
  it('renderiza tabla con celdas RAG (score y nombres de mecanica/contexto)', () => {
    renderWithRouter(<CrossMatrix data={SAMPLE_DATA} />);

    // Header de contextos (columnas). El contexto puede aparecer 1 vez
    // en el thead, pero tambien dentro del data-table sr-only — usamos
    // getAllByText para no fallar por matches duplicados.
    expect(screen.getAllByText('Animales').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Geografía').length).toBeGreaterThan(0);

    // Filas: mecanicas (formateadas via formatMechanicName).
    expect(screen.getAllByText('Memoria').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Secuencia').length).toBeGreaterThan(0);

    // Scores de las celdas con datos.
    expect(screen.getByText('85%')).toBeTruthy();
    expect(screen.getByText('55%')).toBeTruthy();
    expect(screen.getByText('42%')).toBeTruthy();

    // Una celda Secuencia × Geografia esta ausente del dataset → debe
    // renderizarse como celda "Sin datos" (aria-label).
    expect(
      screen.getByLabelText(/Secuencia, Geografía: sin datos/i)
    ).toBeTruthy();
  });

  it('al hacer click en una celda con datos invoca onCellClick con la celda completa', () => {
    const onCellClick = vi.fn();
    renderWithRouter(
      <CrossMatrix data={SAMPLE_DATA} onCellClick={onCellClick} />
    );

    // Buscamos la celda Memoria × Animales por su aria-label.
    const cellBtn = screen.getByLabelText(
      /Memoria, Animales: 85% en 24 partidas/i
    );
    fireEvent.click(cellBtn);

    expect(onCellClick).toHaveBeenCalledTimes(1);
    const cellArg = onCellClick.mock.calls[0][0];
    expect(cellArg.mechanicId).toBe('mech-mem');
    expect(cellArg.contextId).toBe('ctx-animals');
    expect(cellArg.avgScore).toBe(85);
  });

  it('al hacer click sin onCellClick abre el drill-down lateral interno', () => {
    renderWithRouter(<CrossMatrix data={SAMPLE_DATA} />);

    // Estado inicial: panel no esta abierto (no hay role=dialog).
    expect(screen.queryByRole('dialog')).toBeNull();

    const cellBtn = screen.getByLabelText(
      /Memoria, Animales: 85% en 24 partidas/i
    );
    fireEvent.click(cellBtn);

    // Tras el click se monta el panel con role=dialog y el titulo de la
    // combinacion en el header.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    // Buscamos por substring concreto del titulo en el dialog, sin regex
    // con backtracking ambiguo.
    expect(
      within(dialog).getByText(
        (_, node) =>
          node?.tagName?.toLowerCase() === 'h2' &&
          node.textContent.includes('Memoria') &&
          node.textContent.includes('Animales')
      )
    ).toBeTruthy();
  });

  it('no dispara onCellClick al pulsar una celda sin datos', () => {
    const onCellClick = vi.fn();
    renderWithRouter(
      <CrossMatrix data={SAMPLE_DATA} onCellClick={onCellClick} />
    );

    const emptyCellBtn = screen.getByLabelText(
      /Secuencia, Geografía: sin datos/i
    );
    // El boton esta disabled, pero por si acaso lanzamos el click.
    expect(emptyCellBtn.hasAttribute('disabled')).toBe(true);
    fireEvent.click(emptyCellBtn);
    expect(onCellClick).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// Filtros
// ═════════════════════════════════════════════════════════════════════

describe('CrossMatrix — filtros', () => {
  it('filterMechanicId reduce la tabla a una sola fila', () => {
    renderWithRouter(
      <CrossMatrix data={SAMPLE_DATA} filterMechanicId="mech-mem" />
    );

    // Memoria sigue presente (header de fila).
    expect(screen.getAllByText('Memoria').length).toBeGreaterThan(0);

    // Secuencia ya no debe aparecer como cabecera de fila (la celda
    // gris "sin datos" para Secuencia tampoco existe ahora porque la
    // fila completa esta filtrada).
    // Comprobamos por la ausencia del aria-label de la celda Secuencia.
    expect(
      screen.queryByLabelText(/Secuencia, Animales/i)
    ).toBeNull();
    expect(
      screen.queryByLabelText(/Secuencia, Geografía/i)
    ).toBeNull();
  });
});
