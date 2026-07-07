/**
 * @fileoverview Helpers compartidos por los tests de accesibilidad (jest-axe).
 *
 * El proyecto usa una custom variant `light` (data-theme="light") en lugar de
 * la clase `.dark` de Tailwind. Para validar que un componente cumple WCAG
 * 2.2 AA en ambos temas con un solo describe block, los tests pueden:
 *
 *    await renderEnAmbosTemas(<MiComponente />, async (container) => {
 *      const resultado = await axe(container);
 *      expect(resultado).toHaveNoViolations();
 *    });
 *
 * El helper alterna `data-theme` en `document.documentElement` entre `dark`
 * y `light`, re-renderiza el componente fresco para cada tema y ejecuta la
 * aserción del caller. Limpia el DOM tras cada iteración para evitar
 * estado compartido.
 */

import { render, cleanup } from '@testing-library/react';

const TEMAS = ['dark', 'light'];

/**
 * Renderiza el JSX y ejecuta la aserción del caller para cada tema.
 *
 * @param {React.ReactNode} ui — El JSX a renderizar.
 * @param {(container: HTMLElement, tema: string) => Promise<void>} asercion
 *   Función que recibe el `container` renderizado y el nombre del tema
 *   activo (`'dark'` | `'light'`). Aquí van los `expect()`.
 */
export async function renderEnAmbosTemas(ui, asercion) {
  for (const tema of TEMAS) {
    document.documentElement.setAttribute('data-theme', tema);
    const { container } = render(ui);
    await asercion(container, tema);
    cleanup();
  }
}
