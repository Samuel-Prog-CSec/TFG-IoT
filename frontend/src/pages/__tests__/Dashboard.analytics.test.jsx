/**
 * @fileoverview Tests de integracion para la pagina Dashboard.
 * Verifica la carga de datos de analytics, renderizado de KPIs,
 * manejo de errores y comportamiento segun rol de usuario.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';

// ── Mocks de navegacion ──
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Mocks de hooks ──
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'teacher-1', role: 'teacher' }, isSuperAdmin: false })
}));
vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: () => {} }));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => ({ shouldReduceMotion: true }) }));
vi.mock('../../hooks/useRefetchOnFocus', () => ({ useRefetchOnFocus: () => {} }));
vi.mock('../../lib/sentry', () => ({ captureException: vi.fn() }));

// ── Mock framer-motion ──
// T-907 INT2: la app migró a `<LazyMotion>` + `m` para reducir bundle. Los
// componentes ahora importan `m as motion` desde framer-motion. Este mock
// expone `motion` y `m` (mismo proxy) para cubrir ambos patrones. El proxy
// se construye DENTRO del factory porque `vi.mock` se hoist al top del
// archivo y no puede referenciar variables externas.
vi.mock('framer-motion', () => {
  const proxy = new Proxy(
    {},
    {
      get: (_, tag) => {
        const Component = props => {
          const {
            children,
            initial,
            animate,
            exit,
            variants,
            transition,
            whileHover,
            whileTap,
            layout,
            ...rest
          } = props;
          const domProps = {};
          for (const [key, val] of Object.entries(rest)) {
            if (
              typeof val !== 'object' ||
              key === 'className' ||
              key === 'style' ||
              key.startsWith('data-') ||
              key.startsWith('aria-') ||
              key === 'role' ||
              key === 'id' ||
              key === 'onClick' ||
              key === 'dateTime'
            ) {
              domProps[key] = val;
            }
          }
          const Tag = typeof tag === 'string' ? tag : 'div';
          return <Tag {...domProps}>{children}</Tag>;
        };
        Component.displayName = `motion.${String(tag)}`;
        return Component;
      }
    }
  );
  return {
    motion: proxy,
    m: proxy,
    AnimatePresence: ({ children }) => <>{children}</>,
    LazyMotion: ({ children }) => <>{children}</>,
    domAnimation: {},
    animate: vi.fn(() => ({ stop: vi.fn() }))
  };
});

// ── Mock analytics service (vi.hoisted para que este disponible antes de vi.mock) ──
const mockAnalyticsService = vi.hoisted(() => ({
  getClassroomSummary: vi.fn(),
  getClassroomTrends: vi.fn(),
  getClassroomComparison: vi.fn(),
  getClassroomDifficulties: vi.fn(),
  getClassroomStudents: vi.fn(),
  getClassroomDistribution: vi.fn(),
  getClassroomHeatmap: vi.fn(),
  getAlerts: vi.fn(),
  getAlertsSummary: vi.fn(),
}));

vi.mock('../../services/analytics', () => ({
  default: mockAnalyticsService
}));

vi.mock('../../services/api', () => ({
  isAbortError: (err) => err?.name === 'AbortError',
  contextsAPI: { getContexts: vi.fn().mockResolvedValue({ data: { data: [] } }) },
  mechanicsAPI: { getMechanics: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));

// ── Mock sub-componentes pesados como stubs simples ──
vi.mock('../../components/dashboard/StudentProgressChart', () => ({ default: () => <div data-testid="progress-chart">Chart</div> }));
vi.mock('../../components/dashboard/DifficultyHeatmap', () => ({ default: () => <div data-testid="difficulty-heatmap">Heatmap</div> }));
vi.mock('../../components/analytics/ActivityHeatmap', () => ({ default: () => <div data-testid="activity-heatmap">Activity</div> }));
vi.mock('../../components/dashboard/DistributionChart', () => ({ default: () => <div data-testid="distribution-chart">Distribution</div> }));
vi.mock('../../components/dashboard/ChartSection', () => ({ default: ({ children, title }) => <div data-testid="chart-section"><h3>{title}</h3>{children}</div> }));
vi.mock('../../components/ui/GlassCard', () => ({ default: ({ children, className }) => <div className={className}>{children}</div> }));

// ── Datos mock ──
const MOCK_SUMMARY = {
  studentsInRisk: 2,
  averageScore: 65,
  gamesToday: 12,
  totalGames: 150,
  averageAccuracy: 72,
  averageResponseTime: 3500,
  abandonmentRate: 15,
};

const MOCK_TRENDS = {
  kpis: [
    { name: 'studentsInRisk', current: 2, previous: 3, changePercent: -33 },
    { name: 'averageScore', current: 65, previous: 60, changePercent: 8 },
    { name: 'gamesToday', current: 12, previous: 8, changePercent: 50 },
    { name: 'totalGames', current: 150, previous: 120, changePercent: 25 },
    { name: 'averageAccuracy', current: 72, previous: 68, changePercent: 6 },
    { name: 'averageResponseTime', current: 3500, previous: 4000, changePercent: -13 },
  ]
};

const MOCK_STUDENTS = {
  students: [
    { _id: 's1', name: 'Maria', averageScore: 85, totalGamesPlayed: 20, lastPlayedAt: new Date().toISOString(), profile: { classroom: 'A1' } },
    { _id: 's2', name: 'Carlos', averageScore: 45, totalGamesPlayed: 10, lastPlayedAt: null, profile: { classroom: 'A1' } },
  ],
  total: 2,
};

const MOCK_DISTRIBUTION = [
  { range: 'risk', count: 2, percentage: 20 },
  { range: 'average', count: 3, percentage: 30 },
  { range: 'good', count: 3, percentage: 30 },
  { range: 'excellent', count: 2, percentage: 20 },
];

const MOCK_ALERTS = {
  alerts: [
    { _id: 'a1', type: 'declining_performance', severity: 'warning', message: 'Carlos ha bajado su rendimiento' },
  ],
};

const MOCK_HEATMAP = {
  data: [[0, 1, 2], [3, 4, 5]],
  days: ['Lunes', 'Martes'],
  hours: ['9:00', '10:00', '11:00'],
};

// ── Helper de renderizado ──
function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

// ──────────────── Suite principal ────────────────
describe('Dashboard — integracion analytics', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Configurar todos los mocks para resolver con datos de test
    mockAnalyticsService.getClassroomSummary.mockResolvedValue(MOCK_SUMMARY);
    mockAnalyticsService.getClassroomTrends.mockResolvedValue(MOCK_TRENDS);
    mockAnalyticsService.getClassroomComparison.mockResolvedValue([]);
    mockAnalyticsService.getClassroomDifficulties.mockResolvedValue([]);
    mockAnalyticsService.getClassroomStudents.mockResolvedValue(MOCK_STUDENTS);
    mockAnalyticsService.getClassroomDistribution.mockResolvedValue(MOCK_DISTRIBUTION);
    mockAnalyticsService.getAlerts.mockResolvedValue(MOCK_ALERTS);
    mockAnalyticsService.getClassroomHeatmap.mockResolvedValue(MOCK_HEATMAP);
  });

  it('muestra skeleton mientras carga datos', () => {
    // Dejar las promesas pendientes para que loading=true se mantenga
    mockAnalyticsService.getClassroomSummary.mockReturnValue(new Promise(() => {}));
    mockAnalyticsService.getClassroomTrends.mockReturnValue(new Promise(() => {}));

    renderDashboard();

    // El skeleton usa SkeletonStatCard que renderiza dentro del grid
    // Verificar que NO se renderiza el contenido real mientras carga
    expect(screen.queryByText('Alumnos en Riesgo')).not.toBeInTheDocument();
    expect(screen.queryByText('Puntuación Media')).not.toBeInTheDocument();
  });

  it('muestra los StatCards con datos del summary', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alumnos en Riesgo')).toBeInTheDocument();
    });

    expect(screen.getByText('Puntuación Media')).toBeInTheDocument();
    expect(screen.getByText('Partidas Hoy')).toBeInTheDocument();
    // El KPI «Partidas Totales» se renombró a «Partidas» (ADR-192): ahora
    // refleja el periodo seleccionado, no el acumulado de por vida.
    expect(screen.getByText('Partidas')).toBeInTheDocument();
  });

  it('muestra KPIs secundarios con datos del summary', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Tasa de Acierto')).toBeInTheDocument();
    });

    expect(screen.getByText('Tiempo Medio')).toBeInTheDocument();
    expect(screen.getByText('Alumnos Activos')).toBeInTheDocument();
    expect(screen.getByText('Tasa Completado')).toBeInTheDocument();
  });

  it('muestra el titulo de bienvenida', async () => {
    renderDashboard();

    await waitFor(() => {
      // PROP-40A cambio el saludo a "Buenos dias/tardes/noches, {firstName}".
      // El nombre se pinta con gradient en un span separado del saludo,
      // por lo que matcheamos cualquiera de las tres variantes horarias.
      const matches = screen.getAllByText(/Buen[oa]s (días|tardes|noches)/);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('muestra el subtitulo contextual del saludo ligado al dato', async () => {
    // Con `studentsInRisk: 2` el subtítulo se personaliza (momento de firma,
    // 2026-06-04) en vez del genérico "Resumen de actividad…".
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Hoy, 2 alumnos necesitan tu atención')).toBeInTheDocument();
    });
  });

  it('llama a los servicios de analytics al montar', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(mockAnalyticsService.getClassroomSummary).toHaveBeenCalledTimes(1);
    });

    expect(mockAnalyticsService.getClassroomTrends).toHaveBeenCalledTimes(1);
    expect(mockAnalyticsService.getClassroomComparison).toHaveBeenCalledTimes(1);
    expect(mockAnalyticsService.getClassroomDifficulties).toHaveBeenCalledTimes(1);
    expect(mockAnalyticsService.getClassroomStudents).toHaveBeenCalledTimes(1);
    expect(mockAnalyticsService.getClassroomDistribution).toHaveBeenCalledTimes(1);
    expect(mockAnalyticsService.getAlerts).toHaveBeenCalledTimes(1);
    expect(mockAnalyticsService.getClassroomHeatmap).toHaveBeenCalledTimes(1);
  });

  it('muestra error cuando el servicio principal falla', async () => {
    mockAnalyticsService.getClassroomSummary.mockRejectedValue(new Error('Network error'));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No pudimos cargar tu panel')).toBeInTheDocument();
    });

    expect(screen.getByText(/No se pudieron cargar los datos del dashboard/)).toBeInTheDocument();
  });

  it('renderiza el selector de rango de tiempo', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alumnos en Riesgo')).toBeInTheDocument();
    });

    // El SelectPremium de tiempo se renderiza con aria-label = propósito + valor
    // seleccionado (BUG-A11Y-SELECT-NAME-B, QA 2026-06-04): "Filtrar por rango
    // de tiempo: Últimos 7 días". Match por prefijo para no acoplar al valor.
    expect(screen.getByLabelText(/^Filtrar por rango de tiempo/)).toBeInTheDocument();
  });

  it('muestra la lista de estudiantes cuando hay datos', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alumnos en Riesgo')).toBeInTheDocument();
    });

    // El componente StudentsList recibe los datos de estudiantes
    // y los renderiza — verificamos que el componente de progreso esta en el DOM
    expect(screen.getByTestId('progress-chart')).toBeInTheDocument();
  });

  it('renderiza accesos rapidos', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Accesos rápidos')).toBeInTheDocument();
    });

    expect(screen.getByText('Ver todas las sesiones')).toBeInTheDocument();
    expect(screen.getByText('Crear nueva sesión')).toBeInTheDocument();
    expect(screen.getByText('Ver mazos de cartas')).toBeInTheDocument();
  });

  it('muestra actividad reciente cuando hay estudiantes con partidas', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Actividad Reciente')).toBeInTheDocument();
    });

    // Maria tiene lastPlayedAt, aparece en StudentsList y en RecentActivity
    const mariaElements = screen.getAllByText('Maria');
    expect(mariaElements.length).toBeGreaterThanOrEqual(1);
  });

  it('muestra empty state en actividad reciente cuando ningun estudiante tiene partidas', async () => {
    // Sesion pulido UI/UX final: el slot "Actividad Reciente" ahora siempre
    // queda visible para mantener la simetría del grid; cuando no hay
    // partidas se muestra un copy explicativo en lugar de desaparecer
    // dejando hueco vertical.
    mockAnalyticsService.getClassroomStudents.mockResolvedValue({
      students: [
        { _id: 's1', name: 'Ana', averageScore: 50, lastPlayedAt: null },
      ],
      total: 1,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alumnos en Riesgo')).toBeInTheDocument();
    });

    expect(screen.getByText('Actividad Reciente')).toBeInTheDocument();
    expect(screen.getByText(/Aún no hay partidas/i)).toBeInTheDocument();
  });

  it('maneja el caso de datos parciales sin crash', async () => {
    // Servicios secundarios fallan pero los principales funcionan
    mockAnalyticsService.getClassroomStudents.mockRejectedValue(new Error('students fail'));
    mockAnalyticsService.getClassroomDistribution.mockRejectedValue(new Error('distribution fail'));
    mockAnalyticsService.getAlerts.mockRejectedValue(new Error('alerts fail'));
    mockAnalyticsService.getClassroomHeatmap.mockRejectedValue(new Error('heatmap fail'));

    renderDashboard();

    // Los KPIs principales deben seguir visibles
    await waitFor(() => {
      expect(screen.getByText('Alumnos en Riesgo')).toBeInTheDocument();
    });

    expect(screen.getByText('Puntuación Media')).toBeInTheDocument();
    expect(screen.getByText('Partidas Hoy')).toBeInTheDocument();
    // No debe haber mensaje de error si solo fallan los secundarios
    expect(screen.queryByText('No pudimos cargar tu panel')).not.toBeInTheDocument();
  });

  it('renderiza los graficos stub correctamente', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('progress-chart')).toBeInTheDocument();
    });

    expect(screen.getByTestId('difficulty-heatmap')).toBeInTheDocument();
  });

  it('renderiza el heatmap de actividad cuando hay datos', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('activity-heatmap')).toBeInTheDocument();
    });
  });

  it('no renderiza el heatmap de actividad cuando no hay datos', async () => {
    mockAnalyticsService.getClassroomHeatmap.mockResolvedValue(null);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Alumnos en Riesgo')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('activity-heatmap')).not.toBeInTheDocument();
  });
});

// ──────────────── Suite super_admin ────────────────
describe('Dashboard — redireccion super_admin', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('no renderiza dashboard si es super_admin — redirige a admin', async () => {
    // Sobreescribir el mock de AuthContext para este test
    const authModule = await import('../../context/AuthContext');
    vi.spyOn(authModule, 'useAuth').mockReturnValue({
      user: { _id: 'admin-1', role: 'super_admin' },
      isSuperAdmin: true,
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => {
      // T-942 Fase D: el super_admin aterriza ahora en /admin/dashboard (vista
      // del centro con KPIs agregados) en lugar de /admin/approvals.
      expect(mockNavigate).toHaveBeenCalledWith('/admin/dashboard', { replace: true });
    });
  });
});
