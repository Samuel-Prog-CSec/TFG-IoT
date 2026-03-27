import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockUseAuth = vi.fn();
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth()
}));

vi.mock('../../../constants/routes', () => ({
  ROUTES: { LOGIN: '/login', DASHBOARD: '/dashboard' }
}));

import RequireRole from '../RequireRole';

const renderWithRouter = (ui) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('RequireRole', () => {
  it('renders children when user has the required role', () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'teacher' },
      isAuthenticated: true,
      isLoading: false
    });

    renderWithRouter(
      <RequireRole roles="teacher"><div>Teacher content</div></RequireRole>
    );

    expect(screen.getByText('Teacher content')).toBeInTheDocument();
  });

  it('renders children when user role is in allowed array', () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'super_admin' },
      isAuthenticated: true,
      isLoading: false
    });

    renderWithRouter(
      <RequireRole roles={['teacher', 'super_admin']}><div>Admin content</div></RequireRole>
    );

    expect(screen.getByText('Admin content')).toBeInTheDocument();
  });

  it('redirects when user does not have the required role', () => {
    mockUseAuth.mockReturnValue({
      user: { role: 'student' },
      isAuthenticated: true,
      isLoading: false
    });

    renderWithRouter(
      <RequireRole roles="teacher"><div>Teacher only</div></RequireRole>
    );

    expect(screen.queryByText('Teacher only')).not.toBeInTheDocument();
  });

  it('renders nothing while loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true
    });

    const { container } = renderWithRouter(
      <RequireRole roles="teacher"><div>Content</div></RequireRole>
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false
    });

    const { container } = renderWithRouter(
      <RequireRole roles="teacher"><div>Content</div></RequireRole>
    );

    expect(container.innerHTML).toBe('');
  });
});
