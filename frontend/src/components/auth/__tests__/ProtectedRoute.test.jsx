import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: () => ({ children, ...props }) => <div {...props}>{children}</div>
  })
}));
vi.mock('@sentry/react', () => ({ captureException: vi.fn(), setUser: vi.fn(), withScope: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('socket.io-client', () => ({ io: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), connected: false })) }));
vi.mock('../../../services/api', () => ({ authAPI: { refreshToken: vi.fn(), getProfile: vi.fn() }, getAccessToken: vi.fn(), AUTH_EVENTS: {} }));
vi.mock('../../../services/socket', () => ({ socketService: { disconnect: vi.fn() } }));
vi.mock('../../../lib/sentry', () => ({ setUserContext: vi.fn(), captureException: vi.fn() }));
vi.mock('../../../constants/routes', () => ({ ROUTES: { LOGIN: '/login', DASHBOARD: '/dashboard' } }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, isLoading: false }) }));

describe('ProtectedRoute', () => {
  it('renders children when authenticated', async () => {
    const { MemoryRouter } = await import('react-router-dom');
    const { default: ProtectedRoute } = await import('../ProtectedRoute');
    render(<MemoryRouter><ProtectedRoute><div>Content</div></ProtectedRoute></MemoryRouter>);
    expect(screen.getByText('Content')).toBeInTheDocument();
    cleanup();
  });
});
