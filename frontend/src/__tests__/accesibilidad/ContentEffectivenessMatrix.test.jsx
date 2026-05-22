/**
 * @fileoverview Tests de accesibilidad para `ContentEffectivenessMatrix`.
 *
 * El componente renderiza una lista de items con barras RAG (verde/ámbar/
 * rojo/gris) según puntuación. Tras los fixes de Sprint 0, los `text-{tone}-base`
 * usan `light:` variants para AA. Este test valida que no haya regresiones
 * en ninguna combinación con datos representativos.
 */

import { describe, it, expect } from 'vitest';
import { axe } from 'jest-axe';
import ContentEffectivenessMatrix from '../../components/analytics/ContentEffectivenessMatrix';
import { renderEnAmbosTemas } from './helpers';

const DATOS_REPRESENTATIVOS = [
  // Verde (≥75% — excellent/good)
  { name: 'Países de Europa', avgScore: 85, totalPlays: 42, improvementRate: 12 },
  // Ámbar (50-74% — average)
  { name: 'Animales de Granja', avgScore: 65, totalPlays: 28, improvementRate: -5 },
  // Rojo (<50% — risk)
  { name: 'Números del 1 al 6', avgScore: 35, totalPlays: 18, improvementRate: -15 },
  // Gris (sin datos suficientes — improvementRate null)
  { name: 'Formas Básicas', avgScore: 70, totalPlays: 5, improvementRate: null },
];

describe('ContentEffectivenessMatrix — accesibilidad', () => {
  it('renderiza datos representativos (verde/ámbar/rojo/gris) sin violaciones en dark + light', async () => {
    await renderEnAmbosTemas(
      <ContentEffectivenessMatrix data={DATOS_REPRESENTATIVOS} groupBy="context" />,
      async container => {
        const resultado = await axe(container);
        expect(resultado).toHaveNoViolations();
      }
    );
  });

  it('renderiza con groupBy="mechanic" sin violaciones en dark + light', async () => {
    const datosMecanicas = [
      { name: 'Asociación', avgScore: 80, totalPlays: 50, improvementRate: 8 },
      { name: 'Memoria', avgScore: 55, totalPlays: 30, improvementRate: 3 },
      { name: 'Secuencia', avgScore: 40, totalPlays: 12, improvementRate: -20 },
    ];
    await renderEnAmbosTemas(
      <ContentEffectivenessMatrix data={datosMecanicas} groupBy="mechanic" />,
      async container => {
        const resultado = await axe(container);
        expect(resultado).toHaveNoViolations();
      }
    );
  });

  it('renderiza estado vacío sin violaciones en dark + light', async () => {
    await renderEnAmbosTemas(
      <ContentEffectivenessMatrix data={[]} groupBy="context" />,
      async container => {
        const resultado = await axe(container);
        expect(resultado).toHaveNoViolations();
      }
    );
  });
});
