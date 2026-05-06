/**
 * @fileoverview Tema visual canónico por mecánica de juego (ADR-C).
 *
 * Hasta esta sesión solo Asociación tenía un tema (`associationTheme.js`)
 * y los componentes de Memoria/Secuencia mostraban la misma identidad
 * cromática que el resto de la app. Este módulo da a cada mecánica una
 * "firma" visual: un color de acento, un icono Lucide signature, un
 * headline corto y clases Tailwind preconfiguradas para badges, glow,
 * borders y rings.
 *
 * Se aplica en cabecera del juego (`GameHeader`), backdrop sutil
 * (`GameBackdrop`), tableros (`MemoryBoard`, `SequenceBoard`) y panel del
 * profesor (`MemoryHighlightCard`, `AssociationHighlightCard`,
 * `SequenceHighlightCard`).
 *
 * NOTA: este theme es ortogonal al de contexto (`contextTheme.js` y
 * `associationTheme.js`). En Asociación los dos coexisten — la mecánica
 * aporta el color del badge y el headline, el contexto sigue tintando el
 * `ChallengeDisplay`.
 *
 * @module lib/mechanicTheme
 */

import { Brain, Link2, ListOrdered } from 'lucide-react';

const MEMORY_THEME = Object.freeze({
  key: 'memory',
  label: 'Memoria',
  // Indigo-violeta para evocar lo cerebral / memoria.
  accentVar: '--color-accent-indigo',
  accentClass: 'text-accent-indigo',
  accentBgSoftClass: 'bg-accent-indigo/10',
  accentBgClass: 'bg-accent-indigo/20',
  accentBorderClass: 'border-accent-indigo/30',
  accentRingClass: 'ring-accent-indigo/35',
  accentHexFallback: '#7C7CF0',
  glowClass:
    'shadow-[0_8px_28px_color-mix(in_oklab,var(--color-accent-indigo)_45%,transparent)]',
  backdropTintClass:
    'bg-[radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--color-accent-indigo)_18%,transparent),transparent_60%)]',
  icon: Brain,
  // Headline corto que la cabecera mostrará bajo el badge. <= 36 chars.
  headline: 'Encuentra las parejas',
  // Frase que el alumno ve al cargar la primera ronda. <= 70 chars.
  intro: 'Concéntrate y recuerda dónde está cada carta.',
  // Etiqueta semántica usada en el GameOver y los charts del profesor.
  unitSingular: 'pareja',
  unitPlural: 'parejas'
});

const ASSOCIATION_THEME = Object.freeze({
  key: 'association',
  label: 'Asociación',
  // Cyan turquesa: relacional, evoca conexión.
  accentVar: '--color-accent-cyan',
  accentClass: 'text-accent-cyan',
  accentBgSoftClass: 'bg-accent-cyan/10',
  accentBgClass: 'bg-accent-cyan/20',
  accentBorderClass: 'border-accent-cyan/30',
  accentRingClass: 'ring-accent-cyan/35',
  accentHexFallback: '#5FCBE8',
  glowClass:
    'shadow-[0_8px_28px_color-mix(in_oklab,var(--color-accent-cyan)_45%,transparent)]',
  backdropTintClass:
    'bg-[radial-gradient(circle_at_80%_15%,color-mix(in_oklab,var(--color-accent-cyan)_16%,transparent),transparent_60%)]',
  icon: Link2,
  headline: 'Encuentra la respuesta correcta',
  // QA 2026-05-06: Asociación no tiene sistema de pistas (es un mecanismo
  // exclusivo de Secuencia en dificultad fácil). El intro anterior
  // "Lee bien la pista..." inducía a error a profesores nuevos.
  intro: 'Observa el objetivo y elige la tarjeta que le corresponde.',
  unitSingular: 'respuesta',
  unitPlural: 'respuestas'
});

const SEQUENCE_THEME = Object.freeze({
  key: 'sequence',
  label: 'Secuencia',
  // Ámbar/orange: ritmo, urgencia, secuencia musical.
  accentVar: '--color-accent-orange',
  accentClass: 'text-accent-amber',
  accentBgSoftClass: 'bg-accent-amber/10',
  accentBgClass: 'bg-accent-amber/20',
  accentBorderClass: 'border-accent-amber/30',
  accentRingClass: 'ring-accent-amber/35',
  accentHexFallback: '#F4B26A',
  glowClass:
    'shadow-[0_8px_28px_color-mix(in_oklab,var(--color-accent-orange)_45%,transparent)]',
  backdropTintClass:
    'bg-[radial-gradient(circle_at_50%_85%,color-mix(in_oklab,var(--color-accent-orange)_18%,transparent),transparent_60%)]',
  icon: ListOrdered,
  headline: 'Sigue la secuencia',
  intro: 'Memoriza el orden y reprodúcelo igual.',
  unitSingular: 'secuencia',
  unitPlural: 'secuencias'
});

const MECHANIC_THEMES = Object.freeze({
  memory: MEMORY_THEME,
  association: ASSOCIATION_THEME,
  sequence: SEQUENCE_THEME
});

const FALLBACK_THEME = MEMORY_THEME;

/**
 * Devuelve el tema canónico para una mecánica. Acepta el `mechanicType`
 * que llega por socket (`'memory'`, `'association'`, `'sequence'`) o por
 * `summary.mode` del GameOver. Si la mecánica no se reconoce, devuelve un
 * tema fallback (Memoria) para que la UI no se rompa — esto es defensa
 * frente a payloads de partidas antiguas o tipos no registrados.
 *
 * @param {string} mechanicType
 * @returns {typeof MEMORY_THEME}
 */
export function getMechanicTheme(mechanicType) {
  if (!mechanicType) {
    return FALLBACK_THEME;
  }
  const key = String(mechanicType).toLowerCase();
  return MECHANIC_THEMES[key] || FALLBACK_THEME;
}

/**
 * Lista de claves ordenada (memory, association, sequence). Útil para
 * filtros del dashboard del profesor (ChipGroup) y selectores.
 *
 * @returns {ReadonlyArray<'memory'|'association'|'sequence'>}
 */
export const MECHANIC_KEYS = Object.freeze(['memory', 'association', 'sequence']);

export { MECHANIC_THEMES };

export default getMechanicTheme;
