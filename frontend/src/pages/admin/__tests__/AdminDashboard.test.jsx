/**
 * @fileoverview Tests del AdminDashboard (T-942 Fase D).
 *
 * Cubre los 4 caminos clave: loading skeleton inicial, render con datos
 * completos, cambio de timeRange dispara nuevo fetch, y empty state cuando
 * el centro está vacío. Mocks granulares de analyticsService para aislar
 * el componente del cliente HTTP real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks globales ───

vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => ({ shouldReduceMotion: true })
}));

vi.mock('../../../hooks/useDocumentTitle', () => ({
  useDocumentTitle: () => {}
}));

vi.mock('../../../hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: () => {}
}));

vi.mock('../../../lib/sentry', () => ({
  captureException: vi.fn()
}));

vi.mock('../../../services/api', () => ({
  isAbortError: (err) => err?.code === 'ERR_CANCELED'
}));

vi.mock('../../../services/analytics', () => ({
  default: {
    getAdminOverview: vi.fn()
  }
}));

// Reemplazamos el SelectPremium real (combobox custom con dropdown) por un
// <select> nativo: jsdom no maneja bien los listbox animados de SelectPremium
// (mousedown/click off, etc.), pero un native select es trivial de manipular
// con userEvent.selectOptions y refleja el mismo comportamiento del lado del
// componente (onChange recibe el valor).
vi.mock('../../../components/ui/SelectPremium', () => ({
  default: ({ value, onChange, options = [], 'aria-label': ariaLabel, label }) => (
    <select
      data-testid="select-premium-mock"
      aria-label={ariaLabel || label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}));

const mockOverviewData = {
  timeRange: '30d',
  users: {
    totalStudents: 120,
    totalTeachers: 8,
    activeTeachers: 5,
    pendingTeachers: 2
  },
  activity: {
    totalPlaysInRange: 540,
    avgScoreInRange: 73.4,
    playsToday: 18,
    playsByMechanic: []
  },
  content: {
    totalDecks: 22,
    totalSessions: 30,
    activeSessions: 9,
    totalContexts: 5,
    totalMechanics: 3
  },
  alerts: {
    totalCriticalActive: 1,
    totalWarningActive: 4,
    totalInfoActive: 2,
    byTeacher: [
      { teacherId: 't1', teacherName: 'María García', criticalCount: 1, warningCount: 2 }
    ]
  },
  topTeachers: [
    {
      teacherId: 't1',
      teacherName: 'María García',
      totalPlays: 200,
      avgScore: 78,
      activeStudents: 25
    },
    {
      teacherId: 't2',
      teacherName: 'Carlos López',
      totalPlays: 150,
      avgScore: 72,
      activeStudents: 18
    }
  ],
  topMechanics: [
    { mechanicId: 'm1', mechanicName: 'asociacion', totalPlays: 250, avgScore: 75 },
    { mechanicId: 'm2', mechanicName: 'memoria', totalPlays: 180, avgScore: 70 }
  ],
  topContexts: [
    { contextId: 'c1', contextName: 'Geografía', totalPlays: 300, avgScore: 80 },
    { contextId: 'c2', contextName: 'Animales', totalPlays: 240, avgScore: 73 }
  ],
  generatedAt: new Date('2026-05-24T10:30:00').toISOString()
};

const emptyOverview = {
  timeRange: '30d',
  users: { totalStudents: 0, totalTeachers: 0, activeTeachers: 0, pendingTeachers: 0 },
  activity: { totalPlaysInRange: 0, avgScoreInRange: 0, playsToday: 0, playsByMechanic: [] },
  content: { totalDecks: 0, totalSessions: 0, activeSessions: 0, totalContexts: 0, totalMechanics: 0 },
  alerts: { totalCriticalActive: 0, totalWarningActive: 0, totalInfoActive: 0, byTeacher: [] },
  topTeachers: [],
  topMechanics: [],
  topContexts: [],
  generatedAt: new Date().toISOString()
};

// Import después de mockear para que el component use los mocks.
import AdminDashboard from '../AdminDashboard';
import analyticsService from '../../../services/analytics';

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <AdminDashboard />
    </MemoryRouter>
  );

describe('AdminDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra skeleton inicial mientras carga la overview', async () => {
    // Pending promise — el skeleton debe aparecer.
    let resolveFn;
    analyticsService.getAdminOverview.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFn = resolve;
      })
    );
    const { container } = renderDashboard();

    // El SelectPremium del header sale en seguida, y el grid de skeleton
    // de la fila 1 debe estar presente (4 KPI skeletons).
    expect(screen.getByText('Vista del centro')).toBeInTheDocument();
    // Skeleton structural debe estar visible (verificamos por la presencia
    // del header sin que aún hayan llegado los KPIs reales).
    expect(container.querySelectorAll('.animate-pulse, [class*="shimmer"]').length).toBeGreaterThan(0);

    // Resolver para que el test termine sin warnings de unmounted.
    resolveFn(mockOverviewData);
    await waitFor(() => {
      expect(screen.getByText('Alumnos del centro')).toBeInTheDocument();
    });
  });

  it('renderiza los KPIs principales cuando llegan datos', async () => {
    analyticsService.getAdminOverview.mockResolvedValueOnce(mockOverviewData);
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alumnos del centro')).toBeInTheDocument();
    });

    // Fila 1 — magnitud
    expect(screen.getByText('Alumnos del centro')).toBeInTheDocument();
    expect(screen.getByText('Profesores activos')).toBeInTheDocument();
    expect(screen.getByText('Partidas del periodo')).toBeInTheDocument();
    expect(screen.getByText('Mazos publicados')).toBeInTheDocument();

    // Fila 2 — salud
    expect(screen.getByText('Puntuación media')).toBeInTheDocument();
    expect(screen.getByText('Solicitudes pendientes')).toBeInTheDocument();
    expect(screen.getByText('Alertas críticas')).toBeInTheDocument();
    expect(screen.getByText('Sesiones activas')).toBeInTheDocument();

    // Fila 3 — análisis cruzado.
    // María aparece dos veces: en Top profesores y en Alertas por profesor.
    expect(screen.getByText('Top profesores activos')).toBeInTheDocument();
    expect(screen.getByText('Alertas por profesor')).toBeInTheDocument();
    expect(screen.getAllByText('María García').length).toBeGreaterThanOrEqual(1);

    // Fila 4 — análisis por dimensión
    expect(screen.getByText('Top mecánicas del centro')).toBeInTheDocument();
    expect(screen.getByText('Top contextos del centro')).toBeInTheDocument();
    expect(screen.getByText('Geografía')).toBeInTheDocument();
  });

  it('renderiza el empty state cuando el centro está vacío', async () => {
    analyticsService.getAdminOverview.mockResolvedValueOnce(emptyOverview);
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('El centro acaba de empezar')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Aún no hay actividad en el centro/i)
    ).toBeInTheDocument();
    // No deben aparecer los KPI cards (todos a 0 + sin actividad = empty).
    expect(screen.queryByText('Alumnos del centro')).not.toBeInTheDocument();
  });

  it('vuelve a pedir overview cuando cambia el timeRange', async () => {
    analyticsService.getAdminOverview
      .mockResolvedValueOnce(mockOverviewData)
      .mockResolvedValueOnce({ ...mockOverviewData, timeRange: '7d' });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alumnos del centro')).toBeInTheDocument();
    });

    expect(analyticsService.getAdminOverview).toHaveBeenCalledTimes(1);
    expect(analyticsService.getAdminOverview).toHaveBeenLastCalledWith(
      { timeRange: '30d' },
      expect.objectContaining({ signal: expect.anything() })
    );

    // Cambia timeRange usando el mock <select> nativo (SelectPremium real
    // tiene listbox custom incompatible con jsdom — mock arriba lo sustituye).
    const user = userEvent.setup();
    const selectNode = screen.getByLabelText('Periodo de análisis');
    await user.selectOptions(selectNode, '7d');

    await waitFor(() => {
      expect(analyticsService.getAdminOverview).toHaveBeenCalledTimes(2);
    });
    expect(analyticsService.getAdminOverview).toHaveBeenLastCalledWith(
      { timeRange: '7d' },
      expect.objectContaining({ signal: expect.anything() })
    );
  });
});
