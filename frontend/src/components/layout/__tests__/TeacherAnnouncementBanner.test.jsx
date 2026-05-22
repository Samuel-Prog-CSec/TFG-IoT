/**
 * @fileoverview Tests del banner de avisos para teacher (T-942).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TeacherAnnouncementBanner from '../TeacherAnnouncementBanner';

const mk = (overrides = {}) => ({
  id: 'a1',
  title: 'Aviso',
  body: 'Cuerpo del aviso',
  severity: 'info',
  ...overrides
});

describe('TeacherAnnouncementBanner (T-942)', () => {
  it('no renderiza nada si no hay avisos', () => {
    const { container } = render(<TeacherAnnouncementBanner announcements={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('ordena avisos por severidad: urgent → warning → info', () => {
    const { container } = render(
      <TeacherAnnouncementBanner
        announcements={[
          mk({ id: 'info', severity: 'info', title: 'Info' }),
          mk({ id: 'urgent', severity: 'urgent', title: 'Urgent' }),
          mk({ id: 'warning', severity: 'warning', title: 'Warning' })
        ]}
      />
    );
    const banners = container.querySelectorAll('[role="alert"], [role="status"]');
    const titles = Array.from(banners).map(el => el.textContent);
    expect(titles[0]).toMatch(/Urgent/);
    expect(titles[1]).toMatch(/Warning/);
    expect(titles[2]).toMatch(/Info/);
  });

  it('urgent renderiza con role=alert + aria-live="assertive"', () => {
    render(
      <TeacherAnnouncementBanner
        announcements={[mk({ severity: 'urgent', title: 'Crítico' })]}
      />
    );
    const banner = screen.getByRole('alert');
    expect(banner).toHaveAttribute('aria-live', 'assertive');
  });

  it('llama onDismiss con id al cerrar', () => {
    const onDismiss = vi.fn();
    render(
      <TeacherAnnouncementBanner
        announcements={[mk({ id: 'a1' })]}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByLabelText(/Cerrar aviso/i));
    expect(onDismiss).toHaveBeenCalledWith('a1');
  });

  it('muestra solo 3 visibles y resume el resto', () => {
    render(
      <TeacherAnnouncementBanner
        announcements={[
          mk({ id: '1' }),
          mk({ id: '2' }),
          mk({ id: '3' }),
          mk({ id: '4', title: '4to' }),
          mk({ id: '5', title: '5to' })
        ]}
      />
    );
    expect(screen.queryByText(/4to/)).toBeNull();
    expect(screen.queryByText(/5to/)).toBeNull();
    expect(screen.getByText(/\+2 aviso/i)).toBeInTheDocument();
  });

  it('isPreview oculta el botón de cerrar', () => {
    render(
      <TeacherAnnouncementBanner
        announcements={[mk({ id: 'p' })]}
        isPreview
      />
    );
    expect(screen.queryByLabelText(/Cerrar aviso/i)).toBeNull();
  });

  it('link interno (/) no usa target=_blank', () => {
    render(
      <TeacherAnnouncementBanner
        announcements={[
          mk({ id: 'l', linkUrl: '/decks', linkLabel: 'Ir a mazos' })
        ]}
      />
    );
    const link = screen.getByText('Ir a mazos').closest('a');
    expect(link).toHaveAttribute('href', '/decks');
    expect(link).not.toHaveAttribute('target');
  });
});
