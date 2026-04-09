/**
 * @fileoverview Tests de renderizado de la pagina publica de privacidad.
 * Verifica que cumple los requisitos del Art. 13/14 RGPD.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Mock framer-motion ──
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_, tag) => {
      const Component = (props) => {
        const { children, initial, animate, exit, variants, transition, whileHover, whileTap, layout, ...rest } = props;
        const domProps = {};
        for (const [key, val] of Object.entries(rest)) {
          if (typeof val !== 'object' || key === 'className' || key === 'style' || key.startsWith('data-') || key.startsWith('aria-') || key === 'role' || key === 'id' || key === 'onClick') {
            domProps[key] = val;
          }
        }
        const Tag = typeof tag === 'string' ? tag : 'div';
        return <Tag {...domProps}>{children}</Tag>;
      };
      Component.displayName = `motion.${String(tag)}`;
      return Component;
    }
  }),
  AnimatePresence: ({ children }) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => false,
}));

// Mock de hooks del proyecto (PrivacyPage es standalone pero por si acaso)
vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => ({ shouldReduceMotion: false })
}));

import PrivacyPage from '../PrivacyPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>
  );

describe('PrivacyPage (Art. 13/14 RGPD)', () => {
  it('renderiza el titulo principal', () => {
    renderPage();
    expect(screen.getAllByText(/Privacidad/i).length).toBeGreaterThan(0);
  });

  it('incluye enlace a iniciar sesion', () => {
    renderPage();
    expect(screen.getAllByText(/Iniciar sesi[oó]n/i).length).toBeGreaterThan(0);
  });

  it('menciona los datos que se recogen', () => {
    renderPage();
    expect(screen.getAllByText(/Datos que recogemos/i).length).toBeGreaterThan(0);
  });

  it('menciona la finalidad del tratamiento', () => {
    renderPage();
    expect(screen.getAllByText(/Finalidad/i).length).toBeGreaterThan(0);
  });

  it('menciona la base juridica', () => {
    renderPage();
    expect(screen.getAllByText(/Base jur[ií]dica/i).length).toBeGreaterThan(0);
  });

  it('menciona los plazos de conservacion', () => {
    renderPage();
    expect(screen.getAllByText(/conservaci[oó]n/i).length).toBeGreaterThan(0);
  });

  it('menciona los derechos del interesado', () => {
    renderPage();
    expect(screen.getAllByText(/[Dd]erechos/i).length).toBeGreaterThan(0);
  });

  it('referencia la AEPD como autoridad de control', () => {
    renderPage();
    expect(screen.getAllByText(/AEPD/i).length).toBeGreaterThan(0);
  });

  it('indica que NO se recogen ciertos datos sensibles', () => {
    renderPage();
    expect(screen.getAllByText(/[Nn][Oo] recogemos/i).length).toBeGreaterThan(0);
  });
});
