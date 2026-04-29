/**
 * Helper de temas visuales por contexto de juego.
 * Mapea el slug del contexto (o su clave) a una paleta OKLCH ya definida en
 * index.css, y devuelve clases/estilos Tailwind-friendly para tintar iconos,
 * bordes o fondos con coherencia cross-producto.
 *
 * Uso:
 *   const theme = getContextTheme(deck.context?.slug);
 *   <div className={`bg-gradient-to-br ${theme.gradientFromTo}`}> ... </div>
 */

export const CONTEXT_THEME_KEYS = ['default', 'geography', 'animals', 'colors', 'numbers', 'shapes'];

const THEMES = {
  default: {
    primaryVar: '--color-theme-default',
    altVar: '--color-theme-default-alt',
    textVar: '--color-theme-default-text',
    gradientClass: 'from-[var(--color-theme-default)] to-[var(--color-theme-default-alt)]',
    ringClass: 'ring-[color-mix(in_oklab,var(--color-theme-default)_35%,transparent)]',
    textClass: 'text-[var(--color-theme-default-text)]',
    glowClass: 'shadow-[0_6px_24px_color-mix(in_oklab,var(--color-theme-default)_40%,transparent)]',
  },
  geography: {
    primaryVar: '--color-theme-geography',
    altVar: '--color-theme-geography-alt',
    textVar: '--color-theme-geography-text',
    gradientClass: 'from-[var(--color-theme-geography)] to-[var(--color-theme-geography-alt)]',
    ringClass: 'ring-[color-mix(in_oklab,var(--color-theme-geography)_35%,transparent)]',
    textClass: 'text-[var(--color-theme-geography-text)]',
    glowClass: 'shadow-[0_6px_24px_color-mix(in_oklab,var(--color-theme-geography)_40%,transparent)]',
  },
  animals: {
    primaryVar: '--color-theme-animals',
    altVar: '--color-theme-animals-alt',
    textVar: '--color-theme-animals-text',
    gradientClass: 'from-[var(--color-theme-animals)] to-[var(--color-theme-animals-alt)]',
    ringClass: 'ring-[color-mix(in_oklab,var(--color-theme-animals)_35%,transparent)]',
    textClass: 'text-[var(--color-theme-animals-text)]',
    glowClass: 'shadow-[0_6px_24px_color-mix(in_oklab,var(--color-theme-animals)_40%,transparent)]',
  },
  colors: {
    primaryVar: '--color-theme-colors',
    altVar: '--color-theme-colors-alt',
    textVar: '--color-theme-colors-text',
    gradientClass: 'from-[var(--color-theme-colors)] to-[var(--color-theme-colors-alt)]',
    ringClass: 'ring-[color-mix(in_oklab,var(--color-theme-colors)_35%,transparent)]',
    textClass: 'text-[var(--color-theme-colors-text)]',
    glowClass: 'shadow-[0_6px_24px_color-mix(in_oklab,var(--color-theme-colors)_40%,transparent)]',
  },
  numbers: {
    primaryVar: '--color-theme-numbers',
    altVar: '--color-theme-numbers-alt',
    textVar: '--color-theme-numbers-text',
    gradientClass: 'from-[var(--color-theme-numbers)] to-[var(--color-theme-numbers-alt)]',
    ringClass: 'ring-[color-mix(in_oklab,var(--color-theme-numbers)_35%,transparent)]',
    textClass: 'text-[var(--color-theme-numbers-text)]',
    glowClass: 'shadow-[0_6px_24px_color-mix(in_oklab,var(--color-theme-numbers)_40%,transparent)]',
  },
  shapes: {
    primaryVar: '--color-accent-cyan',
    altVar: '--color-accent-indigo',
    textVar: '--color-accent-cyan',
    gradientClass: 'from-accent-cyan to-accent-indigo',
    ringClass: 'ring-accent-cyan/35',
    textClass: 'text-accent-cyan',
    glowClass: 'shadow-[0_6px_24px_color-mix(in_oklab,var(--color-accent-cyan)_40%,transparent)]',
  },
};

const SLUG_ALIASES = {
  'geography-europe': 'geography',
  'animals-farm': 'animals',
  'colors-basic': 'colors',
  'numbers-1-6': 'numbers',
  'shapes-basic': 'shapes',
};

/**
 * Resuelve la clave de tema desde un contexto. Acepta string (slug/name)
 * o un objeto con slug/key/name. Siempre retorna un tema valido (default).
 */
export function getContextTheme(input) {
  if (!input) return THEMES.default;
  const raw = typeof input === 'string' ? input : (input.slug || input.key || input.name || '');
  const slug = String(raw).toLowerCase();
  if (SLUG_ALIASES[slug]) return THEMES[SLUG_ALIASES[slug]];
  const prefix = slug.split('-')[0];
  if (THEMES[prefix]) return THEMES[prefix];
  return THEMES.default;
}
