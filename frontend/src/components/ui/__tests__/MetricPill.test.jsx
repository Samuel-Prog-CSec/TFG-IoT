/**
 * @fileoverview Tests del primitivo `MetricPill` (ADR-F).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Brain } from 'lucide-react';
import MetricPill from '../MetricPill';

describe('MetricPill', () => {
  it('renderiza label y value', () => {
    render(<MetricPill label="Errores" value={3} />);
    expect(screen.getByText('Errores')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('aplica el tone en clases CSS', () => {
    const { container } = render(<MetricPill label="Aciertos" value={5} tone="success" />);
    expect(container.firstChild.className).toMatch(/success-base/);
  });

  it('cae a "neutral" si el tone no es válido', () => {
    const { container } = render(<MetricPill label="Test" value={1} tone="invalid" />);
    expect(container.firstChild.className).toMatch(/background-elevated|border-subtle/);
  });

  it('renderiza el icono cuando se pasa', () => {
    const { container } = render(<MetricPill label="Mente" value={9} icon={Brain} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('formatea delta numérico positivo con flecha arriba y signo', () => {
    render(<MetricPill label="Score" value={120} delta={12} />);
    expect(screen.getByText('↑ +12')).toBeInTheDocument();
  });

  it('formatea delta negativo con flecha abajo y signo', () => {
    render(<MetricPill label="Score" value={120} delta={-5} />);
    expect(screen.getByText('↓ -5')).toBeInTheDocument();
  });

  it('formatea delta cero sin flecha', () => {
    render(<MetricPill label="Score" value={120} delta={0} />);
    expect(screen.getByText('· 0')).toBeInTheDocument();
  });

  it('acepta delta como string sin formatear', () => {
    render(<MetricPill label="Score" value={120} delta="vs partida anterior" />);
    expect(screen.getByText('vs partida anterior')).toBeInTheDocument();
  });

  it('aplica el atributo title si se pasa tooltip', () => {
    const { container } = render(<MetricPill label="X" value={1} tooltip="ayuda" />);
    expect(container.firstChild.getAttribute('title')).toBe('ayuda');
  });
});
