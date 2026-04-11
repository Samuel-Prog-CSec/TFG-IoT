/**
 * @fileoverview Tests de componentes de analytics: StudentKPICard, GameHistoryTable,
 * NarrativeCard, TrajectoryChart y EngagementRadar.
 *
 * Se mockean framer-motion, Recharts, GlassCard y useReducedMotion para aislar
 * la logica de renderizado de cada componente en jsdom.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Mocks globales ---

vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => ({ shouldReduceMotion: true }),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_, tag) => {
        const Component = (props) => {
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
          const Tag = typeof tag === 'string' ? tag : 'div';
          return <Tag {...rest}>{children}</Tag>;
        };
        Component.displayName = `motion.${String(tag)}`;
        return Component;
      },
    }
  ),
  AnimatePresence: ({ children }) => <>{children}</>,
}));

vi.mock('../../ui/GlassCard', () => ({
  default: ({ children, className, ...props }) => (
    <div data-testid="glass-card" className={className} {...props}>
      {children}
    </div>
  ),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  RadarChart: ({ children }) => <div data-testid="radar-chart">{children}</div>,
  Line: () => null,
  Bar: () => null,
  Radar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Cell: () => null,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  PolarRadiusAxis: () => null,
  ReferenceLine: () => null,
  Legend: () => null,
}));

// --- Imports de componentes bajo test ---

import StudentKPICard from '../StudentKPICard';
import GameHistoryTable from '../GameHistoryTable';
import NarrativeCard from '../NarrativeCard';
import TrajectoryChart from '../TrajectoryChart';
import EngagementRadar from '../EngagementRadar';

// ══════════════════════════════════════════════════════════════════════
// StudentKPICard
// ══════════════════════════════════════════════════════════════════════

describe('StudentKPICard', () => {
  it('renderiza el label del KPI', () => {
    render(<StudentKPICard label="Puntuacion Media" value={85} />);
    expect(screen.getByText('Puntuacion Media')).toBeTruthy();
  });

  it('renderiza el valor numerico', () => {
    render(<StudentKPICard label="Score" value={72} />);
    // AnimatedValue con shouldReduceMotion: el valor se redondea con Math.round
    expect(screen.getByText('72')).toBeTruthy();
  });

  it('renderiza el sufijo cuando se proporciona', () => {
    render(<StudentKPICard label="Precision" value={88} suffix="%" />);
    // El sufijo aparece dos veces: dentro de AnimatedValue y como span separado
    const suffixes = screen.getAllByText('%');
    expect(suffixes.length).toBeGreaterThanOrEqual(1);
  });

  it('aplica borde verde para ragStatus "green"', () => {
    render(
      <StudentKPICard label="KPI" value={90} ragStatus="green" />
    );
    // El GlassCard recibe className con border-l-success-base
    const card = screen.getByTestId('glass-card');
    expect(card.className).toContain('border-l-success-base');
  });

  it('aplica borde rojo para ragStatus "red"', () => {
    render(<StudentKPICard label="KPI" value={30} ragStatus="red" />);
    const card = screen.getByTestId('glass-card');
    expect(card.className).toContain('border-l-error-base');
  });

  it('aplica borde ambar para ragStatus "amber"', () => {
    render(<StudentKPICard label="KPI" value={55} ragStatus="amber" />);
    const card = screen.getByTestId('glass-card');
    expect(card.className).toContain('border-l-warning-base');
  });

  it('muestra el indicador RAG dot con aria-label del estado', () => {
    render(<StudentKPICard label="KPI" value={80} ragStatus="green" />);
    expect(screen.getByLabelText('Estado: green')).toBeTruthy();
  });

  it('renderiza la comparativa cuando se proporciona', () => {
    render(
      <StudentKPICard
        label="Score"
        value={85}
        comparison="vs clase: +11%"
        comparisonPositive
      />
    );
    expect(screen.getByText('vs clase: +11%')).toBeTruthy();
  });

  it('renderiza el icono cuando se proporciona', () => {
    const icon = <span data-testid="test-icon">IC</span>;
    render(<StudentKPICard label="KPI" value={70} icon={icon} />);
    expect(screen.getByTestId('test-icon')).toBeTruthy();
  });

  it('usa ragStatus "gray" por defecto si no se especifica', () => {
    render(<StudentKPICard label="KPI" value={0} />);
    const card = screen.getByTestId('glass-card');
    expect(card.className).toContain('border-l-text-muted');
  });
});

// ══════════════════════════════════════════════════════════════════════
// GameHistoryTable
// ══════════════════════════════════════════════════════════════════════

describe('GameHistoryTable', () => {
  const sampleGames = [
    {
      gameplayId: 'gp1',
      score: 95,
      correctAttempts: 9,
      totalAttempts: 10,
      completedAt: '2026-03-01T10:00:00Z',
      completionTime: 150000,
      contextName: 'Animales',
      mechanicName: 'Emparejamiento',
    },
    {
      gameplayId: 'gp2',
      score: 45,
      correctAttempts: 4,
      totalAttempts: 10,
      completedAt: '2026-03-02T14:00:00Z',
      completionTime: 90000,
      contextName: 'Colores',
      mechanicName: 'Quiz',
    },
  ];

  it('muestra mensaje vacio cuando games es null', () => {
    render(<GameHistoryTable games={null} />);
    expect(
      screen.getByText('Este alumno aun no tiene partidas registradas.')
    ).toBeTruthy();
  });

  it('muestra mensaje vacio cuando games es un array vacio', () => {
    render(<GameHistoryTable games={[]} />);
    expect(
      screen.getByText('Este alumno aun no tiene partidas registradas.')
    ).toBeTruthy();
  });

  it('renderiza el titulo "Historial de Partidas"', () => {
    render(<GameHistoryTable games={sampleGames} />);
    expect(screen.getByText('Historial de Partidas')).toBeTruthy();
  });

  it('muestra el contador de partidas', () => {
    render(<GameHistoryTable games={sampleGames} />);
    expect(screen.getByText('2 partidas')).toBeTruthy();
  });

  it('renderiza los nombres de contexto y mecanica', () => {
    render(<GameHistoryTable games={sampleGames} />);
    expect(screen.getByText('Animales')).toBeTruthy();
    expect(screen.getByText('Emparejamiento')).toBeTruthy();
    expect(screen.getByText('Colores')).toBeTruthy();
    expect(screen.getByText('Quiz')).toBeTruthy();
  });

  it('renderiza los scores redondeados', () => {
    render(<GameHistoryTable games={sampleGames} />);
    expect(screen.getByText('95')).toBeTruthy();
    expect(screen.getByText('45')).toBeTruthy();
  });

  it('calcula y muestra el porcentaje de aciertos', () => {
    render(<GameHistoryTable games={sampleGames} />);
    // 9/10 = 90%, 4/10 = 40%
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
  });

  it('muestra boton "Ver todas" cuando hay mas partidas que initialCount', () => {
    // Crear 3 partidas y poner initialCount=2
    const threeGames = [
      ...sampleGames,
      {
        gameplayId: 'gp3',
        score: 70,
        correctAttempts: 7,
        totalAttempts: 10,
        contextName: 'Numeros',
        mechanicName: 'Memoria',
      },
    ];

    render(<GameHistoryTable games={threeGames} initialCount={2} />);
    expect(screen.getByText(/Ver todas/)).toBeTruthy();
  });

  it('alterna entre "Ver todas" y "Mostrar menos" al hacer click', async () => {
    const user = userEvent.setup();
    const threeGames = [
      ...sampleGames,
      {
        gameplayId: 'gp3',
        score: 70,
        correctAttempts: 7,
        totalAttempts: 10,
        contextName: 'Numeros',
        mechanicName: 'Memoria',
      },
    ];

    render(<GameHistoryTable games={threeGames} initialCount={2} />);

    // Inicialmente muestra "Ver todas"
    const btn = screen.getByText(/Ver todas/);
    expect(btn).toBeTruthy();

    // Tras click muestra "Mostrar menos"
    await user.click(btn);
    expect(screen.getByText(/Mostrar menos/)).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
// NarrativeCard
// ══════════════════════════════════════════════════════════════════════

describe('NarrativeCard', () => {
  const fullInterpretation = {
    whatHappened: 'El alumno mejoro un 15% en la ultima semana.',
    soWhat: 'Esto indica una tendencia positiva sostenida.',
    nowWhat: 'Continuar con ejercicios de refuerzo avanzado.',
  };

  it('renderiza el titulo personalizado', () => {
    render(<NarrativeCard title="Analisis Detallado" />);
    expect(screen.getByText('Analisis Detallado')).toBeTruthy();
  });

  it('renderiza el titulo por defecto "Resumen del Alumno"', () => {
    render(<NarrativeCard />);
    expect(screen.getByText('Resumen del Alumno')).toBeTruthy();
  });

  it('muestra las tres secciones de la narrativa BI', () => {
    render(<NarrativeCard interpretation={fullInterpretation} />);
    // Labels de secciones
    expect(screen.getByText('Que paso')).toBeTruthy();
    expect(screen.getByText('Por que importa')).toBeTruthy();
    expect(screen.getByText('Que hacer')).toBeTruthy();
    // Contenido
    expect(
      screen.getByText('El alumno mejoro un 15% en la ultima semana.')
    ).toBeTruthy();
    expect(
      screen.getByText('Esto indica una tendencia positiva sostenida.')
    ).toBeTruthy();
    expect(
      screen.getByText('Continuar con ejercicios de refuerzo avanzado.')
    ).toBeTruthy();
  });

  it('muestra estado vacio cuando interpretation es null', () => {
    render(<NarrativeCard interpretation={null} />);
    expect(
      screen.getByText(
        'Se necesitan mas partidas para generar insights.'
      )
    ).toBeTruthy();
  });

  it('muestra estado vacio cuando interpretation no tiene datos', () => {
    render(<NarrativeCard interpretation={{}} />);
    expect(
      screen.getByText(
        'Se necesitan mas partidas para generar insights.'
      )
    ).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
// TrajectoryChart
// ══════════════════════════════════════════════════════════════════════

describe('TrajectoryChart', () => {
  const validTrajectory = {
    dataPoints: [
      { date: '2026-03-01', averageScore: 70 },
      { date: '2026-03-02', averageScore: 80 },
      { date: '2026-03-03', averageScore: 85 },
    ],
    trend: {
      direction: 'improving',
      confidence: 'alta',
      dataPoints: 3,
    },
  };

  it('muestra estado vacio cuando trajectoryData es null', () => {
    render(<TrajectoryChart trajectoryData={null} />);
    expect(
      screen.getByText(/No hay partidas en este periodo/)
    ).toBeTruthy();
  });

  it('muestra estado vacio cuando dataPoints esta vacio', () => {
    render(<TrajectoryChart trajectoryData={{ dataPoints: [] }} />);
    expect(
      screen.getByText(/No hay partidas en este periodo/)
    ).toBeTruthy();
  });

  it('renderiza el titulo personalizado', () => {
    render(
      <TrajectoryChart
        trajectoryData={validTrajectory}
        title="Progresion Semanal"
      />
    );
    expect(screen.getByText('Progresion Semanal')).toBeTruthy();
  });

  it('muestra la etiqueta de tendencia "Mejorando" cuando direction es improving', () => {
    render(<TrajectoryChart trajectoryData={validTrajectory} />);
    expect(screen.getByText('Mejorando')).toBeTruthy();
    expect(screen.getByLabelText('Tendencia: Mejorando')).toBeTruthy();
  });

  it('renderiza el chart cuando hay datos validos', () => {
    render(<TrajectoryChart trajectoryData={validTrajectory} />);
    expect(screen.getByTestId('responsive-container')).toBeTruthy();
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  it('muestra la leyenda "Alumno"', () => {
    render(<TrajectoryChart trajectoryData={validTrajectory} />);
    expect(screen.getByText('Alumno')).toBeTruthy();
  });

  it('muestra informacion de confianza cuando esta disponible', () => {
    render(<TrajectoryChart trajectoryData={validTrajectory} />);
    expect(screen.getByText(/Confianza: alta/)).toBeTruthy();
    expect(screen.getByText(/3 puntos/)).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════
// EngagementRadar
// ══════════════════════════════════════════════════════════════════════

describe('EngagementRadar', () => {
  const validEngagement = {
    engagementScore: 72,
    components: {
      playFrequency: 0.8,
      regularity: 0.6,
      completionRate: 0.9,
      timeBetweenSessions: 0.5,
      voluntaryReplays: 0.3,
    },
  };

  it('muestra estado vacio cuando engagement es null', () => {
    render(<EngagementRadar engagement={null} />);
    expect(
      screen.getByText(/Sin datos de engagement aun/)
    ).toBeTruthy();
  });

  it('muestra estado vacio cuando no hay componentes', () => {
    render(<EngagementRadar engagement={{}} />);
    expect(
      screen.getByText(/Sin datos de engagement aun/)
    ).toBeTruthy();
  });

  it('renderiza el titulo "Engagement"', () => {
    render(<EngagementRadar engagement={validEngagement} />);
    expect(screen.getByText('Engagement')).toBeTruthy();
  });

  it('muestra el score con la etiqueta RAG correcta (Alto para >= 60)', () => {
    render(<EngagementRadar engagement={validEngagement} />);
    // score 72 -> "72 — Alto"
    expect(screen.getByText(/72/)).toBeTruthy();
    expect(screen.getByText(/Alto/)).toBeTruthy();
  });

  it('renderiza el radar chart cuando hay datos', () => {
    render(<EngagementRadar engagement={validEngagement} />);
    expect(screen.getByTestId('responsive-container')).toBeTruthy();
    expect(screen.getByTestId('radar-chart')).toBeTruthy();
  });

  it('muestra etiqueta "Medio" para score entre 35 y 59', () => {
    const mediumEngagement = {
      engagementScore: 45,
      components: {
        playFrequency: 0.5,
        regularity: 0.4,
        completionRate: 0.5,
        timeBetweenSessions: 0.3,
        voluntaryReplays: 0.2,
      },
    };
    render(<EngagementRadar engagement={mediumEngagement} />);
    expect(screen.getByText(/Medio/)).toBeTruthy();
  });

  it('muestra etiqueta "Bajo" para score menor a 35', () => {
    const lowEngagement = {
      engagementScore: 20,
      components: {
        playFrequency: 0.2,
        regularity: 0.1,
        completionRate: 0.3,
        timeBetweenSessions: 0.1,
        voluntaryReplays: 0.05,
      },
    };
    render(<EngagementRadar engagement={lowEngagement} />);
    expect(screen.getByText(/Bajo/)).toBeTruthy();
  });
});
