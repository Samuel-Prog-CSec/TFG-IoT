/**
 * @fileoverview Tests del wrapper Icon.jsx.
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import Icon, { resolveIconSize } from '../Icon';
import { ICON_REGISTRY, listRegisteredIconNames } from '../iconRegistry';

describe('Icon wrapper', () => {
  describe('resolveIconSize', () => {
    it('mapea los tokens sm/md/lg/xl a píxeles estables', () => {
      expect(resolveIconSize('sm')).toBe(14);
      expect(resolveIconSize('md')).toBe(16);
      expect(resolveIconSize('lg')).toBe(20);
      expect(resolveIconSize('xl')).toBe(24);
    });

    it('acepta números directos para casos especiales', () => {
      expect(resolveIconSize(28)).toBe(28);
      expect(resolveIconSize(40)).toBe(40);
    });

    it('usa "md" por defecto si el valor es inválido', () => {
      expect(resolveIconSize('xxl')).toBe(16);
      expect(resolveIconSize(undefined)).toBe(16);
    });
  });

  describe('iconRegistry', () => {
    it('expone el mapa canónico', () => {
      expect(ICON_REGISTRY).toBeDefined();
      expect(Object.keys(ICON_REGISTRY).length).toBeGreaterThan(80);
    });

    it('permite listar los nombres registrados (ordenados)', () => {
      const names = listRegisteredIconNames();
      expect(names.length).toBeGreaterThan(80);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });

    it('registra aliases conocidos (MapIcon apunta a Map)', () => {
      expect(ICON_REGISTRY.MapIcon).toBeDefined();
      expect(ICON_REGISTRY.MapIcon).toBe(ICON_REGISTRY.Map);
    });
  });

  describe('render', () => {
    it('renderiza un SVG para un nombre válido', () => {
      const { container } = render(<Icon name="Play" size="md" data-testid="icon" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg).toHaveAttribute('width', '16');
      expect(svg).toHaveAttribute('height', '16');
    });

    it('aplica el size enum correcto para "lg"', () => {
      const { container } = render(<Icon name="Users" size="lg" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '20');
    });

    it('acepta tamaño numérico directo', () => {
      const { container } = render(<Icon name="Users" size={32} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '32');
    });

    it('propaga className al SVG', () => {
      const { container } = render(<Icon name="Check" className="text-success-base" />);
      const svg = container.querySelector('svg');
      expect(svg.getAttribute('class')).toContain('text-success-base');
    });

    it('renderiza placeholder sin romper cuando el icono no existe', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { container } = render(<Icon name="NoExisteSiquiera" size="md" />);
      expect(container.querySelector('svg')).toBeNull();
      const placeholder = container.querySelector('[data-icon-missing]');
      expect(placeholder).toBeTruthy();
      expect(placeholder).toHaveAttribute('aria-hidden', 'true');
      warnSpy.mockRestore();
    });
  });
});
