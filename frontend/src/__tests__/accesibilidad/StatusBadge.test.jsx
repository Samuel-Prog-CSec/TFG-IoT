/**
 * @fileoverview Tests de accesibilidad para StatusBadge.
 *
 * Valida que cada variante (status × size) renderice sin violaciones WCAG
 * 2.2 AA según axe-core, en tema dark y light. Es la red de seguridad que
 * detecta regresiones cuando se modifican los tokens semánticos o el
 * sistema de variantes `light:` de Tailwind v4.
 */

import { describe, it, expect } from 'vitest';
import { axe } from 'jest-axe';
import StatusBadge from '../../components/ui/StatusBadge';
import { renderEnAmbosTemas } from './helpers';

const STATUSES = ['active', 'inactive', 'success', 'warning', 'error', 'info'];
const SIZES = ['sm', 'md'];

describe('StatusBadge — accesibilidad', () => {
  for (const status of STATUSES) {
    for (const size of SIZES) {
      it(`status="${status}" size="${size}" cumple WCAG 2.2 AA en dark + light`, async () => {
        await renderEnAmbosTemas(
          <StatusBadge status={status} size={size} pulse={false}>
            Etiqueta de prueba
          </StatusBadge>,
          async container => {
            const resultado = await axe(container);
            expect(resultado).toHaveNoViolations();
          }
        );
      });
    }
  }
});
