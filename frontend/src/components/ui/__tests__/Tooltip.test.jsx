/**
 * @fileoverview Tests del componente Tooltip.
 *
 * Cubre la deteccion de "hijo interactivo" — el wrapper Tooltip NO debe
 * envolver los buttons reales con un span[role=button] (anidamiento HTML
 * invalido) cuando el hijo ya es interactivo. Regresion de BUG-1 (QA
 * 2026-05-12): Tooltip no detectaba `motion.button` (displayName literal
 * "motion.button") y aplicaba el wrapper interactivo.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { motion } from 'framer-motion';
import Tooltip from '../Tooltip';

describe('Tooltip - deteccion de hijo interactivo', () => {
  it('NO envuelve un <button> nativo en span[role=button]', () => {
    const { container } = render(
      <Tooltip content="Hint">
        <button type="button">Click</button>
      </Tooltip>
    );
    const wrapperSpan = container.querySelector('span[role="button"]');
    expect(wrapperSpan).toBeNull();
  });

  it('NO envuelve un <a> nativo en span[role=button]', () => {
    const { container } = render(
      <Tooltip content="Hint">
        <a href="/foo">Link</a>
      </Tooltip>
    );
    expect(container.querySelector('span[role="button"]')).toBeNull();
  });

  it('NO envuelve un motion.button en span[role=button] (BUG-1 QA 2026-05-12)', () => {
    const { container } = render(
      <Tooltip content="Opciones">
        <motion.button type="button" aria-label="Opciones para mazo X">
          ⋮
        </motion.button>
      </Tooltip>
    );
    const wrapperSpan = container.querySelector('span[role="button"]');
    expect(wrapperSpan).toBeNull();
    // El boton real debe seguir existiendo, sin doble role
    const realButton = container.querySelector('button[aria-label="Opciones para mazo X"]');
    expect(realButton).not.toBeNull();
  });

  it('NO envuelve un motion.a en span[role=button]', () => {
    const { container } = render(
      <Tooltip content="Hint">
        <motion.a href="/foo">Link</motion.a>
      </Tooltip>
    );
    expect(container.querySelector('span[role="button"]')).toBeNull();
  });

  it('SI envuelve un <span> plano (no interactivo) en span[role=button]', () => {
    const { container } = render(
      <Tooltip content="Info no interactiva">
        <span>Solo texto decorativo</span>
      </Tooltip>
    );
    const wrapperSpan = container.querySelector('span[role="button"]');
    expect(wrapperSpan).not.toBeNull();
    expect(wrapperSpan?.getAttribute('aria-label')).toBe('Info no interactiva');
  });

  it('respeta children.props.role="button" sin envolver', () => {
    const { container } = render(
      <Tooltip content="Hint">
        <div role="button" tabIndex={0}>Pseudo-button</div>
      </Tooltip>
    );
    expect(container.querySelector('span[role="button"]')).toBeNull();
  });
});
