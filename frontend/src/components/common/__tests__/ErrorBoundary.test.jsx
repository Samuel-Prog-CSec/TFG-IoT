import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock Sentry
vi.mock('../../../lib/sentry', () => ({
  captureException: vi.fn()
}));

// Mock ButtonPremium
vi.mock('../../ui/ButtonPremium', () => ({
  default: ({ children, onClick, ...props }) => (
    <button onClick={onClick} {...props}>{children}</button>
  )
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  AlertTriangle: (props) => <span data-testid="alert-icon" {...props} />,
  RefreshCw: (props) => <span data-testid="refresh-icon" {...props} />,
  Home: (props) => <span data-testid="home-icon" {...props} />
}));

// Mock CharacterMascot (presentacional): el fallback de ErrorBoundary ahora
// muestra a Otto, que transita mechanicTheme→lucide. Aislamos el test de la
// boundary de ese árbol (e impedimos que el mock parcial de lucide rompa al
// pedir iconos como `Brain`).
vi.mock('../../game/CharacterMascot', () => ({
  default: () => <div data-testid="mascot" />
}));

import ErrorBoundary from '../ErrorBoundary';
import { captureException } from '../../../lib/sentry';

// Component that throws an error
const ThrowingComponent = ({ shouldThrow = true }) => {
  if (shouldThrow) throw new Error('Test error');
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error from React error boundary
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Child content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('renders default fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Algo salió mal/)).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
  });

  it('reports error to Sentry via captureException', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ react: expect.any(Object) })
    );
  });

  it('calls onError callback when provided', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it('resets error state when retry button is clicked', () => {
    const onReset = vi.fn();
    let shouldThrow = true;

    const ConditionalThrower = () => {
      if (shouldThrow) throw new Error('Test');
      return <div>Recovered</div>;
    };

    render(
      <ErrorBoundary onReset={onReset}>
        <ConditionalThrower />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Algo salió mal/)).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Intentar de nuevo'));

    expect(onReset).toHaveBeenCalled();
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});
