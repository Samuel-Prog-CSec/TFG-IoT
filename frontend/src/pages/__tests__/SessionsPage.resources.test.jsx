/**
 * @fileoverview Tests de degradación "Recursos no disponibles" (ADR-231).
 * Una sesión con resourcesAvailable=false (contexto eliminado o mazo
 * archivado) muestra el badge y deshabilita jugar/clonar; el flag ausente
 * (undefined) NO degrada la sesión.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionsPage from '../SessionsPage';
import { sessionsAPI } from '../../services/api';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('framer-motion', () => {
  const proxy = new Proxy(
    {},
    {
      get: () =>
        ({ children, ...props }) =>
          <div {...props}>{children}</div>
    }
  );
  return {
    motion: proxy,
    m: proxy,
    AnimatePresence: ({ children }) => <>{children}</>,
    LazyMotion: ({ children }) => <>{children}</>,
    domAnimation: {}
  };
});

vi.mock('../../hooks/useContexts', () => ({
  useContexts: () => ({ contexts: [] })
}));

vi.mock('../../hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: () => {}
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../components/ui/ButtonPremium', () => ({
  default: ({ children, onClick, disabled, ...props }) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  )
}));

vi.mock('../../components/ui/GlassCard', () => ({
  default: ({ children }) => <div>{children}</div>
}));

vi.mock('../../components/ui/SelectPremium', () => ({
  default: ({ label }) => <div>{label}</div>
}));

vi.mock('../../components/ui/StatusBadge', () => ({
  default: ({ children }) => <span>{children}</span>
}));

vi.mock('../../components/ui/SkeletonShimmer', () => ({
  SkeletonCard: () => <div>loading</div>,
  SkeletonGrid: () => <div>loading grid</div>
}));

vi.mock('../../components/ui/Tooltip', () => ({
  default: ({ children }) => <>{children}</>
}));

vi.mock('../../components/ui/EmptyState', () => ({
  default: ({ title }) => <div>{title}</div>
}));

vi.mock('../../components/ui/ConfirmationModal', async () => {
  const ReactModule = await vi.importActual('react');
  const { useState } = ReactModule;

  const useConfirmationModal = () => {
    const [isOpen, setIsOpen] = useState(false);
    return {
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false)
    };
  };

  return {
    default: ({ open, title }) => (open ? <div>{title}</div> : null),
    useConfirmationModal
  };
});

const buildSession = overrides => ({
  id: 'session-degraded',
  status: 'completed',
  deck: { name: 'Mazo Frutas', status: 'archived' },
  mechanic: { name: 'association', displayName: 'Asociación' },
  context: null,
  config: {
    numberOfCards: 4,
    numberOfRounds: 5,
    timeLimit: 15,
    pointsPerCorrect: 10
  },
  playStats: { playsCount: 3, averageScore: 72 },
  resourcesAvailable: false,
  ...overrides
});

vi.mock('../../services/api', () => ({
  sessionsAPI: {
    getSessions: vi.fn(),
    cloneSession: vi.fn(),
    deleteSession: vi.fn()
  },
  mechanicsAPI: {
    getMechanics: vi.fn(async () => ({ data: { data: [] } }))
  },
  extractData: response => response?.data?.data || response?.data,
  extractErrorMessage: error => error?.message || 'error',
  isAbortError: () => false
}));

const mockSessionsResponse = sessions => {
  sessionsAPI.getSessions.mockResolvedValue({
    data: {
      success: true,
      data: sessions,
      pagination: { page: 1, totalPages: 1 }
    }
  });
};

describe('SessionsPage — degradación "Recursos no disponibles" (ADR-231)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el badge y deshabilita el botón primario cuando resourcesAvailable=false', async () => {
    mockSessionsResponse([buildSession()]);

    render(
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>
    );

    await screen.findByText('Mazo Frutas');

    expect(screen.getByText('Recursos no disponibles')).toBeInTheDocument();

    const primaryButton = screen.getByRole('button', { name: /volver a jugar/i });
    expect(primaryButton).toBeDisabled();
  });

  it('no degrada la sesión cuando el flag viene a true', async () => {
    mockSessionsResponse([buildSession({ resourcesAvailable: true, context: { name: 'Frutas' } })]);

    render(
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>
    );

    await screen.findByText('Mazo Frutas');

    expect(screen.queryByText('Recursos no disponibles')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /volver a jugar/i })).toBeEnabled();
  });

  it('no degrada la sesión cuando el endpoint no calcula el flag (undefined)', async () => {
    const session = buildSession({ context: { name: 'Frutas' } });
    delete session.resourcesAvailable;
    mockSessionsResponse([session]);

    render(
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>
    );

    await screen.findByText('Mazo Frutas');

    expect(screen.queryByText('Recursos no disponibles')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /volver a jugar/i })).toBeEnabled();
  });
});
