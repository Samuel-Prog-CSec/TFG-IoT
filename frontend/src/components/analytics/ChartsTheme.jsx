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

import { useMemo } from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

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
      {/* Gradients horizontales 0% (full saturation) → 100% (subtone).
          Consumen variables semánticas `--chart-stop-X-start/end` que se
          redefinen por tema en index.css (T-952 Fase 0.B): en dark el
          extremo va a la variante CLARA, en light a la variante OSCURA.
          Mantenemos opacities altas y similares para que la línea tenga
          el mismo peso visual en ambos temas. */}
      <linearGradient id="chart-gradient-brand" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--chart-stop-brand-start)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--chart-stop-brand-end)" stopOpacity={0.85} />
      </linearGradient>
      <linearGradient id="chart-gradient-memory" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--chart-stop-memory-start)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--chart-stop-memory-end)" stopOpacity={0.75} />
      </linearGradient>
      <linearGradient id="chart-gradient-association" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--chart-stop-association-start)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--chart-stop-association-end)" stopOpacity={0.75} />
      </linearGradient>
      <linearGradient id="chart-gradient-sequence" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="var(--chart-stop-sequence-start)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--chart-stop-sequence-end)" stopOpacity={0.75} />
      </linearGradient>
      <linearGradient id="chart-gradient-success" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--chart-stop-success-start)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--chart-stop-success-end)" stopOpacity={0.75} />
      </linearGradient>
      <linearGradient id="chart-gradient-warning" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--chart-stop-warning-start)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--chart-stop-warning-end)" stopOpacity={0.75} />
      </linearGradient>
      <linearGradient id="chart-gradient-error" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--chart-stop-error-start)" stopOpacity={0.95} />
        <stop offset="100%" stopColor="var(--chart-stop-error-end)" stopOpacity={0.75} />
      </linearGradient>

      {/* Gradient vertical para "área bajo la curva" — útil cuando un
          LineChart quiere fade hacia abajo (Trayectoria, Sparklines).
          El extremo superior usa el "start" del brand (tonalidad media)
          y el inferior siempre se desvanece a transparente, así que no
          necesita variante por tema. */}
      <linearGradient id="chart-area-brand" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--chart-stop-brand-start)" stopOpacity={0.35} />
        <stop offset="100%" stopColor="var(--chart-stop-brand-start)" stopOpacity={0.02} />
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

      {/* Patterns "RAG con textura" — color sólido + overlay de textura
          distintiva para que daltonismo rojo-verde distinga estados sin
          depender solo del color (T-952 Fase 0.D, WCAG 2.2 §1.4.1 Use of
          Color). Cada celda rinde el rect de fondo (color RAG) y una
          forma única encima (dots/diagonal/dashed). */}
      <pattern
        id="chart-rag-green"
        width="8"
        height="8"
        patternUnits="userSpaceOnUse"
      >
        <rect width="8" height="8" fill="var(--color-success-base)" />
        <circle cx="2" cy="2" r="1.1" fill="white" fillOpacity="0.35" />
        <circle cx="6" cy="6" r="1.1" fill="white" fillOpacity="0.35" />
      </pattern>
      <pattern
        id="chart-rag-amber"
        width="8"
        height="8"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="8" height="8" fill="var(--color-warning-base)" />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="8"
          stroke="white"
          strokeWidth="1.5"
          strokeOpacity="0.35"
        />
      </pattern>
      <pattern
        id="chart-rag-red"
        width="10"
        height="8"
        patternUnits="userSpaceOnUse"
      >
        <rect width="10" height="8" fill="var(--color-error-base)" />
        <line
          x1="0"
          y1="4"
          x2="6"
          y2="4"
          stroke="white"
          strokeWidth="1.5"
          strokeOpacity="0.40"
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

/**
 * Devuelve el `fill="url(#...)"` apropiado para una celda RAG: color
 * semántico + textura única (dots/diagonal/dashed) para que daltonismo
 * rojo-verde distinga estados sin depender del color (T-952 Fase 0.D).
 *
 * @param {number} score 0-100
 * @returns {string} ej "url(#chart-rag-green)"
 */
export function getRAGPatternFill(score) {
  if (score >= 70) return 'url(#chart-rag-green)';
  if (score >= 40) return 'url(#chart-rag-amber)';
  return 'url(#chart-rag-red)';
}

/**
 * Duración base de la animación de entrada de Recharts. Match con la
 * familia "Move" del sistema de motion (200-300ms ease-out) — sin caer en
 * el "demo bouncy" típico de dashboards genéricos. Cada serie escalonada
 * suma 80ms (`animationBegin = seriesIndex * 80`) para que las líneas
 * múltiples no entren a la vez.
 */
const CHART_ANIMATION_BASE_MS = 700;
const CHART_ANIMATION_STAGGER_MS = 80;

/**
 * Hook que devuelve los flags de animación coherentes con la preferencia
 * de motion del usuario (T-952 Fase 0.A). Aplica en cualquier chart
 * Recharts (LineChart, BarChart, RadarChart, AreaChart, PieChart, …):
 *
 *   const motion = useChartMotion();
 *   <Line {...motion(0)} />
 *   <Line {...motion(1)} /> // segunda serie entra 80ms después
 *
 * En `prefers-reduced-motion: reduce` o cuando el usuario haya pulsado
 * el toggle de Animaciones del sidebar, los charts pintan en su estado
 * final SIN animación (Recharts respeta `isAnimationActive={false}`).
 *
 * @returns {(seriesIndex?: number) => { isAnimationActive: boolean, animationDuration: number, animationBegin: number }}
 */
export function useChartMotion() {
  const { shouldReduceMotion } = useReducedMotion();
  return useMemo(() => {
    if (shouldReduceMotion) {
      return () => ({ isAnimationActive: false, animationDuration: 0, animationBegin: 0 });
    }
    return (seriesIndex = 0) => ({
      isAnimationActive: true,
      animationDuration: CHART_ANIMATION_BASE_MS,
      animationBegin: Math.max(0, seriesIndex) * CHART_ANIMATION_STAGGER_MS,
    });
  }, [shouldReduceMotion]);
}

export default ChartsThemeDefs;
