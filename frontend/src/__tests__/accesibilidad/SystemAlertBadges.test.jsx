/**
 * @fileoverview Tests de accesibilidad para badges de SystemAlerts.
 *
 * Cubre dos colecciones:
 *  - `SOURCE_STYLES`: 7 fuentes (redis/mongo/memory/queue/auth/moderation/compliance)
 *  - `ANNOUNCEMENT_SEVERITY_STYLES`: 3 severidades (info/warning/urgent)
 */

import { describe, it, expect } from 'vitest';
import { axe } from 'jest-axe';
import { SOURCE_STYLES, ANNOUNCEMENT_SEVERITY_STYLES } from '../../constants/systemAlertTypes';
import { renderEnAmbosTemas } from './helpers';

const FUENTES = ['redis', 'mongo', 'memory', 'queue', 'auth', 'moderation', 'compliance'];
const SEVERIDADES_ANUNCIO = ['info', 'warning', 'urgent'];

describe('SOURCE_STYLES (System alerts) — accesibilidad', () => {
  for (const fuente of FUENTES) {
    it(`fuente="${fuente}" badge cumple WCAG 2.2 AA en dark + light`, async () => {
      const estilo = SOURCE_STYLES[fuente];
      await renderEnAmbosTemas(
        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${estilo.badge}`}>
          {estilo.label}
        </span>,
        async container => {
          const resultado = await axe(container);
          expect(resultado).toHaveNoViolations();
        }
      );
    });
  }
});

describe('ANNOUNCEMENT_SEVERITY_STYLES — accesibilidad', () => {
  for (const severidad of SEVERIDADES_ANUNCIO) {
    it(`severidad="${severidad}" container cumple WCAG 2.2 AA en dark + light`, async () => {
      const estilo = ANNOUNCEMENT_SEVERITY_STYLES[severidad];
      await renderEnAmbosTemas(
        <div className={`p-4 rounded-xl border ${estilo.container}`}>
          <strong>{estilo.label}:</strong> Mensaje de prueba para el anuncio.
        </div>,
        async container => {
          const resultado = await axe(container);
          expect(resultado).toHaveNoViolations();
        }
      );
    });
  }
});
