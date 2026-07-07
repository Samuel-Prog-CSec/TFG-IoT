/**
 * @fileoverview Tests de ReportTemplateCards (T-942 Fase D).
 *
 * Cubre render con datos mock + interacción click → onApply.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => ({ shouldReduceMotion: true })
}));

import ReportTemplateCards from '../ReportTemplateCards';

const mockTemplates = [
  {
    _id: '1',
    key: 'end-of-term',
    name: 'Fin de trimestre',
    description: 'Resumen completo del trimestre para reuniones.',
    icon: 'GraduationCap',
    defaults: { reportType: 'classroom', period: '90d', format: 'detailed' }
  },
  {
    _id: '2',
    key: 'parents',
    name: 'Para padres',
    description: 'Informe individual breve enfocado en el progreso.',
    icon: 'Users',
    defaults: { reportType: 'student', period: '30d', format: 'summary' }
  },
  {
    _id: '3',
    key: 'staff-meeting',
    name: 'Reunión de claustro',
    description: 'Datos agregados del aula para el equipo docente.',
    icon: 'Building2',
    defaults: { reportType: 'classroom', period: '30d', format: 'summary' }
  }
];

describe('ReportTemplateCards', () => {
  it('renderiza las 3 plantillas con nombre y descripción', () => {
    render(<ReportTemplateCards templates={mockTemplates} onApply={vi.fn()} loading={false} />);
    expect(screen.getByText('Fin de trimestre')).toBeInTheDocument();
    expect(screen.getByText('Para padres')).toBeInTheDocument();
    expect(screen.getByText('Reunión de claustro')).toBeInTheDocument();
    expect(screen.getByText(/Resumen completo del trimestre/i)).toBeInTheDocument();
    // Pills resumen de defaults
    expect(screen.getByText('Aula · 90 días · Detallado')).toBeInTheDocument();
    expect(screen.getByText('Alumno · 30 días · Resumen')).toBeInTheDocument();
  });

  it('invoca onApply con la plantilla correcta al click', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<ReportTemplateCards templates={mockTemplates} onApply={onApply} loading={false} />);

    const card = screen.getByLabelText('Aplicar plantilla Fin de trimestre');
    await user.click(card);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(mockTemplates[0]);
  });
});
