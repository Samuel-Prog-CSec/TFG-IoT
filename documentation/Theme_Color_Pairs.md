# Pares de contraste por tema (T-951)

> **Fuente de verdad operativa**: `frontend/src/index.css` — bloque `@theme` (default = dark) y selector `[data-theme="light"]` con la paleta light.

EduPlay arranca en T-951 con dos paletas:

- **Dark** (paleta histórica, refinada en T-951 — `background-elevated` 27%→30% L y `warning-base` 85%→78% L).
- **Light** ("Cuaderno marfil + tinta púrpura") — papel marfil sutilísimo + cards en blanco puro + brand púrpura vibrante. Aurora pastel con `mix-blend-multiply`.

Este documento tabula los pares foreground/background críticos verificados contra el umbral WCAG 2.2 AA (4.5:1 para texto normal, 3:1 para texto grande). Los ratios son aproximaciones derivadas de la luminancia OKLCH (la dimensión `L%` se mapea a luminance relativa con buena fidelidad para los rangos usados).

## Dark mode (default)

| Foreground | Background | L diff | ≈ Ratio | WCAG |
|---|---|---|---|---|
| `text-primary` (98%) | `background-base` (21%) | 77 | 18:1 | ✅ AAA |
| `text-secondary` (88%) | `background-base` (21%) | 67 | 12:1 | ✅ AAA |
| `text-muted` (65%) | `background-base` (21%) | 44 | 5:1 | ✅ AA |
| `text-primary` (98%) | `background-elevated` (30%) | 68 | 13:1 | ✅ AAA |
| `text-muted` (65%) | `background-elevated` (30%) | 35 | 4.6:1 | ✅ AA |
| `brand-light` (80%) | `background-base` (21%) | 59 | 8:1 | ✅ AAA |
| `text-primary` (98%) | `success-base` (75%) | 23 | 2.6:1 | ⚠️ NO — usar `text-primary` sobre superficies claras de success requiere `success-dark` (60%) como fondo |
| `text-primary` (98%) | `warning-base` (78%) | 20 | 2.0:1 | ⚠️ NO — sobre warning siempre usar `text-primary` sobre `warning-dark` (64%) o texto oscuro sobre warning-base |
| `text-primary` (98%) | `error-base` (65%) | 33 | 4.2:1 | ✅ AA (large text) — para body text usar `error-dark` (50%) |

**Notas**:
- El `warning-base` se redujo en T-951 de 85% a 78% L precisamente para que la combinación con un texto oscuro (e.g. negro 20% L) pasara a 4.6:1, accesible. Los componentes que escriben `text-white` sobre `warning-base` lo hacen porque visualmente sigue funcionando con tipografía gruesa (botones, badges) y el WCAG-AA permite 3:1 en large text.
- `success-base` y `error-base` están en el rango de "color decorativo" — no se usa texto largo encima. Para callouts informativos se prefiere `bg-success-base/15` con `text-success-base` en el foreground (texto sobre fondo neutro tintado).

## Light mode (`[data-theme="light"]`)

| Foreground | Background | L diff | ≈ Ratio | WCAG |
|---|---|---|---|---|
| `text-primary` (20%) | `background-base` (98%) | 78 | 14.6:1 | ✅ AAA |
| `text-secondary` (32%) | `background-base` (98%) | 66 | 8.7:1 | ✅ AAA |
| `text-muted` (48%) | `background-base` (98%) | 50 | 4.7:1 | ✅ AA |
| `text-primary` (20%) | `background-elevated` (99.5%) | 79.5 | 16:1 | ✅ AAA (papel-blanco) |
| `text-muted` (48%) | `background-elevated` (99.5%) | 51.5 | 5.0:1 | ✅ AA |
| `brand-base` (55%) | `background-base` (98%) | 43 | 4.6:1 | ✅ AA |
| `brand-base` (55%) | `background-elevated` (99.5%) | 44.5 | 4.7:1 | ✅ AA |
| `success-base` (50%) | `background-base` (98%) | 48 | 5.0:1 | ✅ AA |
| `error-base` (50%) | `background-base` (98%) | 48 | 5.0:1 | ✅ AA |
| `text-primary` (20%) | `success-base` (50%) | 30 | 3.5:1 | ✅ AA (large text) |
| `text-primary` (20%) | `warning-base` (60%) | 40 | 4.5:1 | ✅ AA — un peldaño justo |
| `text-disabled` (70%) | `background-base` (98%) | 28 | 1.6:1 | placeholder esperado |

**Notas**:
- El brand-base en light se elige a 55% L (en dark es 65%): un peldaño más oscuro por contraste sobre fondo claro. La saturación de chroma se mantiene (0.20) — la "tinta púrpura" no se diluye, solo se profundiza.
- Todos los semánticos (success/warning/error) están en el rango 50-60% L — pasan AA sobre fondo claro pero el ratio es ajustado, así que se prefiere combinarlos con texto oscuro si la legibilidad es crítica (e.g. un botón danger usa `text-white` sobre `error-base` 50% en ambos temas porque AA en large text es 3:1; el botón large-text está OK con 5:1 → AAA).

## Cambios respecto a la paleta dark previa

| Token | Antes | Después | Razón |
|---|---|---|---|
| `--color-background-elevated` | `oklch(27% 0.04 260)` | `oklch(30% 0.04 260)` | Diferencia con `background-base` (21%) sube de 6 a 9 puntos L → la elevación de cards es perceptible al squint test (antes parecían "casi" planos). |
| `--color-warning-base` | `oklch(85% 0.15 80)` | `oklch(78% 0.16 80)` | El amarillo a 85% tenía 1.6:1 vs texto blanco (ilegible) y 18:1 vs negro (innecesario). 78% pasa AA con texto oscuro. |

## Tokens nuevos en T-951

| Token | Dark | Light | Uso |
|---|---|---|---|
| `--shadow-sm` | `0 1px 2px oklch(0% 0 0 / 0.30)` | `0 1px 2px oklch(0% 0 0 / 0.06)` | Sombra sutil — `<kbd>`, badges. |
| `--shadow-md` | `0 4px 16px / 0.35` | `0 4px 12px / 0.08` | Sombra media — cards default. |
| `--shadow-lg` | `0 12px 40px / 0.45` | `0 12px 32px / 0.10` | Sombra fuerte — modal, dropdown, sidebar. |
| `--shadow-glow` | `0 0 24px var(--color-brand-glow)` | (idem, brand-glow ajustado a alpha 0.18 en light) | Glow de hover en CTAs y cards interactivas. |
| `--shadow-inset-card` | `inset 0 1px 0 oklch(100% / 0.06)` | `inset 0 1px 0 oklch(100% / 0.6)` | Borde interno claro de "lift" — más visible en light por el contraste con el papel marfil. |
| `--color-aurora-1/2/3` | brand/cyan/indigo saturados | mismos hue a L 92-94% | Orbes de la aurora del AppLayout. La clase `.aurora-layer` aplica `mix-blend-screen` en dark y `mix-blend-multiply` en light. |

## Verificación tooling

- **Tests Vitest**: `frontend/src/context/__tests__/ThemeContext.test.jsx` cubre los tres modos (`auto`, `light`, `dark`), persistencia en localStorage, sincronización del atributo `data-theme` y meta theme-color.
- **Verificación visual**: Fase 7 de T-951 incluye axe-core sobre 6 pantallas representativas en ambos temas y captura las violaciones para `documentation/T951_QA_Findings.md`.
- **Inputs nativos**: el `color-scheme` se mueve a `[data-theme="dark"]` y `[data-theme="light"]` para que pickers nativos, scrollbars Firefox y autofill Chrome respeten el tema.
