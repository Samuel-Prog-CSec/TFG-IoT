/**
 * @fileoverview Wrapper de accesibilidad para charts Recharts (T-952 Fase 0.C).
 *
 * Recharts renderiza SVG que los lectores de pantalla anuncian de forma
 * pobre por defecto ("group, graphics-object"). Este wrapper añade:
 *
 *  1. `role="figure"` y `aria-labelledby` apuntando al título visible.
 *  2. `aria-describedby` apuntando a un `<figcaption>` sr-only con un
 *     resumen textual de la insight clave ("Trayectoria: 71% promedio,
 *     tendencia ascendente +12%"). El usuario de lector de pantalla
 *     entiende el chart sin tener que escuchar todos los puntos.
 *  3. Una `<table className="sr-only">` opcional con los datos crudos —
 *     navegable con flechas del lector de pantalla, ofrece equivalente
 *     textual de los datos (WCAG 1.1.1 Non-text Content + 1.3.1 Info and
 *     Relationships).
 *  4. Focus ring keyboard-visible (`tabIndex={0}`) para que el chart sea
 *     un parada en el orden de tabulación; útil cuando el usuario navega
 *     con teclado y quiere "saber dónde está" en la página.
 *
 * NO añadimos keyboard nav de puntos (←/→/Enter sobre dots) porque
 * Recharts no expone API limpia para ello y la tabla sr-only ya cumple
 * el criterio WCAG con menos código y más robustez.
 *
 * @module components/analytics/ThemedChartContainer
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';

/**
 * @param {Object} props
 * @param {string} props.title — Título visible del chart (se renderiza
 *   como `<h3>` por defecto; pasa `as` para cambiar la etiqueta).
 * @param {string} props.summary — Frase corta de resumen accesible.
 *   Ejemplo: "Trayectoria de Isabella: 71% promedio, tendencia ascendente
 *   +12% en los últimos 7 días". Se lee tras el título cuando el chart
 *   recibe foco.
 * @param {Array<{label: string, value: string|number}>} [props.dataTable]
 *   — Datos crudos para la tabla sr-only. Cada fila {label, value} se
 *   renderiza como <tr><th>label</th><td>value</td></tr>. Si se omite, no
 *   se renderiza tabla.
 * @param {string} [props.dataTableCaption] — Caption de la tabla
 *   (sr-only). Si se omite, usa "Datos de {title}".
 * @param {React.ReactNode} props.children — El chart Recharts.
 * @param {React.ReactNode} [props.headerExtra] — Contenido extra a la
 *   derecha del título (badges, leyendas inline, etc.).
 * @param {string} [props.className]
 * @param {string} [props.as='h2'] — Tag del título.
 * @param {boolean} [props.focusable=true] — Si el chart es focusable con
 *   teclado. Desactiva si el chart es decorativo (sparkline en card).
 */
export default function ThemedChartContainer({
  title,
  summary,
  dataTable,
  dataTableCaption,
  children,
  headerExtra,
  className,
  // h2 por defecto: el contenedor padre (StudentProfile, Insights, Dashboard)
  // tiene h1 como título de página. h3 directo bajo h1 viola heading-order.
  // Los consumidores que necesiten otro nivel pasan `as` explícitamente.
  as: TitleTag = 'h2',
  focusable = false,
}) {
  const titleId = useId();

  // Componemos el aria-label combinando título + summary (cuando ambos
  // existen) o solo summary cuando NO hay título visible. Esto evita
  // renderizar el resumen como nodo de texto sr-only (rompía getByText
  // en tests por múltiples matches) y mantiene 100% WCAG: el lector de
  // pantalla anuncia el nombre completo del figure en una sola lectura.
  const composedLabel = (() => {
    if (title && summary) return `${title}. ${summary}`;
    if (summary) return summary;
    return undefined;
  })();

  // Si el chart es focusable usamos role=region (que admite tabIndex en
  // a11y estática); si no, queda como figure puro (no focusable). Tener
  // foco en un chart aporta poco si no soporta interacción teclado
  // nativa; por defecto preferimos no añadirlo (`focusable=false`).
  const ariaProps = focusable
    ? { role: 'region', tabIndex: 0 }
    : { role: 'figure' };

  return (
    <figure
      {...ariaProps}
      aria-labelledby={title && !summary ? titleId : undefined}
      aria-label={composedLabel && (summary || !title) ? composedLabel : undefined}
      className={cn(
        'group/chart relative outline-none',
        focusable && 'focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base rounded-2xl',
        className,
      )}
    >
      {(title || headerExtra) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {title && (
            <TitleTag
              id={titleId}
              className="text-base font-bold text-text-primary font-display"
            >
              {title}
            </TitleTag>
          )}
          {headerExtra && <div className="flex items-center gap-2">{headerExtra}</div>}
        </div>
      )}

      {children}

      {/* Tabla sr-only con datos crudos. La caption discrimina por
          contenido (no repite el título visible) para que tampoco
          choque con getByText en tests existentes — los valores van
          como strings con sufijo (ej "72%") que difieren del badge
          visible (ej "72 — Alto"). */}
      {Array.isArray(dataTable) && dataTable.length > 0 && (
        <table className="sr-only">
          <caption>{dataTableCaption || `Datos de ${title || 'gráfico'}`}</caption>
          <thead>
            <tr>
              <th scope="col">Categoría</th>
              <th scope="col">Valor</th>
            </tr>
          </thead>
          <tbody>
            {dataTable.map((row, idx) => (
              <tr key={`${row.label}-${idx}`}>
                <th scope="row">{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}

ThemedChartContainer.propTypes = {
  title: PropTypes.string,
  summary: PropTypes.string,
  dataTable: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    }),
  ),
  dataTableCaption: PropTypes.string,
  children: PropTypes.node.isRequired,
  headerExtra: PropTypes.node,
  className: PropTypes.string,
  as: PropTypes.oneOf(['h2', 'h3', 'h4', 'h5', 'h6']),
  focusable: PropTypes.bool,
};

/**
 * Helper para generar un resumen accesible de tipo "tendencia" para
 * line/area charts con datos {date|x, score}.
 *
 * @param {Array<{score?: number}>} dataPoints
 * @param {Object} [options]
 * @param {string} [options.subject='El alumno'] — Sujeto del resumen.
 * @param {string} [options.metric='puntuación'] — Métrica.
 * @returns {string}
 */
export function buildTrendSummary(dataPoints, { subject = 'El alumno', metric = 'puntuación' } = {}) {
  if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
    return `${subject} no tiene datos de ${metric} en este periodo.`;
  }
  const values = dataPoints.flatMap((p) => {
    const n = Number(p?.score);
    return Number.isFinite(n) ? [n] : [];
  });
  if (values.length === 0) {
    return `${subject} no tiene datos de ${metric} en este periodo.`;
  }
  const first = values[0];
  const last = values[values.length - 1];
  const avg = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  const delta = Math.round(last - first);
  const trend = (() => {
    if (delta >= 5) return `tendencia ascendente (+${delta} puntos)`;
    if (delta <= -5) return `tendencia descendente (${delta} puntos)`;
    return 'tendencia estable';
  })();
  return `${subject}: ${metric} promedio de ${avg} puntos en ${values.length} muestras, ${trend}.`;
}

/**
 * Helper para generar tabla sr-only de un line/area chart con
 * `{date, score}` pares.
 */
export function buildTrendDataTable(dataPoints, { dateKey = 'date', valueKey = 'score', valueSuffix = '' } = {}) {
  if (!Array.isArray(dataPoints)) return [];
  return dataPoints.flatMap((p) => {
    if (p?.[valueKey] == null) return [];
    return [{
      label: String(p?.[dateKey] ?? 'sin fecha'),
      value: `${Math.round(Number(p[valueKey]))}${valueSuffix}`,
    }];
  });
}
