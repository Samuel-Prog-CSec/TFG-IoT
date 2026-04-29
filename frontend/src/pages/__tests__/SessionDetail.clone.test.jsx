import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionDetail from '../SessionDetail';
import { sessionsAPI } from '../../services/api';

const mockNavigate = vi.fn();

const buildSessionDetailResponse = (overrides = {}) => ({
  id: 'session-1',
  status: 'created',
  deck: { name: 'Deck detail' },
  mechanic: { displayName: 'Asociación', name: 'association' },
  context: { name: 'Animales' },
  createdAt: '2026-03-03T10:00:00.000Z',
  config: {
    numberOfCards: 4,
    numberOfRounds: 5,
    timeLimit: 15,
    pointsPerCorrect: 10,
    penaltyPerError: -2
  },
  cardMappings: [],
  ...overrides
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ sessionId: 'session-1' })
  };
});

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'teacher-1', role: 'teacher' } })
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => ({ children, ...props }) => <div {...props}>{children}</div>
    }
  ),
  AnimatePresence: ({ children }) => <>{children}</>
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

vi.mock('../../components/ui/StatusBadge', () => ({
  default: ({ children }) => <span>{children}</span>
}));

vi.mock('../../components/ui/SkeletonShimmer', () => ({
  SkeletonCard: () => <div>loading</div>
}));

vi.mock('../../components/ui/EmptyState', () => ({
  default: ({ title }) => <div>{title}</div>
}));

vi.mock('../../components/ui/Tooltip', () => ({
  default: ({ children }) => <>{children}</>
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
    default: ({ open, title, confirmText, onConfirm }) =>
      open ? (
        <div>
          <p>{title}</p>
          <button type="button" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      ) : null,
    useConfirmationModal
  };
});

vi.mock('../../components/ui/SelectPremium', () => ({
  default: ({ options, value, onChange, placeholder, label, ...props }) => (
    <select
      data-testid="select-premium"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      aria-label={label || placeholder}
      {...props}
    >
      <option value="">{placeholder}</option>
      {(options || []).map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}));

vi.mock('../../services/api', () => ({
  sessionsAPI: {
    getSessionById: vi.fn(),
    cloneSession: vi.fn(async () => ({ data: { id: 'clone-9' } })),
    deleteSession: vi.fn()
  },
  usersAPI: {
    getStudentsByTeacher: vi.fn(async () => ({
      data: [
        { id: 'student-1', name: 'Alumno 1' },
        { id: 'student-2', name: 'Alumno 2' }
      ]
    }))
  },
  extractData: response => response?.data,
  extractErrorMessage: error => error?.message || 'error',
  isAbortError: () => false
}));

describe('SessionDetail clone action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionsAPI.getSessionById.mockResolvedValue({
      data: buildSessionDetailResponse()
    });
  });

  it('clones session from detail view and redirects to cloned detail', async () => {
    const user = userEvent.setup();

    sessionsAPI.getSessionById.mockResolvedValueOnce({
      data: buildSessionDetailResponse({ status: 'completed' })
    });

    render(
      <MemoryRouter>
        <SessionDetail />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: /deck detail/i });

    const cloneButton = screen.getByRole('button', { name: /volver a jugar/i });
    await user.click(cloneButton);

    await user.click(screen.getByRole('button', { name: /clonar sesión/i }));

    await waitFor(() => {
      expect(sessionsAPI.cloneSession).toHaveBeenCalledWith('session-1');
      expect(mockNavigate).toHaveBeenCalledWith('/sessions/clone-9');
    });
  });

  it('shows memory board configuration warning for memory drafts without board layout', async () => {
    const user = userEvent.setup();

    sessionsAPI.getSessionById.mockResolvedValueOnce({
      data: buildSessionDetailResponse({
        mechanic: { displayName: 'Memoria', name: 'memory' },
        boardLayout: []
      })
    });

    render(
      <MemoryRouter>
        <SessionDetail />
      </MemoryRouter>
    );

    await screen.findByRole('heading', { name: /deck detail/i });

    expect(
      screen.getByText(/requiere configurar el tablero antes de iniciar/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /configurar tablero/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/board-setup/session-1');
  });
});
