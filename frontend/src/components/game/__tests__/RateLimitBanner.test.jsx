/**
 * @fileoverview Tests del RateLimitBanner (PROP-92).
 *
 * Cubre: render del countdown, auto-dismiss tras retryAfterMs, accesibilidad
 * mínima (role, aria-live, progressbar) y comportamiento con reduced-motion.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import RateLimitBanner from '../RateLimitBanner';

vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => ({ shouldReduceMotion: false })
}));

describe('RateLimitBanner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renderiza el mensaje y el contador inicial', () => {
    render(
      <RateLimitBanner retryAfterMs={3000} message="Espera un momento" onDismiss={() => {}} />
    );

    expect(screen.getByText('Espera un momento')).toBeInTheDocument();
    expect(screen.getByText(/vuelves a poder tocar en 3s/i)).toBeInTheDocument();
  });

  it('expone role="status" + aria-live polite + progressbar', () => {
    render(
      <RateLimitBanner retryAfterMs={2000} onDismiss={() => {}} />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuemin', '0');
    expect(progressbar).toHaveAttribute('aria-valuemax', '2000');
  });

  it('llama a onDismiss cuando expira el tiempo', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<RateLimitBanner retryAfterMs={1000} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('NO renderiza nada si retryAfterMs es 0 o negativo', () => {
    const { container } = render(<RateLimitBanner retryAfterMs={0} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('reset cuando llega un nuevo retryAfterMs', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const { rerender } = render(<RateLimitBanner retryAfterMs={1000} onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Llega un segundo rate-limit antes de que el primero auto-dismiss.
    rerender(<RateLimitBanner retryAfterMs={2000} onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(1000); // 500 + 1000 = 1500ms total, pero el reset solo lleva 1000ms
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000); // Ahora 2000ms desde el reset
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
