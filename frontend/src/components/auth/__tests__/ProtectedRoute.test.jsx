import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock AuthContext
const mockUseAuth = vi.fn();
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));

// Mock AuthLoader
vi.mock('../../common', () => ({
  AuthLoader: ({ message }) => <div data-testid="auth-loader">{message}</div>
}));

// Mock ROUTES
vi.mock('../../../constants/routes', () => ({
  ROUTES: { LOGIN: '/login', DASHBOARD: '/dashboard' }
}));

import ProtectedRoute from '../ProtectedRoute';

const renderWithRouter = (ui) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ProtectedRoute', () => {
  it('shows loader while authentication is loading', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });

    renderWithRouter(
      <ProtectedRoute><div>Protected content</div></ProtectedRoute>
    );

    expect(screen.getByTestId('auth-loader')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });

    renderWithRouter(
      <ProtectedRoute><div>Protected content</div></ProtectedRoute>
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });

    renderWithRouter(
      <ProtectedRoute><div>Protected content</div></ProtectedRoute>
    );

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
