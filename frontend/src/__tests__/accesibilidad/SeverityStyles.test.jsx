/**
 * @fileoverview Tests de accesibilidad para `SEVERITY_STYLES` (alertas
 * inteligentes de teacher: critical/warning/info).
 *
 * El `text` de cada severidad se compone con su `bg` y `border` para
 * formar una badge. Validamos los 3 niveles en ambos temas.
 */

import { describe, it, expect } from 'vitest';
import { axe } from 'jest-axe';
import { SEVERITY_STYLES } from '../../constants/alertTypes';
import { renderEnAmbosTemas } from './helpers';

const SEVERIDADES = ['critical', 'warning', 'info'];

describe('SEVERITY_STYLES — accesibilidad', () => {
  for (const severidad of SEVERIDADES) {
    it(`severidad="${severidad}" en badge cumple WCAG 2.2 AA en dark + light`, async () => {
      const estilo = SEVERITY_STYLES[severidad];
      await renderEnAmbosTemas(
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${estilo.bg} ${estilo.border} ${estilo.text}`}>
          <span className={`size-2 rounded-full ${estilo.dot}`} aria-hidden="true" />
          <span className="text-sm font-medium">{estilo.label}: rendimiento descendente del alumno</span>
        </div>,
        async container => {
          const resultado = await axe(container);
          expect(resultado).toHaveNoViolations();
        }
      );
    });
  }
});
