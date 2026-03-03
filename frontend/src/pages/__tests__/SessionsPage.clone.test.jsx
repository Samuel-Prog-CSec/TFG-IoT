 
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionsPage from '../SessionsPage';
import { sessionsAPI, mechanicsAPI } from '../../services/api';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => ({ children, ...props }) => <div {...props}>{children}</div>
    }
  ),
  AnimatePresence: ({ children }) => <>{children}</>
}));

vi.mock('../../hooks', () => ({
  useContexts: () => ({ contexts: [] }),
  useRefetchOnFocus: () => {}
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../../components/ui', async () => {
  const ReactModule = await vi.importActual('react');
  const {useState} = ReactModule;

  const useConfirmationModal = () => {
    const [isOpen, setIsOpen] = useState(false);
    return {
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false)
    };
  };

  return {
    ButtonPremium: ({ children, onClick, disabled, ...props }) => (
      <button type="button" onClick={onClick} disabled={disabled} {...props}>
        {children}
      </button>
    ),
    GlassCard: ({ children }) => <div>{children}</div>,
    SelectPremium: ({ label }) => <div>{label}</div>,
    StatusBadge: ({ children }) => <span>{children}</span>,
    SkeletonCard: () => <div>loading</div>,
    Tooltip: ({ children }) => <>{children}</>,
    EmptyState: ({ title }) => <div>{title}</div>,
    ConfirmationModal: ({ open, title, confirmText, onConfirm }) =>
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

vi.mock('../../services/api', () => ({
  sessionsAPI: {
    getSessions: vi.fn(async () => ({
      data: {
        success: true,
        data: [
          {
            id: 'session-1',
            status: 'created',
            deck: { name: 'Deck test' },
            mechanic: { name: 'association', displayName: 'Asociación' },
            context: { name: 'Animales' },
            config: {
              numberOfCards: 4,
              numberOfRounds: 5,
              timeLimit: 15,
              pointsPerCorrect: 10
            }
          }
        ],
        pagination: { page: 1, totalPages: 1 }
      }
    })),
    cloneSession: vi.fn(async () => ({
      data: {
        id: 'clone-1',
        status: 'created'
      }
    })),
    deleteSession: vi.fn()
  },
  mechanicsAPI: {
    getMechanics: vi.fn(async () => ({ data: { data: [] } }))
  },
  extractData: response => response?.data?.data || response?.data,
  extractErrorMessage: error => error?.message || 'error',
  isAbortError: () => false
}));

describe('SessionsPage clone action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clones session from list and redirects to cloned detail', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>
    );

    await screen.findByText('Deck test');

    const cloneButton = screen.getByRole('button', { name: /volver a jugar/i });
    await user.click(cloneButton);

    await user.click(screen.getByRole('button', { name: /clonar sesión/i }));

    await waitFor(() => {
      expect(sessionsAPI.cloneSession).toHaveBeenCalledWith('session-1');
      expect(mockNavigate).toHaveBeenCalledWith('/sessions/clone-1');
    });

    expect(mechanicsAPI.getMechanics).toHaveBeenCalled();
  });

  it('redirects memory clones to board setup for reconfiguration', async () => {
    const user = userEvent.setup();

    sessionsAPI.cloneSession.mockResolvedValueOnce({
      data: {
        id: 'clone-memory-1',
        status: 'created',
        mechanic: { name: 'memory' }
      }
    });

    render(
      <MemoryRouter>
        <SessionsPage />
      </MemoryRouter>
    );

    await screen.findByText('Deck test');

    const cloneButton = screen.getByRole('button', { name: /volver a jugar/i });
    await user.click(cloneButton);
    await user.click(screen.getByRole('button', { name: /clonar sesión/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/board-setup/clone-memory-1');
    });
  });
});
