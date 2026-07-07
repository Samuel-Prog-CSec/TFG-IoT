import { describe, it, expect, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { mascotForStep } from '../mascotForStep';
import { MascotGuide } from '../OnboardingOverlay';

// jsdom no implementa IntersectionObserver (lo usa `useInView` dentro de
// CharacterMascot). Stub que nunca dispara → render determinista.
beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
});

describe('mascotForStep — mood + frase por paso', () => {
  it('usa mascotMood/mascotLine del paso si existen', () => {
    expect(mascotForStep({ mascotMood: 'pointing', mascotLine: 'X' }, 2, 7)).toEqual({
      mood: 'pointing',
      line: 'X',
    });
  });
  it('default: paso 0 → greeting', () => {
    expect(mascotForStep({ mascotLine: 'Hola' }, 0, 7).mood).toBe('greeting');
  });
  it('default: último → celebrating', () => {
    expect(mascotForStep({ mascotLine: 'Fin' }, 6, 7).mood).toBe('celebrating');
  });
  it('default: spotlight intermedio → pointing', () => {
    expect(mascotForStep({ type: 'spotlight', mascotLine: 'P' }, 2, 7).mood).toBe('pointing');
  });
  it('default: modal intermedio → thinking', () => {
    expect(mascotForStep({ type: 'modal', mascotLine: 'M' }, 3, 7).mood).toBe('thinking');
  });
});

describe('MascotGuide — Otto + bocadillo', () => {
  it('muestra Otto (svg del rig) y el bocadillo con la frase', () => {
    const { container, getByText } = render(<MascotGuide mood="greeting" line="¡Hola!" />);
    expect(container.querySelector('svg[data-otto-size]')).not.toBeNull();
    expect(getByText('¡Hola!')).not.toBeNull();
  });
  it('flip marca el contenedor de Otto para voltearlo', () => {
    const { container } = render(<MascotGuide mood="pointing" line="X" flip />);
    expect(container.querySelector('[data-otto-flip="true"]')).not.toBeNull();
  });
});
