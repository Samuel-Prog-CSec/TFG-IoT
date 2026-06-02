/**
 * @fileoverview Tests de accesibilidad para los chips de mecánica usados en
 * `StudentsAnalytics` (rendimiento desglosado por mecánica).
 *
 * Cada chip combina icono + dot del tier + texto sr-only. La estructura
 * crítica es el `<span role="img" aria-label={...}>` que lo envuelve.
 * Validamos las 3 mecánicas × 4 tiers × 2 temas.
 */

import { describe, it, expect } from 'vitest';
import { axe } from 'jest-axe';
import { getMechanicTheme } from '../../lib/mechanicTheme';
import { TIER_BADGE } from '../../constants/analyticsThresholds';
import { renderEnAmbosTemas } from './helpers';

const MECANICAS = ['association', 'memory', 'sequence'];
const TIERS = ['excellent', 'good', 'average', 'risk'];

describe('MechanicChip — accesibilidad', () => {
  for (const mecanica of MECANICAS) {
    for (const tier of TIERS) {
      it(`mecánica="${mecanica}" tier="${tier}" chip cumple WCAG 2.2 AA en dark + light`, async () => {
        const theme = getMechanicTheme(mecanica);
        const Icon = theme.icon;
        const badge = TIER_BADGE[tier];
        const tooltip = `${theme.label}: ${badge.label} · 85% · 12 partidas`;
        const dotClass = badge.className
          .split(' ')
          .find(c => c.startsWith('text-'))
          ?.replace('text-', 'bg-') || 'bg-text-muted';

        await renderEnAmbosTemas(
          <span
            role="img"
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider border ${theme.accentBgSoftClass} ${theme.accentBorderClass}`}
            title={tooltip}
            aria-label={tooltip}
          >
            <Icon size={10} className={theme.accentClass} aria-hidden="true" />
            <span className={`size-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
          </span>,
          async container => {
            const resultado = await axe(container);
            expect(resultado).toHaveNoViolations();
          }
        );
      });
    }
  }
});
