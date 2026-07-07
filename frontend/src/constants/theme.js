/**
 * Constantes del sistema de tema (T-951 Fase 1).
 * Se definen aquí (no en ThemeContext.jsx) para evitar el warning de
 * react-refresh "fast refresh solo funciona cuando un archivo exporta
 * solo componentes" — la separación de concerns también facilita reuso
 * desde el ThemeToggle y los tests.
 */

export const THEME_STORAGE_KEY = 'eduplay:theme';
export const THEME_MODES = Object.freeze(['auto', 'light', 'dark']);

/**
 * Colores que se aplican a la meta theme-color del navegador para que la
 * barra de direcciones (en mobile) y la status bar de la PWA se fundan
 * con el primer pixel de la app. Coinciden con `--color-background-base`
 * de cada paleta. Si esa CSS var cambia, actualiza estos valores.
 */
export const META_THEME_COLOR = Object.freeze({
  dark: '#0f172a',
  light: '#fbf7ee',
});
