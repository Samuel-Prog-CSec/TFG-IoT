/**
 * @fileoverview Sistema de tema canónico para charts Recharts (T-953 Fase A).
 *
 * Antes de este módulo cada chart definía sus propios tokens, gradients y
 * tooltips inline. La consecuencia: tooltips ligeramente distintos por
 * chart, ejes con tipografía dispar, colores hardcoded mezclados con CSS
 * vars, y cero patterns colorblind-safe.
 *
 * Este módulo unifica esos primitivos en cinco piezas reutilizables:
 *
 *  1. `<ChartsThemeDefs />` — componente que dropa un bloque `<defs>` con
 *     tres gradients (brand, success-amber-error semantic, mechanic) y
 *     tres patterns colorblind-safe (diagonal lines, dots, dashed
 *     horizontal). Se monta dentro del `<ResponsiveContainer>` de cada
 *     chart, no compite con nada porque los `<defs>` viven en el SVG raíz.
 *
 *  2. `chartColors` — paletas tokenizadas por mecánica y por semántica.
 *     Resuelven a `var(--color-*)` para que el tema light/dark sea
 *     transparente. Cada paleta expone `{ stroke, fill, gradientId }`.
 *
 *  3. `chartTokens` — strings con los tokens compartidos para grid, ejes,
 *     tooltip background, border. Evita duplicar literales como
 *     `var(--color-border-subtle)` por todo el código.
 *
 *  4. `<ThemedTooltipCard>` — wrapper de tooltip con el estilo canónico
 *     (`bg-background-elevated/95 border border-border-default rounded-lg
 *     p-3 shadow-xl backdrop-blur text-sm`). Cada chart sigue pasando su
 *     propio `<CustomTooltip>` content, pero envuelto en este card para
 *     que la "look" sea idéntica.
 *
 *  5. `commonAxisProps` y `commonGridProps` — props pre-spread para
 *     `XAxis`/`YAxis`/`CartesianGrid`. Reduce 3-4 líneas por chart.
 *
 * Reglas para añadir colores nuevos:
 *  - Solo tokens del `index.css` (`--color-*`). Nada hex hardcoded.
 *  - Si un chart necesita un color one-off, debe pasar por `chartColors`
 *    como entrada nueva, no inline.
 *
 * @module components/analytics/ChartsTheme
 */

import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

/**
 * Paletas de color por mecánica de juego. Coherentes con
 * `lib/mechanicTheme.js` — mismos accent vars, distinta API porque los
 * charts trabajan con `stroke` y `fill` literales, no clases Tailwind.
 *
 * Cada paleta expone:
 *  - `stroke`: color literal CSS para `stroke` de líneas/bordes (var()).
 *  - `fill`:   color literal para áreas/celdas (var()).
 *  - `gradientId`: id del `<linearGradient>` definido en
 *    `<ChartsThemeDefs />`. Útil cuando un chart quiere `stroke="url(#id)"`.
 */
const byMechanic = Object.freeze({
  memory: Object.freeze({
    stroke: 'var(--color-accent-indigo)',
    fill: 'var(--color-accent-indigo)',
    gradientId: 'chart-gradient-memory',
  }),
  association: Object.freeze({
    stroke: 'var(--color-accent-cyan)',
    fill: 'var(--color-accent-cyan)',
    gradientId: 'chart-gradient-association',
  }),
  sequence: Object.freeze({
    stroke: 'var(--color-accent-amber)',
    fill: 'var(--color-accent-amber)',
    gradientId: 'chart-gradient-sequence',
  }),
});

/**
 * Paletas de color por categoría semántica. Útiles para charts que no
 * pertenecen a una mecánica concreta (Trayectoria de un alumno, KPIs
 * agregados, comparativas globales).
 */
const bySemantic = Object.freeze({
  brand: Object.freeze({
    stroke: 'var(--color-brand-base)',
    fill: 'var(--color-brand-base)',
    gradientId: 'chart-gradient-brand',
  }),
  success: Object.freeze({
    stroke: 'var(--color-success-base)',
    fill: 'var(--color-success-base)',
    gradientId: 'chart-gradient-success',
  }),
  warning: Object.freeze({
    stroke: 'var(--color-warning-base)',
    fill: 'var(--color-warning-base)',
    gradientId: 'chart-gradient-warning',
  }),
  error: Object.freeze({
    stroke: 'var(--color-error-base)',
    fill: 'var(--color-error-base)',
    gradientId: 'chart-gradient-error',
  }),
  info: Object.freeze({
    stroke: 'var(--color-info-base)',
    fill: 'var(--color-info-base)',
  }),
  muted: Object.freeze({
    stroke: 'var(--color-text-muted)',
    fill: 'var(--color-text-muted)',
  }),
});

export const chartColors = Object.freeze({
  byMechanic,
  bySemantic,
});

/**
 * Tokens canónicos compartidos entre charts. Cada string resuelve a un
 * token semántico de `index.css` — light/dark se cubre solo.
 */
export const chartTokens = Object.freeze({
  gridStroke: 'var(--color-border-subtle)',
  axisTickFill: 'var(--color-text-muted)',
  axisTickFontSize: 11,
  axisLabelFill: 'var(--color-text-secondary)',
  tooltipBg: 'var(--color-background-elevated)',
  tooltipBorder: 'var(--color-border-default)',
  legendFill: 'var(--color-text-muted)',
  // Pattern fill por defecto para celdas "sin datos" en heatmaps.
  // Usa la utility `bg-stripe-diagonal` ya definida en index.css cuando
  // el caller renderiza un div; cuando es SVG, usa `url(#chart-pattern-empty)`.
  emptyPatternId: 'chart-pattern-empty',
});

/**
 * Props pre-empaquetadas para `<XAxis>`/`<YAxis>` con los defaults
 * canónicos. Cada chart hace `<XAxis {...commonAxisProps} dataKey="..." />`.
 */
export const commonAxisProps = Object.freeze({
  tick: { fill: chartTokens.axisTickFill, fontSize: chartTokens.axisTickFontSize },
  tickLine: false,
  axisLine: false,
});

/**
 * Props canónicos para `<CartesianGrid>`. Stroke `border-subtle`,
 * `strokeDasharray="3 3"`, vertical desactivado para charts horizontales.
 */
export const commonGridProps = Object.freeze({
  stroke: chartTokens.gridStroke,
  strokeDasharray: '3 3',
});

/**
 * Componente que dropa los `<defs>` globales de la app de charts. Se
 * monta DENTRO del `<ResponsiveContainer>` (no fuera) — Recharts inyecta
 * un `<svg>` raíz y todos los `<defs>` viven dentro de ese SVG.
 *
 * NOTA: cuando un mismo chart tiene su propio `<defs>` adicional (ej:
 * `SequenceProgressChart` ya tenía `<linearGradient id="sequenceLine">`),
 * conviene quitar el suyo y consumir desde aquí (`chart-gradient-sequence`).
 */
export function ChartsThemeDefs() {
  return (
    <defs>
      {/* Gradients horizontales 0% (full saturation) → 100% (60% opacity).
          Útil para `stroke="url(#id)"` en líneas. */}
      <linearGradient id="chart-gradient-brand" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--color-brand-base)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--color-brand-light)" stopOpacity={0.6} />
      </linearGradient>
      <linearGradient id="chart-gradient-memory" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--color-accent-indigo)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--color-accent-indigo)" stopOpacity={0.6} />
      </linearGradient>
      <linearGradient id="chart-gradient-association" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--color-accent-cyan)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--color-accent-cyan)" stopOpacity={0.6} />
      </linearGradient>
      <linearGradient id="chart-gradient-sequence" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--color-accent-amber)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--color-accent-amber)" stopOpacity={0.6} />
      </linearGradient>
      <linearGradient id="chart-gradient-success" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-success-base)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--color-success-dark)" stopOpacity={0.7} />
      </linearGradient>
      <linearGradient id="chart-gradient-warning" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-warning-base)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--color-warning-dark)" stopOpacity={0.7} />
      </linearGradient>
      <linearGradient id="chart-gradient-error" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-error-base)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--color-error-dark)" stopOpacity={0.7} />
      </linearGradient>

      {/* Gradient vertical para "área bajo la curva" — útil cuando un
          LineChart quiere fade hacia abajo (Trayectoria, Sparklines). */}
      <linearGradient id="chart-area-brand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--color-brand-base)" stopOpacity={0.35} />
        <stop offset="100%" stopColor="var(--color-brand-base)" stopOpacity={0.02} />
      </linearGradient>

      {/* Patterns colorblind-safe para heatmaps. Tres formas distintas
          para que daltonismo rojo-verde y azul-amarillo distingan
          niveles SIN depender solo del color de fondo. */}
      <pattern
        id="chart-pattern-diagonal"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.5"
        />
      </pattern>
      <pattern id="chart-pattern-dots" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="1.2" fill="currentColor" fillOpacity="0.6" />
      </pattern>
      <pattern
        id="chart-pattern-dashed"
        width="8"
        height="6"
        patternUnits="userSpaceOnUse"
      >
        <line
          x1="0"
          y1="3"
          x2="6"
          y2="3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeOpacity="0.55"
        />
      </pattern>

      {/* Pattern para celdas "sin datos" en heatmaps SVG. Diagonal
          tenue sobre fondo neutro — comunica "vacío intencional", no
          "valor cero". Color: usa `currentColor` del consumer (suele
          ser text-muted). */}
      <pattern
        id={chartTokens.emptyPatternId}
        width="8"
        height="8"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="8" height="8" fill="var(--color-background-surface)" fillOpacity="0.4" />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="8"
          stroke="var(--color-text-disabled)"
          strokeWidth="1"
          strokeOpacity="0.4"
        />
      </pattern>
    </defs>
  );
}

/**
 * Tooltip card canónica para Recharts. Cada chart sigue definiendo su
 * propio contenido (qué campos muestra), pero el wrapper (bg, border,
 * shadow, padding) es idéntico.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.className]
 */
export function ThemedTooltipCard({ children, className }) {
  return (
    <div
      className={cn(
        'rounded-lg bg-background-elevated/95 border border-border-default',
        'px-3 py-2 text-sm shadow-xl backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  );
}

ThemedTooltipCard.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

/**
 * Devuelve la paleta de chart correspondiente a una mecánica o, en su
 * defecto, a una clave semántica. Útil cuando un mismo chart se usa con
 * variantes (`mode="memory" | "association" | "sequence"` o
 * `tone="success" | "warning" | "error"`).
 *
 * @param {string} key — `'memory'|'association'|'sequence'|'brand'|...`
 * @returns {{ stroke: string, fill: string, gradientId?: string }}
 */
export function getChartPalette(key) {
  if (!key) return bySemantic.brand;
  return byMechanic[key] || bySemantic[key] || bySemantic.brand;
}

export default ChartsThemeDefs;
