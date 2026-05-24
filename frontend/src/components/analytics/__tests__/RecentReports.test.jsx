/**
 * @fileoverview Tests de RecentReports (T-942 Fase D).
 *
 * Cubre los 3 casos: lista con datos, empty state, e interaccion Reabrir.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => ({ shouldReduceMotion: true })
}));

import RecentReports from '../RecentReports';

const mockReports = [
  {
    _id: 'r1',
    title: 'Informe del aula · 30 días',
    reportType: 'classroom',
    period: '30d',
    format: 'summary',
    generatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString() // hace 1h
  },
  {
    _id: 'r2',
    title: 'Trayectoria Lucía Martín',
    reportType: 'student',
    period: '90d',
    format: 'detailed',
    generatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString() // hace 3d
  }
];

describe('RecentReports', () => {
  it('renderiza la lista de informes con título y meta', () => {
    render(
      <RecentReports
        reports={mockReports}
        loading={false}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Informe del aula · 30 días')).toBeInTheDocument();
    expect(screen.getByText('Trayectoria Lucía Martín')).toBeInTheDocument();
    expect(screen.getByText('Informes recientes')).toBeInTheDocument();
    // Contador
    expect(screen.getByText('2 informes')).toBeInTheDocument();
  });

  it('renderiza empty state con microcopy concreta cuando no hay informes', () => {
    render(
      <RecentReports
        reports={[]}
        loading={false}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(
      screen.getByText(/Aún no has generado ningún informe/i)
    ).toBeInTheDocument();
  });

  it('dispara onOpen con el id al hacer click en Reabrir', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <RecentReports
        reports={mockReports}
        loading={false}
        onOpen={onOpen}
        onDelete={vi.fn()}
      />
    );

    const reopenButton = screen.getByLabelText('Reabrir Informe del aula · 30 días');
    await user.click(reopenButton);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('r1');
  });
});
