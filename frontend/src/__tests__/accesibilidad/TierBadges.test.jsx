/**
 * @fileoverview Tests de accesibilidad para los tier badges de analytics.
 *
 * Valida `TIER_CONFIG` (badge largo con label "Necesita apoyo") y
 * `TIER_BADGE` (badge corto con label "Bajo") en cada uno de los 4 tiers
 * (excellent/good/average/risk), en ambos temas.
 */

import { describe, it, expect } from 'vitest';
import { axe } from 'jest-axe';
import { TIER_CONFIG, TIER_BADGE } from '../../constants/analyticsThresholds';
import { renderEnAmbosTemas } from './helpers';

const TIERS = ['excellent', 'good', 'average', 'risk'];

describe('TIER_CONFIG — accesibilidad', () => {
  for (const tier of TIERS) {
    it(`tier="${tier}" cumple WCAG 2.2 AA en dark + light`, async () => {
      const config = TIER_CONFIG[tier];
      await renderEnAmbosTemas(
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${config.className}`}>
          {config.label}
        </span>,
        async container => {
          const resultado = await axe(container);
          expect(resultado).toHaveNoViolations();
        }
      );
    });
  }
});

describe('TIER_BADGE — accesibilidad', () => {
  for (const tier of TIERS) {
    it(`tier="${tier}" cumple WCAG 2.2 AA en dark + light`, async () => {
      const badge = TIER_BADGE[tier];
      await renderEnAmbosTemas(
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${badge.className}`}>
          {badge.label}
        </span>,
        async container => {
          const resultado = await axe(container);
          expect(resultado).toHaveNoViolations();
        }
      );
    });
  }
});
